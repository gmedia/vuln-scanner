"""Read and write access to the ``sku_tiers`` table.

``sku_tiers`` is the runtime source of truth for tier labels, ranking, product
capacity caps, feature gates and workspace seat limits. The legacy constant
dicts in ``app/models/*`` are seed-only from PR A onward; no runtime read path
may fall back to them.

Unknown tiers are never silently mapped to the most generous tier: ``get``
raises 404 and callers that need an active tier use ``get_active`` (400 when
the tier exists but is retired). Grandfathered orgs may keep reading an
inactive tier, which is why the plain ``get`` path does not filter on ``active``.

Mutations are intentionally transactional: a default move, a catalog
synchronisation and the tier row itself commit exactly once, so an admin never
observes a half-applied tier.
"""

from __future__ import annotations

import builtins
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, cast

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import Subscription
from app.models.invoice import INVOICE_PRODUCTS, OrgInvoice, SkuCatalog
from app.models.organization import Organization
from app.models.sku_tier import SkuTier
from app.models.sku_tier_history import SkuTierHistory
from app.models.subscription import SubscriptionRequest
from app.models.user import User
from app.schemas.sku_tier import (
    SkuCatalogPriceBody,
    SkuTierCreate,
    SkuTierUpdate,
    SkuUsage,
)

_PRODUCT_ATTRIBUTES: dict[str, str] = {
    "scan": "limit_scan",
    "host": "limit_host",
    "uptime": "limit_uptime",
    "guard": "limit_guard",
}

# Fixed audit surface; adding a column here is the only way it reaches history.
_TIER_HISTORY_FIELDS: tuple[str, ...] = (
    "label",
    "rank",
    "active",
    "requestable",
    "sales_led",
    "is_default",
    "bundle_idr",
    "limit_scan",
    "limit_host",
    "limit_uptime",
    "limit_guard",
    "allow_status_page",
    "allow_custom_host",
    "allow_waf_protect",
    "allow_siem",
    "billing_unrestricted",
    "workspace_editor_limit",
    "workspace_viewer_limit",
)

# On create, fields still sitting at their model default carry no signal.
_CREATE_DEFAULTS: dict[str, Any] = {
    "active": True,
    "requestable": True,
    "sales_led": False,
    "is_default": False,
    "bundle_idr": None,
    "allow_status_page": False,
    "allow_custom_host": False,
    "allow_waf_protect": False,
    "allow_siem": False,
    "billing_unrestricted": False,
    "workspace_editor_limit": None,
    "workspace_viewer_limit": None,
}


def _tier_values(tier: SkuTier) -> dict[str, Any]:
    return {field: getattr(tier, field) for field in _TIER_HISTORY_FIELDS}


def _price_values(rows: dict[str, SkuCatalog]) -> dict[str, Any]:
    values: dict[str, Any] = {}
    for product in INVOICE_PRODUCTS:
        row = rows.get(product)
        values[f"price.{product}.list_idr"] = int(row.list_idr) if row is not None else None
        values[f"price.{product}.invoicable"] = bool(row.invoicable) if row is not None else None
    return values


def _diff_changes(before: dict[str, Any], after: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        field: {"from": before.get(field), "to": value} for field, value in after.items() if before.get(field) != value
    }


def _created_changes(tier: SkuTier, prices: dict[str, SkuCatalogPriceBody] | None) -> dict[str, dict[str, Any]]:
    changes = {
        field: {"from": None, "to": value}
        for field, value in _tier_values(tier).items()
        if field not in _CREATE_DEFAULTS or value != _CREATE_DEFAULTS[field]
    }
    if prices is not None:
        for product in INVOICE_PRODUCTS:
            price = prices.get(product)
            if price is None:
                continue
            changes[f"price.{product}.list_idr"] = {"from": None, "to": price.list_idr}
            changes[f"price.{product}.invoicable"] = {"from": None, "to": price.invoicable}
    return changes


