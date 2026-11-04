"""Every API route must authenticate, or be listed here as intentionally public.

``ApiKeyMiddleware`` only checks that a credential header is *present*; the real
verification runs in route dependencies. A route that forgets ``Depends(get_current_user)``
is therefore silently public — that is exactly how ``/metrics`` served the whole metric
set to any ``Authorization: Bearer <anything>`` until it was fixed.

The allowlist below is the review surface: adding a public route is a deliberate edit
with a written reason, not an omission nobody notices.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1] / "app" / "api"
MAIN_PY = Path(__file__).resolve().parents[1] / "app" / "main.py"

AUTH_DEPS = frozenset({"get_current_user", "get_current_admin", "_customer_key"})

ROUTE_METHODS = frozenset({"get", "post", "put", "patch", "delete"})

# Any other way of registering a route must still be seen, or the guard has a blind spot.
UNSUPPORTED_ROUTE_API = re.compile(r"\.(api_route|add_api_route)\s*\(")

# WebSocket handlers cannot use HTTP dependencies for the handshake, so they authorise
# imperatively. Listed one by one so a new one cannot slide in unnoticed.
WS_HANDLERS: dict[str, str] = {
    "scan_progress": "_authorize_ws_connection validates api_key/token, closes 4001",
}

# Keys are router-relative (the mount prefix from api_router.py is not applied here).
PUBLIC_ROUTES: dict[str, str] = {
    # Credentials are the payload; there is nothing to authenticate against yet.
    "POST /auth/register": "sign-up",
    "POST /auth/login": "sign-in",
    "POST /auth/refresh": "rotates an expiring refresh token",
    "GET /auth/google/config": "public OAuth client id",
    "POST /auth/google": "sign-in via a Google assertion",
    "POST /auth/verify-email": "the emailed token is the credential",
    "POST /auth/resend-verification": "emailed token; rate limited",
    "POST /auth/forgot-password": "answers identically for known and unknown addresses",
    "POST /auth/reset-password": "the emailed token is the credential",
    # Content that is public by definition.
    "GET /blog/posts": "public blog index",
    "GET /blog/posts/{slug}": "public blog post",
    "GET /install/sinexis-install.sh": "installer for a host that has no credential yet",
    # The credential travels somewhere other than an auth header.
    "POST /guard/enroll": "enrollment token in the body, redeemed once",
    "GET /host/agent/jobs": "X-Host-Agent-Token, resolved by _agent_from_token",
    "GET /host/agent/watch-sites": "X-Host-Agent-Token, resolved by _agent_from_token",
    "POST /host/agent/results": "X-Host-Agent-Token, resolved by _agent_from_token",
    "POST /host/agent/waf-events": "X-Host-Agent-Token, resolved by _agent_from_token",
    "POST /host/agent/request-scan": "X-Host-Agent-Token, resolved by _agent_from_token",
    "POST /host/agent/commands/ack": "X-Host-Agent-Token, resolved by _agent_from_token",
    "POST /uptime/heartbeat/{token}": "per-monitor token in the path",
    # Shared secret or signature, verified inside the handler.
    "POST /webhooks/payments/{provider}": "X-Payment-Webhook-Secret, secrets.compare_digest",
    "POST /webhooks/ses": "SNS signature, verify_sns_signature",
}

# Matches AUTHISH but is a feature flag, not a caller identity check.
NOT_AUTH_DEPS = frozenset({"_require_gateway"})


def _router_prefixes(tree: ast.Module) -> dict[str, str]:
    prefixes: dict[str, str] = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign) or len(node.targets) != 1:
            continue
        target = node.targets[0]
        if not isinstance(target, ast.Name) or not isinstance(node.value, ast.Call):
            continue
        if not (isinstance(node.value.func, ast.Name) and node.value.func.id == "APIRouter"):
            continue
        prefix = ""
        for keyword in node.value.keywords:
            if keyword.arg == "prefix" and isinstance(keyword.value, ast.Constant):
                prefix = str(keyword.value.value)
        prefixes[target.id] = prefix
    return prefixes


def _depends_names(node: ast.FunctionDef | ast.AsyncFunctionDef) -> set[str]:
    """Dependency names declared in the signature.

    Only the signature is inspected: a ``Depends(...)`` inside the function body is an
    imperative call, not a declared guard, and must not count.
    """
    args = node.args
    roots: list[ast.expr | None] = [*args.defaults, *args.kw_defaults]
    roots += [arg.annotation for arg in [*args.posonlyargs, *args.args, *args.kwonlyargs]]
    found: set[str] = set()
    for root in roots:
        if root is None:
            continue
        for child in ast.walk(root):
            if (
                isinstance(child, ast.Call)
                and isinstance(child.func, ast.Name)
                and child.func.id == "Depends"
                and child.args
                and isinstance(child.args[0], ast.Name)
            ):
                found.add(child.args[0].id)
    return found


def _routes() -> list[tuple[str, str, bool, str]]:
    """(method, path, has_auth, source) for every route decorator in app/api."""
    rows: list[tuple[str, str, bool, str]] = []
    for path in sorted(API_DIR.glob("*_routes.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        prefixes = _router_prefixes(tree)
        for node in ast.walk(tree):
            if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                continue
            for decorator in node.decorator_list:
                if not isinstance(decorator, ast.Call) or not isinstance(decorator.func, ast.Attribute):
                    continue
                method = decorator.func.attr
                if method not in ROUTE_METHODS:
                    continue
                router = decorator.func.value
                if not isinstance(router, ast.Name):
                    continue
                route_path = ""
                if decorator.args and isinstance(decorator.args[0], ast.Constant):
                    route_path = str(decorator.args[0].value)
                full = (prefixes.get(router.id, "") + route_path) or "/"
                full = re.sub(r"//+", "/", full)
                has_auth = bool(_depends_names(node) & AUTH_DEPS)
                rows.append((method.upper(), full, has_auth, f"{path.name}:{node.name}"))
    return rows


def _routes_with_deps() -> list[tuple[str, str, set[str], str]]:
    """(method, path, dependency names, source) for every route decorator."""
    rows: list[tuple[str, str, set[str], str]] = []
    for path in sorted(API_DIR.glob("*_routes.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        prefixes = _router_prefixes(tree)
        for node in ast.walk(tree):
            if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                continue
            names = _depends_names(node)
            for decorator in node.decorator_list:
                if not isinstance(decorator, ast.Call) or not isinstance(decorator.func, ast.Attribute):
                    continue
                if decorator.func.attr not in ROUTE_METHODS:
                    continue
                router = decorator.func.value
                if not isinstance(router, ast.Name):
                    continue
                route_path = ""
                if decorator.args and isinstance(decorator.args[0], ast.Constant):
                    route_path = str(decorator.args[0].value)
                full = re.sub(r"//+", "/", (prefixes.get(router.id, "") + route_path) or "/")
                rows.append((decorator.func.attr.upper(), full, names, f"{path.name}:{node.name}"))
    return rows


ADMIN_ROUTE_FILE = re.compile(r"admin[a-z_]*_routes\.py$")


def _is_admin_file(source: str) -> bool:
    """``source`` is "file.py:function", so match the file part only."""
    return bool(ADMIN_ROUTE_FILE.match(source.split(":", 1)[0]))


def test_admin_routes_require_the_platform_admin() -> None:
    """Being logged in is not enough to reach /api/admin/*.

    A route that authenticates with ``get_current_user`` but forgets
    ``get_current_admin`` is reachable by any customer — the classic IDOR shape, and the
    route-auth test above would pass it happily because it only asks "is there auth".
    """
    offenders = [
        (method, path, source, sorted(names & {"get_current_user", "get_current_admin"}))
        for method, path, names, source in _routes_with_deps()
        if _is_admin_file(source)
    ]
    unchecked = [
        (method, path, source)
        for method, path, names, source in _routes_with_deps()
        if _is_admin_file(source) and "get_current_admin" not in names
    ]
    assert len(offenders) >= 50, f"only {len(offenders)} admin routes found — scan looks broken"
    assert not unchecked, "admin route(s) without get_current_admin:\n  " + "\n  ".join(
        f"{m} {p}  ({s})" for m, p, s in unchecked
    )


def test_every_route_authenticates_or_is_allowlisted() -> None:
    unguarded = [
        (method, path, source)
        for method, path, has_auth, source in _routes()
        if not has_auth and f"{method} {path}" not in PUBLIC_ROUTES
    ]
    assert not unguarded, (
        "route(s) without an auth dependency and not in PUBLIC_ROUTES:\n  "
        + "\n  ".join(f"{m} {p}  ({s})" for m, p, s in unguarded)
        + "\n\nIf it is meant to be public, add it to PUBLIC_ROUTES with a reason."
    )


def test_public_allowlist_has_no_stale_entries() -> None:
    live = {f"{method} {path}" for method, path, _, _ in _routes()}
    guarded = {f"{method} {path}" for method, path, has_auth, _ in _routes() if has_auth}
    stale = sorted(key for key in PUBLIC_ROUTES if key not in live)
    parked = sorted(key for key in PUBLIC_ROUTES if key in guarded)
    assert not stale, f"PUBLIC_ROUTES entries match no route: {stale}"
    assert not parked, f"these routes now authenticate; drop them from PUBLIC_ROUTES: {parked}"


def test_no_route_is_registered_in_a_way_the_scan_cannot_see() -> None:
    """A route added via an API the AST scan does not model would silently pass."""
    offenders: list[str] = []
    for path in sorted(API_DIR.glob("*.py")):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if UNSUPPORTED_ROUTE_API.search(line):
                offenders.append(f"{path.name}:{number}: {line.strip()}")
    assert not offenders, "route registered outside @router.<method>; teach this test to see it:\n  " + "\n  ".join(
        offenders
    )


def test_websocket_handlers_are_reviewed_one_by_one() -> None:
    found: set[str] = set()
    for path in sorted(API_DIR.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                continue
            for decorator in node.decorator_list:
                if (
                    isinstance(decorator, ast.Call)
                    and isinstance(decorator.func, ast.Attribute)
                    and decorator.func.attr == "websocket"
                ):
                    found.add(node.name)
    unreviewed = sorted(found - set(WS_HANDLERS))
    assert not unreviewed, (
        f"websocket handler(s) without a reviewed auth story: {unreviewed}. "
        "Authorise the handshake, then add the name to WS_HANDLERS with the reason."
    )
    stale = sorted(set(WS_HANDLERS) - found)
    assert not stale, f"WS_HANDLERS entries match no handler: {stale}"


def test_metrics_endpoint_declares_a_dependency() -> None:
    """Instrumentator registers its own route, which the AST scan above cannot see.

    ``/metrics`` returned 200 with a full metric body to any
    ``Authorization: Bearer <anything>`` before this guard existed.
    """
    source = MAIN_PY.read_text(encoding="utf-8")
    call = re.search(r"instrumentator\.expose\((?:[^()]|\([^()]*\))*\)", source, re.S)
    assert call is not None, "instrumentator.expose not found in main.py"
    assert "dependencies=" in call.group(0), (
        "instrumentator.expose must pass dependencies=[Depends(_require_metrics_key)]; "
        "without it the metric endpoint is public because ApiKeyMiddleware only checks "
        "header presence."
    )


AUTHISH = re.compile(r"current|admin|auth|customer_key|require_", re.I)


def test_authish_dependency_names_are_registered() -> None:
    """A new helper like ``get_current_staff`` must not be ignored by the scan.

    Unregistered, every route using it would look unguarded, and the fix would be to
    allowlist those routes — hiding the very drift this file exists to catch.
    """
    used: set[str] = set()
    for path in sorted(API_DIR.glob("*_routes.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "Depends"
                and node.args
                and isinstance(node.args[0], ast.Name)
            ):
                used.add(node.args[0].id)
    assert used, "no Depends() calls parsed — the scan is broken"
    unregistered = sorted(
        name for name in used if AUTHISH.search(name) and name not in AUTH_DEPS and name not in NOT_AUTH_DEPS
    )
    assert not unregistered, (
        f"auth-looking dependencies missing from AUTH_DEPS: {unregistered}. "
        "Add them so routes using them count as guarded."
    )


def test_the_scan_finds_routes_at_all() -> None:
    rows = _routes()
    assert len(rows) > 100, f"only {len(rows)} routes parsed — the AST scan is broken"
    assert any(has_auth for _, _, has_auth, _ in rows), "no guarded routes found"
