"""Tests for nmap_runner.py: XML parsing and findings extraction."""

from utils.nmap_runner import NmapResult, findings_from_nmap, parse_nmap_xml


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
