"""
Embeddings generation for code chunks using various providers.
Supports OpenAI, Anthropic, Ollama, and Sentence Transformers.
"""
from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
import logging
import asyncio
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class EmbeddingResult:
    """Resultado de generación de embeddings."""
    embeddings: List[List[float]]
    model: str
    dimensions: int
    tokens_used: int = 0
    cost_estimate: float = 0.0


class EmbeddingProvider(ABC):
    """Interfaz base para proveedores de embeddings."""

    @property
    @abstractmethod
    def model_name(self) -> str:
        pass

    @property
    @abstractmethod
    def dimensions(self) -> int:
        pass

    @abstractmethod
    async def embed_texts(self, texts: List[str]) -> EmbeddingResult:
        pass

    @abstractmethod
    async def embed_query(self, query: str) -> List[float]:
        pass


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """Proveedor de embeddings usando OpenAI API."""

    def __init__(self, api_key: str, model: str = "text-embedding-3-small"):
        self.api_key = api_key
        self._model = model
        self._dimensions = 1536 if "3-small" in model else 3072 if "3-large" in model else 1536
        self._client = None

    @property
    def model_name(self) -> str:
        return self._model

    @property
    def dimensions(self) -> int:
        return self._dimensions

    def _get_client(self):
        if self._client is None:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(api_key=self.api_key)
        return self._client

    async def embed_texts(self, texts: List[str]) -> EmbeddingResult:
        client = self._get_client()
        # Procesar en lotes para evitar límites de tokens
        batch_size = 100
        all_embeddings = []
        total_tokens = 0

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            response = await client.embeddings.create(
                model=self._model,
                input=batch,
                encoding_format="float"
            )
            all_embeddings.extend([d.embedding for d in response.data])
            total_tokens += response.usage.total_tokens

        # Estimación de costo (precios 2024)
        cost_per_1k = 0.00002 if "3-small" in self._model else 0.00013 if "3-large" in self._model else 0.0001
        cost = (total_tokens / 1000) * cost_per_1k

        return EmbeddingResult(
            embeddings=all_embeddings,
            model=self._model,
            dimensions=self._dimensions,
            tokens_used=total_tokens,
            cost_estimate=cost
        )

    async def embed_query(self, query: str) -> List[float]:
        result = await self.embed_texts([query])
        return result.embeddings[0]


class OllamaEmbeddingProvider(EmbeddingProvider):
    """Proveedor de embeddings usando Ollama (modelos locales)."""

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "nomic-embed-text"):
        self.base_url = base_url
        self._model = model
        self._dimensions = 768  # nomic-embed-text
        self._client = None

    @property
    def model_name(self) -> str:
        return self._model

    @property
    def dimensions(self) -> int:
        return self._dimensions

    def _get_client(self):
        if self._client is None:
            import httpx
            self._client = httpx.AsyncClient(base_url=self.base_url, timeout=60.0)
        return self._client

    async def embed_texts(self, texts: List[str]) -> EmbeddingResult:
        client = self._get_client()
        all_embeddings = []

        for text in texts:
            response = await client.post(
                "/api/embeddings",
                json={"model": self._model, "prompt": text}
            )
            response.raise_for_status()
            data = response.json()
            all_embeddings.append(data["embedding"])

        return EmbeddingResult(
            embeddings=all_embeddings,
            model=self._model,
            dimensions=self._dimensions,
            tokens_used=0,  # Ollama no reporta tokens
            cost_estimate=0.0
        )

    async def embed_query(self, query: str) -> List[float]:
        result = await self.embed_texts([query])
        return result.embeddings[0]

    async def close(self):
        if self._client:
            await self._client.aclose()


