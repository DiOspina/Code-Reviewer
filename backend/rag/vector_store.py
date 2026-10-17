"""
Vector store for code embeddings using PostgreSQL + pgvector.
Supports semantic search over codebase chunks.
"""
from sqlalchemy import select, func, text, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import VECTOR
from typing import List, Optional, Dict, Any, Tuple
import numpy as np
import logging
from dataclasses import dataclass

from app.database import async_session_maker
from app.models import CodeChunk, Repository
from ast.parser import CodeChunk as ASTCodeChunk

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    """Resultado de búsqueda semántica."""
    chunk: CodeChunk
    similarity: float
    distance: float


class VectorStore:
    """Gestor de embeddings y búsqueda vectorial en PostgreSQL + pgvector."""

    def __init__(self, embedding_dim: int = 1536):
        self.embedding_dim = embedding_dim

    async def initialize_extension(self) -> None:
        """Asegurar que la extensión pgvector existe."""
        async with async_session_maker() as session:
            await session.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await session.commit()
            logger.info("pgvector extension ensured")

    async def create_hnsw_index(self, session: AsyncSession, table: str = "code_chunks",
                                 column: str = "embedding", m: int = 16, ef_construction: int = 64) -> None:
        """Crear índice HNSW para búsqueda vectorial aproximada rápida."""
        index_name = f"ix_{table}_{column}_hnsw"
        sql = f"""
        CREATE INDEX IF NOT EXISTS {index_name}
        ON {table} USING hnsw ({column} vector_cosine_ops)
        WITH (m = {m}, ef_construction = {ef_construction})
        """
        await session.execute(text(sql))
        await session.commit()
        logger.info(f"HNSW index created: {index_name}")

    async def create_ivfflat_index(self, session: AsyncSession, table: str = "code_chunks",
                                    column: str = "embedding", lists: int = 100) -> None:
        """Crear índice IVFFlat para búsqueda vectorial (alternativa a HNSW)."""
        index_name = f"ix_{table}_{column}_ivfflat"
        sql = f"""
        CREATE INDEX IF NOT EXISTS {index_name}
        ON {table} USING ivfflat ({column} vector_cosine_ops)
        WITH (lists = {lists})
        """
        await session.execute(text(sql))
        await session.commit()
        logger.info(f"IVFFlat index created: {index_name}")

    async def upsert_chunks(self, chunks: List[ASTCodeChunk], repository_id: str) -> int:
        """Insertar o actualizar chunks con sus embeddings."""
        from app.models import CodeChunk as DBCodeChunk
        import uuid

        async with async_session_maker() as session:
            inserted = 0
            for chunk in chunks:
                # Verificar si ya existe (basado en file_path, name, chunk_type, content hash)
                existing = await session.execute(
                    select(DBCodeChunk).where(
                        and_(
                            DBCodeChunk.repository_id == uuid.UUID(repository_id),
                            DBCodeChunk.file_path == chunk.file_path,
                            DBCodeChunk.name == chunk.name,
                            DBCodeChunk.chunk_type == chunk.chunk_type,
                        )
                    )
                )
                db_chunk = existing.scalar_one_or_none()

                embedding = chunk.metadata.get("embedding") if chunk.metadata else None

                if db_chunk:
                    # Actualizar
                    db_chunk.content = chunk.content
                    db_chunk.summary = chunk.summary
                    db_chunk.docstring = chunk.docstring
                    db_chunk.complexity = chunk.complexity
                    db_chunk.dependencies = chunk.dependencies
                    db_chunk.embedding = embedding
                    db_chunk.metadata = chunk.metadata
                    db_chunk.start_line = chunk.start_line
                    db_chunk.end_line = chunk.end_line
                    db_chunk.parent_name = chunk.parent_name
                else:
                    # Insertar nuevo
                    db_chunk = DBCodeChunk(
                        repository_id=uuid.UUID(repository_id),
                        file_path=chunk.file_path,
                        language=chunk.language,
                        chunk_type=chunk.chunk_type,
                        name=chunk.name,
                        parent_name=chunk.parent_name,
                        start_line=chunk.start_line,
                        end_line=chunk.end_line,
                        start_column=chunk.start_column,
                        end_column=chunk.end_column,
                        content=chunk.content,
                        summary=chunk.summary,
                        docstring=chunk.docstring,
                        complexity=chunk.complexity,
                        dependencies=chunk.dependencies,
                        embedding=embedding,
                        metadata=chunk.metadata,
                    )
                    session.add(db_chunk)
                    inserted += 1

            await session.commit()
            logger.info(f"Upserted {inserted} new chunks for repository {repository_id}")
            return inserted

    async def semantic_search(
        self,
        query_embedding: List[float],
        repository_id: Optional[str] = None,
        limit: int = 10,
        threshold: float = 0.7,
        chunk_types: Optional[List[str]] = None,
        file_paths: Optional[List[str]] = None
    ) -> List[SearchResult]:
        """Búsqueda semántica por similitud de coseno."""
        from app.models import CodeChunk as DBCodeChunk
        import uuid

        async with async_session_maker() as session:
            # Construir query base
            query = select(
                DBCodeChunk,
                (1 - DBCodeChunk.embedding.cosine_distance(query_embedding)).label("similarity"),
                DBCodeChunk.embedding.cosine_distance(query_embedding).label("distance")
            ).where(
                DBCodeChunk.embedding.is_not(None)
            )

            # Filtros opcionales
            if repository_id:
                query = query.where(DBCodeChunk.repository_id == uuid.UUID(repository_id))

            if chunk_types:
                query = query.where(DBCodeChunk.chunk_type.in_(chunk_types))

            if file_paths:
                query = query.where(DBCodeChunk.file_path.in_(file_paths))

            # Filtrar por umbral de similitud y ordenar
            query = query.where(
                (1 - DBCodeChunk.embedding.cosine_distance(query_embedding)) >= threshold
            ).order_by(
                DBCodeChunk.embedding.cosine_distance(query_embedding)
            ).limit(limit)

            results = await session.execute(query)
            return [
                SearchResult(chunk=row[0], similarity=row[1], distance=row[2])
                for row in results.all()
            ]

    async def hybrid_search(
        self,
        query_embedding: List[float],
        query_text: str,
        repository_id: Optional[str] = None,
        limit: int = 10,
        vector_weight: float = 0.7,
        text_weight: float = 0.3
    ) -> List[SearchResult]:
        """Búsqueda híbrida: vectorial + texto completo (tsvector)."""
        from app.models import CodeChunk as DBCodeChunk
        import uuid

        async with async_session_maker() as session:
            # Usar búsqueda de texto completo de PostgreSQL + vectorial
            sql = """
            SELECT
                cc.*,
                (1 - cc.embedding <=> :query_embedding) as vector_similarity,
                ts_rank_cd(to_tsvector('english', cc.content), plainto_tsquery('english', :query_text)) as text_rank
            FROM code_chunks cc
            WHERE cc.embedding IS NOT NULL
            """

            params = {
                "query_embedding": query_embedding,
                "query_text": query_text,
            }

            if repository_id:
                sql += " AND cc.repository_id = :repository_id"
                params["repository_id"] = uuid.UUID(repository_id)

            sql += """
            ORDER BY
                (:vector_weight * (1 - cc.embedding <=> :query_embedding)) +
                (:text_weight * ts_rank_cd(to_tsvector('english', cc.content), plainto_tsquery('english', :query_text)))
            DESC
            LIMIT :limit
            """

            params.update({
                "vector_weight": vector_weight,
                "text_weight": text_weight,
                "limit": limit,
            })

            results = await session.execute(text(sql), params)
            return [
                SearchResult(
                    chunk=DBCodeChunk(**dict(row._mapping)),
                    similarity=row.vector_similarity,
                    distance=1 - row.vector_similarity
                )
                for row in results.all()
            ]

    async def get_repository_stats(self, repository_id: str) -> Dict[str, Any]:
        """Obtener estadísticas de indexación de un repositorio."""
        from app.models import CodeChunk as DBCodeChunk
        import uuid

        async with async_session_maker() as session:
            stats = await session.execute(
                select(
                    func.count(DBCodeChunk.id).label("total_chunks"),
                    func.count(DBCodeChunk.id).filter(DBCodeChunk.embedding.is_not(None)).label("embedded_chunks"),
                    func.avg(DBCodeChunk.complexity).label("avg_complexity"),
                    func.max(DBCodeChunk.complexity).label("max_complexity"),
                ).where(DBCodeChunk.repository_id == uuid.UUID(repository_id))
            )
            row = stats.first()
            return {
                "total_chunks": row.total_chunks or 0,
                "embedded_chunks": row.embedded_chunks or 0,
                "embedding_coverage": (row.embedded_chunks or 0) / max(row.total_chunks or 1, 1) * 100,
                "avg_complexity": float(row.avg_complexity or 0),
                "max_complexity": row.max_complexity or 0,
            }

    async def delete_repository_chunks(self, repository_id: str) -> int:
        """Eliminar todos los chunks de un repositorio."""
        from app.models import CodeChunk as DBCodeChunk
        import uuid

        async with async_session_maker() as session:
            result = await session.execute(
                select(DBCodeChunk).where(DBCodeChunk.repository_id == uuid.UUID(repository_id))
            )
            chunks = result.scalars().all()
            count = len(chunks)
            for chunk in chunks:
                await session.delete(chunk)
            await session.commit()
            logger.info(f"Deleted {count} chunks for repository {repository_id}")
            return count

    async def find_similar_chunks(
        self,
        chunk_id: str,
        repository_id: Optional[str] = None,
        limit: int = 5,
        threshold: float = 0.8
    ) -> List[SearchResult]:
        """Encontrar chunks similares a uno dado (para detección de duplicados)."""
        from app.models import CodeChunk as DBCodeChunk
        import uuid

        async with async_session_maker() as session:
            # Obtener el embedding del chunk de referencia
            ref_chunk = await session.get(DBCodeChunk, uuid.UUID(chunk_id))
            if not ref_chunk or not ref_chunk.embedding:
                return []

            return await self.semantic_search(
                query_embedding=ref_chunk.embedding,
                repository_id=repository_id,
                limit=limit + 1,  # +1 para excluir el propio chunk
                threshold=threshold
            )


# Instancia global
vector_store = VectorStore()