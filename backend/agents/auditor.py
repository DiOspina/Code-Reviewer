"""
Autonomous Code Auditor Agent using LangGraph.
Detects security vulnerabilities, code smells, performance issues, and more.
"""
from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from typing import Dict, Any, List, Optional, TypedDict, Annotated
import logging
import json
import re
from dataclasses import dataclass, field
from datetime import datetime

from config.settings import settings
from ast.parser import CodeChunk, ast_parser
from rag.vector_store import vector_store, SearchResult
from rag.embeddings import embedding_manager

logger = logging.getLogger(__name__)


# ============ Estado del Agente ============

class AuditorState(TypedDict):
    """Estado que fluye a través del grafo del auditor."""
    repository_id: str
    file_path: str
    code_chunks: List[CodeChunk]
    current_chunk_index: int
    findings: List[Dict[str, Any]]
    context_chunks: List[SearchResult]
    analysis_metadata: Dict[str, Any]
    errors: List[str]


# ============ Configuración de Reglas ============

SECURITY_RULES = {
    "sql_injection": {
        "patterns": [
            r"execute\s*\(\s*[\"'].*%.*[\"']",  # String formatting in SQL
            r"cursor\.execute\s*\(\s*f[\"']",    # f-strings in execute
            r"\.format\s*\(.*\).*execute",       # .format() in SQL
        ],
        "severity": "critical",
        "category": "security",
        "cwe": "CWE-89",
        "owasp": "A03:2021-Injection",
        "message": "Potential SQL injection vulnerability detected",
    },
    "xss": {
        "patterns": [
            r"innerHTML\s*=",
            r"dangerouslySetInnerHTML",
            r"v-html\s*=",
            r"\$\{\s*.*\s*\}",  # Template literals in HTML context
        ],
        "severity": "high",
        "category": "security",
        "cwe": "CWE-79",
        "owasp": "A03:2021-Injection",
        "message": "Potential Cross-Site Scripting (XSS) vulnerability",
    },
    "hardcoded_secrets": {
        "patterns": [
            r"(api[_-]?key|apikey|secret|password|token|auth)[\"']?\s*[:=]\s*[\"'][^\"']+[\"']",
            r"(aws_access_key_id|aws_secret_access_key)\s*[=:]\s*[\"'][^\"']+[\"']",
            r"-----BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY-----",
        ],
        "severity": "critical",
        "category": "security",
        "cwe": "CWE-798",
        "owasp": "A07:2021-Identification and Authentication Failures",
        "message": "Hardcoded secret or credential detected",
    },
    "path_traversal": {
        "patterns": [
            r"\.\./",
            r"\.\.\\",
            r"os\.path\.join.*\.\.",
            r"open\s*\(.*\.\.",
        ],
        "severity": "high",
        "category": "security",
        "cwe": "CWE-22",
        "owasp": "A01:2021-Broken Access Control",
        "message": "Potential path traversal vulnerability",
    },
    "command_injection": {
        "patterns": [
            r"subprocess\.(run|call|Popen).*shell=True",
            r"os\.system\s*\(",
            r"eval\s*\(",
            r"exec\s*\(",
        ],
        "severity": "critical",
        "category": "security",
        "cwe": "CWE-78",
        "owasp": "A03:2021-Injection",
        "message": "Potential command injection vulnerability",
    },
}

PERFORMANCE_RULES = {
    "n_plus_one_query": {
        "patterns": [
            r"for\s+\w+\s+in\s+.*:\s*\n\s*.*\.query",
            r"for\s+.*\s+in\s+.*:\s*\n\s*.*\.execute",
        ],
        "severity": "medium",
        "category": "performance",
        "message": "Potential N+1 query problem detected",
    },
    "inefficient_loop": {
        "patterns": [
            r"\.append\s*\(.*\)\s*in\s+for",
            r"\[\s*.*\s+for\s+.*\s+in\s+.*\s+if\s+",  # List comprehension with filter
        ],
        "severity": "low",
        "category": "performance",
        "message": "Potentially inefficient loop pattern",
    },
}

