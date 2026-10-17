"""
Webhook handlers for GitHub events.
Processes pull_request, push, and other events to trigger analysis.
"""
from fastapi import APIRouter, Request, HTTPException, Header, Depends
from typing import Optional, Dict, Any
import logging
import json

from github.client import github_client
from app.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Repository, WebhookEvent, Analysis, AnalysisStatus
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/github")
async def github_webhook(
    request: Request,
    x_github_event: str = Header(None, alias="X-GitHub-Event"),
    x_github_delivery: str = Header(None, alias="X-GitHub-Delivery"),
    x_hub_signature_256: str = Header(None, alias="X-Hub-Signature-256"),
    db: AsyncSession = Depends(get_db)
):
    """Manejar webhooks de GitHub."""
    # Leer payload
    payload_bytes = await request.body()
    payload = json.loads(payload_bytes.decode('utf-8'))

    # Verificar firma
    if not github_client.verify_webhook_signature(payload_bytes, x_hub_signature_256 or ""):
        logger.warning(f"Invalid webhook signature for delivery {x_github_delivery}")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Registrar evento
    installation_id = payload.get("installation", {}).get("id")
    repo_data = payload.get("repository", {})

    webhook_event = WebhookEvent(
        github_delivery_id=x_github_delivery or str(uuid.uuid4()),
        event_type=x_github_event,
        action=payload.get("action"),
        installation_id=installation_id,
        payload=payload,
    )

    # Buscar repositorio en BD
    if repo_data:
        repo = await db.execute(
            select(Repository).where(Repository.github_id == repo_data["id"])
        )
        db_repo = repo.scalar_one_or_none()
        if db_repo:
            webhook_event.repository_id = db_repo.id

    db.add(webhook_event)
    await db.commit()

    # Procesar según tipo de evento
    try:
        if x_github_event == "pull_request":
            await handle_pull_request_event(payload, db, webhook_event)
        elif x_github_event == "push":
            await handle_push_event(payload, db, webhook_event)
        elif x_github_event == "installation":
            await handle_installation_event(payload, db, webhook_event)
        elif x_github_event == "installation_repositories":
            await handle_installation_repositories_event(payload, db, webhook_event)

        webhook_event.processed = True
        webhook_event.processed_at = datetime.utcnow()
    except Exception as e:
        logger.error(f"Error processing webhook {x_github_delivery}: {e}")
        webhook_event.processed = False
        webhook_event.processing_error = str(e)

    await db.commit()

    return {"status": "processed", "event": x_github_event}


