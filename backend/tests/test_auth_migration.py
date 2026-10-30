"""Migration compatibility with the original quiz database."""
import os
from pathlib import Path
import subprocess
import sys
from sqlalchemy import create_engine, inspect, text


def test_migration_preserves_legacy_event_and_is_repeatable(tmp_path):
    url = f"sqlite:///{(tmp_path / 'legacy.db').as_posix()}"
    engine = create_engine(url)
    with engine.begin() as db:
        db.execute(text('CREATE TABLE events (id VARCHAR(36) PRIMARY KEY, title VARCHAR(100) NOT NULL, join_code VARCHAR(8) NOT NULL UNIQUE, host_token_hash VARCHAR(64) NOT NULL, state VARCHAR(20) NOT NULL, created_at TIMESTAMP NOT NULL)'))
        db.execute(text("INSERT INTO events VALUES ('old', 'Existing quiz', 'LEGACY', 'existing-secret-hash', 'lobby', CURRENT_TIMESTAMP)"))
    env = {**os.environ, 'DATABASE_URL': url, 'AUTH_SECRET': 'migration-test-only'}
    for _ in range(2):
        result = subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', 'head'], cwd=Path(__file__).resolve().parents[1], env=env, capture_output=True, text=True, timeout=40)
        assert result.returncode == 0, result.stderr
    assert {'user', 'oauth_account', 'accesstoken'} <= set(inspect(engine).get_table_names())
    with engine.connect() as db:
        event = db.execute(text('SELECT title, host_token_hash, owner_id FROM events WHERE id = :id'), {'id': 'old'}).one()
        assert tuple(event) == ('Existing quiz', 'existing-secret-hash', None)
    engine.dispose()


def test_new_revision_can_upgrade_existing_and_fresh_databases(tmp_path):
    import shutil
    backend = Path(__file__).resolve().parents[1]
    migration_root = tmp_path / 'project'
    migration_root.mkdir()
    shutil.copy2(backend / 'alembic.ini', migration_root / 'alembic.ini')
    shutil.copytree(backend / 'migrations', migration_root / 'migrations', ignore=shutil.ignore_patterns('__pycache__'))
    env = {**os.environ, 'AUTH_SECRET': 'migration-test-only', 'DATABASE_URL': f"sqlite:///{(tmp_path / 'existing.db').as_posix()}"}
    env['PYTHONPATH'] = str(backend) + os.pathsep + env.get('PYTHONPATH', '')

    def run(*arguments):
        result = subprocess.run([sys.executable, '-m', 'alembic', *arguments], cwd=migration_root, env=env, capture_output=True, text=True, timeout=40)
        assert result.returncode == 0, result.stderr

    run('upgrade', 'head')
    # A clean baseline must produce no unexpected schema operations.
    run('check')
    migration_env = migration_root / 'migrations' / 'env.py'
    source = migration_env.read_text()
    source = source.replace('def run():', "from sqlalchemy import Table, Column, Integer\nTable('workflow_probe', Base.metadata, Column('id', Integer, primary_key=True))\n\ndef run():")
    migration_env.write_text(source)
    run('revision', '--autogenerate', '-m', 'add workflow probe')
    revisions = list((migration_root / 'migrations' / 'versions').glob('*workflow_probe.py'))
    assert len(revisions) == 1
    assert "create_table('workflow_probe'" in revisions[0].read_text()
    run('upgrade', 'head')
    run('check')
    env['DATABASE_URL'] = f"sqlite:///{(tmp_path / 'fresh.db').as_posix()}"
    run('upgrade', 'head')
    run('check')