MAINTAINABILITY_RULES = {
    "long_function": {
        "max_lines": 50,
        "severity": "medium",
        "category": "maintainability",
        "message": "Function exceeds recommended length",
    },
    "high_complexity": {
        "max_complexity": 10,
        "severity": "medium",
        "category": "maintainability",
        "message": "High cyclomatic complexity detected",
    },
    "too_many_parameters": {
        "max_params": 5,
        "severity": "low",
        "category": "maintainability",
        "message": "Function has too many parameters",
    },
    "duplicate_code": {
        "min_similarity": 0.85,
        "severity": "medium",
        "category": "duplication",
        "message": "Potential duplicate code detected",
    },
}

STYLE_RULES = {
    "missing_docstring": {
        "severity": "info",
        "category": "style",
        "message": "Public function/class missing docstring",
    },
    "unused_import": {
        "severity": "info",
        "category": "style",
        "message": "Unused import detected",
    },
}


# ============ Nodos del Grafo ============

def initialize_analysis(state: AuditorState) -> AuditorState:
    """Inicializar el análisis para un archivo."""
    logger.info(f"Starting analysis for {state['file_path']}")
    return {
        **state,
        "current_chunk_index": 0,
        "findings": [],
        "context_chunks": [],
        "analysis_metadata": {
            "started_at": datetime.utcnow().isoformat(),
            "total_chunks": len(state["code_chunks"]),
        },
        "errors": [],
    }


async def retrieve_context(state: AuditorState) -> AuditorState:
    """Recuperar contexto semántico relevante del vector store."""
    if state["current_chunk_index"] >= len(state["code_chunks"]):
        return state

    chunk = state["code_chunks"][state["current_chunk_index"]]

    # Generar embedding para el chunk actual si no tiene
    if "embedding" not in chunk.metadata:
        try:
            await embedding_manager.embed_chunks([chunk])
        except Exception as e:
            logger.warning(f"Failed to embed chunk: {e}")

    # Buscar chunks similares en el mismo repositorio
    if chunk.metadata.get("embedding"):
        try:
            similar = await vector_store.find_similar_chunks(
                chunk_id=chunk.chunk_id,  # Necesitaríamos el ID real de BD
                repository_id=state["repository_id"],
                limit=5,
                threshold=0.75
            )
            state["context_chunks"] = similar
        except Exception as e:
            logger.warning(f"Context retrieval failed: {e}")

    return state


