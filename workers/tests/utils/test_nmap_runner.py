"""Tests for nmap_runner.py: XML parsing and findings extraction."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from utils.nmap_runner import NmapResult, HostInfo, findings_from_nmap, parse_nmap_xml, run_nmap


class TestParseNmapXml:
    def test_open_ports_parsed_correctly(self, sample_nmap_xml_open):
        result = parse_nmap_xml(sample_nmap_xml_open)
        assert len(result.hosts) == 1
        host = result.hosts[0]
        assert host.ip == "192.168.1.1"
        assert host.status == "up"
        assert host.hostname == "router.local"
        assert host.mac == "aa:bb:cc:dd:ee:ff"
        assert host.vendor == "Intel"
        assert host.os_match == "Linux 5.15"
        assert len(host.ports) == 3
        assert host.ports[0].port == 22
        assert host.ports[0].protocol == "tcp"
        assert host.ports[0].state == "open"
        assert host.ports[0].service == "ssh"
        assert host.ports[0].product == "OpenSSH"
        assert host.ports[0].version == "8.9p1"
        assert host.ports[0].extrainfo == "protocol 2.0"
        assert host.ports[1].port == 80
        assert host.ports[1].service == "http"
        assert host.ports[2].port == 443
        assert host.ports[2].service == "https"

    def test_closed_ports_filtered_out(self, sample_nmap_xml_closed):
        result = parse_nmap_xml(sample_nmap_xml_closed)
        assert len(result.hosts) == 1
        host = result.hosts[0]
        assert host.ip == "10.0.0.1"
        assert len(host.ports) == 0

    def test_no_hosts_returns_empty(self, sample_nmap_xml_no_hosts):
        result = parse_nmap_xml(sample_nmap_xml_no_hosts)
        assert len(result.hosts) == 0

    def test_invalid_xml_returns_empty(self, sample_nmap_xml_invalid):
        result = parse_nmap_xml(sample_nmap_xml_invalid)
        assert len(result.hosts) == 0

    def test_no_os_detection(self, sample_nmap_xml_no_os):
        result = parse_nmap_xml(sample_nmap_xml_no_os)
        assert len(result.hosts) == 1
        host = result.hosts[0]
        assert host.os_match == ""

    def test_raw_xml_preserved(self, sample_nmap_xml_open):
        result = parse_nmap_xml(sample_nmap_xml_open)
        assert result.raw_xml == sample_nmap_xml_open

    def test_multiple_hosts(self):
        xml = """<?xml version="1.0"?>
<nmaprun scanner="nmap" version="7.95">
  <host><status state="up"/><address addr="10.0.0.1" addrtype="ipv4"/><hostnames/></host>
  <host><status state="up"/><address addr="10.0.0.2" addrtype="ipv4"/><hostnames/></host>
</nmaprun>"""
        result = parse_nmap_xml(xml)
        assert len(result.hosts) == 2
        assert result.hosts[0].ip == "10.0.0.1"
        assert result.hosts[1].ip == "10.0.0.2"


class TestFindingsFromNmap:
    def test_open_ports_and_os_produce_findings(self, sample_nmap_xml_open):
        result = parse_nmap_xml(sample_nmap_xml_open)
        findings = findings_from_nmap(result)
        assert len(findings) == 4  # 1 OS + 3 ports
        os_finding = findings[0]
        assert os_finding["severity"] == "info"
        assert os_finding["category"] == "os_detection"
        assert "Linux 5.15" in os_finding["title"]
        port_finding = findings[1]
        assert port_finding["category"] == "open_port"
        assert "22" in port_finding["title"]
        assert port_finding["product"] == "OpenSSH"
        assert port_finding["version"] == "8.9p1"

    def test_closed_ports_no_findings(self, sample_nmap_xml_closed):
        result = parse_nmap_xml(sample_nmap_xml_closed)
        findings = findings_from_nmap(result)
        assert len(findings) == 0

    def test_empty_result_produces_empty_findings(self):
        result = NmapResult()
        findings = findings_from_nmap(result)
        assert findings == []

    def test_host_down_skipped(self):
        xml = """<?xml version="1.0"?>
<nmaprun scanner="nmap" version="7.95">
  <host><status state="down"/><address addr="10.0.0.1" addrtype="ipv4"/><hostnames/></host>
