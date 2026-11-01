"""Startup must diagnose missing migrations before serving private requests."""
import pytest
from sqlalchemy import create_engine
from app.database import Base
from app import readiness


def test_missing_schema_has_actionable_migration_message(tmp_path, monkeypatch):
    engine = create_engine('sqlite:///' + str(tmp_path / 'unmigrated.db'))
    monkeypatch.setattr(readiness, 'engine', engine)
    with pytest.raises(RuntimeError, match='python -m alembic upgrade head') as error:
        readiness.check_schema_ready()
    assert 'organisations' in str(error.value)
    Base.metadata.create_all(engine)
    readiness.check_schema_ready()
    with engine.begin() as conn:
        conn.exec_driver_sql('ALTER TABLE events RENAME COLUMN organisation_id TO missing_organisation')
    with pytest.raises(RuntimeError, match=r'events\.organisation_id'):
        readiness.check_schema_ready()
    engine.dispose()
