import ast
from pathlib import Path

FORBIDDEN_WEB_MODULES = {
    "fastapi",
    "starlette",
    "httpx",
    "requests",
    "aiohttp",
    "flask",
    "django",
    "tornado",
}

FORBIDDEN_LLM_MODULES = {
    "openai",
    "anthropic",
    "google.generativeai",
    "google",
    "groq",
    "cohere",
    "langchain",
    "llama_index",
    "transformers",
    "torch",
}


def test_explain_package_has_zero_web_or_llm_imports() -> None:
    """
    Enforces Item 4 rule:
    Zero web or LLM imports in the explain package.
    Tests every python file under backend/app/explain by analyzing AST.
    """
    explain_dir = Path(__file__).resolve().parent.parent / "app" / "explain"
    assert explain_dir.exists(), f"Directory {explain_dir} not found."

    py_files = list(explain_dir.glob("*.py"))
    assert len(py_files) >= 4, f"Found only {len(py_files)} files in explain package."

    forbidden = FORBIDDEN_WEB_MODULES | FORBIDDEN_LLM_MODULES

    for py_file in py_files:
        content = py_file.read_text(encoding="utf-8")
        tree = ast.parse(content, filename=str(py_file))

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    root = alias.name.split(".")[0]
                    assert root not in forbidden, (
                        f"Forbidden import '{alias.name}' found in {py_file.name} (line {node.lineno}). "
                        "Explain package must have ZERO web or LLM imports."
                    )
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    root = node.module.split(".")[0]
                    assert root not in forbidden, (
                        f"Forbidden from-import '{node.module}' found in {py_file.name} (line {node.lineno}). "
                        "Explain package must have ZERO web or LLM imports."
                    )
