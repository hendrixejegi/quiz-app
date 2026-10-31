"""Personal drafts, immutable published versions, and optional event provenance."""
from alembic import op
import sqlalchemy as sa
from fastapi_users_db_sqlalchemy.generics import GUID

revision = '0002_quiz_library'
down_revision = '0001_auth'


def upgrade():
    op.create_table('library_quizzes',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('owner_id', GUID(), sa.ForeignKey('user.id'), nullable=False),
        sa.Column('title', sa.String(100), nullable=False),
        sa.Column('questions', sa.JSON(), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_library_quizzes_owner_id', 'library_quizzes', ['owner_id'])
    op.create_table('quiz_versions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('quiz_id', sa.String(36), sa.ForeignKey('library_quizzes.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('number', sa.Integer(), nullable=False),
        sa.Column('draft_revision', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(100), nullable=False),
        sa.Column('questions', sa.JSON(), nullable=False),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('quiz_id', 'number', name='uq_quiz_version_number'),
        sa.UniqueConstraint('quiz_id', 'draft_revision', name='uq_quiz_version_revision'))
    op.create_index('ix_quiz_versions_quiz_id', 'quiz_versions', ['quiz_id'])
    with op.batch_alter_table('events') as batch:
        batch.add_column(sa.Column('source_version_id', sa.String(36), nullable=True))
        batch.create_foreign_key('fk_events_source_version', 'quiz_versions', ['source_version_id'], ['id'], ondelete='RESTRICT')
        batch.create_index('ix_events_source_version_id', ['source_version_id'])


def downgrade():
    # Published records must not be silently discarded by a deployment rollback.
    raise RuntimeError('Quiz library downgrade is intentionally disabled to preserve saved and published content.')
