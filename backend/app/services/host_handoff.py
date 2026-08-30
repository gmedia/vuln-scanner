from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.host_protect import HostHit, HostSite
from app.models.siem import SiemCase, SiemCaseNote
from app.models.user import User
from app.services.email import send_host_protect_email

logger = logging.getLogger(__name__)

CRITICAL_CLASSES = frozenset({"webshell", "backdoor"})


def _note_body(hit: HostHit) -> str:
    return (
        f"Host Protect hit {hit.id}\n"
        f"class={hit.hit_class}\n"
        f"rule_id={hit.rule_id}\n"
        f"rel_path={hit.rel_path}\n"
        "No file contents attached."
    )


async def handoff_critical_hit(db: AsyncSession, hit: HostHit, site: HostSite) -> UUID | None:
    if hit.hit_class not in CRITICAL_CLASSES:
        return None
    owner = (await db.execute(select(User).where(User.id == site.created_by))).scalar_one_or_none()
    if owner is None:
        return None

    case_id: UUID | None = None
    if settings.siem_enabled:
        try:
            title = f"Host Protect {hit.hit_class}: {site.name}"[:255]
            case = SiemCase(
                organization_id=hit.organization_id,
                title=title,
                status="open",
                created_by_user_id=owner.id,
            )
            db.add(case)
            await db.flush()
            db.add(
                SiemCaseNote(
                    case_id=case.id,
                    author_user_id=owner.id,
                    body=_note_body(hit)[:8000],
                )
            )
            case_id = case.id
        except Exception:
            logger.exception("SIEM hand-off failed for host hit %s", hit.id)

    if owner.email:
        try:
            await send_host_protect_email(
                owner.email,
                site_name=site.name,
                hit_class=hit.hit_class,
                rel_path=hit.rel_path,
                rule_id=hit.rule_id,
                hit_id=str(hit.id),
                locale=getattr(owner, "locale", None),
            )
        except Exception:
            logger.exception("Host Protect email failed for hit %s", hit.id)
    return case_id
