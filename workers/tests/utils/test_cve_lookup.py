"""Tests for cve_lookup.py: caching, OSV query, CVSS extraction, formatting."""

import json
from unittest.mock import MagicMock, patch

import pytest

from utils.cve_lookup import (
    _cache_key,
    _extract_remediation,
    _get_cached_vulns,
    _query_ecosystem,
    _set_cached_vulns,
    extract_cvss,
    format_vuln_finding,
    lookup_service_cves,
    query_osv_ecosystems,
    severity_from_cvss,
)


class TestCacheKey:
    def test_format_includes_ecosystem_package_version(self):
        key = _cache_key("openssl", "Debian", "1.1.1")
        assert key.startswith("cve_cache:")
        assert len(key) == len("cve_cache:") + 64  # sha256 hex

    def test_same_inputs_produce_same_key(self):
        k1 = _cache_key("libc", "PyPI", "1.0")
        k2 = _cache_key("libc", "PyPI", "1.0")
        assert k1 == k2

    def test_different_inputs_produce_different_keys(self):
        k1 = _cache_key("libc", "PyPI", "1.0")
        k2 = _cache_key("libc", "Debian", "1.0")
        assert k1 != k2


class TestGetCachedVulns:
    def test_cache_hit_returns_data(self, mock_redis_hit):
        with patch("utils.cve_lookup.redis.ConnectionPool.from_url"), \
             patch("utils.cve_lookup.redis.Redis", return_value=mock_redis_hit):
            result = _get_cached_vulns("pkg", "PyPI", "1.0")
            assert result is not None
            assert len(result) == 2
            assert result[0]["id"] == "GHSA-xxxx-xxxx-xxxx"

    def test_cache_miss_returns_none(self, mock_redis):
        with patch("utils.cve_lookup.redis.ConnectionPool.from_url"), \
             patch("utils.cve_lookup.redis.Redis", return_value=mock_redis):
            result = _get_cached_vulns("pkg", "PyPI", "1.0")
            assert result is None

    def test_cache_exception_returns_none(self):
        mock = MagicMock()
        mock.get.side_effect = Exception("Redis down")
        with patch("utils.cve_lookup.redis.ConnectionPool.from_url"), \
             patch("utils.cve_lookup.redis.Redis", return_value=mock):
            result = _get_cached_vulns("pkg", "PyPI", "1.0")
            assert result is None

    def test_calls_redis_pool(self):
        import utils.cve_lookup as cve_mod
        cve_mod._redis_pool = None
        mock = MagicMock()
        mock.get.return_value = None
        with patch("utils.cve_lookup.redis.ConnectionPool.from_url") as pool_from_url, \
             patch("utils.cve_lookup.redis.Redis", return_value=mock):
            _get_cached_vulns("pkg", "PyPI", "1.0")
            pool_from_url.assert_called_once()


class TestSetCachedVulns:
    def test_sets_cache_with_ttl(self, mock_redis):
        vulns = [{"id": "CVE-2024-1234"}]
        with patch("utils.cve_lookup.redis.ConnectionPool.from_url"), \
             patch("utils.cve_lookup.redis.Redis", return_value=mock_redis):
            _set_cached_vulns("pkg", "PyPI", "1.0", vulns)
            mock_redis.setex.assert_called_once()
            args = mock_redis.setex.call_args
            assert args[0][1] == 3600  # default TTL
            assert json.loads(args[0][2]) == vulns

    def test_exception_silently_handled(self):
        mock = MagicMock()
        mock.setex.side_effect = Exception("Write error")
        with patch("utils.cve_lookup.redis.ConnectionPool.from_url"), \
             patch("utils.cve_lookup.redis.Redis", return_value=mock):
            _set_cached_vulns("pkg", "PyPI", "1.0", [])
            # should not raise


class TestQueryEcosystem:
    @pytest.mark.asyncio
    async def test_cache_hit_skips_http(self, mock_redis_hit):
        with (
            patch("utils.cve_lookup._get_cached_vulns", return_value=[{"id": "CVE-1"}]),
            patch("utils.cve_lookup.httpx.AsyncClient") as mock_http,
        ):
            result = await _query_ecosystem("pkg", "PyPI", "1.0")
            assert len(result) == 1
            mock_http.assert_not_called()

    @pytest.mark.asyncio
    async def test_cache_miss_calls_osv(self, mock_httpx_osv_success):
        with (
            patch("utils.cve_lookup._get_cached_vulns", return_value=None),
            patch("utils.cve_lookup._set_cached_vulns") as mock_set,
            patch("utils.cve_lookup.httpx.AsyncClient", return_value=mock_httpx_osv_success),
        ):
            result = await _query_ecosystem("pkg", "PyPI", "1.0")
            assert len(result) == 2
            mock_set.assert_called_once()

    @pytest.mark.asyncio
    async def test_osv_404_returns_empty(self, mock_httpx_osv_not_found):
        with (
            patch("utils.cve_lookup._get_cached_vulns", return_value=None),
            patch("utils.cve_lookup.httpx.AsyncClient", return_value=mock_httpx_osv_not_found),
        ):
            result = await _query_ecosystem("pkg", "PyPI", "1.0")
            assert result == []

    @pytest.mark.asyncio
    async def test_osv_exception_returns_empty(self, mock_httpx_osv_error):
        with (
            patch("utils.cve_lookup._get_cached_vulns", return_value=None),
            patch("utils.cve_lookup.httpx.AsyncClient", return_value=mock_httpx_osv_error),
        ):
            result = await _query_ecosystem("pkg", "PyPI", "1.0")
            assert result == []


