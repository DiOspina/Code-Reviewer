"""
Autonomous Code Refactoring Agent using LangGraph.
Generates optimized code proposals with unit tests based on auditor findings.
"""
from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from typing import Dict, Any, List, Optional, TypedDict
import logging
import json
import re
from dataclasses import dataclass
from datetime import datetime

from config.settings import settings
from ast.parser import CodeChunk, ast_parser
from agents.auditor import AuditorState

logger = logging.getLogger(__name__)


# ============ Estado del Refactorizador ============

class RefactorState(TypedDict):
    """Estado para el agente refactorizador."""
    repository_id: str
    finding: Dict[str, Any]  # Hallazgo del auditor
    code_chunk: CodeChunk
    context_chunks: List[CodeChunk]
    refactored_code: Optional[str]
    explanation: str
    test_code: Optional[str]
    test_explanation: str
    diff: str
    confidence: float
    estimated_impact: str
    errors: List[str]
    metadata: Dict[str, Any]


# ============ Plantillas de Refactorización ============

REFACTOR_TEMPLATES = {
    "sql_injection": {
        "pattern": "parameterized_queries",
        "description": "Replace string concatenation with parameterized queries",
    },
    "xss": {
        "pattern": "output_encoding",
        "description": "Apply proper output encoding/escaping",
    },
    "hardcoded_secrets": {
        "pattern": "environment_variables",
        "description": "Move secrets to environment variables or secret manager",
    },
    "path_traversal": {
        "pattern": "path_validation",
        "description": "Validate and sanitize file paths",
    },
    "command_injection": {
        "pattern": "safe_subprocess",
        "description": "Use subprocess without shell=True, validate inputs",
    },
    "long_function": {
        "pattern": "extract_method",
        "description": "Extract logical blocks into separate functions",
    },
    "high_complexity": {
        "pattern": "simplify_logic",
        "description": "Reduce cyclomatic complexity through guard clauses, early returns",
    },
    "too_many_parameters": {
        "pattern": "parameter_object",
        "description": "Group parameters into a dataclass or dictionary",
    },
    "n_plus_one_query": {
        "pattern": "batch_loading",
        "description": "Use eager loading or batch queries",
    },
    "inefficient_loop": {
        "pattern": "list_comprehension",
        "description": "Use list comprehensions or generator expressions",
    },
    "missing_docstring": {
        "pattern": "add_docstring",
        "description": "Add comprehensive docstring with args, returns, raises",
    },
}


# ============ Nodos del Grafo ============

def initialize_refactor(state: RefactorState) -> RefactorState:
    """Inicializar refactorización."""
    finding = state["finding"]
    rule_id = finding.get("rule_id", "unknown")

    template = REFACTOR_TEMPLATES.get(rule_id, {
        "pattern": "general_improvement",
        "description": "Apply best practices and improve code quality",
    })

    return {
        **state,
        "metadata": {
            **state.get("metadata", {}),
            "template": template,
            "started_at": datetime.utcnow().isoformat(),
        },
        "errors": [],
    }


async def retrieve_context_for_refactor(state: RefactorState) -> RefactorState:
    """Recuperar contexto relevante para la refactorización."""
    # Ya tenemos el chunk y contexto del auditor
    # Podemos buscar patrones similares en la codebase
    return state


async def generate_refactored_code(state: RefactorState) -> RefactorState:
    """Generar código refactorizado usando LLM."""
    finding = state["finding"]
    chunk = state["code_chunk"]
    template = state["metadata"]["template"]

    try:
        llm = get_llm()
        prompt = build_refactor_prompt(finding, chunk, template, state.get("context_chunks", []))
        response = await llm.ainvoke(prompt)

        # Parsear respuesta
        result = parse_refactor_response(response.content)
        state["refactored_code"] = result.get("refactored_code", chunk.content)
        state["explanation"] = result.get("explanation", "")
        state["confidence"] = result.get("confidence", 0.8)

    except Exception as e:
        logger.error(f"Refactoring code generation failed: {e}")
        state["errors"].append(f"Code generation: {str(e)}")
        state["refactored_code"] = chunk.content
        state["explanation"] = "Failed to generate refactored code"
        state["confidence"] = 0.0

    return state


