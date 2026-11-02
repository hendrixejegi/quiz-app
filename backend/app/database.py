import os

from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./quiz.db")
if os.getenv('VERCEL') and not DATABASE_URL.startswith(('postgres://', 'postgresql://', 'postgresql+psycopg://')):
    raise RuntimeError('Vercel deployments require a PostgreSQL DATABASE_URL')
if DATABASE_URL.startswith(("postgres://", "postgresql://")):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1).replace("postgresql://", "postgresql+psycopg://", 1)
def database_engine_options(url):
    if url.startswith('sqlite'):
        return {'connect_args': {'check_same_thread': False}, 'pool_pre_ping': True}
    return {
        'pool_pre_ping': True, 'pool_size': 2, 'max_overflow': 0,
        'pool_timeout': 5, 'pool_recycle': 300,
        'connect_args': {
            'connect_timeout': 5,
            'prepare_threshold': None,
        },
    }


engine = create_engine(DATABASE_URL, **database_engine_options(DATABASE_URL))


def install_transaction_limits(target):
    if target.dialect.name != 'postgresql':
        return

    @event.listens_for(target, 'begin')
    def transaction_limits(connection):
        # Transaction-local settings are safe behind PgBouncer.
        connection.exec_driver_sql('SET LOCAL statement_timeout = 10000')
        connection.exec_driver_sql('SET LOCAL lock_timeout = 3000')
        connection.exec_driver_sql('SET LOCAL idle_in_transaction_session_timeout = 10000')


install_transaction_limits(engine)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        persist_organisation_denial(db)
        db.close()


def persist_organisation_denial(db):
    denial = db.info.pop('organisation_denial', None)
    if denial:
        db.rollback()
        from .models import OrganisationAudit
        import uuid
        import logging
        try:
            with SessionLocal() as audit_db:
                audit_db.add(OrganisationAudit(id=str(uuid.uuid4()), organisation_id=denial['organisation_id'],
                    actor_id=denial['user'], action=denial['action'], target_id=denial['target_id'],
                    outcome='denied', correlation_id=denial['correlation_id']))
                audit_db.commit()
        except Exception:
            logging.getLogger(__name__).error('Organisation denial audit could not be persisted')