class TestQueryOsvEcosystems:
    @pytest.mark.asyncio
    async def test_queries_multiple_ecosystems(self):
        call_count = 0

        async def mock_query(pkg, eco, ver):
            nonlocal call_count
            call_count += 1
            return [{"id": f"CVE-{eco}-{call_count}"}]

        with patch("utils.cve_lookup._query_ecosystem", side_effect=mock_query):
            result = await query_osv_ecosystems("pkg", "1.0")
            assert call_count == 7  # Debian, Alpine, Ubuntu, PyPI, npm, Maven, Go
            assert len(result) == 7

    @pytest.mark.asyncio
    async def test_aggregates_duplicates_not_handled_at_this_level(self):
        async def mock_query(pkg, eco, ver):
            return [{"id": "CVE-2024-0001"}]

        with patch("utils.cve_lookup._query_ecosystem", side_effect=mock_query):
            result = await query_osv_ecosystems("pkg", "1.0")
            assert len(result) == 7  # all ecosystems return same vuln, no dedup here


class TestLookupServiceCves:
    @pytest.mark.asyncio
    async def test_queries_service_and_product(self):
        async def mock_query(pkg, ver):
            return [{"id": f"CVE-{pkg}-1"}]

        with patch("utils.cve_lookup.query_osv_ecosystems", side_effect=mock_query):
            result = await lookup_service_cves("nginx", "nginx", "1.24")
            assert len(result) == 1

    @pytest.mark.asyncio
    async def test_dedup_same_cve_from_multiple_sources(self):
        async def mock_query(pkg, ver):
            return [{"id": "CVE-2024-0001"}, {"id": "CVE-2024-0002"}]

        with patch("utils.cve_lookup.query_osv_ecosystems", side_effect=mock_query):
            result = await lookup_service_cves("nginx", "nginx", "1.24")
            assert len(result) == 2

    @pytest.mark.asyncio
    async def test_dedup_removes_duplicate_ids(self):
        call_count = [0]

        async def mock_query(pkg, ver):
            call_count[0] += 1
            if call_count[0] == 1:
                return [{"id": "CVE-2024-0001"}, {"id": "CVE-2024-0002"}]
            return [{"id": "CVE-2024-0001"}, {"id": "CVE-2024-0003"}]

        with patch("utils.cve_lookup.query_osv_ecosystems", side_effect=mock_query):
            result = await lookup_service_cves("nginx", "openssl", "1.24")
            assert len(result) == 3  # CVE-0001 deduped

    @pytest.mark.asyncio
    async def test_empty_when_no_vulns(self):
        async def mock_query(pkg, ver):
            return []

        with patch("utils.cve_lookup.query_osv_ecosystems", side_effect=mock_query):
            result = await lookup_service_cves("unknown", "", "0.1")
            assert result == []

    @pytest.mark.asyncio
    async def test_skips_product_query_when_same_as_service(self):
        call_count = [0]

        async def mock_query(pkg, ver):
            call_count[0] += 1
            return [{"id": f"CVE-{call_count[0]}"}]

        with patch("utils.cve_lookup.query_osv_ecosystems", side_effect=mock_query):
            await lookup_service_cves("nginx", "nginx", "1.24")
            assert call_count[0] == 1

    @pytest.mark.asyncio
    async def test_queries_product_when_different(self):
        call_count = [0]

        async def mock_query(pkg, ver):
            call_count[0] += 1
            return [{"id": f"CVE-{call_count[0]}"}]

        with patch("utils.cve_lookup.query_osv_ecosystems", side_effect=mock_query):
            await lookup_service_cves("nginx", "openssl", "1.24")
            assert call_count[0] == 2


