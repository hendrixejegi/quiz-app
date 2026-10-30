from alembic import context
from app.database import Base, engine
from app import models, auth


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