def _deleted_changes(tier: SkuTier, rows: dict[str, SkuCatalog]) -> dict[str, dict[str, Any]]:
    changes = {field: {"from": None, "to": value} for field, value in _tier_values(tier).items()}
    changes.update({field: {"from": None, "to": value} for field, value in _price_values(rows).items()})
    return changes


@dataclass(frozen=True)
class SkuFeatures:
    """Feature gates for one tier, decoupled from the ORM row."""

    allow_status_page: bool
    allow_custom_host: bool
    allow_waf_protect: bool
    allow_siem: bool
    billing_unrestricted: bool
    sales_led: bool
    requestable: bool

    @classmethod
    def from_tier(cls, tier: SkuTier) -> SkuFeatures:
        return cls(
            allow_status_page=tier.allow_status_page,
            allow_custom_host=tier.allow_custom_host,
            allow_waf_protect=tier.allow_waf_protect,
            allow_siem=tier.allow_siem,
            billing_unrestricted=tier.billing_unrestricted,
            sales_led=tier.sales_led,
            requestable=tier.requestable,
        )


def _seat_word(limit: int | None, noun: str) -> str:
    if limit is None:
        return f"unlimited {noun}s"
    return f"{limit} {noun}" if limit == 1 else f"{limit} {noun}s"


def workspace_seat_cap_detail(label: str, editor_limit: int | None, viewer_limit: int | None) -> str:
    """User-facing seat-cap message built from the tier's actual limits."""
    return (
        f"{label} workspace allows {_seat_word(editor_limit, 'editor')} and "
        f"{_seat_word(viewer_limit, 'viewer')}. Upgrade for more seats."
    )


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def _clean_label(label: str) -> str:
    cleaned = label.strip()
    if not 1 <= len(cleaned) <= 60:
        raise _bad_request("label must be 1..60 characters after trimming")
    return cleaned


def _check_limits(limits: dict[str, int]) -> None:
    for product, value in limits.items():
        if value < 1:
            raise _bad_request(f"limit_{product} must be >= 1")


def _check_cross_field(
    *,
    sales_led: bool,
    requestable: bool,
    allow_status_page: bool,
    allow_custom_host: bool,
    allow_siem: bool,
    billing_unrestricted: bool,
) -> tuple[bool, bool, bool]:
    """Return the effective (requestable, allow_siem, billing_unrestricted)."""
    if sales_led:
        return False, True, True
    if allow_siem:
        raise _bad_request("allow_siem requires sales_led=true")
    if billing_unrestricted:
        raise _bad_request("billing_unrestricted requires sales_led=true")
    if allow_custom_host and not allow_status_page:
        raise _bad_request("allow_custom_host requires allow_status_page=true")
    return requestable, allow_siem, billing_unrestricted


def record_tier_assignment(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    sku_code: str,
    previous: str | None,
    actor_id: uuid.UUID | None,
    source: str | None = None,
) -> None:
    """Append one ``assigned`` row for an organization's effective tier change.

    Called from ``OrganizationService.update_org`` and
    ``InvoiceService.mark_paid`` so "who moved this org to which tier" is
    answerable. The caller owns the transaction; nothing is committed here.
    """
    changes: dict[str, dict[str, Any]] = {
        "tier": {"from": previous, "to": sku_code},
    }
    if source:
        changes["source"] = {"from": None, "to": source}
    db.add(
        SkuTierHistory(
            sku_code=sku_code,
            action="assigned",
            organization_id=organization_id,
            actor_user_id=actor_id,
            changes=changes,
        )
    )


