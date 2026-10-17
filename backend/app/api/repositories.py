"""
Repository management API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
import uuid

from app.database import get_db
from app.models import Repository, Analysis
from github.client import github_client, RepositoryInfo
from pydantic import BaseModel, HttpUrl
from config.settings import settings

router = APIRouter()


class RepositoryResponse(BaseModel):
    id: uuid.UUID
    github_id: int
    name: str
    full_name: str
    description: Optional[str]
    html_url: HttpUrl
    clone_url: HttpUrl
    default_branch: str
    language: Optional[str]
    stars: int
    forks: int
    is_private: bool
    is_archived: bool
    owner_login: str
    owner_type: str
    installation_id: Optional[int]
    created_at: str
    updated_at: str
    last_analyzed_at: Optional[str]
    analyses_count: int = 0

    class Config:
        from_attributes = True


class RepositoryListResponse(BaseModel):
    repositories: List[RepositoryResponse]
    total: int
    page: int
    page_size: int


class SyncRepositoriesRequest(BaseModel):
    installation_id: int


@router.get("/", response_model=RepositoryListResponse)
async def list_repositories(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    installation_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Listar repositorios con paginación y filtros."""
    query = select(Repository)

    if installation_id:
        query = query.where(Repository.installation_id == installation_id)

    if search:
        query = query.where(
            Repository.name.ilike(f"%{search}%") |
            Repository.full_name.ilike(f"%{search}%") |
            Repository.description.ilike(f"%{search}%")
        )

    # Contar total
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)

    # Paginar
    query = query.order_by(Repository.updated_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    repos = result.scalars().all()

    # Contar análisis por repo
    repo_ids = [r.id for r in repos]
    analyses_count = {}
    if repo_ids:
        analyses_result = await db.execute(
            select(Analysis.repository_id, func.count(Analysis.id))
            .where(Analysis.repository_id.in_(repo_ids))
            .group_by(Analysis.repository_id)
        )
        analyses_count = dict(analyses_result.all())

    return RepositoryListResponse(
        repositories=[
            RepositoryResponse(
                **repo.__dict__,
                analyses_count=analyses_count.get(repo.id, 0)
            )
            for repo in repos
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{repository_id}", response_model=RepositoryResponse)
async def get_repository(
    repository_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Obtener detalles de un repositorio."""
    result = await db.execute(
        select(Repository).where(Repository.id == repository_id)
    )
    repo = result.scalar_one_or_none()

    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Contar análisis
    analyses_count = await db.scalar(
        select(func.count(Analysis.id)).where(Analysis.repository_id == repository_id)
    )

    return RepositoryResponse(**repo.__dict__, analyses_count=analyses_count or 0)


@router.post("/sync", response_model=List[RepositoryResponse])
async def sync_repositories(
    request: SyncRepositoriesRequest,
    db: AsyncSession = Depends(get_db)
):
    """Sincronizar repositorios desde GitHub App installation."""
    repos_data = await github_client.get_installation_repositories(request.installation_id)

    synced = []
    for repo_info in repos_data:
        # Upsert en BD
        existing = await db.execute(
            select(Repository).where(Repository.github_id == repo_info.id)
        )
        repo = existing.scalar_one_or_none()

        if repo:
            repo.name = repo_info.name
            repo.full_name = repo_info.full_name
            repo.description = repo_info.description
            repo.html_url = repo_info.html_url
            repo.clone_url = repo_info.clone_url
            repo.default_branch = repo_info.default_branch
            repo.language = repo_info.language
            repo.stars = repo_info.stars
            repo.forks = repo_info.forks
            repo.is_private = repo_info.is_private
            repo.is_archived = repo_info.is_archived
            repo.owner_login = repo_info.owner_login
            repo.owner_type = repo_info.owner_type
            repo.installation_id = request.installation_id
        else:
            repo = Repository(
                github_id=repo_info.id,
                name=repo_info.name,
                full_name=repo_info.full_name,
                description=repo_info.description,
                html_url=repo_info.html_url,
                clone_url=repo_info.clone_url,
                default_branch=repo_info.default_branch,
                language=repo_info.language,
                stars=repo_info.stars,
                forks=repo_info.forks,
                is_private=repo_info.is_private,
                is_archived=repo_info.is_archived,
                owner_login=repo_info.owner_login,
                owner_type=repo_info.owner_type,
                installation_id=request.installation_id,
            )
            db.add(repo)

        synced.append(repo)

    await db.commit()

    # Refrescar para obtener IDs
    for repo in synced:
        await db.refresh(repo)

    return [RepositoryResponse(**r.__dict__, analyses_count=0) for r in synced]


@router.post("/{repository_id}/analyze")
async def trigger_analysis(
    repository_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Disparar análisis completo de un repositorio."""
    repo = await db.get(Repository, repository_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Crear análisis
    from app.models import Analysis, AnalysisStatus
    analysis = Analysis(
        repository_id=repository_id,
        status=AnalysisStatus.PENDING,
        trigger_type="manual",
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    # TODO: Enviar a worker queue (Celery/RQ)
    # background_tasks.add_task(run_full_analysis, analysis.id)

    return {
        "analysis_id": analysis.id,
        "status": "queued",
        "message": "Analysis queued for processing",
    }


@router.get("/{repository_id}/stats")
async def get_repository_stats(
    repository_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Obtener estadísticas de un repositorio."""
    repo = await db.get(Repository, repository_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    from rag.vector_store import vector_store
    vector_stats = await vector_store.get_repository_stats(str(repository_id))

    # Estadísticas de análisis
    analyses_result = await db.execute(
        select(
            func.count(Analysis.id).label("total"),
            func.count(Analysis.id).filter(Analysis.status == "completed").label("completed"),
            func.avg(Analysis.technical_debt_score).label("avg_debt"),
        ).where(Analysis.repository_id == repository_id)
    )
    analyses_stats = analyses_result.first()

    return {
        "repository": RepositoryResponse(**repo.__dict__, analyses_count=0),
        "vector_index": vector_stats,
        "analyses": {
            "total": analyses_stats.total or 0,
            "completed": analyses_stats.completed or 0,
            "avg_technical_debt": float(analyses_stats.avg_debt or 0),
        },
    }