"""
Refactor proposals API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
import uuid

from app.database import get_db
from app.models import RefactorProposal, Analysis
from github.client import github_client
from pydantic import BaseModel
from config.settings import settings

router = APIRouter()


class RefactorProposalResponse(BaseModel):
    id: uuid.UUID
    analysis_id: uuid.UUID
    finding_id: Optional[uuid.UUID]
    file_path: str
    original_code: str
    refactored_code: str
    diff: str
    explanation: str
    test_code: Optional[str]
    test_explanation: Optional[str]
    estimated_impact: str
    confidence: float
    status: str
    github_pr_url: Optional[str]
    github_pr_number: Optional[int]
    metadata: dict
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class CreatePRRequest(BaseModel):
    proposal_id: uuid.UUID
    base_branch: Optional[str] = None
    draft: bool = True


@router.get("/{proposal_id}", response_model=RefactorProposalResponse)
async def get_refactor_proposal(
    proposal_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Obtener detalles de una propuesta de refactorización."""
    proposal = await db.get(RefactorProposal, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Refactor proposal not found")
    return RefactorProposalResponse(**proposal.__dict__)


@router.get("/analysis/{analysis_id}", response_model=List[RefactorProposalResponse])
async def get_refactor_proposals_by_analysis(
    analysis_id: uuid.UUID,
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Obtener todas las propuestas de un análisis."""
    analysis = await db.get(Analysis, analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    query = select(RefactorProposal).where(RefactorProposal.analysis_id == analysis_id)
    if status:
        query = query.where(RefactorProposal.status == status)

    result = await db.execute(query.order_by(RefactorProposal.created_at))
    proposals = result.scalars().all()

    return [RefactorProposalResponse(**p.__dict__) for p in proposals]


@router.post("/{proposal_id}/approve")
async def approve_refactor_proposal(
    proposal_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Aprobar una propuesta de refactorización."""
    proposal = await db.get(RefactorProposal, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    proposal.status = "approved"
    await db.commit()
    await db.refresh(proposal)

    return RefactorProposalResponse(**proposal.__dict__)


@router.post("/{proposal_id}/reject")
async def reject_refactor_proposal(
    proposal_id: uuid.UUID,
    reason: str = "",
    db: AsyncSession = Depends(get_db)
):
    """Rechazar una propuesta de refactorización."""
    proposal = await db.get(RefactorProposal, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    proposal.status = "rejected"
    proposal.metadata = {**proposal.metadata, "rejection_reason": reason}
    await db.commit()
    await db.refresh(proposal)

    return RefactorProposalResponse(**proposal.__dict__)


@router.post("/create-pr")
async def create_pull_request_for_proposal(
    request: CreatePRRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Crear Pull Request en GitHub con el código refactorizado."""
    proposal = await db.get(RefactorProposal, request.proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    if proposal.status not in ["approved", "pending"]:
        raise HTTPException(status_code=400, detail="Proposal must be approved or pending")

    analysis = await db.get(Analysis, proposal.analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Obtener repositorio
    from app.models import Repository
    repo = await db.get(Repository, analysis.repository_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if not repo.installation_id:
        raise HTTPException(status_code=400, detail="Repository not linked to GitHub App installation")

    # Crear rama para el PR
    import uuid as uuid_lib
    branch_name = f"refactor/{proposal.file_path.replace('/', '-')}-{uuid_lib.uuid4().hex[:8]}"

    # Obtener SHA base
    base_sha = analysis.github_commit_sha or repo.default_branch

    # Crear rama
    success = await github_client.create_branch(
        installation_id=repo.installation_id,
        repo_full_name=repo.full_name,
        branch_name=branch_name,
        from_sha=base_sha
    )

    if not success:
        raise HTTPException(status_code=500, detail="Failed to create branch")

    # Actualizar archivo con código refactorizado
    # Primero obtener SHA del archivo actual
    file_content = await github_client.get_file_content(
        installation_id=repo.installation_id,
        repo_full_name=repo.full_name,
        file_path=proposal.file_path,
        ref=branch_name
    )

    file_sha = file_content.sha if file_content else None

    # Crear/actualizar archivo
    result = await github_client.create_or_update_file(
        installation_id=repo.installation_id,
        repo_full_name=repo.full_name,
        file_path=proposal.file_path,
        content=proposal.refactored_code,
        message=f"refactor: {proposal.explanation[:100]}",
        branch=branch_name,
        sha=file_sha
    )

    if not result:
        raise HTTPException(status_code=500, detail="Failed to update file")

    # Crear PR
    base_branch = request.base_branch or repo.default_branch
    pr_title = f"Refactor: {proposal.explanation.split('.')[0]}"
    pr_body = f"""## Automated Refactoring Proposal

This PR was automatically generated by Agent Reviewer.

### Changes
{proposal.explanation}

### Original Issue
- **File**: {proposal.file_path}
- **Lines**: {proposal.metadata.get('start_line', 'N/A')}-{proposal.metadata.get('end_line', 'N/A')}
- **Confidence**: {proposal.confidence:.0%}
- **Estimated Impact**: {proposal.estimated_impact}

### Diff
```diff
{proposal.diff}
```

### Suggested Tests
```{proposal.metadata.get('language', 'python')}
{proposal.test_code or '# No tests generated'}
```

---
*Generated by Agent Reviewer*"""

    pr = await github_client.create_pull_request(
        installation_id=repo.installation_id,
        repo_full_name=repo.full_name,
        title=pr_title,
        body=pr_body,
        head_branch=branch_name,
        base_branch=base_branch,
        draft=request.draft
    )

    if not pr:
        raise HTTPException(status_code=500, detail="Failed to create pull request")

    # Actualizar propuesta
    proposal.status = "applied"
    proposal.github_pr_url = pr.html_url
    proposal.github_pr_number = pr.number
    proposal.metadata = {**proposal.metadata, "pr_branch": branch_name}
    await db.commit()
    await db.refresh(proposal)

    return {
        "proposal": RefactorProposalResponse(**proposal.__dict__),
        "pull_request": {
            "number": pr.number,
            "url": pr.html_url,
            "title": pr.title,
        }
    }


@router.get("/{proposal_id}/diff")
async def get_proposal_diff(
    proposal_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Obtener diff formateado de una propuesta."""
    proposal = await db.get(RefactorProposal, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    return {
        "file_path": proposal.file_path,
        "diff": proposal.diff,
        "original_code": proposal.original_code,
        "refactored_code": proposal.refactored_code,
    }