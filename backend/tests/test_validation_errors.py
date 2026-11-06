from __future__ import annotations

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

from app.errors import validation_exception_handler
from app.schemas.auth import RegisterRequest


class _Nested(BaseModel):
    tag: str = Field(..., min_length=3)

class _Payload(BaseModel):
    email: str
    findings: list[_Nested]
    quantity: int = Field(..., ge=1, le=10)

def _client() -> TestClient:
    app = FastAPI()
    app.add_exception_handler(RequestValidationError, validation_exception_handler)

    @app.post("/register")
    async def register(body: RegisterRequest) -> dict[str, str]:
        return {"ok": "true"}

    @app.post("/payload")
    async def payload(body: _Payload) -> dict[str, str]:
        return {"ok": "true"}

    return TestClient(app)

def test_validation_body_keeps_detail_string_and_adds_fields() -> None:
    resp = _client().post(
        "/register",
        json={
            "email": "weak@example.com",
            "password": "alllowercase1!",
            "confirm_password": "alllowercase1!",
        },
    )

    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] == "validation_error"
    assert isinstance(body["detail"], str)
    assert body["detail"]
    assert body["fields"]["password"]
    assert body["errors"][0]["field"] == "password"
    assert body["errors"][0]["type"] == "password_uppercase"

def test_validation_body_never_echoes_the_submitted_password() -> None:
    resp = _client().post(
        "/register",
        json={
            "email": "weak@example.com",
            "password": "supersecretvalue",
            "confirm_password": "supersecretvalue",
        },
    )

    assert resp.status_code == 422
    assert "supersecretvalue" not in resp.text
    assert "input" not in resp.text

def test_validation_body_maps_nested_loc_paths_and_params() -> None:
    resp = _client().post(
        "/payload",
        json={
            "email": "a@example.com",
            "findings": [{"tag": "x"}],
            "quantity": 99,
        },
    )

    assert resp.status_code == 422
    body = resp.json()
    assert set(body["fields"]) == {"findings[0].tag", "quantity"}
    by_field = {issue["field"]: issue for issue in body["errors"]}
    assert by_field["quantity"]["type"] == "less_than_equal"
    assert by_field["quantity"]["params"] == {"le": 10}
    assert by_field["findings[0].tag"]["type"] == "string_too_short"
    assert by_field["findings[0].tag"]["params"] == {"min_length": 3}

def test_validation_body_reports_a_missing_body() -> None:
    resp = _client().post("/payload")

    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] == "validation_error"
    assert body["detail"]
    assert "input" not in body