def build_refactor_prompt(
    finding: Dict[str, Any],
    chunk: CodeChunk,
    template: Dict[str, str],
    context_chunks: List[CodeChunk]
) -> List:
    """Construir prompt para refactorización."""
    context = ""
    if context_chunks:
        context = "\n\nRelevant codebase patterns:\n"
        for ctx in context_chunks[:3]:
            context += f"\n--- {ctx.file_path} ({ctx.chunk_type}: {ctx.name}) ---\n"
            context += ctx.content[:800] + "\n"

    system_prompt = f"""You are an expert software engineer specializing in code refactoring.
Your task is to refactor the provided code to fix the identified issue.

Issue: {finding.get('message', 'Code quality improvement')}
Rule: {finding.get('rule_id', 'unknown')}
Severity: {finding.get('severity', 'medium')}
Template: {template['pattern']} - {template['description']}

Requirements:
1. Fix the specific issue while maintaining exact same functionality
2. Follow language best practices and idioms
3. Preserve all existing behavior, edge cases, and error handling
4. Add appropriate type hints if missing
5. Keep changes minimal and focused
6. Return ONLY valid code (no markdown, no explanations in code)

Return JSON with:
- refactored_code: The complete refactored code
- explanation: Detailed explanation of changes made
- confidence: Your confidence in the correctness (0-1)"""

    human_prompt = f"""Refactor this code:

File: {chunk.file_path}
Language: {chunk.language}
Type: {chunk.chunk_type}
Name: {chunk.name}
Current Complexity: {chunk.complexity}

Original Code:
```{chunk.language}
{chunk.content}
```
{context}"""

    return [
        SystemMessage(content=system_prompt),
        HumanMessage(content=human_prompt),
    ]


def parse_refactor_response(response: str) -> Dict[str, Any]:
    """Parsear respuesta de refactorización."""
    result = {
        "refactored_code": "",
        "explanation": "",
        "confidence": 0.7,
    }

    try:
        # Buscar JSON en la respuesta
        json_match = re.search(r"\{.*\}", response, re.DOTALL)
        if json_match:
            parsed = json.loads(json_match.group())
            result.update(parsed)
        else:
            # Fallback: asumir que toda la respuesta es el código
            result["refactored_code"] = response.strip()
            result["explanation"] = "Generated refactored code"
    except Exception as e:
        logger.warning(f"Failed to parse refactor response: {e}")

    return result


async def generate_tests(state: RefactorState) -> RefactorState:
    """Generar pruebas unitarias para el código refactorizado."""
    if not state["refactored_code"] or state["refactored_code"] == state["code_chunk"].content:
        return state

    chunk = state["code_chunk"]

    try:
        llm = get_llm()
        prompt = build_test_prompt(chunk, state["refactored_code"], state["explanation"])
        response = await llm.ainvoke(prompt)

        result = parse_test_response(response.content)
        state["test_code"] = result.get("test_code", "")
        state["test_explanation"] = result.get("explanation", "")

    except Exception as e:
        logger.error(f"Test generation failed: {e}")
        state["errors"].append(f"Test generation: {str(e)}")

    return state


def build_test_prompt(chunk: CodeChunk, refactored_code: str, explanation: str) -> List:
    """Construir prompt para generación de tests."""
    system_prompt = f"""You are an expert test engineer. Generate comprehensive unit tests for the refactored code.

Requirements:
1. Use the standard testing framework for the language (pytest for Python, jest for JS/TS, etc.)
2. Cover: happy path, edge cases, error conditions, boundary values
3. Include tests that would have caught the original issue
4. Mock external dependencies appropriately
5. Follow AAA pattern (Arrange, Act, Assert)
6. Return ONLY valid test code

The refactoring was: {explanation}"""

    human_prompt = f"""Generate tests for this refactored code:

File: {chunk.file_path}
Language: {chunk.language}
Type: {chunk.chunk_type}
Name: {chunk.name}

Original Issue Fixed: {explanation}

Refactored Code:
```{chunk.language}
{refactored_code}
```"""

    return [
        SystemMessage(content=system_prompt),
        HumanMessage(content=human_prompt),
    ]


def parse_test_response(response: str) -> Dict[str, Any]:
    """Parsear respuesta de generación de tests."""
    result = {"test_code": "", "explanation": ""}

    try:
        # Limpiar markdown si existe
        code = response.strip()
        if code.startswith("```"):
            lines = code.split("\n")
            # Quitar primera y última línea si son ```
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1].startswith("```"):
                lines = lines[:-1]
            code = "\n".join(lines)

        result["test_code"] = code
        result["explanation"] = "Generated unit tests covering the refactored functionality"
    except Exception as e:
        logger.warning(f"Failed to parse test response: {e}")

    return result


def generate_diff(state: RefactorState) -> RefactorState:
    """Generar diff entre código original y refactorizado."""
    import difflib

    original = state["code_chunk"].content
    refactored = state["refactored_code"] or original

    diff_lines = list(difflib.unified_diff(
        original.splitlines(keepends=True),
        refactored.splitlines(keepends=True),
        fromfile=f"a/{state['code_chunk'].file_path}",
        tofile=f"b/{state['code_chunk'].file_path}",
        lineterm=""
    ))

    state["diff"] = "".join(diff_lines)

    # Estimar impacto basado en el diff
    added = sum(1 for line in diff_lines if line.startswith("+") and not line.startswith("+++"))
    removed = sum(1 for line in diff_lines if line.startswith("-") and not line.startswith("---"))

    if added + removed < 10:
        state["estimated_impact"] = "low"
    elif added + removed < 50:
        state["estimated_impact"] = "medium"
    else:
        state["estimated_impact"] = "high"

    return state