def run_static_analysis(state: AuditorState) -> AuditorState:
    """Ejecutar análisis estático basado en reglas."""
    if state["current_chunk_index"] >= len(state["code_chunks"]):
        return state

    chunk = state["code_chunks"][state["current_chunk_index"]]
    content = chunk.content
    lines = content.split("\n")

    # Verificar reglas de seguridad
    for rule_id, rule in SECURITY_RULES.items():
        for pattern in rule.get("patterns", []):
            matches = list(re.finditer(pattern, content, re.IGNORECASE | re.MULTILINE))
            for match in matches:
                line_num = content[:match.start()].count("\n") + chunk.start_line
                state["findings"].append({
                    "file_path": chunk.file_path,
                    "start_line": line_num,
                    "end_line": line_num,
                    "severity": rule["severity"],
                    "category": rule["category"],
                    "rule_id": rule_id,
                    "rule_name": rule_id.replace("_", " ").title(),
                    "message": rule["message"],
                    "description": f"Pattern matched: {pattern}",
                    "cwe_id": rule.get("cwe"),
                    "owasp_category": rule.get("owasp"),
                    "confidence": 0.8,
                    "code_snippet": lines[max(0, line_num - chunk.start_line - 2):line_num - chunk.start_line + 3],
                })

    # Verificar reglas de rendimiento
    for rule_id, rule in PERFORMANCE_RULES.items():
        for pattern in rule.get("patterns", []):
            if re.search(pattern, content, re.IGNORECASE | re.MULTILINE):
                state["findings"].append({
                    "file_path": chunk.file_path,
                    "start_line": chunk.start_line,
                    "end_line": chunk.end_line,
                    "severity": rule["severity"],
                    "category": rule["category"],
                    "rule_id": rule_id,
                    "rule_name": rule_id.replace("_", " ").title(),
                    "message": rule["message"],
                    "confidence": 0.6,
                })

    # Verificar mantenibilidad
    for rule_id, rule in MAINTAINABILITY_RULES.items():
        if rule_id == "long_function" and len(lines) > rule["max_lines"]:
            state["findings"].append({
                "file_path": chunk.file_path,
                "start_line": chunk.start_line,
                "end_line": chunk.end_line,
                "severity": rule["severity"],
                "category": rule["category"],
                "rule_id": rule_id,
                "rule_name": rule_id.replace("_", " ").title(),
                "message": f"{rule['message']} ({len(lines)} lines, max {rule['max_lines']})",
                "confidence": 0.9,
            })
        elif rule_id == "high_complexity" and chunk.complexity and chunk.complexity > rule["max_complexity"]:
            state["findings"].append({
                "file_path": chunk.file_path,
                "start_line": chunk.start_line,
                "end_line": chunk.end_line,
                "severity": rule["severity"],
                "category": rule["category"],
                "rule_id": rule_id,
                "rule_name": rule_id.replace("_", " ").title(),
                "message": f"{rule['message']} (complexity: {chunk.complexity}, max {rule['max_complexity']})",
                "confidence": 0.95,
            })
        elif rule_id == "too_many_parameters":
            # Contar parámetros en la definición
            param_match = re.search(r"\(([^)]*)\)", content.split("\n")[0])
            if param_match:
                params = [p.strip() for p in param_match.group(1).split(",") if p.strip()]
                if len(params) > rule["max_params"]:
                    state["findings"].append({
                        "file_path": chunk.file_path,
                        "start_line": chunk.start_line,
                        "end_line": chunk.start_line,
                        "severity": rule["severity"],
                        "category": rule["category"],
                        "rule_id": rule_id,
                        "rule_name": rule_id.replace("_", " ").title(),
                        "message": f"{rule['message']} ({len(params)} parameters, max {rule['max_params']})",
                        "confidence": 0.8,
                    })

    # Verificar estilo
    if not chunk.docstring and chunk.chunk_type in ["function", "class", "method", "async_function"]:
        state["findings"].append({
            "file_path": chunk.file_path,
            "start_line": chunk.start_line,
            "end_line": chunk.start_line,
            "severity": STYLE_RULES["missing_docstring"]["severity"],
            "category": STYLE_RULES["missing_docstring"]["category"],
            "rule_id": "missing_docstring",
            "rule_name": "Missing Docstring",
            "message": STYLE_RULES["missing_docstring"]["message"],
            "confidence": 0.7,
        })

    return state


async def run_llm_analysis(state: AuditorState) -> AuditorState:
    """Ejecutar análisis profundo usando LLM."""
    if state["current_chunk_index"] >= len(state["code_chunks"]):
        return state

    chunk = state["code_chunks"][state["current_chunk_index"]]

    # Solo usar LLM para chunks complejos o con hallazgos previos
    if chunk.complexity and chunk.complexity > 5 or len(state["findings"]) > 0:
        try:
            llm = get_llm()
            prompt = build_analysis_prompt(chunk, state["context_chunks"])
            response = await llm.ainvoke(prompt)
            llm_findings = parse_llm_response(response.content, chunk)
            state["findings"].extend(llm_findings)
        except Exception as e:
            logger.error(f"LLM analysis failed: {e}")
            state["errors"].append(f"LLM analysis: {str(e)}")

    return state


