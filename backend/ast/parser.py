"""
Tree-sitter based AST parser for multiple programming languages.
Supports Python, JavaScript, TypeScript, Go, Rust, Java.
"""
from tree_sitter import Language, Parser, Node
from tree_sitter_language_pack import get_language, get_parser
from typing import List, Dict, Any, Optional, Generator
from dataclasses import dataclass, field
import hashlib
import logging

logger = logging.getLogger(__name__)


@dataclass
class CodeChunk:
    """Represents a semantic chunk of code extracted from AST."""
    file_path: str
    language: str
    chunk_type: str  # class, function, method, module, interface, struct, etc.
    name: str
    parent_name: Optional[str] = None
    start_line: int = 0
    end_line: int = 0
    start_column: int = 0
    end_column: int = 0
    content: str = ""
    summary: Optional[str] = None
    docstring: Optional[str] = None
    complexity: Optional[int] = None
    dependencies: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "file_path": self.file_path,
            "language": self.language,
            "chunk_type": self.chunk_type,
            "name": self.name,
            "parent_name": self.parent_name,
            "start_line": self.start_line,
            "end_line": self.end_line,
            "start_column": self.start_column,
            "end_column": self.end_column,
            "content": self.content,
            "summary": self.summary,
            "docstring": self.docstring,
            "complexity": self.complexity,
            "dependencies": self.dependencies,
            "metadata": self.metadata,
        }

    @property
    def chunk_id(self) -> str:
        """Generate a unique ID for this chunk."""
        content_hash = hashlib.sha256(self.content.encode()).hexdigest()[:16]
        return f"{self.file_path}:{self.chunk_type}:{self.name}:{content_hash}"


