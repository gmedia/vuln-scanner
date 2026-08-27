from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from uuid import UUID

from celery import Celery
from celery.exceptions import CeleryError
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.organization import Organization
from app.models.uptime import (
    DEFAULT_INTERVAL_SECONDS,
    UPTIME_SKU_LIMITS,
    UptimeEvent,
    UptimeMonitor,
    UptimeSample,
)
from app.models.user import User
from app.schemas.uptime import (
    HEARTBEAT_PLACEHOLDER,
    UptimeMonitorCreate,
    UptimeMonitorResponse,
    UptimeMonitorUpdate,
    hash_heartbeat_token,
    mint_heartbeat_token,
)
from app.services.organization import get_membership, require_membership, role_at_least
from app.services.uptime_apply import apply_probe as persist_probe
from app.services.uptime_probe import ProbeResult

logger = logging.getLogger(__name__)


def sku_uptime_limit(sku: str | None) -> int:
    return UPTIME_SKU_LIMITS.get(sku or "multi", UPTIME_SKU_LIMITS["multi"])


_celery = Celery(
    "vuln_scanner",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)
_celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_routes={"uptime.check": {"queue": "uptime_check"}},
    broker_connection_retry_on_startup=True,
)


def enqueue_uptime_check(monitor_id: UUID) -> None:
    try:
        _celery.send_task("uptime.check", args=[str(monitor_id)], queue="uptime_check")
    except CeleryError as exc:
        logger.warning("uptime enqueue failed monitor_id=%s error=%s", monitor_id, exc)


