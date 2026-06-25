"""Shared fixtures for workers tasks tests."""

import os
import sys

sys.path.insert(0, "/home/ubuntu/vuln-scanner/workers")

os.environ.setdefault("DATABASE_URL_SYNC", "postgresql://test:test@localhost:5432/test")

from unittest.mock import MagicMock

import pytest
from celery.exceptions import Retry


@pytest.fixture
def mock_self():
    mock = MagicMock()
    mock.request.retries = 0
    mock.max_retries = 3
    mock.retry.side_effect = Retry()
    return mock


@pytest.fixture
def mock_self_final_retry():
    mock = MagicMock()
    mock.request.retries = 3
    mock.max_retries = 3
    mock.retry.side_effect = Retry()
    return mock


@pytest.fixture
def mock_self_mid_retry():
    mock = MagicMock()
    mock.request.retries = 1
    mock.max_retries = 3
    mock.retry.side_effect = Retry()
    return mock


@pytest.fixture
def sample_nmap_result():
    from utils.nmap_runner import HostInfo, NmapResult, PortInfo

    host = HostInfo(
        ip="192.168.1.1",
        hostname="test.local",
        status="up",
        os_match="Linux 5.15",
    )
    host.ports = [
        PortInfo(
            port=22, protocol="tcp", state="open", service="ssh",
            product="OpenSSH", version="8.9p1",
        ),
        PortInfo(
            port=80, protocol="tcp", state="open", service="http",
            product="nginx", version="1.24.0",
        ),
    ]
    return NmapResult(hosts=[host])


@pytest.fixture
def sample_nmap_result_no_hosts():
    from utils.nmap_runner import NmapResult
    return NmapResult(hosts=[])


@pytest.fixture
def sample_nmap_result_host_down():
    from utils.nmap_runner import HostInfo, NmapResult
    host = HostInfo(ip="10.0.0.1", status="down")
    return NmapResult(hosts=[host])


@pytest.fixture
def sample_nmap_result_no_product():
    from utils.nmap_runner import HostInfo, NmapResult, PortInfo
    host = HostInfo(ip="10.0.0.1", status="up")
    host.ports = [
        PortInfo(
            port=8080, protocol="tcp", state="open", service="http-proxy",
            product="", version="",
        ),
    ]
    return NmapResult(hosts=[host])


@pytest.fixture
def sample_vulns():
    return [
        {
            "id": "CVE-2024-1234",
            "aliases": ["CVE-2024-1234"],
            "summary": "Critical RCE in OpenSSH",
            "details": "Remote code execution in OpenSSH",
            "severity": [{"type": "CVSS_V3", "score": 9.1}],
            "database_specific": {},
            "references": [],
        },
        {
            "id": "CVE-2024-5678",
            "aliases": ["CVE-2024-5678"],
            "summary": "Medium DoS in nginx",
            "details": "Denial of service in nginx",
            "severity": [{"type": "CVSS_V3", "score": 5.5}],
            "database_specific": {},
            "references": [],
        },
    ]
