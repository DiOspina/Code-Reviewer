"""
Background worker for processing analysis tasks.
Uses asyncio for concurrent task processing.
"""
import asyncio
import logging
import signal
import sys
from typing import Optional
import uuid

from app.database import async_session_maker, init_db
from app.models import Analysis, AnalysisStatus, Repository, Finding, RefactorProposal, CodeChunk
from agents.auditor import audit_repository, audit_file
from agents.refactor import create_refactor_proposal, refactor_finding
from ast.parser import ast_parser
from rag.vector_store import vector_store
from rag.embeddings import embedding_manager
from github.client import github_client
from config.settings import settings

logger = logging.getLogger(__name__)


class AnalysisWorker:
    """Worker para procesar análisis en background."""

    def __init__(self, max_concurrent: int = 5):
        self.max_concurrent = max_concurrent
        self.running = False
        self.tasks: set = set()

    async def start(self):
        """Iniciar el worker."""
        self.running = True
        logger.info("Analysis worker started")
        await self._run_loop()

    async def stop(self):
        """Detener el worker gracefully."""
        self.running = False
        # Esperar tareas en curso
        if self.tasks:
            logger.info(f"Waiting for {len(self.tasks)} running tasks to complete...")
            await asyncio.gather(*self.tasks, return_exceptions=True)
        logger.info("Analysis worker stopped")

    async def _run_loop(self):
        """Loop principal del worker."""
        while self.running:
            try:
                # Limpiar tareas completadas
                self.tasks = {t for t in self.tasks if not t.done()}

                # Verificar capacidad
                if len(self.tasks) >= self.max_concurrent:
                    await asyncio.sleep(5)
                    continue

                # Buscar análisis pendientes
                analysis_id = await self._get_pending_analysis()
                if analysis_id:
                    task = asyncio.create_task(self._process_analysis(analysis_id))
                    self.tasks.add(task)
                else:
                    await asyncio.sleep(10)  # Esperar antes de volver a buscar

            except Exception as e:
                logger.error(f"Worker loop error: {e}")
                await asyncio.sleep(30)

    async def _get_pending_analysis(self) -> Optional[uuid.UUID]:
        """Obtener próximo análisis pendiente."""
        async with async_session_maker() as session:
            from sqlalchemy import select
            result = await session.execute(
                select(Analysis.id)
                .where(Analysis.status == AnalysisStatus.PENDING)
                .order_by(Analysis.created_at)
                .limit(1)
            )
            return result.scalar_one_or_none()

    async def _process_analysis(self, analysis_id: uuid.UUID):
        """Procesar un análisis completo."""
        logger.info(f"Processing analysis {analysis_id}")

        async with async_session_maker() as session:
            analysis = await session.get(Analysis, analysis_id)
            if not analysis:
                logger.error(f"Analysis {analysis_id} not found")
                return

            repo = await session.get(Repository, analysis.repository_id)
            if not repo:
                logger.error(f"Repository for analysis {analysis_id} not found")
                return

            # Marcar como en progreso
            analysis.status = AnalysisStatus.RUNNING
            analysis.started_at = asyncio.get_event_loop().time()
            await session.commit()

        try:
            # Clonar repositorio o usar caché
            repo_path = await self._prepare_repository(repo, analysis)

            # Ejecutar análisis
            if analysis.github_pr_number:
                # Análisis de PR - solo archivos cambiados
                result = await self._analyze_pr(repo, analysis, repo_path)
            else:
                # Análisis completo del repositorio
                result = await audit_repository(str(analysis.repository_id), repo_path)

            # Guardar hallazgos
            await self._save_findings(analysis_id, result["findings"])

            # Generar propuestas de refactorización
            if result["findings"]:
                await self._generate_refactor_proposals(analysis_id, result["findings"], repo_path)

            # Actualizar análisis
            async with async_session_maker() as session:
                analysis = await session.get(Analysis, analysis_id)
                analysis.status = AnalysisStatus.COMPLETED
                analysis.completed_at = asyncio.get_event_loop().time()
                analysis.total_findings = result["metadata"]["total_findings"]
                analysis.critical_findings = result["metadata"]["by_severity"]["critical"]
                analysis.high_findings = result["metadata"]["by_severity"]["high"]
                analysis.medium_findings = result["metadata"]["by_severity"]["medium"]
                analysis.low_findings = result["metadata"]["by_severity"]["low"]
                analysis.info_findings = result["metadata"]["by_severity"]["info"]

                # Calcular métricas de deuda técnica
                analysis.technical_debt_score = self._calculate_technical_debt(result["findings"])
                analysis.maintainability_index = self._calculate_maintainability_index(result["findings"])

                await session.commit()

            # Notificar a n8n
            await self._notify_n8n_completion(analysis_id, repo, result)

            logger.info(f"Analysis {analysis_id} completed successfully")

        except Exception as e:
            logger.error(f"Analysis {analysis_id} failed: {e}", exc_info=True)
            async with async_session_maker() as session:
                analysis = await session.get(Analysis, analysis_id)
                if analysis:
                    analysis.status = AnalysisStatus.FAILED
                    analysis.error_message = str(e)
                    analysis.completed_at = asyncio.get_event_loop().time()
                    await session.commit()

    async def _prepare_repository(self, repo: Repository, analysis: Analysis) -> str:
        """Preparar repositorio local para análisis."""
        import tempfile
        import os
        import git

        # Usar directorio temporal
        repo_dir = f"/tmp/agent_reviewer/{repo.github_id}"

        if os.path.exists(repo_dir):
            # Actualizar repositorio existente
            try:
                g_repo = git.Repo(repo_dir)
                g_repo.remotes.origin.pull()
            except Exception:
                # Re-clonar si falla
                import shutil
                shutil.rmtree(repo_dir)
                g_repo = git.Repo.clone_from(repo.clone_url, repo_dir)
        else:
            # Clonar nuevo
            os.makedirs(os.path.dirname(repo_dir), exist_ok=True)
            g_repo = git.Repo.clone_from(repo.clone_url, repo_dir)

        # Checkout al commit/PR específico
        if analysis.github_commit_sha:
            g_repo.git.checkout(analysis.github_commit_sha)
        elif analysis.github_pr_number:
            # Para PR, necesitamos el commit del head
            # Esto es simplificado; en producción usar GitHub API
            g_repo.git.checkout(repo.default_branch)

        return repo_dir

    async def _analyze_pr(self, repo: Repository, analysis: Analysis, repo_path: str) -> dict:
        """Analizar solo archivos cambiados en un PR."""
        # Obtener archivos del PR via GitHub API
        pr = await github_client.get_pull_request(
            repo.installation_id,
            repo.full_name,
            analysis.github_pr_number
        )

        if not pr:
            return await audit_repository(str(analysis.repository_id), repo_path)

        all_findings = []
        all_chunks = []

        for file_info in pr.files:
            if file_info["status"] == "removed":
                continue

            file_path = file_info["filename"]
            full_path = os.path.join(repo_path, file_path)

            if not os.path.exists(full_path):
                continue

            # Detectar lenguaje
            language = ast_parser.get_language_for_file(file_path)
            if not language:
                continue

            with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()

            # Analizar archivo
            result = await audit_file(str(analysis.repository_id), file_path, content, language)
            all_findings.extend(result["findings"])

            # Obtener chunks para refactorización
            chunks = ast_parser.parse_file(file_path, content)
            all_chunks.extend(chunks)

        return {
            "findings": all_findings,
            "metadata": {
                "total_findings": len(all_findings),
                "by_severity": {
                    "critical": len([f for f in all_findings if f["severity"] == "critical"]),
                    "high": len([f for f in all_findings if f["severity"] == "high"]),
                    "medium": len([f for f in all_findings if f["severity"] == "medium"]),
                    "low": len([f for f in all_findings if f["severity"] == "low"]),
                    "info": len([f for f in all_findings if f["severity"] == "info"]),
                }
            },
            "chunks": all_chunks,
        }

    async def _save_findings(self, analysis_id: uuid.UUID, findings: List[dict]):
        """Guardar hallazgos en BD."""
        async with async_session_maker() as session:
            from app.models import Finding, FindingSeverity, FindingCategory

            for f in findings:
                finding = Finding(
                    analysis_id=analysis_id,
                    file_path=f["file_path"],
                    start_line=f["start_line"],
                    end_line=f["end_line"],
                    start_column=f.get("start_column"),
                    end_column=f.get("end_column"),
                    severity=FindingSeverity(f["severity"]),
                    category=FindingCategory(f["category"]),
                    rule_id=f["rule_id"],
                    rule_name=f["rule_name"],
                    message=f["message"],
                    description=f.get("description"),
                    recommendation=f.get("recommendation"),
                    cwe_id=f.get("cwe_id"),
                    owasp_category=f.get("owasp_category"),
                    confidence=f.get("confidence", 1.0),
                    code_snippet=f.get("code_snippet"),
                    context_before=f.get("context_before"),
                    context_after=f.get("context_after"),
                    metadata=f.get("metadata", {}),
                )
                session.add(finding)

            await session.commit()

    async def _generate_refactor_proposals(
        self,
        analysis_id: uuid.UUID,
        findings: List[dict],
        repo_path: str
    ):
        """Generar propuestas de refactorización."""
        # Obtener todos los chunks del repositorio
        all_chunks = []
        for chunk in ast_parser.parse_repository(repo_path):
            all_chunks.append(chunk)

        proposals = await create_refactor_proposals(
            str(analysis_id),
            analysis_id,
            findings,
            all_chunks
        )

        async with async_session_maker() as session:
            from app.models import RefactorProposal

            for p in proposals:
                proposal = RefactorProposal(
                    analysis_id=analysis_id,
                    finding_id=p.get("finding_ids", [None])[0],
                    file_path=p["file_path"],
                    original_code=p["original_code"],
                    refactored_code=p["refactored_code"],
                    diff=p["diff"],
                    explanation=p["explanation"],
                    test_code=p.get("test_code"),
                    test_explanation=p.get("test_explanation"),
                    estimated_impact=p["estimated_impact"],
                    confidence=p["confidence"],
                    status="pending",
                    metadata={
                        **p.get("metadata", {}),
                        "language": p.get("language", "python"),
                    },
                )
                session.add(proposal)

            await session.commit()

    def _calculate_technical_debt(self, findings: List[dict]) -> float:
        """Calcular score de deuda técnica (0-100, menor es mejor)."""
        severity_weights = {
            "critical": 20,
            "high": 10,
            "medium": 5,
            "low": 2,
            "info": 1,
        }
        total = sum(severity_weights.get(f["severity"], 0) for f in findings)
        # Normalizar a 0-100
        return min(100.0, total)

    def _calculate_maintainability_index(self, findings: List[dict]) -> float:
        """Calcular índice de mantenibilidad (0-100, mayor es mejor)."""
        # Basado en hallazgos de mantenibilidad
        maint_findings = [f for f in findings if f["category"] == "maintainability"]
        if not maint_findings:
            return 100.0

        penalty = len(maint_findings) * 5
        return max(0.0, 100.0 - penalty)

    async def _notify_n8n_completion(self, analysis_id: uuid.UUID, repo: Repository, result: dict):
        """Notificar a n8n que el análisis completó."""
        import httpx

        if not settings.N8N_WEBHOOK_URL:
            return

        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{settings.N8N_WEBHOOK_URL}/analysis-completed",
                    json={
                        "analysis_id": str(analysis_id),
                        "repository": {
                            "id": str(repo.id),
                            "name": repo.name,
                            "full_name": repo.full_name,
                        },
                        "summary": result["metadata"],
                        "timestamp": asyncio.get_event_loop().time(),
                    },
                    timeout=10.0
                )
        except Exception as e:
            logger.warning(f"Failed to notify n8n: {e}")


