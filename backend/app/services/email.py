import asyncio
import logging
import os
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

_MAX_RETRIES = 3
_RETRY_BACKOFF_BASE = 1  # seconds: 1s, 2s, 4s


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


async def send_verification_email(email_to: str, token: str) -> bool:
    verification_link = f"{FRONTEND_URL}/verify-email?token={token}"

    html_body = f"""\
<html>
<body style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h2>Verify Your Email</h2>
  <p>Click the link below to verify your Sinexis account:</p>
  <p>
    <a href="{verification_link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;"
       "text-decoration:none;border-radius:6px">
      Verify Email
    </a>
  </p>
  <p style="color: #6b7280; font-size: 14px;">
    Or copy this link:<br>
    {verification_link}
  </p>
  <p style="color: #6b7280; font-size: 14px;">
    This link expires in 24 hours. If you didn't create an account, ignore this email.
  </p>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    msg["From"] = SMTP_FROM
    msg["To"] = email_to
    msg["Subject"] = "Sinexis — Verify Your Email"
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    return await _send_with_retry(msg, email_to, "Verification")


async def send_password_reset_email(email_to: str, token: str) -> bool:
    reset_link = f"{FRONTEND_URL}/reset-password?token={token}"

    html_body = f"""\
<html>
<body style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h2>Reset Your Password</h2>
  <p>Click the button below to reset your Sinexis account password:</p>
  <p>
    <a href="{reset_link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;"
       "text-decoration:none;border-radius:6px">
       Reset Password
     </a>
  </p>
  <p style="color: #6b7280; font-size: 14px;">
    Or copy this link:<br>
    {reset_link}
  </p>
  <p style="color: #6b7280; font-size: 14px;">
    This link expires in 1 hour. If you didn't request a password reset, ignore this email.
  </p>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    msg["From"] = SMTP_FROM
    msg["To"] = email_to
    msg["Subject"] = "Sinexis — Reset Your Password"
    msg.attach(MIMEText(html_body, "html", "utf-8"))

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
    subject = t(locale, "notify", "subject", n=n_new, target=target)
    heading = t(locale, "notify", "heading")
    intro = t(locale, "notify", "intro", target=target, n=n_new)
    li_crit = t(locale, "notify", "new_critical", n=int(new_critical))
    li_high = t(locale, "notify", "new_high", n=int(new_high))
    li_res = t(locale, "notify", "resolved", n=int(resolved))
    li_worse = t(locale, "notify", "worsened", n=int(worsened))
    open_detail = t(locale, "notify", "open_detail")
    or_copy = t(locale, "notify", "or_copy")
    footer = t(locale, "notify", "footer")

    html_body = f"""\
<html>
<body style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
  <h2 style="margin-bottom: 8px;">{heading}</h2>
  <p style="color: #374151;">
    {intro}
  </p>
  <ul style="color: #111827; line-height: 1.6;">
    <li>{li_crit}</li>
    <li>{li_high}</li>
    <li>{li_res}</li>
    <li>{li_worse}</li>
  </ul>
  <p>
    <a href="{detail_link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;
       text-decoration:none;border-radius:6px">
      {open_detail}
    </a>
  </p>
  <p style="color: #6b7280; font-size: 14px;">
    {or_copy}<br>
    {detail_link}
  </p>
  <p style="color: #6b7280; font-size: 13px;">
    {footer}
  </p>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    msg["From"] = SMTP_FROM
    msg["To"] = email_to
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html", "utf-8"))

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
    subject = t(loc, "uptime", f"subject_{key}", name=name)
    heading = t(loc, "uptime", f"heading_{key}")
    intro = t(loc, "uptime", f"intro_{key}", name=name, target=target, detail=detail or "")
    open_label = t(loc, "uptime", "open")
    or_copy = t(loc, "uptime", "or_copy")
    footer = t(loc, "uptime", "footer")
    link = f"{FRONTEND_URL}/uptime"
    html_body = f"""\
<html>
<body style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
  <h2 style="margin-bottom: 8px;">{heading}</h2>
  <p style="color: #374151;">{intro}</p>
  <p>
    <a href="{link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;
       text-decoration:none;border-radius:6px">{open_label}</a>
  </p>
  <p style="color: #6b7280; font-size: 14px;">{or_copy}<br>{link}</p>
  <p style="color: #6b7280; font-size: 13px;">{footer}</p>
</body>
</html>"""
    msg = MIMEMultipart("alternative")
    msg["From"] = SMTP_FROM
    msg["To"] = email_to
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html", "utf-8"))
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
    subject = t(loc, "host_notify", "subject", hit_class=hit_class, site=site_name)
    heading = t(loc, "host_notify", "heading")
    intro = t(loc, "host_notify", "intro", hit_class=hit_class, site=site_name)
    path_line = t(loc, "host_notify", "path", rel_path=rel_path)
    rule_line = t(loc, "host_notify", "rule", rule_id=rule_id)
    hit_line = t(loc, "host_notify", "hit", hit_id=hit_id)
    open_label = t(loc, "host_notify", "open")
    or_copy = t(loc, "host_notify", "or_copy")
    footer = t(loc, "host_notify", "footer")
    link = f"{FRONTEND_URL}/host"
    html_body = f"""\
<html>
<body style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
  <h2 style="margin-bottom: 8px;">{heading}</h2>
  <p style="color: #374151;">{intro}</p>
  <ul style="color: #111827; line-height: 1.6;">
    <li>{path_line}</li>
    <li>{rule_line}</li>
    <li>{hit_line}</li>
  </ul>
  <p>
    <a href="{link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;
       text-decoration:none;border-radius:6px">{open_label}</a>
  </p>
  <p style="color: #6b7280; font-size: 14px;">{or_copy}<br>{link}</p>
  <p style="color: #6b7280; font-size: 13px;">{footer}</p>
</body>
</html>"""
    msg = MIMEMultipart("alternative")
    msg["From"] = SMTP_FROM
    msg["To"] = email_to
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    return await _send_with_retry(msg, email_to, "Host Protect")