async def handle_pull_request_event(payload: Dict[str, Any], db: AsyncSession, webhook_event: WebhookEvent):
    """Manejar eventos de Pull Request."""
    action = payload.get("action")
    pr_data = payload.get("pull_request", {})
    repo_data = payload.get("repository", {})

    # Solo actuar en opened, synchronize, reopened
    if action not in ["opened", "synchronize", "reopened", "ready_for_review"]:
        logger.info(f"Ignoring PR action: {action}")
        return

    pr_number = pr_data.get("number")
    repo_full_name = repo_data.get("full_name")
    installation_id = payload.get("installation", {}).get("id")

    logger.info(f"Processing PR #{pr_number} in {repo_full_name} (action: {action})")

    # Buscar o crear repositorio en BD
    repo = await db.execute(
        select(Repository).where(Repository.github_id == repo_data["id"])
    )
    db_repo = repo.scalar_one_or_none()

    if not db_repo:
        logger.warning(f"Repository {repo_full_name} not found in DB")
        return

    # Crear análisis
    analysis = Analysis(
        repository_id=db_repo.id,
        github_pr_number=pr_number,
        github_commit_sha=pr_data.get("head", {}).get("sha"),
        status=AnalysisStatus.PENDING,
        trigger_type="webhook",
        metadata={
            "action": action,
            "pr_title": pr_data.get("title"),
            "pr_author": pr_data.get("user", {}).get("login"),
            "webhook_delivery_id": webhook_event.github_delivery_id,
        }
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    # Disparar análisis asíncrono (via worker/queue)
    # TODO: Integrar con Celery/RQ
    logger.info(f"Created analysis {analysis.id} for PR #{pr_number}")

    # Notificar a n8n para orquestación
    await notify_n8n_analysis_started(analysis.id, db_repo, pr_number, pr_data)


async def handle_push_event(payload: Dict[str, Any], db: AsyncSession, webhook_event: WebhookEvent):
    """Manejar eventos de push (commits directos a rama)."""
    ref = payload.get("ref", "")
    repo_data = payload.get("repository", {})
    installation_id = payload.get("installation", {}).get("id")

    # Solo analizar pushes a ramas principales
    main_branches = ["refs/heads/main", "refs/heads/master", "refs/heads/develop"]
    if ref not in main_branches:
        logger.info(f"Ignoring push to non-main branch: {ref}")
        return

    repo_full_name = repo_data.get("full_name")
    head_commit = payload.get("head_commit", {})
    commit_sha = head_commit.get("id")

    logger.info(f"Processing push to {repo_full_name} ({ref}) commit {commit_sha[:8]}")

    # Buscar repositorio
    repo = await db.execute(
        select(Repository).where(Repository.github_id == repo_data["id"])
    )
    db_repo = repo.scalar_one_or_none()

    if not db_repo:
        return

    # Crear análisis
    analysis = Analysis(
        repository_id=db_repo.id,
        github_commit_sha=commit_sha,
        status=AnalysisStatus.PENDING,
        trigger_type="webhook_push",
        metadata={
            "ref": ref,
            "commit_message": head_commit.get("message"),
            "commit_author": head_commit.get("author", {}).get("name"),
            "webhook_delivery_id": webhook_event.github_delivery_id,
        }
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    logger.info(f"Created analysis {analysis.id} for push to {ref}")


async def handle_installation_event(payload: Dict[str, Any], db: AsyncSession, webhook_event: WebhookEvent):
    """Manejar eventos de instalación de GitHub App."""
    action = payload.get("action")
    installation_data = payload.get("installation", {})
    installation_id = installation_data.get("id")

    logger.info(f"GitHub App installation {action}: {installation_id}")

    if action == "created":
        # Sincronizar repositorios
        repos = await github_client.get_installation_repositories(installation_id)
        for repo_info in repos:
            await upsert_repository(db, repo_info, installation_id)

    elif action == "deleted":
        # Marcar repositorios como no accesibles
        await db.execute(
            select(Repository).where(Repository.installation_id == installation_id)
        )
        # TODO: Soft delete o marcar como inactive

    await db.commit()


async def handle_installation_repositories_event(payload: Dict[str, Any], db: AsyncSession, webhook_event: WebhookEvent):
    """Manejar cambios en repositorios de una instalación."""
    action = payload.get("action")
    repositories_added = payload.get("repositories_added", [])
    repositories_removed = payload.get("repositories_removed", [])
    installation_id = payload.get("installation", {}).get("id")

    if action == "added":
        for repo_data in repositories_added:
            repo_info = RepositoryInfo(
                id=repo_data["id"],
                name=repo_data["name"],
                full_name=repo_data["full_name"],
                description=repo_data.get("description"),
                html_url=repo_data["html_url"],
                clone_url=repo_data["clone_url"],
                default_branch=repo_data["default_branch"],
                language=repo_data.get("language"),
                stars=repo_data.get("stargazers_count", 0),
                forks=repo_data.get("forks_count", 0),
                is_private=repo_data.get("private", False),
                is_archived=repo_data.get("archived", False),
                owner_login=repo_data["owner"]["login"],
                owner_type=repo_data["owner"]["type"],
                permissions=repo_data.get("permissions", {}),
            )
            await upsert_repository(db, repo_info, installation_id)

    elif action == "removed":
        for repo_data in repositories_removed:
            await db.execute(
                select(Repository).where(Repository.github_id == repo_data["id"])
            )
            # TODO: Soft delete

    await db.commit()


async def upsert_repository(db: AsyncSession, repo_info: "RepositoryInfo", installation_id: int):
    """Insertar o actualizar repositorio en BD."""
    from app.models import Repository
    from datetime import datetime

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
        repo.installation_id = installation_id
        repo.updated_at = datetime.utcnow()
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
            installation_id=installation_id,
        )
        db.add(repo)

    return repo


async def notify_n8n_analysis_started(analysis_id: uuid.UUID, repo: Repository, pr_number: int, pr_data: Dict[str, Any]):
    """Notificar a n8n que se inició un análisis."""
    import httpx
    from config.settings import settings

    if not settings.N8N_WEBHOOK_URL:
        return

    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{settings.N8N_WEBHOOK_URL}/analysis-started",
                json={
                    "analysis_id": str(analysis_id),
                    "repository": {
                        "id": str(repo.id),
                        "name": repo.name,
                        "full_name": repo.full_name,
                        "html_url": repo.html_url,
                    },
                    "pull_request": {
                        "number": pr_number,
                        "title": pr_data.get("title"),
                        "author": pr_data.get("user", {}).get("login"),
                        "html_url": pr_data.get("html_url"),
                    },
                    "timestamp": datetime.utcnow().isoformat(),
                },
                timeout=10.0
            )
    except Exception as e:
        logger.warning(f"Failed to notify n8n: {e}")


# Import datetime at top
from datetime import datetime