import asyncio
import logging
import os
import re
from email.message import Message
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any
from uuid import UUID, uuid4

import aiosmtplib
from aiosmtplib.errors import SMTPException

from app.config import settings
from app.i18n import normalize_lang, t
from app.services.email_send_log import record_email_send
from app.services.email_suppression import is_suppressed

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "localhost")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", "Sinexis <noreply@sinexis.app>")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://sinexis.app")
SES_ENABLED = os.getenv("SES_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")
SES_REGION = os.getenv("SES_REGION", "ap-southeast-1")
SES_CONFIG_SET = os.getenv("SES_CONFIG_SET", "")
SES_FROM_ARN = os.getenv("SES_FROM_ARN", "")

_CTA_BG = "#22c55e"
_MAX_RETRIES = 3
_RETRY_BACKOFF_BASE = 1

_CTA_STYLE = (
    f"display:inline-block;padding:12px 24px;background:{_CTA_BG};color:#fff;text-decoration:none;border-radius:6px"
)


def _plain_from_html(html: str) -> str:
    text = re.sub(r"(?is)<style.*?>.*?</style>", "", html)
    text = re.sub(r"(?is)<script.*?>.*?</script>", "", text)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</p>", "\n\n", text)
    text = re.sub(r"(?i)</li>", "\n", text)
    text = re.sub(r"(?i)</h2>", "\n\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
    lines = [ln.strip() for ln in text.splitlines()]
    collapsed: list[str] = []
    blank = False
    for ln in lines:
        if not ln:
            if not blank:
                collapsed.append("")
            blank = True
            continue
        blank = False
        collapsed.append(ln)
    return "\n".join(collapsed).strip() + "\n"


def _wrap_html(*, heading: str, inner: str, preheader: str) -> str:
    hidden = f'<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{preheader}</div>'
    return f"""\
<html>
<body style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
  {hidden}
  <p style="margin:0 0 16px;font-size:13px;letter-spacing:0.04em;color:#166534;">Sinexis</p>
  <h2 style="margin-bottom: 8px;">{heading}</h2>
  {inner}
</body>
</html>"""


def _cta_block(href: str, label: str, or_copy: str) -> str:
    return f"""\
  <p>
    <a href="{href}" style="{_CTA_STYLE}">{label}</a>
  </p>
  <p style="color: #6b7280; font-size: 14px;">
    {or_copy}<br>
    {href}
  </p>"""


def _build_message(*, email_to: str, subject: str, html_body: str) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["From"] = SMTP_FROM
    msg["To"] = email_to
    msg["Subject"] = subject
    msg["Message-ID"] = f"<{uuid4()}@sinexis.app>"
    config_set = SES_CONFIG_SET or settings.ses_config_set
    if config_set:
        msg["X-SES-CONFIGURATION-SET"] = config_set
    msg.attach(MIMEText(_plain_from_html(html_body), "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    return msg


def _job_uuid(job_id: str | None) -> UUID | None:
    if not job_id:
        return None
    try:
        return UUID(str(job_id))
    except ValueError:
        return None


def _ses_enabled() -> bool:
    return bool(SES_ENABLED or settings.ses_enabled)


def _ses_send_sync(
    *,
    email_to: str,
    subject: str,
    text_body: str,
    html_body: str,
    config_set: str,
    region: str,
    from_arn: str,
) -> str | None:
    try:
        import boto3
    except ImportError:
        logger.warning("boto3 unavailable; falling back to SMTP bridge")
        return None
    client: Any = boto3.client("sesv2", region_name=region or "ap-southeast-1")
    kwargs: dict[str, Any] = {
        "FromEmailAddress": SMTP_FROM,
        "Destination": {"ToAddresses": [email_to]},
        "Content": {
            "Simple": {
                "Subject": {"Data": subject, "Charset": "utf-8"},
                "Body": {
                    "Html": {"Data": html_body, "Charset": "utf-8"},
                    "Text": {"Data": text_body, "Charset": "utf-8"},
                },
            }
        },
    }
    if from_arn:
        kwargs["FromEmailAddressIdentityArn"] = from_arn
    if config_set:
        kwargs["ConfigurationSetName"] = config_set
    response = client.send_email(**kwargs)
    message_id = response.get("MessageId")
    return str(message_id) if message_id else None


def _decode_part(part: Message) -> str:
    raw = part.get_payload(decode=True)
    if raw is None:
        return ""
    if isinstance(raw, str):
        return raw
    return bytes(raw).decode("utf-8", "replace")


def _message_parts(msg: MIMEMultipart) -> tuple[str, str, str]:
    subject = str(msg.get("Subject", "") or "")
    text_body = ""
    html_body = ""
    try:
        payload = msg.get_payload()
        if isinstance(payload, list) and len(payload) >= 2:
            text_part = payload[0]
            html_part = payload[1]
            if isinstance(text_part, Message) and isinstance(html_part, Message):
                text_body = _decode_part(text_part)
                html_body = _decode_part(html_part)
    except Exception:
        logger.warning("Failed to extract message parts for SES send")
    return subject, text_body, html_body


async def _send_with_retry(
    msg: MIMEMultipart,
    email_to: str,
    label: str,
    *,
    user_id: UUID | None = None,
    job_id: UUID | None = None,
) -> bool:
    try:
        suppressed = is_suppressed(email_to)
    except Exception:
        logger.exception("Suppression gate failed; failing open to normal send")
        suppressed = False
    if suppressed:
        record_email_send(
            label=label,
            email_to=email_to,
            ok=False,
            attempts=1,
            error="suppressed: bounced",
            user_id=user_id,
            job_id=job_id,
        )
        return False
    rfc_message_id = str(msg.get("Message-ID", "") or "").strip().strip("<>")
    provider = "smtp"
    provider_message_id: str | None = rfc_message_id or None
    if _ses_enabled():
        try:
            subject, text_body, html_body = _message_parts(msg)
            config_set = SES_CONFIG_SET or settings.ses_config_set
            region = SES_REGION or settings.ses_region
            from_arn = SES_FROM_ARN or settings.ses_from_arn
            ses_id = await asyncio.to_thread(
                _ses_send_sync,
                email_to=email_to,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
                config_set=config_set,
                region=region,
                from_arn=from_arn,
            )
        except Exception as exc:
            logger.warning("SES send failed; falling back to SMTP bridge: %s", exc)
            ses_id = None
        if ses_id is not None:
            provider = "ses-api"
            provider_message_id = ses_id
            logger.warning("%s email sent to %s via ses-api", label, email_to)
            record_email_send(
                label=label,
                email_to=email_to,
                ok=True,
                attempts=1,
                user_id=user_id,
                job_id=job_id,
                provider=provider,
                provider_message_id=provider_message_id,
            )
            return True
    last_error = ""
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            use_tls = SMTP_PORT == 465
            start_tls = SMTP_PORT == 587
            smtp = aiosmtplib.SMTP(
                hostname=SMTP_HOST,
                port=SMTP_PORT,
                use_tls=use_tls,
                start_tls=start_tls,
                timeout=10,
            )
            await smtp.connect()

            if SMTP_USER and SMTP_PASS:
                await smtp.login(SMTP_USER, SMTP_PASS)

            await smtp.send_message(msg)
            await smtp.quit()

            logger.warning("%s email sent to %s", label, email_to)
            record_email_send(
                label=label,
                email_to=email_to,
                ok=True,
                attempts=attempt,
                user_id=user_id,
                job_id=job_id,
                provider=provider,
                provider_message_id=provider_message_id,
            )
            return True

        except (SMTPException, OSError, Exception) as exc:
            last_error = str(exc)
            if attempt < _MAX_RETRIES:
                delay = _RETRY_BACKOFF_BASE * (2 ** (attempt - 1))
                logger.warning(
                    "Retry %d/%d sending %s email to %s — retrying in %ds",
                    attempt,
                    _MAX_RETRIES,
                    label,
                    email_to,
                    delay,
                )
                await asyncio.sleep(delay)
            else:
                logger.exception(
                    "Failed to send %s email to %s after %d attempts",
                    label,
                    email_to,
                    _MAX_RETRIES,
                )
                record_email_send(
                    label=label,
                    email_to=email_to,
                    ok=False,
                    attempts=attempt,
                    error=last_error,
                    user_id=user_id,
                    job_id=job_id,
                    provider=provider,
                    provider_message_id=provider_message_id,
                )

    return False


async def send_verification_email(email_to: str, token: str, lang: str | None = None) -> bool:
    locale = normalize_lang(lang)
    verification_link = f"{FRONTEND_URL}/verify-email?token={token}"
    heading = t(locale, "auth_email", "verify_heading")
    inner = f"""\
  <p style="color: #374151;">{t(locale, "auth_email", "verify_intro")}</p>
{_cta_block(verification_link, t(locale, "auth_email", "verify_cta"), t(locale, "auth_email", "verify_or_copy"))}
  <p style="color: #6b7280; font-size: 14px;">
    {t(locale, "auth_email", "verify_footer")}
  </p>"""
    html_body = _wrap_html(
        heading=heading,
        inner=inner,
        preheader=t(locale, "auth_email", "verify_preheader"),
    )
    msg = _build_message(
        email_to=email_to,
        subject=t(locale, "auth_email", "verify_subject"),
        html_body=html_body,
    )
    return await _send_with_retry(msg, email_to, "Verification", user_id=None)


async def send_password_reset_email(email_to: str, token: str, lang: str | None = None) -> bool:
    locale = normalize_lang(lang)
    reset_link = f"{FRONTEND_URL}/reset-password?token={token}"
    heading = t(locale, "auth_email", "reset_heading")
    inner = f"""\
  <p style="color: #374151;">{t(locale, "auth_email", "reset_intro")}</p>
{_cta_block(reset_link, t(locale, "auth_email", "reset_cta"), t(locale, "auth_email", "reset_or_copy"))}
  <p style="color: #6b7280; font-size: 14px;">
    {t(locale, "auth_email", "reset_footer")}
  </p>"""
    html_body = _wrap_html(
        heading=heading,
        inner=inner,
        preheader=t(locale, "auth_email", "reset_preheader"),
    )
    msg = _build_message(
        email_to=email_to,
        subject=t(locale, "auth_email", "reset_subject"),
        html_body=html_body,
    )
    return await _send_with_retry(msg, email_to, "Password reset", user_id=None)


async def send_scan_diff_email(
    email_to: str,
    *,
    target: str,
    job_id: str,
    new_critical: int,
    new_high: int,
    resolved: int = 0,
    worsened: int = 0,
    lang: str | None = None,
    user_id: UUID | None = None,
    initial_report: bool = False,
    has_baseline: bool = True,
) -> bool:
    locale = normalize_lang(lang)
    n_new = int(new_critical) + int(new_high)
    detail_link = f"{FRONTEND_URL}/scan/{job_id}"
    use_initial = bool(initial_report) and (n_new == 0 or not has_baseline)
    key_prefix = "initial_" if use_initial else ""
    heading = t(locale, "notify", f"{key_prefix}heading")
    inner = f"""\
  <p style="color: #374151;">
    {t(locale, "notify", f"{key_prefix}intro", target=target, n=n_new)}
  </p>
  <ul style="color: #111827; line-height: 1.6;">
    <li>{t(locale, "notify", "new_critical", n=int(new_critical))}</li>
    <li>{t(locale, "notify", "new_high", n=int(new_high))}</li>
    <li>{t(locale, "notify", "resolved", n=int(resolved))}</li>
    <li>{t(locale, "notify", "worsened", n=int(worsened))}</li>
  </ul>
{_cta_block(detail_link, t(locale, "notify", "open_detail"), t(locale, "notify", "or_copy"))}
  <p style="color: #6b7280; font-size: 13px;">
    {t(locale, "notify", "footer")}
  </p>"""
    html_body = _wrap_html(
        heading=heading,
        inner=inner,
        preheader=t(locale, "notify", f"{key_prefix}preheader", n=n_new, target=target),
    )
    msg = _build_message(
        email_to=email_to,
        subject=t(locale, "notify", f"{key_prefix}subject", n=n_new, target=target),
        html_body=html_body,
    )
    return await _send_with_retry(msg, email_to, "Scan diff", user_id=user_id, job_id=_job_uuid(job_id))


async def send_uptime_email(
    email_to: str,
    *,
    kind: str,
    name: str,
    target: str,
    locale: str | None = None,
    detail: str | None = None,
    user_id: UUID | None = None,
) -> bool:
    loc = normalize_lang(locale)
    key = kind if kind in ("down", "up", "tls") else "down"
    heading = t(loc, "uptime", f"heading_{key}")
    link = f"{FRONTEND_URL}/uptime"
    inner = f"""\
  <p style="color: #374151;">{t(loc, "uptime", f"intro_{key}", name=name, target=target, detail=detail or "")}</p>
{_cta_block(link, t(loc, "uptime", "open"), t(loc, "uptime", "or_copy"))}
  <p style="color: #6b7280; font-size: 13px;">{t(loc, "uptime", "footer")}</p>"""
    html_body = _wrap_html(
        heading=heading,
        inner=inner,
        preheader=t(loc, "uptime", f"preheader_{key}", name=name),
    )
    msg = _build_message(
        email_to=email_to,
        subject=t(loc, "uptime", f"subject_{key}", name=name),
        html_body=html_body,
    )
    return await _send_with_retry(msg, email_to, "Uptime", user_id=user_id)


async def send_host_protect_email(
    email_to: str,
    *,
    site_name: str,
    hit_class: str,
    rel_path: str,
    rule_id: str,
    hit_id: str,
    locale: str | None = None,
    user_id: UUID | None = None,
) -> bool:
    loc = normalize_lang(locale)
    heading = t(loc, "host_notify", "heading")
    link = f"{FRONTEND_URL}/host"
    inner = f"""\
  <p style="color: #374151;">{t(loc, "host_notify", "intro", hit_class=hit_class, site=site_name)}</p>
  <ul style="color: #111827; line-height: 1.6;">
    <li>{t(loc, "host_notify", "path", rel_path=rel_path)}</li>
    <li>{t(loc, "host_notify", "rule", rule_id=rule_id)}</li>
    <li>{t(loc, "host_notify", "hit", hit_id=hit_id)}</li>
  </ul>
{_cta_block(link, t(loc, "host_notify", "open"), t(loc, "host_notify", "or_copy"))}
  <p style="color: #6b7280; font-size: 13px;">{t(loc, "host_notify", "footer")}</p>"""
    html_body = _wrap_html(
        heading=heading,
        inner=inner,
        preheader=t(loc, "host_notify", "preheader", hit_class=hit_class, site=site_name),
    )
    msg = _build_message(
        email_to=email_to,
        subject=t(loc, "host_notify", "subject", hit_class=hit_class, site=site_name),
        html_body=html_body,
    )
    return await _send_with_retry(msg, email_to, "Host Protect", user_id=user_id)


async def send_host_waf_email(
    email_to: str,
    *,
    site_name: str,
    rule_id: str,
    method: str,
    path: str,
    action: str,
    event_id: str,
    locale: str | None = None,
    user_id: UUID | None = None,
) -> bool:
    loc = normalize_lang(locale)
    heading = t(loc, "host_notify", "waf_heading")
    link = f"{FRONTEND_URL}/host"
    inner = f"""\
  <p style="color: #374151;">{t(loc, "host_notify", "waf_intro", site=site_name, action=action)}</p>
  <ul style="color: #111827; line-height: 1.6;">
    <li>{t(loc, "host_notify", "waf_path", method=method, path=path)}</li>
    <li>{t(loc, "host_notify", "waf_rule", rule_id=rule_id)}</li>
    <li>{t(loc, "host_notify", "waf_event", event_id=event_id)}</li>
  </ul>
{_cta_block(link, t(loc, "host_notify", "open"), t(loc, "host_notify", "or_copy"))}
  <p style="color: #6b7280; font-size: 13px;">{t(loc, "host_notify", "waf_footer")}</p>"""
    html_body = _wrap_html(
        heading=heading,
        inner=inner,
        preheader=t(loc, "host_notify", "waf_preheader", site=site_name),
    )
    msg = _build_message(
        email_to=email_to,
        subject=t(loc, "host_notify", "waf_subject", site=site_name),
        html_body=html_body,
    )
    return await _send_with_retry(msg, email_to, "Host WAF", user_id=user_id)


async def send_invite_email(
    email_to: str,
    token: str,
    *,
    org_name: str,
    role: str,
    lang: str | None = None,
    user_id: UUID | None = None,
) -> bool:
    locale = normalize_lang(lang)
    invite_link = f"{FRONTEND_URL}/settings/workspace?invite={token}"
    heading = t(locale, "auth_email", "invite_heading", org=org_name)
    inner = f"""\
  <p style="color: #374151;">{t(locale, "auth_email", "invite_intro", org=org_name, role=role)}</p>
{_cta_block(invite_link, t(locale, "auth_email", "invite_cta"), t(locale, "auth_email", "invite_or_copy"))}
  <p style="color: #6b7280; font-size: 14px;">
    {t(locale, "auth_email", "invite_footer")}
  </p>"""
    html_body = _wrap_html(
        heading=heading,
        inner=inner,
        preheader=t(locale, "auth_email", "invite_preheader", org=org_name, role=role),
    )
    msg = _build_message(
        email_to=email_to,
        subject=t(locale, "auth_email", "invite_subject", org=org_name, role=role),
        html_body=html_body,
    )
    return await _send_with_retry(msg, email_to, "Invite", user_id=user_id)