</nmaprun>"""
        result = parse_nmap_xml(xml)
        findings = findings_from_nmap(result)
        assert len(findings) == 0

    def test_no_os_no_ports_no_findings(self, sample_nmap_xml_no_os):
        result = parse_nmap_xml(sample_nmap_xml_no_os)
        findings = findings_from_nmap(result)
        assert len(findings) == 1  # just the open port
        assert findings[0]["category"] == "open_port"


# ---------------------------------------------------------------------------
# Tests for run_nmap — async subprocess mocking for success, error, and fallback paths
# ---------------------------------------------------------------------------


class TestRunNmap:
    """Cover run_nmap() exit-code paths: success (0), non-zero without fallback trigger, and
    non-zero with 'Failed to open' that triggers the OS-detection-free retry."""

    @pytest.mark.asyncio
    async def test_run_nmap_success(self, sample_nmap_xml_open):
        """Exit code 0 → stdout XML parsed normally."""
        fake_stdout = sample_nmap_xml_open.encode("utf-8")
        fake_stderr = b""

        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.communicate = AsyncMock(return_value=(fake_stdout, fake_stderr))

        with patch("utils.nmap_runner.asyncio.create_subprocess_exec", return_value=mock_proc) as mock_exec:
            result = await run_nmap("192.168.1.1")

        mock_exec.assert_called_once()
        assert len(result.hosts) == 1
        assert result.hosts[0].ip == "192.168.1.1"
        assert result.hosts[0].os_match == "Linux 5.15"
        assert len(result.hosts[0].ports) == 3

    @pytest.mark.asyncio
    async def test_run_nmap_nonzero_no_fallback(self):
        """Exit code non-zero with generic stderr → no retry, raw XML is empty string."""
        fake_stdout = b""
        fake_stderr = b"some generic nmap error"

        mock_proc = MagicMock()
        mock_proc.returncode = 1
        mock_proc.communicate = AsyncMock(return_value=(fake_stdout, fake_stderr))

        with patch("utils.nmap_runner.asyncio.create_subprocess_exec", return_value=mock_proc) as mock_exec:
            result = await run_nmap("10.0.0.5")

        # Only called once — no fallback triggered
        mock_exec.assert_called_once()
        assert result.hosts == []

    @pytest.mark.asyncio
    async def test_run_nmap_fallback_on_failed_to_open(self, sample_nmap_xml_no_os):
        """First call fails with 'Failed to open' → retry without -O succeeds."""
        fake_stdout_fail = b""
        fake_stderr_fail = b"Failed to open normal/nmap.rawpacket"

        mock_proc_fail = MagicMock()
        mock_proc_fail.returncode = 1
        mock_proc_fail.communicate = AsyncMock(return_value=(fake_stdout_fail, fake_stderr_fail))

        fake_stdout_ok = sample_nmap_xml_no_os.encode("utf-8")
        fake_stderr_ok = b""

        mock_proc_ok = MagicMock()
        mock_proc_ok.returncode = 0
        mock_proc_ok.communicate = AsyncMock(return_value=(fake_stdout_ok, fake_stderr_ok))

        with patch("utils.nmap_runner.asyncio.create_subprocess_exec") as mock_exec:
            mock_exec.side_effect = [mock_proc_fail, mock_proc_ok]
            result = await run_nmap("10.0.0.5")

        assert mock_exec.call_count == 2

        # Second call must NOT contain -O or --osscan-guess
        fallback_cmd_args = mock_exec.call_args_list[1][0]
        assert "-O" not in fallback_cmd_args
        assert "--osscan-guess" not in fallback_cmd_args

        # Result from the second (successful) call
        assert len(result.hosts) == 1
        assert result.hosts[0].ip == "10.0.0.1"
        assert result.hosts[0].os_match == ""  # no OS in fallback XML


# ---------------------------------------------------------------------------
# Tests for findings_from_nmap — edge cases beyond the existing coverage
# ---------------------------------------------------------------------------


class TestFindingsFromNmapEdgeCases:
    """Cover findings_from_nmap edge cases: os_match with no ports, and mixed up/down hosts."""

    def test_os_match_no_ports_produces_os_finding_only(self):
        """Host is up, has os_match but zero open ports → only OS finding."""
        host = HostInfo(
            ip="10.0.0.99",
            status="up",
            os_match="Windows Server 2019",
            ports=[],
        )
        result = NmapResult(hosts=[host])
        findings = findings_from_nmap(result)

        assert len(findings) == 1
        assert findings[0]["category"] == "os_detection"
        assert findings[0]["severity"] == "info"
        assert "Windows Server 2019" in findings[0]["title"]

    def test_mixed_up_and_down_hosts(self):
        """One up host with ports + OS, one down host → only up host yields findings."""
        xml_mixed = """<?xml version="1.0"?>
<nmaprun scanner="nmap" version="7.95">
  <host>
    <status state="up"/>
    <address addr="10.0.0.1" addrtype="ipv4"/>
    <hostnames/>
    <ports>
      <port protocol="tcp" portid="443">
        <state state="open"/>
        <service name="https" product="Apache" version="2.4"/>
      </port>
    </ports>
    <os>
      <osmatch name="Ubuntu 22.04" accuracy="98"/>
    </os>
  </host>
  <host>
    <status state="down"/>
    <address addr="10.0.0.2" addrtype="ipv4"/>
    <hostnames/>
    <ports>
      <port protocol="tcp" portid="22">
        <state state="open"/>
        <service name="ssh"/>
      </port>
    </ports>
  </host>
</nmaprun>"""
        result = parse_nmap_xml(xml_mixed)
        assert len(result.hosts) == 2

        findings = findings_from_nmap(result)
        # 1 OS finding + 1 port finding from the up host; down host skipped entirely
        assert len(findings) == 2
        assert findings[0]["category"] == "os_detection"
        assert "Ubuntu 22.04" in findings[0]["title"]
        assert findings[1]["category"] == "open_port"
        assert "443" in findings[1]["title"]
