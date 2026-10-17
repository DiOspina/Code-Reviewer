"""
Findings API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
import uuid

from app.database import get_db
from app.models import Finding, FindingSeverity, FindingCategory
from pydantic import BaseModel

router = APIRouter()


class FindingResponse(BaseModel):
    id: uuid.UUID
    analysis_id: uuid.UUID
    file_path: str
    start_line: int
    end_line: int
    start_column: Optional[int]
    end_column: Optional[int]
    severity: FindingSeverity
    category: FindingCategory
    rule_id: str
    rule_name: str
    message: str
    description: Optional[str]
    recommendation: Optional[str]
    cwe_id: Optional[str]
    owasp_category: Optional[str]
    confidence: float
    code_snippet: Optional[str]
    context_before: Optional[str]
    context_after: Optional[str]
    metadata: dict
    created_at: str

    class Config:
        from_attributes = True


class FindingStatsResponse(BaseModel):
    total: int
    by_severity: dict
    by_category: dict
    top_rules: List[dict]
    affected_files: int


@router.get("/{finding_id}", response_model=FindingResponse)
async def get_finding(
    finding_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Obtener detalles de un hallazgo específico."""
    finding = await db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    return FindingResponse(**finding.__dict__)


@router.get("/analysis/{analysis_id}/stats", response_model=FindingStatsResponse)
async def get_findings_stats(
    analysis_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Obtener estadísticas agregadas de hallazgos para un análisis."""
    # Verificar que el análisis existe
    from app.models import Analysis
    analysis = await db.get(Analysis, analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Total
    total = await db.scalar(
        select(func.count(Finding.id)).where(Finding.analysis_id == analysis_id)
    )

    # Por severidad
    severity_result = await db.execute(
        select(Finding.severity, func.count(Finding.id))
        .where(Finding.analysis_id == analysis_id)
        .group_by(Finding.severity)
    )
    by_severity = {s.value: c for s, c in severity_result.all()}

    # Por categoría
    category_result = await db.execute(
        select(Finding.category, func.count(Finding.id))
        .where(Finding.analysis_id == analysis_id)
        .group_by(Finding.category)
    )
    by_category = {c.value: cnt for c, cnt in category_result.all()}

    # Top reglas
    rules_result = await db.execute(
        select(Finding.rule_id, Finding.rule_name, func.count(Finding.id))
        .where(Finding.analysis_id == analysis_id)
        .group_by(Finding.rule_id, Finding.rule_name)
        .order_by(func.count(Finding.id).desc())
        .limit(10)
    )
    top_rules = [
        {"rule_id": r, "rule_name": n, "count": c}
        for r, n, c in rules_result.all()
    ]

    # Archivos afectados
    affected_files = await db.scalar(
        select(func.count(func.distinct(Finding.file_path)))
        .where(Finding.analysis_id == analysis_id)
    )

    return FindingStatsResponse(
        total=total or 0,
        by_severity=by_severity,
        by_category=by_category,
        top_rules=top_rules,
        affected_files=affected_files or 0,
    )


@router.get("/repository/{repository_id}/trends")
async def get_findings_trends(
    repository_id: uuid.UUID,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db)
):
    """Obtener tendencias de hallazgos a lo largo del tiempo."""
    from app.models import Analysis
    from datetime import datetime, timedelta

    cutoff = datetime.utcnow() - timedelta(days=days)

    # Obtener análisis en el período
    analyses_result = await db.execute(
        select(Analysis.id, Analysis.created_at)
        .where(
            Analysis.repository_id == repository_id,
            Analysis.created_at >= cutoff,
            Analysis.status == "completed"
        )
        .order_by(Analysis.created_at)
    )
    analyses = analyses_result.all()

    if not analyses:
        return {"trends": [], "period_days": days}

    # Para cada análisis, contar hallazgos por severidad
    trends = []
    for analysis_id, created_at in analyses:
        severity_counts = await db.execute(
            select(Finding.severity, func.count(Finding.id))
            .where(Finding.analysis_id == analysis_id)
            .group_by(Finding.severity)
        )
        trends.append({
            "date": created_at.isoformat(),
            "analysis_id": str(analysis_id),
            "by_severity": {s.value: c for s, c in severity_counts.all()},
        })

    return {
        "trends": trends,
        "period_days": days,
        "total_analyses": len(analyses),
    }