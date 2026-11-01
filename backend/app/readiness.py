"""Read-only startup schema readiness check; never runs migrations automatically."""
from sqlalchemy import inspect
from .database import Base, engine


def check_schema_ready():
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    missing = []
    for table in Base.metadata.sorted_tables:
        if table.name not in tables:
            missing.append(table.name)
            continue
        columns = {column['name'] for column in inspector.get_columns(table.name)}
        missing.extend(f'{table.name}.{column.name}' for column in table.columns if column.name not in columns)
    if missing:
        raise RuntimeError('Database schema is out of date (' + ', '.join(missing) + '). From backend/, run python -m alembic upgrade head against the intended database, then restart the API.')
