"""
GitHub integration for repository management, webhooks, and PR creation.
Supports both GitHub App and Personal Access Token authentication.
"""
from github import Github, GithubIntegration, Auth
from githubkit import GitHub
from githubkit.versions.latest import models
from githubkit.exception import GitHubError
from typing import List, Optional, Dict, Any, AsyncGenerator
import logging
import base64
import hmac
import hashlib
from dataclasses import dataclass
from datetime import datetime

from config.settings import settings

logger = logging.getLogger(__name__)


@dataclass
class RepositoryInfo:
    """Información de un repositorio de GitHub."""
    id: int
    name: str
    full_name: str
    description: Optional[str]
    html_url: str
    clone_url: str
    default_branch: str
    language: Optional[str]
    stars: int
    forks: int
    is_private: bool
    is_archived: bool
    owner_login: str
    owner_type: str
    permissions: Dict[str, bool]


@dataclass
class PullRequestInfo:
    """Información de un Pull Request."""
    number: int
    title: str
    body: Optional[str]
    state: str
    head_sha: str
    base_sha: str
    head_ref: str
    base_ref: str
    html_url: str
    author_login: str
    created_at: datetime
    updated_at: datetime
    files: List[Dict[str, Any]]
    diff_url: str
    patch_url: str


@dataclass
class FileContent:
    """Contenido de un archivo en el repositorio."""
    path: str
    content: str
    encoding: str
    size: int
    sha: str


