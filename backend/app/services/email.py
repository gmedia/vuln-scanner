import asyncio
import logging
import os
import re
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib
from aiosmtplib.errors import SMTPException

from app.i18n import normalize_lang, t
from app.services.email_send_log import record_email_send

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "localhost")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", "Sinexis <noreply@sinexis.app>")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://sinexis.app")

_CTA_BG = "#22c55e"
_MAX_RETRIES = 3
_RETRY_BACKOFF_BASE = 1

_CTA_STYLE = (
    f"display:inline-block;padding:12px 24px;background:{_CTA_BG};color:#fff;"
    "text-decoration:none;border-radius:6px"
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
    hidden = (
        '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">'
        f"{preheader}</div>"
    )
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
    msg.attach(MIMEText(_plain_from_html(html_body), "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    return msg


async def _send_with_retry(msg: MIMEMultipart, email_to: str, label: str) -> bool:
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
    return await _send_with_retry(msg, email_to, "Verification")


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
    return await _send_with_retry(msg, email_to, "Password reset")


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
) -> bool:
    locale = normalize_lang(lang)
    n_new = int(new_critical) + int(new_high)
    detail_link = f"{FRONTEND_URL}/scan/{job_id}"
    heading = t(locale, "notify", "heading")
    inner = f"""\
  <p style="color: #374151;">
    {t(locale, "notify", "intro", target=target, n=n_new)}
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
        preheader=t(locale, "notify", "preheader", n=n_new, target=target),
    )
    msg = _build_message(
        email_to=email_to,
        subject=t(locale, "notify", "subject", n=n_new, target=target),
        html_body=html_body,
    )
    return await _send_with_retry(msg, email_to, "Scan diff")


async def send_uptime_email(
    email_to: str,
    *,
    kind: str,
    name: str,
    target: str,
    locale: str | None = None,
    detail: str | None = None,
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
    return await _send_with_retry(msg, email_to, "Uptime")


async def send_host_protect_email(
    email_to: str,
    *,
    site_name: str,
    hit_class: str,
    rel_path: str,
    rule_id: str,
    hit_id: str,
    locale: str | None = None,
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
    return await _send_with_retry(msg, email_to, "Host Protect")