def build_analysis_prompt(chunk: CodeChunk, context_chunks: List[SearchResult]) -> List:
    """Construir prompt para análisis LLM."""
    context = ""
    if context_chunks:
        context = "\n\nRelevant context from codebase:\n"
        for ctx in context_chunks[:3]:
            context += f"\n--- {ctx.chunk.file_path} ({ctx.chunk.chunk_type}: {ctx.chunk.name}) ---\n"
            context += ctx.chunk.content[:500] + "\n"

    system_prompt = """You are an expert code auditor specializing in security, performance, and maintainability.
Analyze the provided code chunk and identify:
1. Security vulnerabilities (OWASP Top 10, CWE)
2. Performance bottlenecks
3. Maintainability issues
4. Code smells and anti-patterns
5. Missing error handling
6. Concurrency issues

Return findings as JSON array with: rule_id, severity (critical/high/medium/low/info), category, message, description, confidence (0-1)."""

    human_prompt = f"""Analyze this code chunk:

File: {chunk.file_path}
Type: {chunk.chunk_type}
Name: {chunk.name}
Complexity: {chunk.complexity}
Dependencies: {', '.join(chunk.dependencies) if chunk.dependencies else 'None'}

Code:
```{chunk.language}
{chunk.content}
```
{context}"""

    return [
        SystemMessage(content=system_prompt),
        HumanMessage(content=human_prompt),
    ]


def parse_llm_response(response: str, chunk: CodeChunk) -> List[Dict[str, Any]]:
    """Parsear respuesta del LLM en hallazgos estructurados."""
    findings = []
    try:
        # Intentar extraer JSON de la respuesta
        json_match = re.search(r"\[.*\]", response, re.DOTALL)
        if json_match:
            llm_findings = json.loads(json_match.group())
            for f in llm_findings:
                findings.append({
                    "file_path": chunk.file_path,
                    "start_line": chunk.start_line,
                    "end_line": chunk.end_line,
                    "severity": f.get("severity", "medium"),
                    "category": f.get("category", "maintainability"),
                    "rule_id": f.get("rule_id", "llm_detected"),
                    "rule_name": f.get("rule_id", "LLM Detected").replace("_", " ").title(),
                    "message": f.get("message", ""),
                    "description": f.get("description", ""),
                    "confidence": f.get("confidence", 0.7),
                })
    except Exception as e:
        logger.warning(f"Failed to parse LLM response: {e}")
    return findings


def check_duplicates(state: AuditorState) -> AuditorState:
    """Verificar duplicación de código usando búsqueda vectorial."""
    if state["current_chunk_index"] >= len(state["code_chunks"]):
        return state

    chunk = state["code_chunks"][state["current_chunk_index"]]

    if chunk.metadata.get("embedding"):
        try:
            # Buscar chunks muy similares (posibles duplicados)
            similar = await vector_store.find_similar_chunks(
                chunk_id=chunk.chunk_id,
                repository_id=state["repository_id"],
                limit=10,
                threshold=0.9  # Umbral alto para duplicados
            )

            for sim in similar:
                if sim.similarity > 0.95 and sim.chunk.file_path != chunk.file_path:
                    state["findings"].append({
                        "file_path": chunk.file_path,
                        "start_line": chunk.start_line,
                        "end_line": chunk.end_line,
                        "severity": "medium",
                        "category": "duplication",
                        "rule_id": "code_duplication",
                        "rule_name": "Code Duplication",
                        "message": f"Near-duplicate code found in {sim.chunk.file_path}:{sim.chunk.name}",
                        "description": f"Similarity: {sim.similarity:.2%}",
                        "confidence": sim.similarity,
                    })
        except Exception as e:
            logger.warning(f"Duplicate check failed: {e}")

    return state


def advance_chunk(state: AuditorState) -> AuditorState:
    """Avanzar al siguiente chunk."""
    return {
        **state,
        "current_chunk_index": state["current_chunk_index"] + 1,
    }


def finalize_analysis(state: AuditorState) -> AuditorState:
    """Finalizar análisis y preparar resultados."""
    logger.info(f"Analysis complete for {state['file_path']}: {len(state['findings'])} findings")
    return {
        **state,
        "analysis_metadata": {
            **state["analysis_metadata"],
            "completed_at": datetime.utcnow().isoformat(),
            "total_findings": len(state["findings"]),
            "by_severity": {
                "critical": len([f for f in state["findings"] if f["severity"] == "critical"]),
                "high": len([f for f in state["findings"] if f["severity"] == "high"]),
                "medium": len([f for f in state["findings"] if f["severity"] == "medium"]),
                "low": len([f for f in state["findings"] if f["severity"] == "low"]),
                "info": len([f for f in state["findings"] if f["severity"] == "info"]),
            },
        }
    }