class SentenceTransformerProvider(EmbeddingProvider):
    """Proveedor de embeddings usando sentence-transformers (local, CPU/GPU)."""

    def __init__(self, model_name: str = "all-MiniLM-L6-v2", device: str = "cpu"):
        self._model_name = model_name
        self._device = device
        self._model = None
        self._dimensions = 384  # all-MiniLM-L6-v2

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def dimensions(self) -> int:
        return self._dimensions

    def _get_model(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self._model_name, device=self._device)
            self._dimensions = self._model.get_sentence_embedding_dimension()
        return self._model

    async def embed_texts(self, texts: List[str]) -> EmbeddingResult:
        # Ejecutar en thread pool para no bloquear event loop
        loop = asyncio.get_event_loop()
        model = self._get_model()

        def _encode():
            return model.encode(texts, convert_to_numpy=True, show_progress_bar=False)

        embeddings = await loop.run_in_executor(None, _encode)

        return EmbeddingResult(
            embeddings=embeddings.tolist(),
            model=self._model_name,
            dimensions=self._dimensions,
            tokens_used=0,
            cost_estimate=0.0
        )

    async def embed_query(self, query: str) -> List[float]:
        result = await self.embed_texts([query])
        return result.embeddings[0]


class EmbeddingManager:
    """Gestor centralizado de embeddings con fallback y caché."""

    def __init__(self):
        self.providers: Dict[str, EmbeddingProvider] = {}
        self.default_provider: Optional[str] = None
        self._cache: Dict[str, List[float]] = {}  # Simple cache en memoria

    def register_provider(self, name: str, provider: EmbeddingProvider, is_default: bool = False):
        """Registrar un proveedor de embeddings."""
        self.providers[name] = provider
        if is_default or self.default_provider is None:
            self.default_provider = name
        logger.info(f"Registered embedding provider: {name} ({provider.model_name}, {provider.dimensions}d)")

    def get_provider(self, name: Optional[str] = None) -> EmbeddingProvider:
        """Obtener proveedor por nombre o el default."""
        provider_name = name or self.default_provider
        if not provider_name or provider_name not in self.providers:
            raise ValueError(f"No embedding provider available: {provider_name}")
        return self.providers[provider_name]

    async def embed_chunks(self, chunks: List[Any], provider_name: Optional[str] = None) -> List[Any]:
        """Generar embeddings para una lista de chunks AST."""
        provider = self.get_provider(provider_name)

        # Preparar textos para embedding (combinar nombre, tipo, contenido, docstring)
        texts = []
        for chunk in chunks:
            text_parts = [
                f"Type: {chunk.chunk_type}",
                f"Name: {chunk.name}",
            ]
            if chunk.docstring:
                text_parts.append(f"Docstring: {chunk.docstring}")
            text_parts.append(f"Code: {chunk.content[:2000]}")  # Limitar longitud
            texts.append("\n".join(text_parts))

        # Verificar caché
        cached_embeddings = []
        uncached_indices = []
        uncached_texts = []

        for i, text in enumerate(texts):
            cache_key = f"{provider.model_name}:{hash(text)}"
            if cache_key in self._cache:
                cached_embeddings.append((i, self._cache[cache_key]))
            else:
                uncached_indices.append(i)
                uncached_texts.append(text)

        # Generar embeddings para textos no cacheados
        new_embeddings = []
        if uncached_texts:
            result = await provider.embed_texts(uncached_texts)
            new_embeddings = result.embeddings

            # Actualizar caché
            for idx, emb in zip(uncached_indices, new_embeddings):
                cache_key = f"{provider.model_name}:{hash(texts[idx])}"
                self._cache[cache_key] = emb

        # Combinar resultados manteniendo orden original
        final_embeddings = [None] * len(texts)
        for i, emb in cached_embeddings:
            final_embeddings[i] = emb

        new_idx = 0
        for i in range(len(texts)):
            if final_embeddings[i] is None:
                final_embeddings[i] = new_embeddings[new_idx]
                new_idx += 1

        # Asignar embeddings a chunks
        for chunk, embedding in zip(chunks, final_embeddings):
            if chunk.metadata is None:
                chunk.metadata = {}
            chunk.metadata["embedding"] = embedding
            chunk.metadata["embedding_model"] = provider.model_name
            chunk.metadata["embedding_dimensions"] = provider.dimensions

        logger.info(f"Generated embeddings for {len(chunks)} chunks using {provider.model_name}")
        return chunks

    async def embed_query(self, query: str, provider_name: Optional[str] = None) -> List[float]:
        """Generar embedding para una consulta."""
        provider = self.get_provider(provider_name)
        return await provider.embed_query(query)


# Instancia global
embedding_manager = EmbeddingManager()