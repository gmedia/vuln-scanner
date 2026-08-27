import ast
from pathlib import Path


def test_uptime_tasks_do_not_import_fastapi_service() -> None:
    src = Path("/home/ubuntu/vuln-scanner/workers/tasks/uptime.py").read_text()
    tree = ast.parse(src)
    imported: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            imported.append(node.module)
        elif isinstance(node, ast.Import):
            imported.extend(alias.name for alias in node.names)
    assert "app.services.uptime" not in imported
    assert "fastapi" not in imported
    assert "app.services.uptime_apply" in imported
