"""
Webhooks API router - re-exports from github.webhooks.
"""
from fastapi import APIRouter
from github.webhooks import router as github_webhooks_router

router = APIRouter()
router.include_router(github_webhooks_router)