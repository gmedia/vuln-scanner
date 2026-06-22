import logging
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "localhost")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", "VulnScanner <noreply@vs.appmedia.id>")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://vs.appmedia.id")


async def send_verification_email(email_to: str, token: str) -> bool:
    verification_link = f"{FRONTEND_URL}/verify-email?token={token}"

    html_body = f"""\
<html>
<body style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h2>Verify Your Email</h2>
  <p>Click the link below to verify your VulnScanner account:</p>
  <p>
    <a href="{verification_link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">
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
    msg["Subject"] = "VulnScanner — Verify Your Email"
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        use_tls = SMTP_PORT == 587
        smtp = aiosmtplib.SMTP(
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            use_tls=use_tls,
            timeout=5,
        )
        await smtp.connect()

        if SMTP_USER and SMTP_PASS:
            await smtp.login(SMTP_USER, SMTP_PASS)

        await smtp.send_message(msg)
        await smtp.quit()

        logger.info("Verification email sent to %s", email_to)
        return True

    except Exception:
        logger.exception("Failed to send verification email to %s", email_to)
        return False
