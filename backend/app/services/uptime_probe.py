from __future__ import annotations

import ipaddress
import socket
import ssl
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse

import httpx

from app.models.uptime import USER_AGENT

TLS_WARN_DAYS = 14
BODY_LIMIT = 64 * 1024
MAX_REDIRECTS = 3


@dataclass
class ProbeResult:
    ok: bool
    latency_ms: int | None
    status_code: int | None
    error: str | None
    tls_days_left: int | None = None


def _blocked_ip(host: str, *, allow_private: bool = False) -> bool:
    if allow_private:
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return bool(
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified
    )


def resolve_public(host: str, *, allow_private: bool | None = None) -> str:
    from app.config import settings

    if allow_private is None:
        allow_private = settings.uptime_allow_private
    infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    if not infos:
        raise ValueError("host did not resolve")
    addr = infos[0][4][0]
    if _blocked_ip(str(addr), allow_private=allow_private):
        raise ValueError("resolved address is not allowed")
    return str(addr)


def probe_tcp(target: str, timeout: int) -> ProbeResult:
    host, port_s = target.rsplit(":", 1)
    port = int(port_s)
    start = time.perf_counter()
    try:
        ip = resolve_public(host)
        with socket.create_connection((ip, port), timeout=timeout):
            latency = int((time.perf_counter() - start) * 1000)
            return ProbeResult(ok=True, latency_ms=latency, status_code=None, error=None)
    except Exception as exc:
        latency = int((time.perf_counter() - start) * 1000)
        return ProbeResult(ok=False, latency_ms=latency, status_code=None, error=str(exc)[:200])


def _tls_days_left(hostname: str, timeout: int) -> int | None:
    try:
        ctx = ssl.create_default_context()
        with (
            socket.create_connection((hostname, 443), timeout=timeout) as sock,
            ctx.wrap_socket(sock, server_hostname=hostname) as ssock,
        ):
            cert = ssock.getpeercert()
        not_after = cert.get("notAfter") if cert else None
        if not not_after:
            return None
        exp = datetime.strptime(str(not_after), "%b %d %H:%M:%S %Y %Z").replace(tzinfo=UTC)
        return int((exp - datetime.now(UTC)).total_seconds() // 86400)
    except Exception:
        return None


def probe_http(
    target: str,
    timeout: int,
    expect_status: int | None,
    keyword: str | None,
    keyword_invert: bool,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: str | None = None,
) -> ProbeResult:
    parsed = urlparse(target)
    host = parsed.hostname or ""
    start = time.perf_counter()
    try:
        resolve_public(host)
        req_headers = {"User-Agent": USER_AGENT}
        if headers:
            req_headers.update(headers)
        with httpx.Client(
            timeout=timeout,
            follow_redirects=True,
            max_redirects=MAX_REDIRECTS,
            headers=req_headers,
        ) as client:
            resp = client.request(method, target, content=body)
        latency = int((time.perf_counter() - start) * 1000)
        code = resp.status_code
        if expect_status is not None:
            ok = code == expect_status
            err = None if ok else f"expected {expect_status} got {code}"
        else:
            ok = 200 <= code < 400
            err = None if ok else f"status {code}"
        if ok and keyword:
            raw = resp.content[:BODY_LIMIT].decode("utf-8", errors="replace")
            found = keyword.lower() in raw.lower()
            if keyword_invert:
                ok = not found
                err = None if ok else "keyword present"
            else:
                ok = found
                err = None if ok else "keyword missing"
        tls_days = None
        if parsed.scheme == "https":
            tls_days = _tls_days_left(host, timeout)
        return ProbeResult(ok=ok, latency_ms=latency, status_code=code, error=err, tls_days_left=tls_days)
    except Exception as exc:
        latency = int((time.perf_counter() - start) * 1000)
        return ProbeResult(ok=False, latency_ms=latency, status_code=None, error=str(exc)[:200])


def probe_dns(target: str, timeout: int, record: str | None, expected: list[str] | None) -> ProbeResult:
    start = time.perf_counter()
    rtype = (record or "A").upper()
    try:
        family = socket.AF_INET6 if rtype == "AAAA" else socket.AF_INET
        infos = socket.getaddrinfo(target, None, family=family, type=socket.SOCK_STREAM)
        if not infos:
            raise ValueError("host did not resolve")
        for info in infos:
            addr = str(info[4][0])
            if _blocked_ip(addr):
                raise ValueError("resolved address is not allowed")
        values = sorted({str(info[4][0]).lower() for info in infos})
        latency = int((time.perf_counter() - start) * 1000)
        if expected:
            want = sorted(v.strip().rstrip(".").lower() for v in expected if v.strip())
            ok = values == want
            err = None if ok else "dns mismatch"
            return ProbeResult(ok=ok, latency_ms=latency, status_code=None, error=err)
        return ProbeResult(ok=True, latency_ms=latency, status_code=None, error=None)
    except Exception as exc:
        latency = int((time.perf_counter() - start) * 1000)
        return ProbeResult(ok=False, latency_ms=latency, status_code=None, error=str(exc)[:200])


def probe_ping(target: str, timeout: int) -> ProbeResult:
    import subprocess

    from app.config import settings

    if not settings.uptime_icmp:
        return ProbeResult(ok=False, latency_ms=None, status_code=None, error="ICMP ping is disabled")
    start = time.perf_counter()
    try:
        ip = resolve_public(target)
        proc = subprocess.run(
            ["ping", "-c", "1", "-W", str(max(timeout, 1)), ip],
            capture_output=True,
            timeout=timeout + 2,
            check=False,
        )
        latency = int((time.perf_counter() - start) * 1000)
        ok = proc.returncode == 0
        err = None if ok else "ping failed"
        return ProbeResult(ok=ok, latency_ms=latency, status_code=None, error=err)
    except Exception as exc:
        latency = int((time.perf_counter() - start) * 1000)
        return ProbeResult(ok=False, latency_ms=latency, status_code=None, error=str(exc)[:200])


def probe_heartbeat(last_at: datetime | None, interval_seconds: int) -> ProbeResult:
    grace = timedelta(seconds=interval_seconds + 60)
    if last_at is None:
        return ProbeResult(ok=False, latency_ms=None, status_code=None, error="waiting for heartbeat")
    stamp = last_at if last_at.tzinfo else last_at.replace(tzinfo=UTC)
    if datetime.now(UTC) - stamp > grace:
        return ProbeResult(ok=False, latency_ms=None, status_code=None, error="heartbeat stale")
    return ProbeResult(ok=True, latency_ms=None, status_code=None, error=None)


def tls_warn_due(last_warn: datetime | None, days_left: int | None) -> bool:
    if days_left is None or days_left > TLS_WARN_DAYS:
        return False
    if last_warn is None:
        return True
    return datetime.now(UTC) - last_warn >= timedelta(hours=24)
