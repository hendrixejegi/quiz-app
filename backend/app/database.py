import os

from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./quiz.db")
if DATABASE_URL.startswith(("postgres://", "postgresql://")):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1).replace("postgresql://", "postgresql+psycopg://", 1)
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
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