class SkuTierService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def _record_history(
        self,
        code: str,
        action: str,
        actor: User | None,
        changes: dict[str, dict[str, Any]],
    ) -> None:
        self.db.add(
            SkuTierHistory(
                sku_code=code,
                action=action,
                actor_user_id=actor.id if actor is not None else None,
                changes=changes,
            )
        )

    async def _history_page(
        self, clause: Any, *, page: int, page_size: int
    ) -> tuple[list[tuple[SkuTierHistory, str | None, str | None]], int]:
        """Shared count + page read for the two history scopes (tier, org).

        Keeping the joins, ordering and offset maths in one place is what stops
        ``history`` and ``history_for_org`` from drifting apart; only the filter
        clause differs.
        """
        total = int(
            await self.db.scalar(select(func.count()).select_from(SkuTierHistory).where(clause))
            or 0
        )
        stmt = (
            select(SkuTierHistory, User.email, Organization.name)
            .outerjoin(User, SkuTierHistory.actor_user_id == User.id)
            .outerjoin(Organization, SkuTierHistory.organization_id == Organization.id)
            .where(clause)
            .order_by(SkuTierHistory.created_at.desc(), SkuTierHistory.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        rows = (await self.db.execute(stmt)).all()
        return [(row[0], row[1], row[2]) for row in rows], total

    async def history(
        self, code: str, *, page: int = 1, page_size: int = 20
    ) -> tuple[list[tuple[SkuTierHistory, str | None, str | None]], int]:
        return await self._history_page(
            SkuTierHistory.sku_code == code, page=page, page_size=page_size
        )

    async def history_for_org(
        self, organization_id: uuid.UUID, *, page: int = 1, page_size: int = 20
    ) -> tuple[list[tuple[SkuTierHistory, str | None, str | None]], int]:
        """History rows for one organization, newest first.

        There is no existence check by design: history is append-only, so a
        deleted organization must still return its rows (``organization_id`` is
        ``ON DELETE SET NULL``, so an unknown id simply yields an empty page).
        """
        return await self._history_page(
            SkuTierHistory.organization_id == organization_id,
            page=page,
            page_size=page_size,
        )

    async def list(self, *, include_inactive: bool = False) -> list[SkuTier]:
        stmt = select(SkuTier).order_by(SkuTier.rank.asc())
        if not include_inactive:
            stmt = stmt.where(SkuTier.active.is_(True))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get(self, code: str) -> SkuTier:
        tier = await self.db.get(SkuTier, code)
        if tier is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Unknown SKU tier '{code}'",
            )
        return tier

    async def get_active(self, code: str) -> SkuTier:
        tier = await self.get(code)
        if not tier.active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"SKU tier '{tier.label}' is inactive",
            )
        return tier

    async def default(self) -> SkuTier:
        result = await self.db.execute(select(SkuTier).where(SkuTier.is_default.is_(True)).limit(1))
        tier = result.scalar_one_or_none()
        if tier is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No default SKU tier configured (sku_tiers.is_default)",
            )
        return tier

    async def limits(self, code: str) -> dict[str, int]:
        tier = await self.get(code)
        return {
            "scan": tier.limit_scan,
            "host": tier.limit_host,
            "uptime": tier.limit_uptime,
            "guard": tier.limit_guard,
        }

    async def product_limit(self, code: str, product: str) -> int:
        attribute = _PRODUCT_ATTRIBUTES.get(product)
        if attribute is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown product '{product}'")
        tier = await self.get(code)
        return int(getattr(tier, attribute))

    async def features(self, code: str) -> SkuFeatures:
        return SkuFeatures.from_tier(await self.get(code))

    async def workspace_limits(self, code: str) -> tuple[int | None, int | None]:
        tier = await self.get(code)
        return tier.workspace_editor_limit, tier.workspace_viewer_limit

    async def label(self, code: str) -> str:
        return (await self.get(code)).label

    async def usage_counts(self, code: str) -> SkuUsage:
        """Rows that reference this tier and therefore block a hard delete.

        ``sku_catalog`` is deliberately excluded: its FK is ``ON DELETE
        CASCADE`` because prices belong to the tier, not to customer history.
        """
        orgs = await self._count(Organization, Organization.sku == code)
        subscriptions = await self._count(Subscription, Subscription.sku == code)
        invoices = await self._count(OrgInvoice, OrgInvoice.sku == code)
        requests = await self._count(
            SubscriptionRequest,
            (SubscriptionRequest.current_sku == code) | (SubscriptionRequest.target_sku == code),
        )
        return SkuUsage(orgs=orgs, subscriptions=subscriptions, invoices=invoices, requests=requests)

    async def usage_counts_many(self, codes: builtins.list[str]) -> dict[str, SkuUsage]:
        """Usage counts for many tiers in a constant number of queries.

        Five grouped statements total (orgs, subscriptions, invoices, request
        ``current_sku`` and request ``target_sku``); the request column is
        summed in Python rather than expressed as a UNION so SQLite and
        PostgreSQL run the same shape. A request row is attributed to both
        columns, so a row moving from one tier to another counts under both
        codes. Every requested code is present in the result, defaulting to
        zeros.
        """
        if not codes:
            return {}
        unique: builtins.list[str] = list(dict.fromkeys(codes))

        async def _grouped(column: Any) -> dict[str, int]:
            rows = await self.db.execute(select(column, func.count()).where(column.in_(unique)).group_by(column))
            return {str(code): int(cast(int, count)) for code, count in rows.all()}

        orgs = await _grouped(Organization.sku)
        subscriptions = await _grouped(Subscription.sku)
        invoices = await _grouped(OrgInvoice.sku)
        requests_current = await _grouped(SubscriptionRequest.current_sku)
        requests_target = await _grouped(SubscriptionRequest.target_sku)

        return {
            code: SkuUsage(
                orgs=orgs.get(code, 0),
                subscriptions=subscriptions.get(code, 0),
                invoices=invoices.get(code, 0),
                requests=requests_current.get(code, 0) + requests_target.get(code, 0),
            )
            for code in unique
        }

    async def catalog_presence_many(self, codes: builtins.list[str]) -> set[str]:
        """Codes that have at least one ``sku_catalog`` row, in one query."""
        if not codes:
            return set()
        rows = await self.db.execute(
            select(SkuCatalog.sku).where(SkuCatalog.sku.in_(list(dict.fromkeys(codes)))).group_by(SkuCatalog.sku)
        )
        return {str(code) for code in rows.scalars().all()}

    async def _count(self, model: Any, clause: Any) -> int:
        result = await self.db.execute(select(func.count()).select_from(model).where(clause))
        return int(result.scalar() or 0)

    async def _rank_taken(self, rank: int, *, exclude: str | None = None) -> bool:
        stmt = select(SkuTier.code).where(SkuTier.rank == rank)
        if exclude is not None:
            stmt = stmt.where(SkuTier.code != exclude)
        return (await self.db.execute(stmt.limit(1))).scalar_one_or_none() is not None

    async def _next_rank(self) -> int:
        current = await self.db.scalar(select(func.max(SkuTier.rank)))
        return int(current or 0) + 1

    async def _requestable_codes(self, *, exclude: str | None = None) -> set[str]:
        stmt = select(SkuTier.code).where(
            SkuTier.active.is_(True),
            SkuTier.requestable.is_(True),
        )
        if exclude is not None:
            stmt = stmt.where(SkuTier.code != exclude)
        result = await self.db.execute(stmt)
        return set(result.scalars().all())

    async def _ensure_not_last_requestable(self, code: str, label: str) -> None:
        """Keep at least one tier a customer can ask to move to."""
        remaining = await self._requestable_codes(exclude=code)
        if not remaining:
            raise _conflict(
                f"{label} is the last tier a customer can request; make another tier requestable before retiring it"
            )

    async def _demote_default(self) -> None:
        """Unset the current default in the same transaction as the promotion."""
        await self.db.execute(update(SkuTier).where(SkuTier.is_default.is_(True)).values(is_default=False))

    def _catalog_prices(self, body: SkuTierCreate | SkuTierUpdate) -> dict[str, SkuCatalogPriceBody] | None:
        prices = body.prices
        if prices is None:
            return None
        return {str(product): price for product, price in prices.items()}

    async def _catalog_rows(self, code: str) -> dict[str, SkuCatalog]:
        result = await self.db.execute(select(SkuCatalog).where(SkuCatalog.sku == code))
        return {str(row.product): row for row in result.scalars().all()}

    async def create(self, body: SkuTierCreate, actor: User) -> SkuTier:
        code = body.code
        if await self.db.get(SkuTier, code) is not None:
            raise _conflict(f"SKU tier '{code}' already exists")

        label = _clean_label(body.label)
        limits = {
            "scan": body.limit_scan,
            "host": body.limit_host,
            "uptime": body.limit_uptime,
            "guard": body.limit_guard,
        }
        _check_limits(limits)

        rank = body.rank if body.rank is not None else await self._next_rank()
        if await self._rank_taken(rank):
            raise _conflict(f"Tier rank {rank} is already in use")

        requestable, allow_siem, billing_unrestricted = _check_cross_field(
            sales_led=body.sales_led,
            requestable=body.requestable,
            allow_status_page=body.allow_status_page,
            allow_custom_host=body.allow_custom_host,
            allow_siem=body.allow_siem,
            billing_unrestricted=body.billing_unrestricted,
        )
        if body.is_default and not (body.active and not body.sales_led and requestable):
            raise _bad_request("The default tier must be active, requestable and not sales-led")

        prices = self._catalog_prices(body)
        if not body.sales_led and (prices is None or set(prices) != set(INVOICE_PRODUCTS)):
            raise _bad_request("sales_led=false requires prices for scan, host, uptime and guard")

        now = datetime.now(UTC)
        if body.is_default:
            await self._demote_default()

        tier = SkuTier(
            code=code,
            label=label,
            rank=rank,
            active=body.active,
            requestable=requestable,
            sales_led=body.sales_led,
            is_default=body.is_default,
            bundle_idr=body.bundle_idr,
            limit_scan=limits["scan"],
            limit_host=limits["host"],
            limit_uptime=limits["uptime"],
            limit_guard=limits["guard"],
            allow_status_page=body.allow_status_page,
            allow_custom_host=body.allow_custom_host,
            allow_waf_protect=body.allow_waf_protect,
            allow_siem=allow_siem,
            billing_unrestricted=billing_unrestricted,
            workspace_editor_limit=body.workspace_editor_limit,
            workspace_viewer_limit=body.workspace_viewer_limit,
            created_at=now,
            updated_at=now,
            updated_by=actor.id,
        )
        self.db.add(tier)
        await self.db.flush()

        if not body.sales_led and prices is not None:
            for product in INVOICE_PRODUCTS:
                price = prices[product]
                self.db.add(
                    SkuCatalog(
                        product=product,
                        sku=code,
                        list_idr=price.list_idr,
                        invoicable=price.invoicable,
                        updated_at=now,
                        updated_by=actor.id,
                    )
                )

        self._record_history(code, "created", actor, _created_changes(tier, prices))

        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise _conflict(f"SKU tier '{code}' or rank {rank} already exists") from exc
        await self.db.refresh(tier)
        return tier

    async def update(self, code: str, body: SkuTierUpdate, actor: User) -> SkuTier:
        tier = await self.get(code)
        before_rows = await self._catalog_rows(code)
        before = {**_tier_values(tier), **_price_values(before_rows)}
        present = body.model_fields_set

        label = _clean_label(body.label) if "label" in present and body.label is not None else tier.label
        rank = tier.rank
        if "rank" in present and body.rank is not None:
            if body.rank != tier.rank and await self._rank_taken(body.rank, exclude=code):
                raise _conflict(f"Tier rank {body.rank} is already in use")
            rank = body.rank

        limits = {
            "scan": body.limit_scan if "limit_scan" in present and body.limit_scan is not None else tier.limit_scan,
            "host": body.limit_host if "limit_host" in present and body.limit_host is not None else tier.limit_host,
            "uptime": (
                body.limit_uptime if "limit_uptime" in present and body.limit_uptime is not None else tier.limit_uptime
            ),
            "guard": (
                body.limit_guard if "limit_guard" in present and body.limit_guard is not None else tier.limit_guard
            ),
        }
        _check_limits(limits)

        active = body.active if "active" in present and body.active is not None else tier.active
        sales_led = body.sales_led if "sales_led" in present and body.sales_led is not None else tier.sales_led
        allow_status_page = (
            body.allow_status_page
            if "allow_status_page" in present and body.allow_status_page is not None
            else tier.allow_status_page
        )
        allow_custom_host = (
            body.allow_custom_host
            if "allow_custom_host" in present and body.allow_custom_host is not None
            else tier.allow_custom_host
        )
        allow_waf_protect = (
            body.allow_waf_protect
            if "allow_waf_protect" in present and body.allow_waf_protect is not None
            else tier.allow_waf_protect
        )
        allow_siem = body.allow_siem if "allow_siem" in present and body.allow_siem is not None else tier.allow_siem
        billing_unrestricted = (
            body.billing_unrestricted
            if "billing_unrestricted" in present and body.billing_unrestricted is not None
            else tier.billing_unrestricted
        )
        if tier.sales_led and not sales_led:
            # These flags were forced on by the sales-led transition; clear them
            # unless the caller explicitly overrides them while leaving that mode.
            if "allow_siem" not in present:
                allow_siem = False
            if "billing_unrestricted" not in present:
                billing_unrestricted = False
        requestable = (
            body.requestable if "requestable" in present and body.requestable is not None else tier.requestable
        )
        requestable, allow_siem, billing_unrestricted = _check_cross_field(
            sales_led=sales_led,
            requestable=requestable,
            allow_status_page=allow_status_page,
            allow_custom_host=allow_custom_host,
            allow_siem=allow_siem,
            billing_unrestricted=billing_unrestricted,
        )

        is_default = body.is_default if "is_default" in present and body.is_default is not None else tier.is_default
        if is_default:
            if not (active and not sales_led and requestable):
                raise _bad_request("The default tier must be active, requestable and not sales-led")
            if not tier.is_default:
                await self._demote_default()
        elif tier.is_default:
            raise _bad_request("Cannot unset the default tier; promote another tier first")

        if tier.active and tier.requestable and not (active and requestable):
            await self._ensure_not_last_requestable(code, label)

        prices = self._catalog_prices(body)
        existing_rows: dict[str, SkuCatalog] = {}
        if not sales_led:
            existing_rows = before_rows
            if tier.sales_led:
                if prices is None or set(prices) != set(INVOICE_PRODUCTS):
                    raise _bad_request("Switching away from sales_led requires prices for scan, host, uptime and guard")
            else:
                for product in INVOICE_PRODUCTS:
                    if product not in existing_rows and (prices is None or product not in prices):
                        raise _bad_request(f"Missing price for {product}; a catalog row must be created")

        now = datetime.now(UTC)
        tier.label = label
        tier.rank = rank
        tier.active = active
        tier.requestable = requestable
        tier.sales_led = sales_led
        tier.is_default = is_default
        tier.bundle_idr = body.bundle_idr if "bundle_idr" in present else tier.bundle_idr
        tier.limit_scan = limits["scan"]
        tier.limit_host = limits["host"]
        tier.limit_uptime = limits["uptime"]
        tier.limit_guard = limits["guard"]
        tier.allow_status_page = allow_status_page
        tier.allow_custom_host = allow_custom_host
        tier.allow_waf_protect = allow_waf_protect
        tier.allow_siem = allow_siem
        tier.billing_unrestricted = billing_unrestricted
        tier.workspace_editor_limit = (
            body.workspace_editor_limit if "workspace_editor_limit" in present else tier.workspace_editor_limit
        )
        tier.workspace_viewer_limit = (
            body.workspace_viewer_limit if "workspace_viewer_limit" in present else tier.workspace_viewer_limit
        )
        tier.updated_at = now
        tier.updated_by = actor.id

        if sales_led:
            await self.db.execute(delete(SkuCatalog).where(SkuCatalog.sku == code))
        else:
            for product in INVOICE_PRODUCTS:
                price = prices.get(product) if prices is not None else None
                row = existing_rows.get(product)
                if row is None:
                    if price is None:  # validated above, kept for mypy
                        raise _bad_request(f"Missing price for {product}")
                    row = SkuCatalog(
                        product=product,
                        sku=code,
                        list_idr=price.list_idr,
                        invoicable=price.invoicable,
                        updated_at=now,
                        updated_by=actor.id,
                    )
                    self.db.add(row)
                else:
                    if price is not None:
                        row.list_idr = price.list_idr
                        row.invoicable = price.invoicable
                    row.updated_at = now
                    row.updated_by = actor.id

        after_prices: dict[str, Any] = {}
        if not sales_led:
            for product in INVOICE_PRODUCTS:
                price = prices.get(product) if prices is not None else None
                row = existing_rows.get(product)
                if price is not None:
                    after_prices[f"price.{product}.list_idr"] = price.list_idr
                    after_prices[f"price.{product}.invoicable"] = price.invoicable
                elif row is not None:
                    after_prices[f"price.{product}.list_idr"] = int(row.list_idr)
                    after_prices[f"price.{product}.invoicable"] = bool(row.invoicable)
                else:
                    after_prices[f"price.{product}.list_idr"] = None
                    after_prices[f"price.{product}.invoicable"] = None
        else:
            after_prices = _price_values({})

        changes = _diff_changes(before, {**_tier_values(tier), **after_prices})
        if changes:
            self._record_history(code, "updated", actor, changes)

        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise _conflict(f"SKU tier '{code}' or rank {rank} already exists") from exc
        await self.db.refresh(tier)
        return tier

    async def deactivate(self, code: str, actor: User) -> SkuTier:
        tier = await self.get(code)
        if tier.is_default:
            raise _conflict("The default tier cannot be deactivated")
        if tier.active and tier.requestable:
            await self._ensure_not_last_requestable(code, tier.label)
        previous = tier.active
        tier.active = False
        tier.updated_at = datetime.now(UTC)
        tier.updated_by = actor.id
        self._record_history(code, "deactivated", actor, {"active": {"from": previous, "to": False}})
        await self.db.commit()
        await self.db.refresh(tier)
        return tier

    async def reactivate(self, code: str, actor: User) -> SkuTier:
        tier = await self.get(code)
        if await self._rank_taken(tier.rank, exclude=code):
            raise _conflict(f"Tier rank {tier.rank} is already in use")
        previous = tier.active
        tier.active = True
        tier.updated_at = datetime.now(UTC)
        tier.updated_by = actor.id
        self._record_history(code, "reactivated", actor, {"active": {"from": previous, "to": True}})
        await self.db.commit()
        await self.db.refresh(tier)
        return tier

    async def delete(self, code: str, actor: User) -> None:
        tier = await self.get(code)
        if tier.is_default:
            raise _conflict("The default tier cannot be deleted")
        usage = await self.usage_counts(code)
        if usage.orgs or usage.subscriptions or usage.invoices or usage.requests:
            raise _conflict(
                f"Tier '{code}' is in use "
                f"(orgs={usage.orgs}, subscriptions={usage.subscriptions}, "
                f"invoices={usage.invoices}, requests={usage.requests})"
            )
        changes = _deleted_changes(tier, await self._catalog_rows(code))
        self._record_history(code, "deleted", actor, changes)
        # sku_catalog is owned by the tier (FK CASCADE); delete it explicitly so
        # SQLite test harnesses and PostgreSQL behave the same way.
        await self.db.execute(delete(SkuCatalog).where(SkuCatalog.sku == code))
        await self.db.delete(tier)
        await self.db.commit()


__all__ = ["SkuFeatures", "SkuTierService", "workspace_seat_cap_detail"]
