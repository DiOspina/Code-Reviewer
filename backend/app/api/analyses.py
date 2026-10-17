"""
Analysis management API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload
from typing import List, Optional
import uuid
from datetime import datetime

from app.database import get_db
from app.models import Analysis, AnalysisStatus, Repository, Finding, RefactorProposal
from pydantic import BaseModel

router = APIRouter()


class AnalysisResponse(BaseModel):
    id: uuid.UUID
    repository_id: uuid.UUID
    github_pr_number: Optional[int]
    github_commit_sha: Optional[str]
    status: AnalysisStatus
    trigger_type: str
    total_files: int
    analyzed_files: int
    total_findings: int
    critical_findings: int
    high_findings: int
    medium_findings: int
    low_findings: int
    info_findings: int
    technical_debt_score: Optional[float]
    maintainability_index: Optional[float]
    duplication_percentage: Optional[float]
    started_at: Optional[str]
    completed_at: Optional[str]
    error_message: Optional[str]
    metadata: dict
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class AnalysisListResponse(BaseModel):
    analyses: List[AnalysisResponse]
    total: int
    page: int
    page_size: int


class AnalysisDetailResponse(AnalysisResponse):
    repository: Optional[dict] = None
    findings_summary: dict = {}
    refactor_proposals_count: int = 0


@router.get("/", response_model=AnalysisListResponse)
async def list_analyses(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    repository_id: Optional[uuid.UUID] = Query(None),
    status: Optional[AnalysisStatus] = Query(None),
    trigger_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Listar análisis con filtros."""
    query = select(Analysis)

    if repository_id:
        query = query.where(Analysis.repository_id == repository_id)
    if status:
        query = query.where(Analysis.status == status)
    if trigger_type:
        query = query.where(Analysis.trigger_type == trigger_type)

    # Contar total
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)

    # Paginar
    query = query.order_by(desc(Analysis.created_at))
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    analyses = result.scalars().all()

    return AnalysisListResponse(
        analyses=[AnalysisResponse(**a.__dict__) for a in analyses],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{analysis_id}", response_model=AnalysisDetailResponse)
async def get_analysis(
    analysis_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Obtener detalles completos de un análisis."""
    result = await db.execute(
        select(Analysis)
        .options(selectinload(Analysis.repository))
        .where(Analysis.id == analysis_id)
    )
    analysis = result.scalar_one_or_none()

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Resumen de hallazgos por severidad y categoría
    findings_result = await db.execute(
        select(
            Finding.severity,
            Finding.category,
            func.count(Finding.id)
        )
        .where(Finding.analysis_id == analysis_id)
        .group_by(Finding.severity, Finding.category)
    )
    findings_summary = {}
    for severity, category, count in findings_result.all():
        if severity not in findings_summary:
            findings_summary[severity] = {}
        findings_summary[severity][category] = count

    # Contar propuestas de refactorización
    refactors_count = await db.scalar(
        select(func.count(RefactorProposal.id))
        .where(RefactorProposal.analysis_id == analysis_id)
    )

    repo_data = None
    if analysis.repository:
        repo_data = {
            "id": str(analysis.repository.id),
            "name": analysis.repository.name,
            "full_name": analysis.repository.full_name,
            "html_url": analysis.repository.html_url,
        }

    return AnalysisDetailResponse(
        **analysis.__dict__,
        repository=repo_data,
        findings_summary=findings_summary,
        refactor_proposals_count=refactors_count or 0,
    )


@router.get("/{analysis_id}/findings")
async def get_analysis_findings(
    analysis_id: uuid.UUID,
    severity: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    file_path: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db)
):
    """Obtener hallazgos de un análisis con filtros."""
    analysis = await db.get(Analysis, analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    from app.models import Finding, FindingSeverity, FindingCategory

    query = select(Finding).where(Finding.analysis_id == analysis_id)

    if severity:
        try:
            query = query.where(Finding.severity == FindingSeverity(severity))
        except ValueError:
            pass
    if category:
        try:
            query = query.where(Finding.category == FindingCategory(category))
        except ValueError:
            pass
    if file_path:
        query = query.where(Finding.file_path.ilike(f"%{file_path}%"))

    # Contar total
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)

    # Paginar
    query = query.order_by(Finding.severity, Finding.file_path, Finding.start_line)
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    findings = result.scalars().all()

    return {
        "findings": [f.__dict__ for f in findings],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{analysis_id}/refactor-proposals")
async def get_analysis_refactor_proposals(
    analysis_id: uuid.UUID,
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Obtener propuestas de refactorización de un análisis."""
    analysis = await db.get(Analysis, analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    query = select(RefactorProposal).where(RefactorProposal.analysis_id == analysis_id)

    if status:
        query = query.where(RefactorProposal.status == status)

    result = await db.execute(query.order_by(RefactorProposal.created_at))
    proposals = result.scalars().all()

    return {
        "proposals": [p.__dict__ for p in proposals],
        "total": len(proposals),
    }


@router.post("/{analysis_id}/retry")
async def retry_analysis(
    analysis_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Reintentar un análisis fallido."""
    analysis = await db.get(Analysis, analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    if analysis.status not in [AnalysisStatus.FAILED, AnalysisStatus.CANCELLED]:
        raise HTTPException(status_code=400, detail="Only failed or cancelled analyses can be retried")

    # Resetear análisis
    analysis.status = AnalysisStatus.PENDING
    analysis.error_message = None
    analysis.started_at = None
    analysis.completed_at = None
    analysis.total_findings = 0
    analysis.critical_findings = 0
    analysis.high_findings = 0
    analysis.medium_findings = 0
    analysis.low_findings = 0
    analysis.info_findings = 0

    # Eliminar hallazgos y propuestas previas
    from app.models import Finding, RefactorProposal
    await db.execute(
        select(Finding).where(Finding.analysis_id == analysis_id).delete()
    )
    await db.execute(
        select(RefactorProposal).where(RefactorProposal.analysis_id == analysis_id).delete()
    )

    await db.commit()

    # TODO: Enviar a worker queue
    # background_tasks.add_task(run_analysis, analysis_id)

    return {
        "analysis_id": analysis.id,
        "status": "queued",
        "message": "Analysis queued for retry",
    }


@router.delete("/{analysis_id}")
async def delete_analysis(
    analysis_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Eliminar un análisis y sus datos asociados."""
    analysis = await db.get(Analysis, analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    await db.delete(analysis)
    await db.commit()

    return {"message": "Analysis deleted successfully"}