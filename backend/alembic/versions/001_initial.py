"""Initial migration

Revision ID: 001
Revises: 
Create Date: 2026-11-05 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, VECTOR, ARRAY, JSONB
import uuid

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm')

    # repositories table
    op.create_table(
        'repositories',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('github_id', sa.Integer(), unique=True, nullable=False, index=True),
        sa.Column('name', sa.String(255), nullable=False, index=True),
        sa.Column('full_name', sa.String(500), nullable=False, index=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('html_url', sa.String(500), nullable=False),
        sa.Column('clone_url', sa.String(500), nullable=False),
        sa.Column('default_branch', sa.String(100), nullable=False, default='main'),
        sa.Column('language', sa.String(50), nullable=True),
        sa.Column('stars', sa.Integer(), nullable=False, default=0),
        sa.Column('forks', sa.Integer(), nullable=False, default=0),
        sa.Column('is_private', sa.Boolean(), nullable=False, default=False),
        sa.Column('is_archived', sa.Boolean(), nullable=False, default=False),
        sa.Column('owner_login', sa.String(255), nullable=False, index=True),
        sa.Column('owner_type', sa.String(50), nullable=False),
        sa.Column('installation_id', sa.Integer(), nullable=True, index=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column('last_analyzed_at', sa.DateTime(), nullable=True),
    )

    # analyses table
    op.create_table(
        'analyses',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('repository_id', UUID(as_uuid=True), sa.ForeignKey('repositories.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('github_pr_number', sa.Integer(), nullable=True, index=True),
        sa.Column('github_commit_sha', sa.String(40), nullable=True, index=True),
        sa.Column('status', sa.Enum('pending', 'running', 'completed', 'failed', 'cancelled', name='analysis_status'), nullable=False, default='pending', index=True),
        sa.Column('trigger_type', sa.String(50), nullable=False),
        sa.Column('total_files', sa.Integer(), nullable=False, default=0),
        sa.Column('analyzed_files', sa.Integer(), nullable=False, default=0),
        sa.Column('total_findings', sa.Integer(), nullable=False, default=0),
        sa.Column('critical_findings', sa.Integer(), nullable=False, default=0),
        sa.Column('high_findings', sa.Integer(), nullable=False, default=0),
        sa.Column('medium_findings', sa.Integer(), nullable=False, default=0),
        sa.Column('low_findings', sa.Integer(), nullable=False, default=0),
        sa.Column('info_findings', sa.Integer(), nullable=False, default=0),
        sa.Column('technical_debt_score', sa.Float(), nullable=True),
        sa.Column('maintainability_index', sa.Float(), nullable=True),
        sa.Column('duplication_percentage', sa.Float(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('metadata', JSONB(), nullable=False, default={}),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, default=sa.func.now(), onupdate=sa.func.now()),
    )

    # findings table
    op.create_table(
        'findings',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('analysis_id', UUID(as_uuid=True), sa.ForeignKey('analyses.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('file_path', sa.String(500), nullable=False, index=True),
        sa.Column('start_line', sa.Integer(), nullable=False),
        sa.Column('end_line', sa.Integer(), nullable=False),
        sa.Column('start_column', sa.Integer(), nullable=True),
        sa.Column('end_column', sa.Integer(), nullable=True),
        sa.Column('severity', sa.Enum('critical', 'high', 'medium', 'low', 'info', name='finding_severity'), nullable=False, index=True),
        sa.Column('category', sa.Enum('security', 'performance', 'maintainability', 'style', 'bug', 'duplication', 'antipattern', name='finding_category'), nullable=False, index=True),
        sa.Column('rule_id', sa.String(100), nullable=False, index=True),
        sa.Column('rule_name', sa.String(255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('recommendation', sa.Text(), nullable=True),
        sa.Column('cwe_id', sa.String(20), nullable=True),
        sa.Column('owasp_category', sa.String(50), nullable=True),
        sa.Column('confidence', sa.Float(), nullable=False, default=1.0),
        sa.Column('code_snippet', sa.Text(), nullable=True),
        sa.Column('context_before', sa.Text(), nullable=True),
        sa.Column('context_after', sa.Text(), nullable=True),
        sa.Column('metadata', JSONB(), nullable=False, default={}),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=sa.func.now()),
    )

    # code_chunks table
    op.create_table(
        'code_chunks',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('repository_id', UUID(as_uuid=True), sa.ForeignKey('repositories.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('file_path', sa.String(500), nullable=False, index=True),
        sa.Column('language', sa.String(50), nullable=False),
        sa.Column('chunk_type', sa.String(50), nullable=False),
        sa.Column('name', sa.String(255), nullable=False, index=True),
        sa.Column('parent_name', sa.String(255), nullable=True),
        sa.Column('start_line', sa.Integer(), nullable=False),
        sa.Column('end_line', sa.Integer(), nullable=False),
        sa.Column('start_column', sa.Integer(), nullable=False, default=0),
        sa.Column('end_column', sa.Integer(), nullable=False, default=0),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('docstring', sa.Text(), nullable=True),
        sa.Column('complexity', sa.Integer(), nullable=True),
        sa.Column('dependencies', ARRAY(sa.String()), nullable=False, default=[]),
        sa.Column('embedding', VECTOR(1536), nullable=True),
        sa.Column('metadata', JSONB(), nullable=False, default={}),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, default=sa.func.now(), onupdate=sa.func.now()),
    )

    # refactor_proposals table
    op.create_table(
        'refactor_proposals',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('analysis_id', UUID(as_uuid=True), sa.ForeignKey('analyses.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('finding_id', UUID(as_uuid=True), sa.ForeignKey('findings.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('file_path', sa.String(500), nullable=False, index=True),
        sa.Column('original_code', sa.Text(), nullable=False),
        sa.Column('refactored_code', sa.Text(), nullable=False),
        sa.Column('diff', sa.Text(), nullable=False),
        sa.Column('explanation', sa.Text(), nullable=False),
        sa.Column('test_code', sa.Text(), nullable=True),
        sa.Column('test_explanation', sa.Text(), nullable=True),
        sa.Column('estimated_impact', sa.String(50), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=False, default=1.0),
        sa.Column('status', sa.String(50), nullable=False, default='pending'),
        sa.Column('github_pr_url', sa.String(500), nullable=True),
        sa.Column('github_pr_number', sa.Integer(), nullable=True),
        sa.Column('metadata', JSONB(), nullable=False, default={}),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, default=sa.func.now(), onupdate=sa.func.now()),
    )

    # github_installations table
    op.create_table(
        'github_installations',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('installation_id', sa.Integer(), unique=True, nullable=False, index=True),
        sa.Column('account_login', sa.String(255), nullable=False, index=True),
        sa.Column('account_type', sa.String(50), nullable=False),
        sa.Column('target_type', sa.String(50), nullable=False),
        sa.Column('permissions', JSONB(), nullable=False, default={}),
        sa.Column('repository_selection', sa.String(50), nullable=False),
        sa.Column('access_tokens_url', sa.String(500), nullable=False),
        sa.Column('repositories_url', sa.String(500), nullable=False),
        sa.Column('html_url', sa.String(500), nullable=False),
        sa.Column('app_id', sa.Integer(), nullable=False),
        sa.Column('app_slug', sa.String(255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column('suspended_at', sa.DateTime(), nullable=True),
    )

    # webhook_events table
    op.create_table(
        'webhook_events',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('github_delivery_id', sa.String(100), unique=True, nullable=False, index=True),
        sa.Column('event_type', sa.String(50), nullable=False, index=True),
        sa.Column('action', sa.String(50), nullable=True),
        sa.Column('repository_id', UUID(as_uuid=True), sa.ForeignKey('repositories.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('installation_id', sa.Integer(), nullable=True, index=True),
        sa.Column('payload', JSONB(), nullable=False),
        sa.Column('processed', sa.Boolean(), nullable=False, default=False),
        sa.Column('processing_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=sa.func.now()),
        sa.Column('processed_at', sa.DateTime(), nullable=True),
    )

    # Create indexes
    op.create_index('ix_analyses_repo_status', 'analyses', ['repository_id', 'status'])
    op.create_index('ix_analyses_created_at', 'analyses', ['created_at'])
    op.create_index('ix_findings_analysis_severity', 'findings', ['analysis_id', 'severity'])
    op.create_index('ix_findings_file_path', 'findings', ['file_path'])
    op.create_index('ix_code_chunks_repo_file', 'code_chunks', ['repository_id', 'file_path'])
    op.create_index('ix_code_chunks_name_type', 'code_chunks', ['name', 'chunk_type'])
    op.create_index('ix_webhook_events_type_action', 'webhook_events', ['event_type', 'action'])

    # Create HNSW index for vector similarity search
    op.execute('''
        CREATE INDEX IF NOT EXISTS ix_code_chunks_embedding_hnsw
        ON code_chunks USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    ''')


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_table('webhook_events')
    op.drop_table('github_installations')
    op.drop_table('refactor_proposals')
    op.drop_table('code_chunks')
    op.drop_table('findings')
    op.drop_table('analyses')
    op.drop_table('repositories')

    # Drop enums
    op.execute('DROP TYPE IF EXISTS analysis_status')
    op.execute('DROP TYPE IF EXISTS finding_severity')
    op.execute('DROP TYPE IF EXISTS finding_category')