def finalize_refactor(state: RefactorState) -> RefactorState:
    """Finalizar refactorización."""
    return {
        **state,
        "metadata": {
            **state.get("metadata", {}),
            "completed_at": datetime.utcnow().isoformat(),
        },
    }


# ============ Construcción del Grafo ============

def build_refactor_graph() -> StateGraph:
    """Construir grafo de refactorización."""
    workflow = StateGraph(RefactorState)

    workflow.add_node("initialize", initialize_refactor)
    workflow.add_node("retrieve_context", retrieve_context_for_refactor)
    workflow.add_node("generate_code", generate_refactored_code)
    workflow.add_node("generate_tests", generate_tests)
    workflow.add_node("generate_diff", generate_diff)
    workflow.add_node("finalize", finalize_refactor)

    workflow.set_entry_point("initialize")
    workflow.add_edge("initialize", "retrieve_context")
    workflow.add_edge("retrieve_context", "generate_code")
    workflow.add_edge("generate_code", "generate_tests")
    workflow.add_edge("generate_tests", "generate_diff")
    workflow.add_edge("generate_diff", "finalize")
    workflow.add_edge("finalize", END)

    return workflow.compile()


# ============ Utilidades ============

def get_llm():
    """Obtener LLM configurado."""
    if settings.OPENAI_API_KEY:
        return ChatOpenAI(
            model="gpt-4-turbo-preview",
            temperature=0.2,
            api_key=settings.OPENAI_API_KEY,
        )
    elif settings.ANTHROPIC_API_KEY:
        return ChatAnthropic(
            model="claude-3-opus-20240229",
            temperature=0.2,
            api_key=settings.ANTHROPIC_API_KEY,
        )
    else:
        from langchain_community.llms import Ollama
        return Ollama(
            model="codellama",
            base_url=settings.OLLAMA_BASE_URL,
            temperature=0.2,
        )


async def refactor_finding(
    repository_id: str,
    finding: Dict[str, Any],
    code_chunk: CodeChunk,
    context_chunks: List[CodeChunk] = None
) -> Dict[str, Any]:
    """Refactorizar un hallazgo específico."""
    initial_state = RefactorState(
        repository_id=repository_id,
        finding=finding,
        code_chunk=code_chunk,
        context_chunks=context_chunks or [],
        refactored_code=None,
        explanation="",
        test_code=None,
        test_explanation="",
        diff="",
        confidence=0.0,
        estimated_impact="low",
        errors=[],
        metadata={},
    )

    graph = build_refactor_graph()
    result = await graph.ainvoke(initial_state)

    return {
        "original_code": code_chunk.content,
        "refactored_code": result["refactored_code"],
        "explanation": result["explanation"],
        "test_code": result["test_code"],
        "test_explanation": result["test_explanation"],
        "diff": result["diff"],
        "confidence": result["confidence"],
        "estimated_impact": result["estimated_impact"],
        "errors": result["errors"],
        "metadata": result["metadata"],
    }


async def create_refactor_proposal(
    repository_id: str,
    analysis_id: str,
    findings: List[Dict[str, Any]],
    code_chunks: List[CodeChunk]
) -> List[Dict[str, Any]]:
    """Crear propuestas de refactorización para múltiples hallazgos."""
    proposals = []

    # Agrupar hallazgos por archivo/chunk
    findings_by_chunk = {}
    for finding in findings:
        key = (finding["file_path"], finding["start_line"], finding["end_line"])
        if key not in findings_by_chunk:
            findings_by_chunk[key] = []
        findings_by_chunk[key].append(finding)

    # Procesar cada grupo
    for (file_path, start_line, end_line), chunk_findings in findings_by_chunk.items():
        # Encontrar chunk correspondiente
        chunk = next(
            (c for c in code_chunks
             if c.file_path == file_path and c.start_line == start_line and c.end_line == end_line),
            None
        )

        if not chunk:
            continue

        # Refactorizar el hallazgo más severo primero
        worst_finding = max(chunk_findings, key=lambda f: {
            "critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1
        }.get(f["severity"], 0))

        proposal = await refactor_finding(repository_id, worst_finding, chunk, code_chunks)
        proposal["finding_ids"] = [f.get("id") for f in chunk_findings if f.get("id")]
        proposal["file_path"] = file_path
        proposals.append(proposal)

    return proposals