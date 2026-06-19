import asyncio
import xml.etree.ElementTree as ET
import re
from dataclasses import dataclass, field
from loguru import logger


@dataclass
class PortInfo:
    port: int
    protocol: str
    state: str
    service: str
    product: str = ""
    version: str = ""
    extrainfo: str = ""


@dataclass
class HostInfo:
    ip: str
    hostname: str = ""
    status: str = "unknown"
    mac: str = ""
    vendor: str = ""
    os_match: str = ""
    ports: list[PortInfo] = field(default_factory=list)


@dataclass
class NmapResult:
    hosts: list[HostInfo] = field(default_factory=list)
    raw_xml: str = ""


def parse_nmap_xml(xml_output: str) -> NmapResult:
    result = NmapResult(raw_xml=xml_output)
    try:
        root = ET.fromstring(xml_output)
    except ET.ParseError as e:
        logger.error("Failed to parse nmap XML output: {error}", error=e)
        return result

    for host_elem in root.findall("host"):
        host = HostInfo(ip="")

        status_elem = host_elem.find("status")
        if status_elem is not None:
            host.status = status_elem.get("state", "unknown")

        for addr in host_elem.findall("address"):
            addr_type = addr.get("addrtype", "")
            addr_val = addr.get("addr", "")
            if addr_type == "ipv4":
                host.ip = addr_val
            elif addr_type == "mac":
                host.mac = addr_val
                host.vendor = addr.get("vendor", "")

        hostnames = host_elem.find("hostnames")
        if hostnames is not None:
            for hn in hostnames.findall("hostname"):
                if hn.get("type") == "PTR":
                    host.hostname = hn.get("name", "")
                else:
                    host.hostname = host.hostname or hn.get("name", "")

        os_elem = host_elem.find("os")
        if os_elem is not None:
            for osm in os_elem.findall("osmatch"):
                if osm.get("accuracy"):
                    host.os_match = osm.get("name", "")
                    break

        for port_elem in host_elem.findall("ports/port"):
            port_id = int(port_elem.get("portid", "0"))
            protocol = port_elem.get("protocol", "tcp")

            state_elem = port_elem.find("state")
            state = state_elem.get("state", "unknown") if state_elem is not None else "unknown"

            if state != "open":
                continue

            service_elem = port_elem.find("service")
            service_name = service_elem.get("name", "unknown") if service_elem is not None else "unknown"
            product = service_elem.get("product", "") if service_elem is not None else ""
            version = service_elem.get("version", "") if service_elem is not None else ""
            extrainfo = service_elem.get("extrainfo", "") if service_elem is not None else ""

            port_info = PortInfo(
                port=port_id,
                protocol=protocol,
                state=state,
                service=service_name,
                product=product,
                version=version,
                extrainfo=extrainfo,
            )
            host.ports.append(port_info)

        result.hosts.append(host)

    return result


async def run_nmap(target: str, ports: str = "1-1000") -> NmapResult:
    logger.info("Starting nmap scan on {target} ports {ports}", target=target, ports=ports)
    cmd = [
        "nmap",
        "-sV",
        "-sC",
        "-O",
        "--osscan-guess",
        "-p", ports,
        target,
        "-oX", "-",
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    stdout, stderr = await proc.communicate()
    xml_output = stdout.decode("utf-8", errors="replace")

    if proc.returncode != 0:
        stderr_text = stderr.decode("utf-8", errors="replace")
        logger.warning("nmap exited with code {code} for {target}: {stderr}", code=proc.returncode, target=target, stderr=stderr_text[:200])
        if "Failed to open" in stderr_text or "Permission denied" in stderr_text:
            logger.info("Retrying nmap without OS detection for {target}", target=target)
            cmd_fallback = [
                "nmap",
                "-sV",
                "-sC",
                "-p", ports,
                target,
                "-oX", "-",
            ]
            proc = await asyncio.create_subprocess_exec(
                *cmd_fallback,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await proc.communicate()
            xml_output = stdout.decode("utf-8", errors="replace")

    return parse_nmap_xml(xml_output)


def findings_from_nmap(result: NmapResult) -> list[dict]:
    findings = []

    for host in result.hosts:
        if host.status != "up":
            continue

        if host.os_match:
            findings.append({
                "severity": "info",
                "category": "os_detection",
                "title": f"Operating System: {host.os_match}",
                "description": f"Detected OS: {host.os_match} on {host.ip}",
            })

        for port in host.ports:
            findings.append({
                "severity": "info",
                "category": "open_port",
                "title": f"Open port: {port.port}/{port.protocol} ({port.service})",
                "description": f"Service: {port.service} {port.product} {port.version}".strip(),
                "product": port.product,
                "version": port.version,
            })

    return findings