# ============ Construcción del Grafo ============

def should_continue(state: AuditorState) -> str:
    """Decidir si continuar con el siguiente chunk."""
    if state["current_chunk_index"] < len(state["code_chunks"]):
        return "retrieve_context"
    return "finalize"


def build_auditor_graph() -> StateGraph:
    """Construir el grafo de LangGraph para el auditor."""
    workflow = StateGraph(AuditorState)

    # Nodos
    workflow.add_node("initialize", initialize_analysis)
    workflow.add_node("retrieve_context", retrieve_context)
    workflow.add_node("static_analysis", run_static_analysis)
    workflow.add_node("llm_analysis", run_llm_analysis)
    workflow.add_node("check_duplicates", check_duplicates)
    workflow.add_node("advance", advance_chunk)
    workflow.add_node("finalize", finalize_analysis)

    # Flujo
    workflow.set_entry_point("initialize")
    workflow.add_edge("initialize", "retrieve_context")
    workflow.add_edge("retrieve_context", "static_analysis")
    workflow.add_edge("static_analysis", "llm_analysis")
    workflow.add_edge("llm_analysis", "check_duplicates")
    workflow.add_edge("check_duplicates", "advance")

    # Bucle condicional
    workflow.add_conditional_edges(
        "advance",
        should_continue,
        {
            "retrieve_context": "retrieve_context",
            "finalize": "finalize",
        }
    )

    workflow.add_edge("finalize", END)

    return workflow.compile()


# ============ Utilidades ============

def get_llm():
    """Obtener instancia de LLM configurada."""
    if settings.OPENAI_API_KEY:
        return ChatOpenAI(
            model="gpt-4-turbo-preview",
            temperature=0.1,
            api_key=settings.OPENAI_API_KEY,
        )
    elif settings.ANTHROPIC_API_KEY:
        return ChatAnthropic(
            model="claude-3-opus-20240229",
            temperature=0.1,
            api_key=settings.ANTHROPIC_API_KEY,
        )
    else:
        # Fallback a modelo local via Ollama
        from langchain_community.llms import Ollama
        return Ollama(
            model="codellama",
            base_url=settings.OLLAMA_BASE_URL,
            temperature=0.1,
        )


async def audit_file(
    repository_id: str,
    file_path: str,
    content: str,
    language: str
) -> Dict[str, Any]:
    """Auditar un archivo completo."""
    # Parsear en chunks
    chunks = ast_parser.parse_file(file_path, content)

    if not chunks:
        return {"findings": [], "metadata": {"chunks_analyzed": 0}}

    # Estado inicial
    initial_state = AuditorState(
        repository_id=repository_id,
        file_path=file_path,
        code_chunks=chunks,
        current_chunk_index=0,
        findings=[],
        context_chunks=[],
        analysis_metadata={},
        errors=[],
    )

    # Ejecutar grafo
    graph = build_auditor_graph()
    result = await graph.ainvoke(initial_state)

    return {
        "findings": result["findings"],
        "metadata": result["analysis_metadata"],
        "errors": result["errors"],
    }


async def audit_repository(repository_id: str, repo_path: str) -> Dict[str, Any]:
    """Auditar un repositorio completo."""
    all_findings = []
    total_chunks = 0
    errors = []

    for chunk in ast_parser.parse_repository(repo_path):
        result = await audit_file(repository_id, chunk.file_path, chunk.content, chunk.language)
        all_findings.extend(result["findings"])
        total_chunks += 1
        errors.extend(result.get("errors", []))

    return {
        "findings": all_findings,
        "metadata": {
            "total_chunks_analyzed": total_chunks,
            "total_findings": len(all_findings),
            "by_severity": {
                "critical": len([f for f in all_findings if f["severity"] == "critical"]),
                "high": len([f for f in all_findings if f["severity"] == "high"]),
                "medium": len([f for f in all_findings if f["severity"] == "medium"]),
                "low": len([f for f in all_findings if f["severity"] == "low"]),
                "info": len([f for f in all_findings if f["severity"] == "info"]),
            },
        },
        "errors": errors,
    }