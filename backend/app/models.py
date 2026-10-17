from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, Enum, JSON, Boolean, Index, Float, ARRAY
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, VECTOR
from datetime import datetime
import uuid
import enum
from app.database import Base


class AnalysisStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class FindingSeverity(str, enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class FindingCategory(str, enum.Enum):
    SECURITY = "security"
    PERFORMANCE = "performance"
    MAINTAINABILITY = "maintainability"
    STYLE = "style"
    BUG = "bug"
    DUPLICATION = "duplication"
    ANTIPATTERN = "antipattern"


class Repository(Base):
    __tablename__ = "repositories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    github_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    full_name: Mapped[str] = mapped_column(String(500), index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    html_url: Mapped[str] = mapped_column(String(500))
    clone_url: Mapped[str] = mapped_column(String(500))
    default_branch: Mapped[str] = mapped_column(String(100), default="main")
    language: Mapped[str | None] = mapped_column(String(50), nullable=True)
    stars: Mapped[int] = mapped_column(Integer, default=0)
    forks: Mapped[int] = mapped_column(Integer, default=0)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    owner_login: Mapped[str] = mapped_column(String(255), index=True)
    owner_type: Mapped[str] = mapped_column(String(50))  # User or Organization
    installation_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_analyzed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Relaciones
    analyses: Mapped[list["Analysis"]] = relationship(back_populates="repository", cascade="all, delete-orphan")
    code_chunks: Mapped[list["CodeChunk"]] = relationship(back_populates="repository", cascade="all, delete-orphan")


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    github_pr_number: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    github_commit_sha: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    status: Mapped[AnalysisStatus] = mapped_column(Enum(AnalysisStatus), default=AnalysisStatus.PENDING, index=True)
    trigger_type: Mapped[str] = mapped_column(String(50))  # manual, webhook, scheduled
    total_files: Mapped[int] = mapped_column(Integer, default=0)
    analyzed_files: Mapped[int] = mapped_column(Integer, default=0)
    total_findings: Mapped[int] = mapped_column(Integer, default=0)
    critical_findings: Mapped[int] = mapped_column(Integer, default=0)
    high_findings: Mapped[int] = mapped_column(Integer, default=0)
    medium_findings: Mapped[int] = mapped_column(Integer, default=0)
    low_findings: Mapped[int] = mapped_column(Integer, default=0)
    info_findings: Mapped[int] = mapped_column(Integer, default=0)
    technical_debt_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    maintainability_index: Mapped[float | None] = mapped_column(Float, nullable=True)
    duplication_percentage: Mapped[float | None] = mapped_column(Float, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relaciones
    repository: Mapped["Repository"] = relationship(back_populates="analyses")
    findings: Mapped[list["Finding"]] = relationship(back_populates="analysis", cascade="all, delete-orphan")
    refactor_proposals: Mapped[list["RefactorProposal"]] = relationship(back_populates="analysis", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_analyses_repo_status", "repository_id", "status"),
        Index("ix_analyses_created_at", "created_at"),
    )


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("analyses.id", ondelete="CASCADE"), index=True)
    file_path: Mapped[str] = mapped_column(String(500), index=True)
    start_line: Mapped[int] = mapped_column(Integer)
    end_line: Mapped[int] = mapped_column(Integer)
    start_column: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_column: Mapped[int | None] = mapped_column(Integer, nullable=True)
    severity: Mapped[FindingSeverity] = mapped_column(Enum(FindingSeverity), index=True)
    category: Mapped[FindingCategory] = mapped_column(Enum(FindingCategory), index=True)
    rule_id: Mapped[str] = mapped_column(String(100), index=True)
    rule_name: Mapped[str] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommendation: Mapped[str | None] = mapped_column(Text, nullable=True)
    cwe_id: Mapped[str | None] = mapped_column(String(20), nullable=True)  # Common Weakness Enumeration
    owasp_category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    code_snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    context_before: Mapped[str | None] = mapped_column(Text, nullable=True)
    context_after: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relaciones
    analysis: Mapped["Analysis"] = relationship(back_populates="findings")

    __table_args__ = (
        Index("ix_findings_analysis_severity", "analysis_id", "severity"),
        Index("ix_findings_file_path", "file_path"),
    )


class CodeChunk(Base):
    __tablename__ = "code_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    file_path: Mapped[str] = mapped_column(String(500), index=True)
    language: Mapped[str] = mapped_column(String(50))
    chunk_type: Mapped[str] = mapped_column(String(50))  # class, function, method, module, etc.
    name: Mapped[str] = mapped_column(String(255), index=True)
    parent_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    start_line: Mapped[int] = mapped_column(Integer)
    end_line: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    docstring: Mapped[str | None] = mapped_column(Text, nullable=True)
    complexity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dependencies: Mapped[list[str]] = mapped_column(ARRAY(String), default=[])
    embedding: Mapped[list[float] | None] = mapped_column(VECTOR(1536), nullable=True)  # OpenAI ada-002 = 1536 dims
    metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relaciones
    repository: Mapped["Repository"] = relationship(back_populates="code_chunks")

    __table_args__ = (
        Index("ix_code_chunks_repo_file", "repository_id", "file_path"),
        Index("ix_code_chunks_name_type", "name", "chunk_type"),
    )


class RefactorProposal(Base):
    __tablename__ = "refactor_proposals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("analyses.id", ondelete="CASCADE"), index=True)
    finding_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("findings.id", ondelete="SET NULL"), nullable=True, index=True)
    file_path: Mapped[str] = mapped_column(String(500), index=True)
    original_code: Mapped[str] = mapped_column(Text)
    refactored_code: Mapped[str] = mapped_column(Text)
    diff: Mapped[str] = mapped_column(Text)
    explanation: Mapped[str] = mapped_column(Text)
    test_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    test_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_impact: Mapped[str] = mapped_column(String(50))  # low, medium, high
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending, approved, rejected, applied
    github_pr_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    github_pr_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relaciones
    analysis: Mapped["Analysis"] = relationship(back_populates="refactor_proposals")


class GitHubInstallation(Base):
    __tablename__ = "github_installations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    installation_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    account_login: Mapped[str] = mapped_column(String(255), index=True)
    account_type: Mapped[str] = mapped_column(String(50))
    target_type: Mapped[str] = mapped_column(String(50))
    permissions: Mapped[dict] = mapped_column(JSON, default=dict)
    repository_selection: Mapped[str] = mapped_column(String(50))  # all, selected
    access_tokens_url: Mapped[str] = mapped_column(String(500))
    repositories_url: Mapped[str] = mapped_column(String(500))
    html_url: Mapped[str] = mapped_column(String(500))
    app_id: Mapped[int] = mapped_column(Integer)
    app_slug: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    github_delivery_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    event_type: Mapped[str] = mapped_column(String(50), index=True)
    action: Mapped[str | None] = mapped_column(String(50), nullable=True)
    repository_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("repositories.id", ondelete="SET NULL"), nullable=True, index=True)
    installation_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    processed: Mapped[bool] = mapped_column(Boolean, default=False)
    processing_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_webhook_events_type_action", "event_type", "action"),
    )