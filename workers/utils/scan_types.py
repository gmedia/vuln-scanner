"""Shared type definitions for Celery workers.

Provides TypedDicts and type aliases used across scan tasks, utilities,
and the health server.  Eliminates pervasive Any usage by giving
concrete shapes to finding dicts, severity summaries, CVE entries, and
progress messages.
"""

from __future__ import annotations

from typing import NotRequired, TypedDict


class ScanFinding(TypedDict):
    severity: str
    category: str
    title: str
    description: str
    cve_id: NotRequired[str | None]
    cvss_score: NotRequired[float | None]
    remediation: NotRequired[str | None]
    raw_data: NotRequired[object | None]
    product: NotRequired[str]
    version: NotRequired[str]


class SeveritySummary(TypedDict):
    total_findings: int
    critical: int
    high: int
    medium: int
    low: int
    info: int


class CveVuln(TypedDict, total=False):
    id: str
    summary: str
    details: str
    aliases: list[str]
    severity: list[dict[str, str | float]]
    references: list[dict[str, str]]
    database_specific: dict[str, str] | None


class ProgressMessage(TypedDict):
    type: str
    step: str
    progress: int
    message: str


class DeadLetterEntry(TypedDict):
    task_name: str
    args: list[object]
    kwargs: dict[str, object]
    exception_info: str
    timestamp: float


class HealthPayload(TypedDict):
    worker_status: str
    celery_broker: str
    queue_depth: dict[str, int | str]
    uptime: int
    dead_letter_count: int | str
    last_task_seconds_ago: int | str | None


class TaskResult(TypedDict):
    job_id: str
    summary: SeveritySummary
    error: NotRequired[str]
