"""The sitemap must reach the app without a credential.

The shared ``client`` fixture sets ``app.middleware_stack = None``, so it can never
catch a public-path omission in ``ApiKeyMiddleware``. This test builds a real
middleware stack around a stub app instead.
"""

from fastapi.testclient import TestClient
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route

from app.middleware.auth import ApiKeyMiddleware


async def _sitemap(_request):
    return PlainTextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><urlset/>',
        media_type="application/xml",
    )


async def _scan_history(_request):
    return PlainTextResponse("secret")


def _build_app() -> Starlette:
    app = Starlette(
        routes=[
            Route("/sitemap.xml", _sitemap),
            Route("/api/scan/history", _scan_history),
        ]
    )
    app.add_middleware(ApiKeyMiddleware)
    return app


def test_sitemap_is_public_but_api_is_not():
    with TestClient(_build_app()) as client:
        sitemap = client.get("/sitemap.xml")
        assert sitemap.status_code == 200
        assert "application/xml" in sitemap.headers["content-type"]

        history = client.get("/api/scan/history")
        assert history.status_code == 401
        assert history.json() == {"detail": "Missing API key"}
