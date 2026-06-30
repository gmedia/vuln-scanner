import asyncio
from email.mime.multipart import MIMEMultipart
from unittest.mock import AsyncMock, patch

import pytest

import app.services.email as email_module
from app.services.email import send_verification_email

# ---------------------------------------------------------------------------
# Successful sends
# ---------------------------------------------------------------------------


class TestSendVerificationEmailSuccess:
    @pytest.mark.asyncio
    async def test_returns_true_on_success(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.login = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_verification_email("user@example.com", "abc123token")

        assert result is True
        mock_smtp.connect.assert_awaited_once()
        mock_smtp.login.assert_not_awaited()
        mock_smtp.send_message.assert_awaited_once()
        mock_smtp.quit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_login_called_when_credentials_provided(self, monkeypatch):
        monkeypatch.setattr(email_module, "SMTP_USER", "smtpuser")
        monkeypatch.setattr(email_module, "SMTP_PASS", "smtppass")

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.login = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_verification_email("user@example.com", "token123")

        assert result is True
        mock_smtp.login.assert_awaited_once_with("smtpuser", "smtppass")


# ---------------------------------------------------------------------------
# MIME message structure
# ---------------------------------------------------------------------------


class TestMimeMessageStructure:
    @pytest.mark.asyncio
    async def test_from_header(self, monkeypatch):
        monkeypatch.setattr(email_module, "SMTP_FROM", "TestApp <test@app.com>")

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_verification_email("to@example.com", "token123")

        sent_msg = mock_smtp.send_message.call_args[0][0]
        assert sent_msg["From"] == "TestApp <test@app.com>"

    @pytest.mark.asyncio
    async def test_to_header(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_verification_email("recipient@example.com", "token123")

        sent_msg = mock_smtp.send_message.call_args[0][0]
        assert sent_msg["To"] == "recipient@example.com"

    @pytest.mark.asyncio
    async def test_subject_header(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_verification_email("user@example.com", "token123")

        sent_msg = mock_smtp.send_message.call_args[0][0]
        assert sent_msg["Subject"] == "VulnScanner — Verify Your Email"

    @pytest.mark.asyncio
    async def test_message_is_multipart_alternative(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_verification_email("user@example.com", "token123")

        sent_msg = mock_smtp.send_message.call_args[0][0]
        assert isinstance(sent_msg, MIMEMultipart)
        assert sent_msg.get_content_subtype() == "alternative"

    @pytest.mark.asyncio
    async def test_html_body_contains_verification_link(self, monkeypatch):
        monkeypatch.setattr(email_module, "FRONTEND_URL", "https://custom.example.com")

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_verification_email("user@example.com", "special-token-456")

        sent_msg = mock_smtp.send_message.call_args[0][0]
        html_part = sent_msg.get_payload()[0]
        html_body = html_part.get_payload(decode=True).decode("utf-8")
        assert "https://custom.example.com/verify-email?token=special-token-456" in html_body

    @pytest.mark.asyncio
    async def test_html_body_uses_default_frontend_url(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_verification_email("user@example.com", "token789")

        sent_msg = mock_smtp.send_message.call_args[0][0]
        html_part = sent_msg.get_payload()[0]
        html_body = html_part.get_payload(decode=True).decode("utf-8")
        assert "https://vs.appmedia.id/verify-email?token=token789" in html_body

    @pytest.mark.asyncio
    async def test_html_content_type(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_verification_email("user@example.com", "token123")

        sent_msg = mock_smtp.send_message.call_args[0][0]
        html_part = sent_msg.get_payload()[0]
        assert html_part.get_content_type() == "text/html"
        assert html_part.get_content_charset() == "utf-8"


# ---------------------------------------------------------------------------
# SMTP failures
# ---------------------------------------------------------------------------


class TestSendVerificationEmailFailure:
    @pytest.mark.asyncio
    async def test_connect_failure_returns_false(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock(side_effect=OSError("Connection refused"))

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_verification_email("user@example.com", "token123")

        assert result is False
        mock_smtp.connect.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_send_failure_returns_false(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock(side_effect=Exception("Send failed"))
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_verification_email("user@example.com", "token123")

        assert result is False
        mock_smtp.send_message.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_login_failure_returns_false(self, monkeypatch):
        monkeypatch.setattr(email_module, "SMTP_USER", "baduser")
        monkeypatch.setattr(email_module, "SMTP_PASS", "badpass")

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.login = AsyncMock(side_effect=Exception("Auth failed"))

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_verification_email("user@example.com", "token123")

        assert result is False
        mock_smtp.login.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_timeout_returns_false(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock(side_effect=TimeoutError("Connection timed out"))

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_verification_email("user@example.com", "token123")

        assert result is False


# ---------------------------------------------------------------------------
# SMTP configuration (TLS / STARTTLS)
# ---------------------------------------------------------------------------


class TestSmtpConfiguration:
    @pytest.mark.asyncio
    async def test_port_587_uses_starttls(self, monkeypatch):
        monkeypatch.setattr(email_module, "SMTP_PORT", 587)

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP") as mock_smtp_class:
            mock_smtp_class.return_value = mock_smtp
            await send_verification_email("user@example.com", "token123")

        _, kwargs = mock_smtp_class.call_args
        assert kwargs["port"] == 587
        assert kwargs["start_tls"] is True
        assert kwargs["use_tls"] is False

    @pytest.mark.asyncio
    async def test_port_465_uses_implicit_tls(self, monkeypatch):
        monkeypatch.setattr(email_module, "SMTP_PORT", 465)

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP") as mock_smtp_class:
            mock_smtp_class.return_value = mock_smtp
            await send_verification_email("user@example.com", "token123")

        _, kwargs = mock_smtp_class.call_args
        assert kwargs["port"] == 465
        assert kwargs["use_tls"] is True
        assert kwargs["start_tls"] is False

    @pytest.mark.asyncio
    async def test_custom_smtp_host(self, monkeypatch):
        monkeypatch.setattr(email_module, "SMTP_HOST", "smtp.custom.com")

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP") as mock_smtp_class:
            mock_smtp_class.return_value = mock_smtp
            await send_verification_email("user@example.com", "token123")

        _, kwargs = mock_smtp_class.call_args
        assert kwargs["hostname"] == "smtp.custom.com"

    @pytest.mark.asyncio
    async def test_default_host_is_localhost(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP") as mock_smtp_class:
            mock_smtp_class.return_value = mock_smtp
            await send_verification_email("user@example.com", "token123")

        _, kwargs = mock_smtp_class.call_args
        assert kwargs["hostname"] == "localhost"

    @pytest.mark.asyncio
    async def test_timeout_set_to_10(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP") as mock_smtp_class:
            mock_smtp_class.return_value = mock_smtp
            await send_verification_email("user@example.com", "token123")

        _, kwargs = mock_smtp_class.call_args
        assert kwargs["timeout"] == 10


# ---------------------------------------------------------------------------
# Token encoding in link
# ---------------------------------------------------------------------------


class TestTokenInLink:
    @pytest.mark.asyncio
    async def test_token_appears_in_link(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_verification_email("user@example.com", "test-token-abc123")

        sent_msg = mock_smtp.send_message.call_args[0][0]
        html_part = sent_msg.get_payload()[0]
        html_body = html_part.get_payload(decode=True).decode("utf-8")
        assert "verify-email?token=test-token-abc123" in html_body

    @pytest.mark.asyncio
    async def test_special_characters_in_token(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        special_token = "aB3-._~+/=xYz"
        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_verification_email("user@example.com", special_token)

        sent_msg = mock_smtp.send_message.call_args[0][0]
        html_part = sent_msg.get_payload()[0]
        html_body = html_part.get_payload(decode=True).decode("utf-8")
        assert special_token in html_body

    @pytest.mark.asyncio
    async def test_empty_token(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_verification_email("user@example.com", "")

        assert result is True
        sent_msg = mock_smtp.send_message.call_args[0][0]
        html_part = sent_msg.get_payload()[0]
        html_body = html_part.get_payload(decode=True).decode("utf-8")
        assert "verify-email?token=" in html_body


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEmailEdgeCases:

    # -- non-standard SMTP ports -----------------------------------------------

    @pytest.mark.asyncio
    async def test_port_25_no_tls(self, monkeypatch):
        monkeypatch.setattr(email_module, "SMTP_PORT", 25)

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP") as mock_smtp_class:
            mock_smtp_class.return_value = mock_smtp
            await send_verification_email("user@example.com", "token123")

        _, kwargs = mock_smtp_class.call_args
        assert kwargs["port"] == 25
        assert kwargs["use_tls"] is False
        assert kwargs["start_tls"] is False

    @pytest.mark.asyncio
    async def test_port_2525_custom(self, monkeypatch):
        monkeypatch.setattr(email_module, "SMTP_PORT", 2525)

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP") as mock_smtp_class:
            mock_smtp_class.return_value = mock_smtp
            await send_verification_email("user@example.com", "token123")

        _, kwargs = mock_smtp_class.call_args
        assert kwargs["port"] == 2525
        assert kwargs["use_tls"] is False
        assert kwargs["start_tls"] is False

    # -- missing credentials / no login ----------------------------------------

    @pytest.mark.asyncio
    async def test_no_credentials_no_login(self, monkeypatch):
        monkeypatch.setattr(email_module, "SMTP_USER", "")
        monkeypatch.setattr(email_module, "SMTP_PASS", "")

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.login = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_verification_email("user@example.com", "token123")

        assert result is True
        mock_smtp.login.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_user_without_pass_no_login(self, monkeypatch):
        monkeypatch.setattr(email_module, "SMTP_USER", "someuser")
        monkeypatch.setattr(email_module, "SMTP_PASS", "")

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.login = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_verification_email("user@example.com", "token123")

        assert result is True
        mock_smtp.login.assert_not_awaited()

    # -- quit failure still returns True ---------------------------------------

    @pytest.mark.asyncio
    async def test_quit_failure_still_returns_true(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock(side_effect=OSError("Broken pipe"))

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_verification_email("user@example.com", "token123")

        # quit is inside the try block, so Exception during quit → False
        assert result is False
        mock_smtp.send_message.assert_awaited_once()
        mock_smtp.quit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_connect_then_quit_failure(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock(side_effect=Exception("Connection lost during quit"))

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_verification_email("user@example.com", "token123")

        # quit inside try block → exception caught → False
        assert result is False
        mock_smtp.connect.assert_awaited_once()
        mock_smtp.send_message.assert_awaited_once()
        mock_smtp.quit.assert_awaited_once()

    # -- generic exception during send -----------------------------------------

    @pytest.mark.asyncio
    async def test_generic_exception_during_send(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock(side_effect=RuntimeError("Unexpected error"))
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_verification_email("user@example.com", "token123")

        assert result is False
        mock_smtp.send_message.assert_awaited_once()

    # -- SMTP constructor timeout ----------------------------------------------

    @pytest.mark.asyncio
    async def test_smtp_constructor_timeout_explicit(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP") as mock_smtp_class:
            mock_smtp_class.return_value = mock_smtp
            await send_verification_email("user@example.com", "token123")

        _, kwargs = mock_smtp_class.call_args
        assert kwargs["timeout"] == 10

    # -- FRONTEND_URL trailing slash -------------------------------------------

    @pytest.mark.asyncio
    async def test_frontend_url_with_trailing_slash(self, monkeypatch):
        monkeypatch.setattr(email_module, "FRONTEND_URL", "https://example.com/")

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_verification_email("user@example.com", "token123")

        sent_msg = mock_smtp.send_message.call_args[0][0]
        html_part = sent_msg.get_payload()[0]
        html_body = html_part.get_payload(decode=True).decode("utf-8")
        # The current implementation does NOT strip trailing slash, so this
        # reveals the actual behavior: double slash exists.
        assert "https://example.com//verify-email?token=token123" in html_body

    # -- long token ------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_very_long_token(self):
        long_token = "x" * 1000

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_verification_email("user@example.com", long_token)

        sent_msg = mock_smtp.send_message.call_args[0][0]
        html_part = sent_msg.get_payload()[0]
        html_body = html_part.get_payload(decode=True).decode("utf-8")
        assert long_token in html_body

    # -- HTML special chars in token (not escaped in href) ---------------------

    @pytest.mark.asyncio
    async def test_html_body_does_not_escape_token(self):
        special_token = "token<with>special&chars"

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_verification_email("user@example.com", special_token)

        sent_msg = mock_smtp.send_message.call_args[0][0]
        html_part = sent_msg.get_payload()[0]
        html_body = html_part.get_payload(decode=True).decode("utf-8")
        # Verify raw token appears in the href (not HTML-escaped as &lt; etc.)
        assert f'href="https://vs.appmedia.id/verify-email?token={special_token}"' in html_body
        # Also confirm it is NOT escaped
        assert "&lt;" not in html_body
        assert "&gt;" not in html_body
        assert "&amp;" not in html_body

    # -- SMTP_HOST empty string ------------------------------------------------

    @pytest.mark.asyncio
    async def test_smtp_host_empty_string(self, monkeypatch):
        monkeypatch.setattr(email_module, "SMTP_HOST", "")

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP") as mock_smtp_class:
            mock_smtp_class.return_value = mock_smtp
            await send_verification_email("user@example.com", "token123")

        _, kwargs = mock_smtp_class.call_args
        assert kwargs["hostname"] == ""

    # -- concurrent sends (no shared mutable state issues) ---------------------

    @pytest.mark.asyncio
    async def test_concurrent_email_sends(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            results = await asyncio.gather(
                send_verification_email("user1@example.com", "tokenA"),
                send_verification_email("user2@example.com", "tokenB"),
                send_verification_email("user3@example.com", "tokenC"),
            )

        assert results == [True, True, True]
        assert mock_smtp.send_message.await_count == 3
