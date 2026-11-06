from __future__ import annotations

import pytest

import app.config
from app.config import Settings
from app.services.payments.preflight import check_payment_config
from scripts import check_payment_config as cli

_DEFAULTS: dict[str, object] = {
    "payment_gateway_enabled": False,
    "payment_providers_enabled": "",
    "midtrans_server_key": "",
    "midtrans_is_production": False,
    "midtrans_verify_status": True,
    "frontend_url": "https://sinexis.app",
}


def _settings(**overrides: object) -> Settings:
    return Settings(**{**_DEFAULTS, **overrides})


_RULE_CASES = [
    pytest.param(
        {
            "payment_gateway_enabled": True,
            "payment_providers_enabled": "midtrans",
            "midtrans_server_key": "",
        },
        "error",
        "requires MIDTRANS_SERVER_KEY",
        id="rule-1-missing-key",
    ),
    pytest.param(
        {
            "payment_gateway_enabled": True,
            "payment_providers_enabled": "",
            "midtrans_server_key": "Mid-server-abc",
            "midtrans_is_production": True,
        },
        "error",
        "PAYMENT_PROVIDERS_ENABLED is empty",
        id="rule-2-empty-provider-list",
    ),
    pytest.param(
        {
            "payment_gateway_enabled": True,
            "payment_providers_enabled": "stripe",
            "midtrans_server_key": "Mid-server-abc",
            "midtrans_is_production": True,
        },
        "error",
        "unknown provider: stripe",
        id="rule-3-unknown-provider",
    ),
    pytest.param(
        {
            "payment_gateway_enabled": True,
            "payment_providers_enabled": "midtrans",
            "midtrans_server_key": "SB-Mid-server-test",
            "midtrans_is_production": True,
        },
        "error",
        "sandbox key",
        id="rule-4-production-mode-with-sandbox-key",
    ),
    pytest.param(
        {
            "payment_gateway_enabled": True,
            "payment_providers_enabled": "midtrans",
            "midtrans_server_key": "Mid-server-abc",
            "midtrans_is_production": False,
        },
        "error",
        "production key",
        id="rule-5-sandbox-mode-with-production-key",
    ),
    pytest.param(
        {
            "payment_gateway_enabled": True,
            "payment_providers_enabled": "midtrans",
            "midtrans_server_key": "Mid-server-abc",
            "midtrans_is_production": True,
            "frontend_url": "http://sinexis.app",
        },
        "error",
        "FRONTEND_URL to start with https://",
        id="rule-6-production-requires-https-frontend",
    ),
    pytest.param(
        {"payment_gateway_enabled": False, "payment_providers_enabled": "midtrans"},
        "warning",
        "PAYMENT_GATEWAY_ENABLED=false",
        id="rule-7-providers-set-while-gateway-off",
    ),
    pytest.param(
        {
            "payment_gateway_enabled": True,
            "payment_providers_enabled": "midtrans",
            "midtrans_server_key": "Mid-server-abc",
            "midtrans_is_production": True,
            "midtrans_verify_status": False,
        },
        "warning",
        "MIDTRANS_VERIFY_STATUS=false",
        id="rule-8-status-verification-off",
    ),
    pytest.param(
        {
            "payment_gateway_enabled": True,
            "payment_providers_enabled": "midtrans",
            "midtrans_server_key": "SB-Mid-server-test",
            "midtrans_is_production": False,
        },
        "warning",
        "MIDTRANS_IS_PRODUCTION=false",
        id="rule-9-sandbox-mode",
    ),
    pytest.param(
        {
            "payment_gateway_enabled": True,
            "payment_providers_enabled": "midtrans",
            "midtrans_server_key": "SB-Mid-server-test",
            "midtrans_is_production": False,
            "frontend_url": "http://localhost:5173",
        },
        "warning",
        "localhost",
        id="rule-10-localhost-frontend",
    ),
    pytest.param(
        {
            "payment_gateway_enabled": True,
            "payment_providers_enabled": "midtrans",
            "midtrans_server_key": "SB-Mid-server-test",
            "midtrans_is_production": False,
            "frontend_url": "",
        },
        "warning",
        "is empty",
        id="rule-10-empty-frontend",
    ),
    pytest.param(
        {"payment_gateway_enabled": False},
        "ok",
        "Manual bank transfer",
        id="rule-11-gateway-off",
    ),
    pytest.param(
        {
            "payment_gateway_enabled": True,
            "payment_providers_enabled": "midtrans",
            "midtrans_server_key": "Mid-server-abc",
            "midtrans_is_production": True,
        },
        "ok",
        "consistent",
        id="rule-12-enabled-and-consistent",
    ),
]


