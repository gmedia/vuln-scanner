from __future__ import annotations

from fastapi import FastAPI, HTTPException, status
from fastapi.testclient import TestClient

from app.errors import ApiError, ErrorCode, api_error, api_error_handler


def _client() -> TestClient:
    app = FastAPI()
    app.add_exception_handler(ApiError, api_error_handler)

    @app.get("/coded")
    async def coded() -> dict[str, str]:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            ErrorCode.UPTIME_SEAT_LIMIT,
            "Uptime seat limit for starter tier is 10",
            params={"tier": "starter", "limit": 10},
        )

    @app.get("/plain")
    async def plain() -> dict[str, str]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header")

    return TestClient(app)


def test_api_error_adds_code_and_params_without_changing_detail() -> None:
    resp = _client().get("/coded")

    assert resp.status_code == 400
    assert resp.json() == {
        "detail": "Uptime seat limit for starter tier is 10",
        "code": "uptime_seat_limit",
        "params": {"tier": "starter", "limit": 10},
    }


def test_api_error_is_still_an_http_exception() -> None:
    exc = api_error(409, ErrorCode.HOST_SITE_DUPLICATE, "Site already exists for this path")

    assert isinstance(exc, HTTPException)
    assert exc.status_code == 409
    assert exc.detail == "Site already exists for this path"
    assert exc.code is ErrorCode.HOST_SITE_DUPLICATE
    assert exc.params == {}


def test_plain_http_exception_body_is_unchanged() -> None:
    resp = _client().get("/plain")

    assert resp.status_code == 401
    assert resp.json() == {"detail": "Missing Authorization header"}