class TestExtractCvss:
    def test_returns_cvss_v3_score(self, sample_osv_response):
        vuln = sample_osv_response["vulns"][0]
        score = extract_cvss(vuln)
        assert score == 8.5

    def test_falls_back_to_other_cvss(self, sample_osv_response_only_v2):
        vuln = sample_osv_response_only_v2["vulns"][0]
        score = extract_cvss(vuln)
        assert score == 6.2

    def test_returns_none_when_no_severity(self, sample_osv_response_no_cvss):
        vuln = sample_osv_response_no_cvss["vulns"][0]
        score = extract_cvss(vuln)
        assert score is None

    def test_returns_none_for_empty_severity(self):
        score = extract_cvss({"severity": []})
        assert score is None

    def test_returns_none_for_missing_severity_key(self):
        score = extract_cvss({})
        assert score is None

    def test_handles_non_numeric_score(self):
        score = extract_cvss({"severity": [{"type": "CVSS_V3", "score": "N/A"}]})
        assert score is None


class TestExtractRemediation:
    def test_fixed_version_from_database_specific(self, sample_vuln_with_remediation):
        result = _extract_remediation(sample_vuln_with_remediation)
        assert result is not None
        assert "Upgrade to version 3.0.0" in result

    def test_fix_commits_included(self, sample_vuln_with_remediation):
        result = _extract_remediation(sample_vuln_with_remediation)
        assert "Fix commits:" in result
        assert "commit/fix1" in result

    def test_fallback_to_advisory(self, sample_vuln_advisory_only):
        result = _extract_remediation(sample_vuln_advisory_only)
        assert result is not None
        assert "Advisory:" in result
        assert "CVE-2024-4444" in result

    def test_returns_none_when_no_remediation(self, sample_vuln_no_remediation):
        result = _extract_remediation(sample_vuln_no_remediation)
        assert result is None

    def test_database_specific_fixed_field(self):
        vuln = {
            "id": "CVE-2024-5555",
            "database_specific": {"fixed": "2.0.0"},
            "references": [],
            "aliases": [],
        }
        result = _extract_remediation(vuln)
        assert result is not None
        assert "Upgrade to version 2.0.0" in result


class TestFormatVulnFinding:
    def test_cve_id_from_aliases(self, sample_osv_response):
        vuln = sample_osv_response["vulns"][0]
        finding = format_vuln_finding(vuln, 8.5)
        assert finding["title"] == "CVE-2024-1234"
        assert finding["cve_id"] == "CVE-2024-1234"
        assert finding["severity"] == "high"
        assert finding["cvss_score"] == 8.5
        assert finding["category"] == "vulnerability"

    def test_finding_from_non_cve_alias(self):
        vuln = {
            "id": "GHSA-xxxx-yyyy-zzzz",
            "aliases": ["GHSA-xxxx-yyyy-zzzz"],
            "severity": [{"type": "CVSS_V3", "score": 9.5}],
            "summary": "Bad vuln",
            "database_specific": {},
            "references": [],
        }
        finding = format_vuln_finding(vuln, 9.5)
        assert finding["title"] == "GHSA-xxxx-yyyy-zzzz"
        assert finding["severity"] == "critical"

    def test_summary_truncation(self):
        vuln = {
            "id": "CVE-2024-7777",
            "aliases": ["CVE-2024-7777"],
            "severity": [{"type": "CVSS_V3", "score": 5.0}],
            "summary": "A" * 600,
            "database_specific": {},
            "references": [],
        }
        finding = format_vuln_finding(vuln, 5.0)
        assert len(finding["description"]) == 500

    def test_fallback_to_details(self):
        vuln = {
            "id": "CVE-2024-8888",
            "aliases": ["CVE-2024-8888"],
            "severity": [],
            "summary": "",
            "details": "Fallback details text",
            "database_specific": {},
            "references": [],
        }
        finding = format_vuln_finding(vuln, None)
        assert finding["description"] == "Fallback details text"

    def test_remediation_included(self, sample_vuln_with_remediation):
        finding = format_vuln_finding(sample_vuln_with_remediation, 9.2)
        assert finding["remediation"] is not None

    def test_remediation_none_when_missing(self, sample_vuln_no_remediation):
        finding = format_vuln_finding(sample_vuln_no_remediation, 7.0)
        assert finding["remediation"] is None

    def test_raw_data_preserved(self, sample_osv_response):
        vuln = sample_osv_response["vulns"][0]
        finding = format_vuln_finding(vuln, 8.5)
        assert finding["raw_data"] == vuln


class TestSeverityFromCvss:
    def test_critical_boundary(self):
        assert severity_from_cvss(9.0) == "critical"
        assert severity_from_cvss(10.0) == "critical"

    def test_high_boundary(self):
        assert severity_from_cvss(7.0) == "high"
        assert severity_from_cvss(8.9) == "high"

    def test_medium_boundary(self):
        assert severity_from_cvss(4.0) == "medium"
        assert severity_from_cvss(6.9) == "medium"

    def test_low_boundary(self):
        assert severity_from_cvss(0.1) == "low"
        assert severity_from_cvss(3.9) == "low"

    def test_info(self):
        assert severity_from_cvss(0.0) == "info"

    def test_none_is_medium(self):
        assert severity_from_cvss(None) == "medium"