async def main():
    """Entry point para el worker."""
    # Configurar logging
    logging.basicConfig(
        level=settings.LOG_LEVEL,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    # Inicializar BD
    await init_db()

    # Inicializar proveedores de embeddings
    if settings.OPENAI_API_KEY:
        from rag.embeddings import OpenAIEmbeddingProvider
        embedding_manager.register_provider(
            "openai",
            OpenAIEmbeddingProvider(settings.OPENAI_API_KEY),
            is_default=True
        )

    if settings.OLLAMA_BASE_URL:
        from rag.embeddings import OllamaEmbeddingProvider
        embedding_manager.register_provider(
            "ollama",
            OllamaEmbeddingProvider(settings.OLLAMA_BASE_URL)
        )

    # Crear índices vectoriales
    async with async_session_maker() as session:
        await vector_store.initialize_extension()
        await vector_store.create_hnsw_index(session)

    # Iniciar worker
    worker = AnalysisWorker(max_concurrent=settings.MAX_CONCURRENT_ANALYSES)

    # Manejar señales
    loop = asyncio.get_event_loop()

    def signal_handler():
        logger.info("Shutdown signal received")
        asyncio.create_task(worker.stop())

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, signal_handler)

    await worker.start()


if __name__ == "__main__":
    asyncio.run(main())