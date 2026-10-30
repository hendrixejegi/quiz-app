"""Create the initial schema and preserve existing legacy events.

Table definitions are frozen here so later model changes do not alter this baseline.
"""
from alembic import op
import sqlalchemy as sa
from fastapi_users_db_sqlalchemy.generics import GUID, TIMESTAMPAware

revision = '0001_auth'
down_revision = None


def upgrade():
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if 'events' not in tables:
        op.create_table('events',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('owner_id', sa.String(length=36), nullable=True),
        sa.Column('title', sa.String(length=100), nullable=False),
        sa.Column('join_code', sa.String(length=8), nullable=False),
        sa.Column('host_token_hash', sa.String(length=64), nullable=False),
        sa.Column('state', sa.String(length=20), nullable=False),
        sa.Column('current_question_position', sa.Integer(), nullable=True),
        sa.Column('timer_deadline', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_events_join_code'), 'events', ['join_code'], unique=True)
        op.create_index(op.f('ix_events_owner_id'), 'events', ['owner_id'], unique=False)
    if 'user' not in tables:
        op.create_table('user',
        sa.Column('display_name', sa.String(length=80), nullable=False),
        sa.Column('id', GUID(), nullable=False),
        sa.Column('email', sa.String(length=320), nullable=False),
        sa.Column('hashed_password', sa.String(length=1024), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('is_superuser', sa.Boolean(), nullable=False),
        sa.Column('is_verified', sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_user_email'), 'user', ['email'], unique=True)
    if 'accesstoken' not in tables:
        op.create_table('accesstoken',
        sa.Column('user_id', GUID(), nullable=False),
        sa.Column('token', sa.String(length=43), nullable=False),
        sa.Column('created_at', TIMESTAMPAware(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='cascade'),
        sa.PrimaryKeyConstraint('token')
        )
        op.create_index(op.f('ix_accesstoken_created_at'), 'accesstoken', ['created_at'], unique=False)
    if 'oauth_account' not in tables:
        op.create_table('oauth_account',
        sa.Column('id', GUID(), nullable=False),
        sa.Column('user_id', GUID(), nullable=False),
        sa.Column('oauth_name', sa.String(length=100), nullable=False),
        sa.Column('access_token', sa.String(length=1024), nullable=False),
        sa.Column('expires_at', sa.Integer(), nullable=True),
        sa.Column('refresh_token', sa.String(length=1024), nullable=True),
        sa.Column('account_id', sa.String(length=320), nullable=False),
        sa.Column('account_email', sa.String(length=320), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='cascade'),
        sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_oauth_account_account_id'), 'oauth_account', ['account_id'], unique=False)
        op.create_index(op.f('ix_oauth_account_oauth_name'), 'oauth_account', ['oauth_name'], unique=False)
    if 'participants' not in tables:
        op.create_table('participants',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('event_id', sa.String(length=36), nullable=False),
        sa.Column('private_name', sa.String(length=80), nullable=False),
        sa.Column('display_name', sa.String(length=32), nullable=False),
        sa.Column('reconnect_token_hash', sa.String(length=64), nullable=False),
        sa.Column('joined_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('event_id', 'display_name', name='uq_event_display_name')
        )
    if 'questions' not in tables:
        op.create_table('questions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event_id', sa.String(length=36), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('prompt', sa.String(length=500), nullable=False),
        sa.Column('time_limit_seconds', sa.Integer(), nullable=False),
        sa.Column('correct_choice_index', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
        )
    if 'choices' not in tables:
        op.create_table('choices',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('question_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('text', sa.String(length=200), nullable=False),
        sa.ForeignKeyConstraint(['question_id'], ['questions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
        )
    if 'participant_answers' not in tables:
        op.create_table('participant_answers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('participant_id', sa.String(length=36), nullable=False),
        sa.Column('question_id', sa.Integer(), nullable=False),
        sa.Column('choice_index', sa.Integer(), nullable=False),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['participant_id'], ['participants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['question_id'], ['questions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('participant_id', 'question_id', name='uq_participant_answers_participant_question')
        )
    columns = {column['name'] for column in sa.inspect(bind).get_columns('events')}
    if 'owner_id' not in columns:
        op.add_column('events', sa.Column('owner_id', sa.String(36), nullable=True))
        op.create_index('ix_events_owner_id', 'events', ['owner_id'])
    if 'current_question_position' not in columns:
        op.add_column('events', sa.Column('current_question_position', sa.Integer))
    if 'timer_deadline' not in columns:
        op.add_column('events', sa.Column('timer_deadline', sa.DateTime(timezone=True)))


def downgrade():
    raise RuntimeError('Authentication downgrade would discard accounts; restore a database backup instead.')

