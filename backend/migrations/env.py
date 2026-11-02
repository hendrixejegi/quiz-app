from alembic import context
from app.database import Base, engine
from app import models, auth
import os
from sqlalchemy import create_engine

# Runtime uses a pooled endpoint; release migrations can use a direct endpoint.
if os.getenv('MIGRATION_DATABASE_URL'):
    migration_url = os.environ['MIGRATION_DATABASE_URL']
    if migration_url.startswith(('postgres://', 'postgresql://')):
        migration_url = migration_url.replace('postgres://', 'postgresql+psycopg://', 1).replace('postgresql://', 'postgresql+psycopg://', 1)
    engine = create_engine(migration_url, pool_pre_ping=True)


def render_type(kind, value, autogen_context):
    if kind == 'type' and value.__class__.__name__ in {'GUID', 'TIMESTAMPAware'}:
        name = value.__class__.__name__
        autogen_context.imports.add(f'from fastapi_users_db_sqlalchemy.generics import {name}')
        return 'GUID()' if name == 'GUID' else 'TIMESTAMPAware(timezone=True)'
    return False


def run():
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=Base.metadata,
            render_as_batch=engine.dialect.name == 'sqlite',
            compare_type=True,
            render_item=render_type,
        )
        with context.begin_transaction():
            context.run_migrations()


run()
