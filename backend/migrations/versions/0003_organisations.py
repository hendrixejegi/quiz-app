"""Organisation workspaces, memberships, invitations, audit and scoped content."""
from alembic import op
import sqlalchemy as sa
from fastapi_users_db_sqlalchemy.generics import GUID

revision = '0003_organisations'
down_revision = '0002_quiz_library'


def upgrade():
    op.create_table('organisations', sa.Column('id',sa.String(36),primary_key=True), sa.Column('name',sa.String(100),nullable=False), sa.Column('created_at',sa.DateTime(timezone=True),nullable=False))
    op.create_table('organisation_memberships',
        sa.Column('id',sa.String(36),primary_key=True), sa.Column('organisation_id',sa.String(36),sa.ForeignKey('organisations.id',ondelete='RESTRICT'),nullable=False),
        sa.Column('user_id',GUID(),sa.ForeignKey('user.id'),nullable=False), sa.Column('role',sa.String(20),nullable=False), sa.Column('active',sa.Boolean(),nullable=False),
        sa.UniqueConstraint('organisation_id','user_id',name='uq_organisation_member'))
    op.create_index('ix_organisation_memberships_organisation_id','organisation_memberships',['organisation_id'])
    op.create_index('uq_organisation_owner','organisation_memberships',['organisation_id'],unique=True,postgresql_where=sa.text("role = 'owner' AND active = true"),sqlite_where=sa.text("role = 'owner' AND active = 1"))
    op.create_table('organisation_invitations',
        sa.Column('id',sa.String(36),primary_key=True),sa.Column('organisation_id',sa.String(36),sa.ForeignKey('organisations.id',ondelete='RESTRICT'),nullable=False),
        sa.Column('issuer_id',GUID(),sa.ForeignKey('user.id'),nullable=False),sa.Column('email',sa.String(320),nullable=False),sa.Column('role',sa.String(20),nullable=False),
        sa.Column('token_hash',sa.String(64),unique=True,nullable=False),sa.Column('status',sa.String(20),nullable=False),sa.Column('expires_at',sa.DateTime(timezone=True),nullable=False),
        sa.Column('accepted_by',GUID(),sa.ForeignKey('user.id'),nullable=True))
    op.create_index('ix_organisation_invitations_organisation_id','organisation_invitations',['organisation_id'])
    op.create_index('uq_pending_organisation_email','organisation_invitations',['organisation_id','email'],unique=True,postgresql_where=sa.text("status = 'pending'"),sqlite_where=sa.text("status = 'pending'"))
    op.create_table('organisation_audit',
        sa.Column('id',sa.String(36),primary_key=True),sa.Column('organisation_id',sa.String(36),sa.ForeignKey('organisations.id',ondelete='RESTRICT'),nullable=False),
        sa.Column('actor_id',GUID(),sa.ForeignKey('user.id'),nullable=False),sa.Column('action',sa.String(80),nullable=False),sa.Column('target_id',sa.String(36),nullable=False),
        sa.Column('outcome',sa.String(16),nullable=False),sa.Column('correlation_id',sa.String(36),nullable=False),sa.Column('created_at',sa.DateTime(timezone=True),nullable=False))
    op.create_index('ix_organisation_audit_organisation_id','organisation_audit',['organisation_id'])
    for table in ('events','library_quizzes'):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column('organisation_id',sa.String(36),nullable=True))
            batch.create_foreign_key('fk_'+table+'_organisation','organisations',['organisation_id'],['id'],ondelete='RESTRICT')
            batch.create_index('ix_'+table+'_organisation_id',['organisation_id'])
    with op.batch_alter_table('participants') as batch:
        batch.add_column(sa.Column('user_id',GUID(),nullable=True))
        batch.create_foreign_key('fk_participants_user','user',['user_id'],['id'])
        batch.create_unique_constraint('uq_event_participant_account',['event_id','user_id'])


def downgrade():
    raise RuntimeError('Organisation downgrade is disabled to preserve memberships, content and audit history.')
