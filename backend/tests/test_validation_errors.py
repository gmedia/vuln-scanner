from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field, ValidationError

from app.errors import validation_exception_handler
from app.schemas.asset import AssetCreate
from app.schemas.auth import RegisterRequest
from app.schemas.billing_profile import BillingProfileUpdate
from app.schemas.status_page import StatusPageCreate


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

def _first_error(model: type[BaseModel], **kwargs: object) -> dict[str, object]:
    with pytest.raises(ValidationError) as exc:
        model(**kwargs)
    return dict(exc.value.errors()[0])


def test_asset_target_uses_a_stable_validation_type() -> None:
    error = _first_error(
        AssetCreate, name="prod", scan_type="ip", target="not valid!"
    )

    assert error["type"] == "target_invalid"


def test_status_slug_uses_a_stable_validation_type() -> None:
    error = _first_error(StatusPageCreate, slug="BAD SLUG", title="Status")

    assert error["type"] == "status_slug_invalid"


def test_billing_tax_id_uses_a_stable_validation_type() -> None:
    error = _first_error(BillingProfileUpdate, tax_id="123")

    assert error["type"] == "tax_id_invalid"


def test_asset_tag_limit_carries_the_max_param() -> None:
    error = _first_error(
        AssetCreate,
        name="prod",
        scan_type="ip",
        target="192.0.2.10",
        tags=[f"tag{i}" for i in range(9)],
    )

    assert error["type"] == "asset_tags_limit"
    assert error["ctx"] == {"max": 8}