class GitHubClient:
    """Cliente para interactuar con GitHub API (REST + GraphQL)."""

    def __init__(self):
        self._app_client: Optional[GithubIntegration] = None
        self._user_client: Optional[Github] = None
        self._github_kit: Optional[GitHub] = None
        self._init_clients()

    def _init_clients(self):
        """Inicializar clientes de GitHub."""
        # GitHub App authentication
        if settings.GITHUB_APP_ID and settings.GITHUB_APP_PRIVATE_KEY:
            try:
                auth = Auth.AppAuth(
                    settings.GITHUB_APP_ID,
                    settings.GITHUB_APP_PRIVATE_KEY
                )
                self._app_client = GithubIntegration(auth=auth)
                logger.info("GitHub App client initialized")
            except Exception as e:
                logger.error(f"Failed to initialize GitHub App client: {e}")

        # GitHub Kit (para GraphQL y operaciones modernas)
        if settings.GITHUB_APP_ID and settings.GITHUB_APP_PRIVATE_KEY:
            try:
                self._github_kit = GitHub(
                    GitHub.installation_auth(
                        settings.GITHUB_APP_ID,
                        settings.GITHUB_APP_PRIVATE_KEY
                    )
                )
            except Exception as e:
                logger.warning(f"GitHub Kit initialization failed: {e}")

        # Fallback: Personal Access Token (si está configurado)
        # Nota: En producción usar solo GitHub App
        # if settings.GITHUB_TOKEN:
        #     self._user_client = Github(settings.GITHUB_TOKEN)

    def get_installation_client(self, installation_id: int) -> Optional[Github]:
        """Obtener cliente autenticado para una instalación específica."""
        if self._app_client:
            try:
                return self._app_client.get_github_for_installation(installation_id)
            except Exception as e:
                logger.error(f"Failed to get installation client: {e}")
        return None

    async def get_installation_repositories(self, installation_id: int) -> List[RepositoryInfo]:
        """Obtener repositorios accesibles por una instalación."""
        client = self.get_installation_client(installation_id)
        if not client:
            return []

        repos = []
        for repo in client.get_installation_repositories():
            repos.append(RepositoryInfo(
                id=repo.id,
                name=repo.name,
                full_name=repo.full_name,
                description=repo.description,
                html_url=repo.html_url,
                clone_url=repo.clone_url,
                default_branch=repo.default_branch,
                language=repo.language,
                stars=repo.stargazers_count,
                forks=repo.forks_count,
                is_private=repo.private,
                is_archived=repo.archived,
                owner_login=repo.owner.login,
                owner_type=repo.owner.type,
                permissions={k: v for k, v in repo.permissions.items()} if repo.permissions else {}
            ))
        return repos

    async def get_repository(self, installation_id: int, repo_full_name: str) -> Optional[RepositoryInfo]:
        """Obtener información de un repositorio específico."""
        client = self.get_installation_client(installation_id)
        if not client:
            return None

        try:
            repo = client.get_repo(repo_full_name)
            return RepositoryInfo(
                id=repo.id,
                name=repo.name,
                full_name=repo.full_name,
                description=repo.description,
                html_url=repo.html_url,
                clone_url=repo.clone_url,
                default_branch=repo.default_branch,
                language=repo.language,
                stars=repo.stargazers_count,
                forks=repo.forks_count,
                is_private=repo.private,
                is_archived=repo.archived,
                owner_login=repo.owner.login,
                owner_type=repo.owner.type,
                permissions={k: v for k, v in repo.permissions.items()} if repo.permissions else {}
            )
        except Exception as e:
            logger.error(f"Failed to get repository {repo_full_name}: {e}")
            return None

    async def get_pull_request(self, installation_id: int, repo_full_name: str, pr_number: int) -> Optional[PullRequestInfo]:
        """Obtener información de un Pull Request."""
        client = self.get_installation_client(installation_id)
        if not client:
            return None

        try:
            repo = client.get_repo(repo_full_name)
            pr = repo.get_pull(pr_number)

            # Obtener archivos cambiados
            files = []
            for file in pr.get_files():
                files.append({
                    "filename": file.filename,
                    "status": file.status,
                    "additions": file.additions,
                    "deletions": file.deletions,
                    "changes": file.changes,
                    "patch": file.patch,
                    "sha": file.sha,
                })

            return PullRequestInfo(
                number=pr.number,
                title=pr.title,
                body=pr.body,
                state=pr.state,
                head_sha=pr.head.sha,
                base_sha=pr.base.sha,
                head_ref=pr.head.ref,
                base_ref=pr.base.ref,
                html_url=pr.html_url,
                author_login=pr.user.login,
                created_at=pr.created_at,
                updated_at=pr.updated_at,
                files=files,
                diff_url=pr.diff_url,
                patch_url=pr.patch_url,
            )
        except Exception as e:
            logger.error(f"Failed to get PR #{pr_number} from {repo_full_name}: {e}")
            return None

    async def get_file_content(
        self,
        installation_id: int,
        repo_full_name: str,
        file_path: str,
        ref: Optional[str] = None
    ) -> Optional[FileContent]:
        """Obtener contenido de un archivo."""
        client = self.get_installation_client(installation_id)
        if not client:
            return None

        try:
            repo = client.get_repo(repo_full_name)
            content = repo.get_contents(file_path, ref=ref)

            if isinstance(content, list):
                # Es un directorio
                return None

            decoded_content = base64.b64decode(content.content).decode('utf-8')
            return FileContent(
                path=content.path,
                content=decoded_content,
                encoding=content.encoding,
                size=content.size,
                sha=content.sha,
            )
        except Exception as e:
            logger.error(f"Failed to get file {file_path} from {repo_full_name}: {e}")
            return None

    async def get_repository_tree(
        self,
        installation_id: int,
        repo_full_name: str,
        ref: Optional[str] = None,
        recursive: bool = True
    ) -> List[Dict[str, Any]]:
        """Obtener árbol de archivos del repositorio."""
        client = self.get_installation_client(installation_id)
        if not client:
            return []

        try:
            repo = client.get_repo(repo_full_name)
            tree = repo.get_git_tree(sha=ref or repo.default_branch, recursive=recursive)
            return [
                {
                    "path": item.path,
                    "mode": item.mode,
                    "type": item.type,
                    "sha": item.sha,
                    "size": item.size,
                }
                for item in tree.tree
            ]
        except Exception as e:
            logger.error(f"Failed to get tree for {repo_full_name}: {e}")
            return []

    async def create_pull_request(
        self,
        installation_id: int,
        repo_full_name: str,
        title: str,
        body: str,
        head_branch: str,
        base_branch: str,
        draft: bool = False
    ) -> Optional[PullRequestInfo]:
        """Crear un Pull Request."""
        client = self.get_installation_client(installation_id)
        if not client:
            return None

        try:
            repo = client.get_repo(repo_full_name)
            pr = repo.create_pull(
                title=title,
                body=body,
                head=head_branch,
                base=base_branch,
                draft=draft
            )
            return await self.get_pull_request(installation_id, repo_full_name, pr.number)
        except Exception as e:
            logger.error(f"Failed to create PR in {repo_full_name}: {e}")
            return None

    async def create_branch(
        self,
        installation_id: int,
        repo_full_name: str,
        branch_name: str,
        from_sha: str
    ) -> bool:
        """Crear una nueva rama."""
        client = self.get_installation_client(installation_id)
        if not client:
            return False

        try:
            repo = client.get_repo(repo_full_name)
            repo.create_git_ref(ref=f"refs/heads/{branch_name}", sha=from_sha)
            return True
        except Exception as e:
            logger.error(f"Failed to create branch {branch_name} in {repo_full_name}: {e}")
            return False

    async def create_or_update_file(
        self,
        installation_id: int,
        repo_full_name: str,
        file_path: str,
        content: str,
        message: str,
        branch: str,
        sha: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Crear o actualizar un archivo en una rama."""
        client = self.get_installation_client(installation_id)
        if not client:
            return None

        try:
            repo = client.get_repo(repo_full_name)
            if sha:
                # Actualizar archivo existente
                result = repo.update_file(
                    path=file_path,
                    message=message,
                    content=content,
                    sha=sha,
                    branch=branch
                )
            else:
                # Crear nuevo archivo
                result = repo.create_file(
                    path=file_path,
                    message=message,
                    content=content,
                    branch=branch
                )
            return {
                "commit_sha": result["commit"].sha,
                "content_sha": result["content"].sha,
            }
        except Exception as e:
            logger.error(f"Failed to create/update file {file_path} in {repo_full_name}: {e}")
            return None

    async def create_pr_review(
        self,
        installation_id: int,
        repo_full_name: str,
        pr_number: int,
        body: str,
        event: str = "COMMENT",  # APPROVE, REQUEST_CHANGES, COMMENT
        comments: Optional[List[Dict[str, Any]]] = None
    ) -> bool:
        """Crear una revisión en un Pull Request."""
        client = self.get_installation_client(installation_id)
        if not client:
            return False

        try:
            repo = client.get_repo(repo_full_name)
            pr = repo.get_pull(pr_number)

            review_comments = []
            if comments:
                for c in comments:
                    review_comments.append({
                        "path": c["path"],
                        "position": c["position"],
                        "body": c["body"],
                    })

            pr.create_review(
                body=body,
                event=event,
                comments=review_comments
            )
            return True
        except Exception as e:
            logger.error(f"Failed to create PR review: {e}")
            return False

    async def post_pr_comment(
        self,
        installation_id: int,
        repo_full_name: str,
        pr_number: int,
        body: str
    ) -> bool:
        """Publicar un comentario en un Pull Request."""
        client = self.get_installation_client(installation_id)
        if not client:
            return False

        try:
            repo = client.get_repo(repo_full_name)
            pr = repo.get_pull(pr_number)
            pr.create_issue_comment(body)
            return True
        except Exception as e:
            logger.error(f"Failed to post PR comment: {e}")
            return False

    def verify_webhook_signature(self, payload: bytes, signature: str) -> bool:
        """Verificar firma de webhook de GitHub."""
        if not settings.GITHUB_WEBHOOK_SECRET:
            logger.warning("No webhook secret configured, skipping verification")
            return True

        expected = "sha256=" + hmac.new(
            settings.GITHUB_WEBHOOK_SECRET.encode(),
            payload,
            hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(expected, signature)

    async def get_github_kit_client(self) -> Optional[GitHub]:
        """Obtener cliente GitHub Kit para GraphQL."""
        return self._github_kit


# Instancia global
github_client = GitHubClient()