@pytest.mark.parametrize(("overrides", "level", "fragment"), _RULE_CASES)
def test_rule_findings(overrides: dict[str, object], level: str, fragment: str) -> None:
    report = check_payment_config(_settings(**overrides))
    matching = [finding for finding in report.findings if finding.level == level]
    assert any(fragment in finding.message for finding in matching), (
        f"expected a {level} finding containing {fragment!r}, got {report.findings!r}"
    )


def test_gateway_off_with_empty_config_is_clean() -> None:
    report = check_payment_config(_settings())
    assert report.ok is True
    assert report.errors == ()
    assert report.warnings == ()
    assert any(finding.level == "ok" and "Manual bank transfer" in finding.message for finding in report.findings)


def test_valid_production_config_is_ok_with_no_warnings() -> None:
    report = check_payment_config(
        _settings(
            payment_gateway_enabled=True,
            payment_providers_enabled="midtrans",
            midtrans_server_key="Mid-server-abc",
            midtrans_is_production=True,
            midtrans_verify_status=True,
            frontend_url="https://sinexis.app",
        )
    )
    assert report.ok is True
    assert len(report.errors) == 0
    assert len(report.warnings) == 0
    ok_lines = [finding for finding in report.findings if finding.level == "ok"]
    assert len(ok_lines) == 1
    assert "midtrans" in ok_lines[0].message
    assert "production" in ok_lines[0].message


@pytest.mark.parametrize(
    ("key", "production"),
    [
        ("SB-Mid-server-test", True),
        ("Mid-server-abc", False),
    ],
)
def test_key_mode_checked_even_when_gateway_off(key: str, production: bool) -> None:
    report = check_payment_config(
        _settings(
            payment_gateway_enabled=False,
            midtrans_server_key=key,
            midtrans_is_production=production,
        )
    )
    assert report.ok is False
    assert any(finding.level == "error" for finding in report.errors)


def test_empty_key_while_gateway_off_produces_no_error_or_warning() -> None:
    report = check_payment_config(
        _settings(
            payment_gateway_enabled=False,
            midtrans_server_key="",
            midtrans_is_production=True,
            frontend_url="http://localhost:5173",
        )
    )
    assert report.ok is True
    assert report.errors == ()
    assert report.warnings == ()


def test_messages_never_contain_the_server_key() -> None:
    cases = [
        ("SB-Mid-server-supersecret123", True, "https://sinexis.app"),
        ("Mid-server-supersecret456", False, "https://sinexis.app"),
        ("Mid-server-supersecret789", True, "http://sinexis.app"),
        ("unknown-supersecret000", True, "https://sinexis.app"),
    ]
    for key, production, frontend_url in cases:
        report = check_payment_config(
            _settings(
                payment_gateway_enabled=True,
                payment_providers_enabled="midtrans",
                midtrans_server_key=key,
                midtrans_is_production=production,
                frontend_url=frontend_url,
            )
        )
        for finding in report.findings:
            assert key not in finding.message
            assert "supersecret" not in finding.message


def test_cli_exit_codes(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setattr(
        app.config,
        "settings",
        _settings(payment_gateway_enabled=True, payment_providers_enabled="midtrans"),
    )
    assert cli.main() == 1
    blocked = capsys.readouterr().out
    assert "ERROR" in blocked
    assert "PAYMENT CONFIG: BLOCKED" in blocked

    monkeypatch.setattr(app.config, "settings", _settings())
    assert cli.main() == 0
    good = capsys.readouterr().out
    assert "OK" in good
    assert "Manual bank transfer" in good
    assert "PAYMENT CONFIG: OK" in good