class ASTParser:
    """Multi-language AST parser using Tree-sitter."""

    # Mapeo de extensiones a lenguajes tree-sitter
    LANGUAGE_MAP = {
        ".py": "python",
        ".js": "javascript",
        ".jsx": "javascript",
        ".ts": "typescript",
        ".tsx": "tsx",
        ".go": "go",
        ".rs": "rust",
        ".java": "java",
        ".cpp": "cpp",
        ".cc": "cpp",
        ".cxx": "cpp",
        ".c": "c",
        ".h": "c",
        ".hpp": "cpp",
        ".cs": "c_sharp",
        ".rb": "ruby",
        ".php": "php",
        ".swift": "swift",
        ".kt": "kotlin",
        ".scala": "scala",
    }

    # Tipos de nodos que consideramos "chunks" semánticos por lenguaje
    CHUNK_NODE_TYPES = {
        "python": [
            "class_definition",
            "function_definition",
            "async_function_definition",
            "lambda",
        ],
        "javascript": [
            "class_declaration",
            "function_declaration",
            "function_expression",
            "arrow_function",
            "method_definition",
            "generator_function_declaration",
        ],
        "typescript": [
            "class_declaration",
            "function_declaration",
            "function_expression",
            "arrow_function",
            "method_definition",
            "interface_declaration",
            "type_alias_declaration",
            "enum_declaration",
        ],
        "tsx": [
            "class_declaration",
            "function_declaration",
            "function_expression",
            "arrow_function",
            "method_definition",
            "interface_declaration",
            "type_alias_declaration",
        ],
        "go": [
            "function_declaration",
            "method_declaration",
            "type_declaration",
            "func_literal",
        ],
        "rust": [
            "function_item",
            "struct_item",
            "enum_item",
            "impl_item",
            "trait_item",
            "mod_item",
            "const_item",
            "macro_definition",
        ],
        "java": [
            "class_declaration",
            "interface_declaration",
            "enum_declaration",
            "method_declaration",
            "constructor_declaration",
            "record_declaration",
        ],
    }

    def __init__(self):
        self._parsers: Dict[str, Parser] = {}
        self._languages: Dict[str, Language] = {}
        self._init_parsers()

    def _init_parsers(self):
        """Inicializar parsers para todos los lenguajes soportados."""
        for lang_name in set(self.LANGUAGE_MAP.values()):
            try:
                language = get_language(lang_name)
                parser = get_parser(lang_name)
                self._languages[lang_name] = language
                self._parsers[lang_name] = parser
                logger.info(f"Initialized parser for {lang_name}")
            except Exception as e:
                logger.warning(f"Could not initialize parser for {lang_name}: {e}")

    def get_language_for_file(self, file_path: str) -> Optional[str]:
        """Obtener el lenguaje tree-sitter para un archivo basado en su extensión."""
        for ext, lang in self.LANGUAGE_MAP.items():
            if file_path.endswith(ext):
                return lang
        return None

    def parse_file(self, file_path: str, content: str) -> List[CodeChunk]:
        """Parsear un archivo y extraer chunks semánticos."""
        language = self.get_language_for_file(file_path)
        if not language or language not in self._parsers:
            logger.debug(f"No parser available for {file_path}")
            return []

        parser = self._parsers[language]
        tree = parser.parse(content.encode("utf-8"))

        chunks = []
        chunk_types = self.CHUNK_NODE_TYPES.get(language, [])

        def walk(node: Node, parent_name: Optional[str] = None):
            if node.type in chunk_types:
                chunk = self._extract_chunk(node, file_path, language, content, parent_name)
                if chunk:
                    chunks.append(chunk)
                    # Para nodos anidados, pasar el nombre actual como parent
                    new_parent = chunk.name
                else:
                    new_parent = parent_name
            else:
                new_parent = parent_name

            for child in node.children:
                walk(child, new_parent)

        walk(tree.root_node)
        return chunks

    def _extract_chunk(
        self,
        node: Node,
        file_path: str,
        language: str,
        content: str,
        parent_name: Optional[str] = None
    ) -> Optional[CodeChunk]:
        """Extraer información de un nodo AST y crear un CodeChunk."""
        try:
            # Obtener el nombre del chunk
            name = self._get_node_name(node, language, content)
            if not name:
                return None

            # Obtener docstring/comentario de documentación
            docstring = self._get_docstring(node, language, content)

            # Calcular complejidad ciclomática
            complexity = self._calculate_complexity(node, language)

            # Extraer dependencias (imports, requires, etc.)
            dependencies = self._extract_dependencies(node, language, content)

            # Generar resumen
            summary = self._generate_summary(node, language, name, docstring)

            return CodeChunk(
                file_path=file_path,
                language=language,
                chunk_type=self._normalize_chunk_type(node.type, language),
                name=name,
                parent_name=parent_name,
                start_line=node.start_point[0] + 1,  # Tree-sitter es 0-indexed
                end_line=node.end_point[0] + 1,
                start_column=node.start_point[1],
                end_column=node.end_point[1],
                content=content[node.start_byte:node.end_byte],
                summary=summary,
                docstring=docstring,
                complexity=complexity,
                dependencies=dependencies,
                metadata={
                    "node_type": node.type,
                    "byte_start": node.start_byte,
                    "byte_end": node.end_byte,
                }
            )
        except Exception as e:
            logger.error(f"Error extracting chunk from {file_path}: {e}")
            return None

    def _get_node_name(self, node: Node, language: str, content: str) -> Optional[str]:
        """Extraer el nombre del nodo según el lenguaje."""
        name_field_names = {
            "python": ["name"],
            "javascript": ["name", "id"],
            "typescript": ["name", "id"],
            "tsx": ["name", "id"],
            "go": ["name"],
            "rust": ["name"],
            "java": ["name"],
        }

        for field_name in name_field_names.get(language, ["name"]):
            child = node.child_by_field_name(field_name)
            if child:
                return content[child.start_byte:child.end_byte]

        # Fallback: buscar identifier en children
        for child in node.children:
            if child.type in ["identifier", "type_identifier", "scoped_identifier"]:
                return content[child.start_byte:child.end_byte]

        return None

    def _get_docstring(self, node: Node, language: str, content: str) -> Optional[str]:
        """Extraer docstring o comentario de documentación."""
        docstring_types = {
            "python": ["string", "docstring"],
            "javascript": ["comment", "jsdoc_comment"],
            "typescript": ["comment", "jsdoc_comment"],
            "tsx": ["comment", "jsdoc_comment"],
            "go": ["comment", "interpreted_string_literal"],
            "rust": ["line_comment", "block_comment", "doc_comment"],
            "java": ["block_comment", "line_comment"],
        }

        for child in node.children:
            if child.type in docstring_types.get(language, []):
                text = content[child.start_byte:child.end_byte]
                # Limpiar comentarios
                text = text.strip()
                if text.startswith(('"""', "'''", "/**", "//", "/*", "#")):
                    return text
        return None

    def _calculate_complexity(self, node: Node, language: str) -> int:
        """Calcular complejidad ciclomática aproximada."""
        complexity = 1  # Base complexity
        decision_nodes = {
            "python": ["if_statement", "for_statement", "while_statement", "try_statement",
                       "except_clause", "with_statement", "match_statement", "case"],
            "javascript": ["if_statement", "for_statement", "while_statement", "do_statement",
                           "switch_statement", "catch_clause", "try_statement", "conditional_expression"],
            "typescript": ["if_statement", "for_statement", "while_statement", "do_statement",
                           "switch_statement", "catch_clause", "try_statement", "conditional_expression"],
            "go": ["if_statement", "for_statement", "switch_statement", "select_statement"],
            "rust": ["if_expression", "loop_expression", "while_expression", "for_expression",
                     "match_expression", "try_block"],
            "java": ["if_statement", "for_statement", "while_statement", "do_statement",
                     "switch_statement", "catch_clause", "try_statement", "ternary_expression"],
        }

        nodes_to_check = decision_nodes.get(language, [])

        def count_decisions(n: Node) -> int:
            count = 0
            if n.type in nodes_to_check:
                count += 1
            for child in n.children:
                count += count_decisions(child)
            return count

        return complexity + count_decisions(node)

    def _extract_dependencies(self, node: Node, language: str, content: str) -> List[str]:
        """Extraer dependencias (imports, requires, uses, etc.)."""
        deps = []
        import_types = {
            "python": ["import_statement", "import_from_statement"],
            "javascript": ["import_statement", "import_declaration", "require_call"],
            "typescript": ["import_statement", "import_declaration", "require_call"],
            "go": ["import_declaration", "import_spec"],
            "rust": ["use_declaration", "extern_crate_declaration"],
            "java": ["import_declaration"],
        }

        for child in node.children:
            if child.type in import_types.get(language, []):
                dep_text = content[child.start_byte:child.end_byte].strip()
                deps.append(dep_text)
            # Buscar recursivamente en hijos
            deps.extend(self._extract_dependencies(child, language, content))

        return list(set(deps))  # Eliminar duplicados

    def _generate_summary(self, node: Node, language: str, name: str, docstring: Optional[str]) -> str:
        """Generar un resumen breve del chunk."""
        if docstring:
            # Tomar la primera línea del docstring
            first_line = docstring.split("\n")[0].strip()
            # Limpiar marcadores de comentario
            for prefix in ['"""', "'''", "/**", "*/", "//", "/*", "#"]:
                first_line = first_line.replace(prefix, "").strip()
            if first_line:
                return f"{name}: {first_line[:200]}"

        return f"{self._normalize_chunk_type(node.type, language)} {name}"

    def _normalize_chunk_type(self, node_type: str, language: str) -> str:
        """Normalizar tipos de nodos a categorías semánticas estándar."""
        type_mapping = {
            # Python
            "class_definition": "class",
            "function_definition": "function",
            "async_function_definition": "async_function",
            "lambda": "lambda",

            # JavaScript/TypeScript
            "class_declaration": "class",
            "function_declaration": "function",
            "function_expression": "function",
            "arrow_function": "arrow_function",
            "method_definition": "method",
            "generator_function_declaration": "generator_function",
            "interface_declaration": "interface",
            "type_alias_declaration": "type_alias",
            "enum_declaration": "enum",

            # Go
            "function_declaration": "function",
            "method_declaration": "method",
            "type_declaration": "type",
            "func_literal": "function_literal",

            # Rust
            "function_item": "function",
            "struct_item": "struct",
            "enum_item": "enum",
            "impl_item": "impl",
            "trait_item": "trait",
            "mod_item": "module",
            "const_item": "const",
            "macro_definition": "macro",

            # Java
            "class_declaration": "class",
            "interface_declaration": "interface",
            "enum_declaration": "enum",
            "method_declaration": "method",
            "constructor_declaration": "constructor",
            "record_declaration": "record",
        }

        return type_mapping.get(node_type, node_type)

    def parse_repository(self, repo_path: str) -> Generator[CodeChunk, None, None]:
        """Parsear todo un repositorio y generar chunks."""
        import os

        for root, dirs, files in os.walk(repo_path):
            # Ignorar directorios comunes
            dirs[:] = [d for d in dirs if not d.startswith('.') and d not in
                       ['node_modules', '__pycache__', 'venv', 'env', 'dist', 'build', 'target', '.git']]

            for file in files:
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, repo_path)

                language = self.get_language_for_file(file_path)
                if not language:
                    continue

                try:
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()

                    # Saltar archivos muy grandes
                    if len(content) > 1024 * 1024:  # 1MB
                        logger.warning(f"Skipping large file: {rel_path}")
                        continue

                    chunks = self.parse_file(rel_path, content)
                    for chunk in chunks:
                        yield chunk

                except Exception as e:
                    logger.error(f"Error parsing {rel_path}: {e}")


# Instancia global del parser
ast_parser = ASTParser()