class UptimeService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _enabled(self) -> None:
        if not settings.uptime_enabled:
            raise HTTPException(status_code=404, detail="Uptime is disabled")

    async def _org(self, organization_id: UUID) -> Organization:
        result = await self.db.execute(select(Organization).where(Organization.id == organization_id))
        org = result.scalar_one_or_none()
        if org is None:
            raise HTTPException(status_code=404, detail="Organization not found")
        return org

    async def _uptime_24h(self, monitor_id: UUID) -> float | None:
        since = datetime.now(UTC) - timedelta(hours=24)
        total_q = await self.db.execute(
            select(func.count())
            .select_from(UptimeSample)
            .where(UptimeSample.monitor_id == monitor_id, UptimeSample.checked_at >= since)
        )
        total = int(total_q.scalar() or 0)
        if total == 0:
            return None
        ok_q = await self.db.execute(
            select(func.count())
            .select_from(UptimeSample)
            .where(
                UptimeSample.monitor_id == monitor_id,
                UptimeSample.checked_at >= since,
                UptimeSample.ok.is_(True),
            )
        )
        ok_n = int(ok_q.scalar() or 0)
        return round(100.0 * ok_n / total, 2)

    def _to_response(
        self, m: UptimeMonitor, *, sku: str | None, uptime_24h: float | None = None
    ) -> UptimeMonitorResponse:
        return UptimeMonitorResponse(
            id=m.id,
            organization_id=m.organization_id,
            name=m.name,
            check_type=m.check_type,
            target=m.target,
            interval_seconds=m.interval_seconds,
            timeout_seconds=m.timeout_seconds,
            expect_status=m.expect_status,
            keyword=m.keyword,
            keyword_invert=m.keyword_invert,
            http_method=m.http_method or "GET",
            request_headers=m.request_headers,
            request_body=m.request_body,
            heartbeat_token_prefix=m.heartbeat_token_prefix,
            last_heartbeat_at=m.last_heartbeat_at,
            dns_record=m.dns_record,
            expected_values=m.expected_values,
            enabled=m.enabled,
            state=m.state,
            consecutive_fails=m.consecutive_fails,
            last_checked_at=m.last_checked_at,
            last_status_code=m.last_status_code,
            last_latency_ms=m.last_latency_ms,
            last_error=m.last_error,
            next_check_at=m.next_check_at,
            notify_email=m.notify_email,
            asset_id=m.asset_id,
            created_at=m.created_at,
            updated_at=m.updated_at,
            sku=sku,
            sku_limit=sku_uptime_limit(sku),
            uptime_24h=uptime_24h,
        )

    async def list_monitors(self, user: User, organization_id: UUID | None) -> list[UptimeMonitorResponse]:
        self._enabled()
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role="viewer")
        org = await self._org(organization_id)
        result = await self.db.execute(
            select(UptimeMonitor)
            .where(UptimeMonitor.organization_id == organization_id)
            .order_by(UptimeMonitor.created_at.desc())
        )
        items = list(result.scalars().all())
        out: list[UptimeMonitorResponse] = []
        for m in items:
            pct = await self._uptime_24h(m.id)
            out.append(self._to_response(m, sku=org.sku, uptime_24h=pct))
        return out

    async def create(
        self, user: User, organization_id: UUID | None, body: UptimeMonitorCreate
    ) -> UptimeMonitorResponse:
        self._enabled()
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role="member")
        org = await self._org(organization_id)
        limit = sku_uptime_limit(org.sku)
        count_result = await self.db.execute(
            select(func.count())
            .select_from(UptimeMonitor)
            .where(UptimeMonitor.organization_id == organization_id, UptimeMonitor.enabled.is_(True))
        )
        count = int(count_result.scalar() or 0)
        if body.check_type == "ping" and not settings.uptime_icmp:
            raise HTTPException(status_code=501, detail="ICMP ping is disabled")
        if body.enabled and count >= limit:
            raise HTTPException(status_code=400, detail=f"Uptime seat limit for {org.sku} tier is {limit}")
        if body.enabled:
            existing = await self.db.execute(
                select(UptimeMonitor.id).where(
                    UptimeMonitor.organization_id == organization_id,
                    UptimeMonitor.check_type == body.check_type,
                    UptimeMonitor.target == body.target,
                    UptimeMonitor.enabled.is_(True),
                )
            )
            if existing.scalar_one_or_none() is not None:
                raise HTTPException(status_code=409, detail="Monitor already exists for this target")
        now = datetime.now(UTC)
        token: str | None = None
        token_hash: str | None = None
        token_prefix: str | None = None
        target = body.target
        if body.check_type == "heartbeat":
            token, token_hash, token_prefix = mint_heartbeat_token()
            target = HEARTBEAT_PLACEHOLDER
        monitor = UptimeMonitor(
            id=uuid.uuid4(),
            organization_id=organization_id,
            created_by=user.id,
            asset_id=body.asset_id,
            name=body.name,
            check_type=body.check_type,
            target=target,
            interval_seconds=body.interval_seconds or DEFAULT_INTERVAL_SECONDS,
            timeout_seconds=body.timeout_seconds,
            expect_status=body.expect_status,
            keyword=body.keyword,
            keyword_invert=body.keyword_invert,
            http_method=body.http_method if body.check_type == "http" else "GET",
            request_headers=body.request_headers if body.check_type == "http" else None,
            request_body=body.request_body if body.check_type == "http" else None,
            heartbeat_token_hash=token_hash,
            heartbeat_token_prefix=token_prefix,
            dns_record=body.dns_record if body.check_type == "dns" else None,
            expected_values=body.expected_values if body.check_type == "dns" else None,
            enabled=body.enabled,
            state="unknown",
            consecutive_fails=0,
            next_check_at=now,
            notify_email=body.notify_email or user.email,
        )
        self.db.add(monitor)
        await self.db.commit()
        await self.db.refresh(monitor)
        if monitor.enabled:
            enqueue_uptime_check(monitor.id)
        resp = self._to_response(monitor, sku=org.sku)
        if token:
            resp.heartbeat_token = token
            resp.heartbeat_url = f"{settings.frontend_url.rstrip('/')}/api/uptime/heartbeat/{token}"
        return resp

    async def _get_in_org(self, monitor_id: UUID, organization_id: UUID | None, user_id: UUID) -> UptimeMonitor:
        result = await self.db.execute(select(UptimeMonitor).where(UptimeMonitor.id == monitor_id))
        monitor = result.scalar_one_or_none()
        if monitor is None:
            raise HTTPException(status_code=404, detail="Monitor not found")
        membership = await get_membership(self.db, monitor.organization_id, user_id)
        if membership is None or not role_at_least(membership.role, "viewer"):
            raise HTTPException(status_code=404, detail="Monitor not found")
        if organization_id is not None and monitor.organization_id != organization_id:
            raise HTTPException(status_code=404, detail="Monitor not found")
        return monitor

    async def get(self, user: User, organization_id: UUID | None, monitor_id: UUID) -> UptimeMonitorResponse:
        self._enabled()
        monitor = await self._get_in_org(monitor_id, organization_id, user.id)
        org = await self._org(monitor.organization_id)
        pct = await self._uptime_24h(monitor.id)
        return self._to_response(monitor, sku=org.sku, uptime_24h=pct)

    async def update(
        self, user: User, organization_id: UUID | None, monitor_id: UUID, body: UptimeMonitorUpdate
    ) -> UptimeMonitorResponse:
        self._enabled()
        monitor = await self._get_in_org(monitor_id, organization_id, user.id)
        membership = await get_membership(self.db, monitor.organization_id, user.id)
        assert membership is not None
        if not role_at_least(membership.role, "admin") and not (
            role_at_least(membership.role, "member") and monitor.created_by == user.id
        ):
            raise HTTPException(status_code=403, detail="Insufficient organization role")
        data = body.model_dump(exclude_unset=True)
        if data.get("enabled") is True and not monitor.enabled:
            org = await self._org(monitor.organization_id)
            limit = sku_uptime_limit(org.sku)
            count_result = await self.db.execute(
                select(func.count())
                .select_from(UptimeMonitor)
                .where(UptimeMonitor.organization_id == monitor.organization_id, UptimeMonitor.enabled.is_(True))
            )
            if int(count_result.scalar() or 0) >= limit:
                raise HTTPException(status_code=400, detail=f"Uptime seat limit for {org.sku} tier is {limit}")
            dup = await self.db.execute(
                select(UptimeMonitor.id).where(
                    UptimeMonitor.organization_id == monitor.organization_id,
                    UptimeMonitor.check_type == monitor.check_type,
                    UptimeMonitor.target == monitor.target,
                    UptimeMonitor.enabled.is_(True),
                    UptimeMonitor.id != monitor.id,
                )
            )
            if dup.scalar_one_or_none() is not None:
                raise HTTPException(status_code=409, detail="Monitor already exists for this target")
        was_enabled = monitor.enabled
        for key, value in data.items():
            setattr(monitor, key, value)
        monitor.updated_at = datetime.now(UTC)
        if monitor.enabled and not was_enabled:
            monitor.next_check_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(monitor)
        if monitor.enabled and (not was_enabled or monitor.state == "unknown"):
            enqueue_uptime_check(monitor.id)
        org = await self._org(monitor.organization_id)
        return self._to_response(monitor, sku=org.sku, uptime_24h=await self._uptime_24h(monitor.id))

    async def rotate_heartbeat(
        self, user: User, organization_id: UUID | None, monitor_id: UUID
    ) -> UptimeMonitorResponse:
        self._enabled()
        monitor = await self._get_in_org(monitor_id, organization_id, user.id)
        membership = await get_membership(self.db, monitor.organization_id, user.id)
        assert membership is not None
        if not role_at_least(membership.role, "member"):
            raise HTTPException(status_code=403, detail="Insufficient organization role")
        if monitor.check_type != "heartbeat":
            raise HTTPException(status_code=400, detail="Not a heartbeat monitor")
        token, token_hash, token_prefix = mint_heartbeat_token()
        monitor.heartbeat_token_hash = token_hash
        monitor.heartbeat_token_prefix = token_prefix
        monitor.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(monitor)
        org = await self._org(monitor.organization_id)
        resp = self._to_response(monitor, sku=org.sku, uptime_24h=await self._uptime_24h(monitor.id))
        resp.heartbeat_token = token
        resp.heartbeat_url = f"{settings.frontend_url.rstrip('/')}/api/uptime/heartbeat/{token}"
        return resp

    async def ingest_heartbeat(self, token: str) -> None:
        self._enabled()
        digest = hash_heartbeat_token(token)
        result = await self.db.execute(
            select(UptimeMonitor).where(
                UptimeMonitor.check_type == "heartbeat",
                UptimeMonitor.heartbeat_token_hash == digest,
                UptimeMonitor.enabled.is_(True),
            )
        )
        monitor = result.scalar_one_or_none()
        if monitor is None:
            raise HTTPException(status_code=404, detail="Unknown heartbeat token")
        now = datetime.now(UTC)
        monitor.last_heartbeat_at = now
        monitor.updated_at = now
        await self.db.commit()

    async def delete(self, user: User, organization_id: UUID | None, monitor_id: UUID) -> None:
        self._enabled()
        monitor = await self._get_in_org(monitor_id, organization_id, user.id)
        membership = await get_membership(self.db, monitor.organization_id, user.id)
        assert membership is not None
        if not role_at_least(membership.role, "admin"):
            raise HTTPException(status_code=403, detail="Insufficient organization role")
        await self.db.delete(monitor)
        await self.db.commit()

    async def list_samples(
        self,
        user: User,
        organization_id: UUID | None,
        monitor_id: UUID,
        since: datetime | None = None,
    ) -> list[UptimeSample]:
        self._enabled()
        monitor = await self._get_in_org(monitor_id, organization_id, user.id)
        floor = datetime.now(UTC) - timedelta(days=7)
        if since is None or since < floor:
            since = floor
        result = await self.db.execute(
            select(UptimeSample)
            .where(UptimeSample.monitor_id == monitor.id, UptimeSample.checked_at >= since)
            .order_by(UptimeSample.checked_at.desc())
            .limit(500)
        )
        return list(result.scalars().all())

    async def pause(
        self, user: User, organization_id: UUID | None, monitor_id: UUID, *, enabled: bool
    ) -> UptimeMonitorResponse:
        return await self.update(user, organization_id, monitor_id, UptimeMonitorUpdate(enabled=enabled))

    async def list_events(self, user: User, organization_id: UUID | None, monitor_id: UUID) -> list[UptimeEvent]:
        self._enabled()
        monitor = await self._get_in_org(monitor_id, organization_id, user.id)
        result = await self.db.execute(
            select(UptimeEvent).where(UptimeEvent.monitor_id == monitor.id).order_by(UptimeEvent.at.desc()).limit(100)
        )
        return list(result.scalars().all())

    async def apply_probe(self, monitor: UptimeMonitor, result: ProbeResult) -> UptimeEvent | None:
        return await persist_probe(self.db, monitor, result)
