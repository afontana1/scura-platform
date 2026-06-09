"""queue and artifact metadata

Revision ID: 0002_queue_artifacts
Revises: 0001_initial_schema
Create Date: 2026-06-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002_queue_artifacts"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("simulation_runs", sa.Column("worker_job_id", sa.String(length=255), nullable=True))
    op.add_column("simulation_results", sa.Column("artifact_metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.alter_column("simulation_results", "artifact_metadata_json", server_default=None)


def downgrade() -> None:
    op.drop_column("simulation_results", "artifact_metadata_json")
    op.drop_column("simulation_runs", "worker_job_id")
