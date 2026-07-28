"""
IP Freely - Advanced Network Scanning Engine
Includes Top 100 Homelab Ports Subnet Discovery and Single-Host Deep Port Scanning.
"""

import asyncio
import ipaddress
import re
import socket
import struct
from dataclasses import dataclass, field
from typing import Dict, List, Optional
import httpx


# -----------------------------------------------------------------------------
# 1. TOP 100 CURATED HOMELAB & INFRASTRUCTURE PORTS
# -----------------------------------------------------------------------------

TOP_100_HOMELAB_PORTS: Dict[int, str] = {
    # Standard Web & Reverse Proxies
    80: "HTTP Web",
    81: "Nginx Proxy Manager",
    443: "HTTPS Web",
    8000: "Portainer / Web App",
    8080: "Alternative HTTP",
    8081: "Nexus / Alternative HTTP",
    8443: "HTTPS Admin / UniFi",
    8888: "Jupyter / Web Interface",
    9443: "Portainer HTTPS",

    # Container & Server Management
    2375: "Docker Daemon HTTP",
    2376: "Docker Daemon HTTPS",
    8006: "Proxmox VE Cluster UI",
    9000: "Portainer UI / Fast Management",
    9090: "Cockpit / Prometheus",
    10000: "Webmin / Virtualmin",
    61208: "Glances System Monitor",

    # Media & "Arr" Apps
    5055: "Jellyseerr / Overseerr",
    6881: "qBittorrent / Torrent Client",
    7878: "Radarr",
    8085: "qBittorrent Web UI",
    8096: "Jellyfin Media Server",
    8686: "Lidarr",
    8787: "Readarr",
    8920: "Jellyfin HTTPS",
    8989: "Sonarr",
    9696: "Prowlarr",
    32400: "Plex Media Server",

    # Smart Home, IoT & Automation
    1880: "Node-RED",
    1883: "MQTT Broker",
    8123: "Home Assistant",
    8400: "Consul Agent",
    50000: "Jenkins Agent",

    # Storage, Databases & NAS
    139: "NetBIOS Session Service",
    445: "SMB / CIFS File Sharing",
    1433: "MSSQL Database",
    2049: "NFS Network File System",
    3306: "MySQL / MariaDB",
    5000: "Synology DSM HTTP",
    5001: "Synology DSM HTTPS",
    5432: "PostgreSQL Database",
    6379: "Redis In-Memory Data Store",
    27017: "MongoDB Database",

    # Remote Access, VPN & Core Infra
    21: "FTP Control",
    22: "SSH Remote Shell",
    23: "Telnet",
    53: "DNS Server / Pi-hole / AdGuard",
    67: "DHCP Server",
    68: "DHCP Client",
    123: "NTP Time Sync",
    137: "NetBIOS Name Service",
    138: "NetBIOS Datagram",
    161: "SNMP Agent",
    500: "IPsec IKE VPN",
    1194: "OpenVPN",
    51820: "WireGuard VPN",

    # Additional Popular Self-Hosted Dashboard & Service Ports
    3000: "Grafana / React App",
    3001: "Uptime Kuma",
    3003: "Homepage / Dashboard",
    4000: "Gitea / Web UI",
    5050: "pgAdmin UI",
    5230: "Memos",
    5353: "mDNS Multicast DNS",
    5601: "Kibana UI",
    6001: "WebSockets Gateway",
    6379: "Redis",
    6443: "Kubernetes API",
    7000: "Frigate NVR / Camera UI",
    8082: "Traccar GPS Tracking",
    8083: "Calibre-Web",
    8086: "InfluxDB API",
    8090: "Confluence / Web App",
    8181: "Tautulli (Plex Monitoring)",
    8200: "HashiCorp Vault",
    8237: "Matrix Synapse",
    8384: "Syncthing Web UI",
    8500: "Consul UI",
    8880: "Unifi Controller HTTP",
    8843: "Unifi Controller HTTPS",
    9001: "MinIO Console / Supervisor",
    9091: "Transmission Web UI",
    9093: "Alertmanager",
    9100: "Prometheus Node Exporter",
    9200: "Elasticsearch API",
    9300: "Elasticsearch Cluster",
    9411: "Zipkin Tracing",
    9999: "UrBackup / Custom Dashboard",
    10050: "Zabbix Agent",
    10051: "Zabbix Server",
    11434: "Ollama Local AI Engine",
    25565: "Minecraft Server",
}


# -----------------------------------------------------------------------------
# 2. DATA STRUCTURES & DATACLASSES
# -----------------------------------------------------------------------------

@dataclass
class DiscoveredService:
    port: int
    protocol: str = "TCP"
    service_name: str = "Unknown"
    title: Optional[str] = None
    favicon_url: Optional[str] = None
    url_path: Optional[str] = None


@dataclass
class DiscoveredHost:
    ip: str
    is_online: bool = True
    mac_address: Optional[str] = None
    mac_vendor: Optional[str] = None
    ptr_hostname: Optional[str] = None
    mdns_hostname: Optional[str] = None
    netbios_hostname: Optional[str] = None
    http_title: Optional[str] = None
    services: List[DiscoveredService] = field(default_factory=list)
    display_name: str = ""


@dataclass
class OpenPortInfo:
    port: int
    protocol: str = "TCP"
    service_hint: str = "Unknown"
    is_open: bool = True
    title: Optional[str] = None
    favicon_url: Optional[str] = None
    url_path: Optional[str] = None


@dataclass
class DeepScanResult:
    ip: str
    total_ports_scanned: int
    open_ports_count: int
    open_ports: List[OpenPortInfo] = field(default_factory=list)


# -----------------------------------------------------------------------------
# 3. HELPER PROTOCOL RESOLVERS & HTTP SCRAPER
# -----------------------------------------------------------------------------

async def resolve_ptr(ip: str, timeout: float = 0.8) -> Optional[str]:
    """Reverse DNS PTR lookup."""
    loop = asyncio.get_running_loop()
    try:
        res = await asyncio.wait_for(
            loop.run_in_executor(None, socket.gethostbyaddr, ip),
            timeout=timeout,
        )
        if res[0] and res[0] != ip:
            return res[0]
    except Exception:
        pass
    return None


async def query_netbios(ip: str, timeout: float = 0.8) -> Optional[str]:
    """UDP NetBIOS Name Query (Port 137)."""
    loop = asyncio.get_running_loop()
    query_pkt = (
        b"\x00\x01\x00\x10\x00\x01\x00\x00\x00\x00\x00\x00"
        b"\x20\x43\x4b\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41"
        b"\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x00\x00\x21\x00\x01"
    )
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setblocking(False)
        await loop.sock_sendto(sock, query_pkt, (ip, 137))
        data, _ = await asyncio.wait_for(loop.sock_recv(sock, 1024), timeout=timeout)
        sock.close()
        if len(data) > 56:
            num_names = data[56]
            if num_names > 0 and len(data) >= 72:
                raw_name = data[57:72].decode("ascii", errors="ignore").strip()
                if raw_name:
                    return raw_name
    except Exception:
        pass
    return None


async def query_mdns(ip: str, timeout: float = 0.8) -> Optional[str]:
    """mDNS multicast query for .local names."""
    loop = asyncio.get_running_loop()
    try:
        ip_obj = ipaddress.ip_address(ip)
        arpa_domain = ip_obj.reverse_pointer + "."

        def encode_dns_name(domain: str) -> bytes:
            encoded = b""
            for part in domain.split("."):
                if part:
                    encoded += bytes([len(part)]) + part.encode("utf-8")
            return encoded + b"\x00"

        pkt = b"\x00\x00\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00" + encode_dns_name(arpa_domain) + b"\x00\x0c\x00\x01"

        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.setblocking(False)

        await loop.sock_sendto(sock, pkt, ("224.0.0.251", 5353))
        data, _ = await asyncio.wait_for(loop.sock_recv(sock, 1024), timeout=timeout)
        sock.close()

        match = re.search(r'([a-zA-Z0-9\-_]+)\.local', data.decode('latin-1', errors='ignore'))
        if match:
            return f"{match.group(1)}.local"
    except Exception:
        pass
    return None


async def probe_port_web(ip: str, port: int, service_hint: str, timeout: float = 0.5) -> Optional[OpenPortInfo]:
    """
    Checks if a port is open. If open and web-oriented, fetches HTTP <title> and favicon URL.
    """
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(ip, port),
            timeout=timeout,
        )
        writer.close()
        await writer.wait_closed()
    except (OSError, asyncio.TimeoutError):
        return None

    info = OpenPortInfo(
        port=port,
        protocol="TCP",
        service_hint=service_hint,
        is_open=True,
    )

    # Scrape web titles for ports often presenting Web UIs
    if port in {80, 81, 443, 3000, 3001, 5000, 5001, 7000, 8000, 8006, 8080, 8081, 8085, 8096, 8123, 8443, 8989, 9000, 9090, 9443, 32400}:
        scheme = "https" if port in (443, 5001, 8006, 8443, 8920, 9443) else "http"
        url = f"{scheme}://{ip}:{port}/"
        info.url_path = url

        try:
            async with httpx.AsyncClient(verify=False, timeout=1.0, follow_redirects=True) as client:
                resp = await client.get(url)
                if resp.status_code < 500:
                    html_content = resp.text
                    title_match = re.search(r"<title[^>]*>(.*?)</title>", html_content, re.IGNORECASE | re.DOTALL)
                    if title_match:
                        clean_title = re.sub(r"\s+", " ", title_match.group(1)).strip()
                        if clean_title:
                            info.title = clean_title

                    icon_match = re.search(
                        r'<link[^>]+rel=["\'](?:shortcut )?icon["\'][^>]+href=["\']([^"\']+)["\']',
                        html_content,
                        re.IGNORECASE,
                    )
                    if icon_match:
                        icon_path = icon_match.group(1)
                        if icon_path.startswith("http"):
                            info.favicon_url = icon_path
                        else:
                            info.favicon_url = f"{scheme}://{ip}:{port}/{icon_path.lstrip('/')}"
        except Exception:
            pass

    return info


def resolve_display_name(host: DiscoveredHost) -> str:
    """Assigns priority host display name."""
    if host.mdns_hostname and host.mdns_hostname.strip():
        return host.mdns_hostname.strip()
    if host.http_title and host.http_title.strip():
        return host.http_title.strip()
    if host.netbios_hostname and host.netbios_hostname.strip():
        return host.netbios_hostname.strip()
    if host.ptr_hostname and host.ptr_hostname.strip():
        return host.ptr_hostname.strip()
    return f"Unidentified Host ({host.ip})"


# -----------------------------------------------------------------------------
# 4. FUNCTION A: `scan_subnet`
# -----------------------------------------------------------------------------

async def ping_ip(ip: str) -> bool:
    """Fast host reachability check."""
    for port in (80, 443, 22, 135, 445, 8080):
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(ip, port),
                timeout=0.3,
            )
            writer.close()
            await writer.wait_closed()
            return True
        except Exception:
            continue
    return False


async def scan_subnet(subnet_cidr: str = "192.168.2.0/24") -> List[DiscoveredHost]:
    """
    Function A:
    Performs a parallel ping sweep across the CIDR range.
    For each active host, runs parallel socket checks across the ~100 curated ports.
    Queries mDNS, NetBIOS, and PTR names.
    Performs HTTP GET requests on open web ports to scrape <title> and favicons.
    """
    network = ipaddress.ip_network(subnet_cidr, strict=False)
    live_hosts: List[str] = []

    # 1. Host Discovery Ping Sweep
    semaphore = asyncio.Semaphore(50)

    async def check_host(ip_str: str):
        async with semaphore:
            if await ping_ip(ip_str):
                live_hosts.append(ip_str)

    tasks = [check_host(str(ip)) for ip in network.hosts()]
    await asyncio.gather(*tasks)

    # 2. Detailed Scan per Live Host
    discovered_list: List[DiscoveredHost] = []

    async def scan_host_details(ip: str) -> DiscoveredHost:
        host = DiscoveredHost(ip=ip, is_online=True)

        ptr_task = asyncio.create_task(resolve_ptr(ip))
        netbios_task = asyncio.create_task(query_netbios(ip))
        mdns_task = asyncio.create_task(query_mdns(ip))

        port_tasks = [
            asyncio.create_task(probe_port_web(ip, port, name))
            for port, name in TOP_100_HOMELAB_PORTS.items()
        ]

        host.ptr_hostname = await ptr_task
        host.netbios_hostname = await netbios_task
        host.mdns_hostname = await mdns_task

        port_results = await asyncio.gather(*port_tasks)
        for res in port_results:
            if res is not None:
                svc = DiscoveredService(
                    port=res.port,
                    protocol=res.protocol,
                    service_name=res.service_hint,
                    title=res.title,
                    favicon_url=res.favicon_url,
                    url_path=res.url_path,
                )
                host.services.append(svc)
                if res.title and not host.http_title:
                    host.http_title = res.title

        host.display_name = resolve_display_name(host)
        return host

    scan_details_tasks = [scan_host_details(ip) for ip in sorted(live_hosts, key=lambda x: ipaddress.ip_address(x))]
    discovered_list = await asyncio.gather(*scan_details_tasks)

    return list(discovered_list)


# -----------------------------------------------------------------------------
# 5. FUNCTION B: `deep_scan_host`
# -----------------------------------------------------------------------------

async def deep_scan_host(
    ip_address: str,
    port_start: int = 1,
    port_end: int = 10000,
    concurrency: int = 200,
) -> DeepScanResult:
    """
    Function B:
    Performs an intensive deep port scan against a SINGLE IP address across a specified port range.
    Uses asyncio.Semaphore to control concurrency to prevent OS socket starvation.
    """
    semaphore = asyncio.Semaphore(concurrency)
    open_ports: List[OpenPortInfo] = []

    async def worker(port: int):
        async with semaphore:
            hint = TOP_100_HOMELAB_PORTS.get(port, "Custom Service")
            res = await probe_port_web(ip_address, port, hint, timeout=0.4)
            if res is not None:
                open_ports.append(res)

    total_ports = (port_end - port_start) + 1
    tasks = [worker(port) for port in range(port_start, port_end + 1)]
    await asyncio.gather(*tasks)

    sorted_open_ports = sorted(open_ports, key=lambda x: x.port)

    return DeepScanResult(
        ip=ip_address,
        total_ports_scanned=total_ports,
        open_ports_count=len(sorted_open_ports),
        open_ports=sorted_open_ports,
    )


# -----------------------------------------------------------------------------
# 6. DEMO RUNNER
# -----------------------------------------------------------------------------

async def main():
    target_subnet = "192.168.2.0/24"
    print("=" * 60)
    print(" IP FREELY ADVANCED SCANNER ENGINE")
    print("=" * 60)

    print(f"\n[1] Running Subnet Auto-Scan across ~100 Top Homelab Ports for {target_subnet}...")
    subnet_results = await scan_subnet(target_subnet)
    print(f"[*] Found {len(subnet_results)} active host(s):")

    for host in subnet_results:
        print(f"\n - Host IP      : {host.ip}")
        print(f"   Display Name : {host.display_name}")
        print(f"   Open Services: {len(host.services)} detected")
        for svc in host.services[:5]:
            t_str = f" ('{svc.title}')" if svc.title else ""
            print(f"     * Port {svc.port} - {svc.service_name}{t_str}")

    if subnet_results:
        target_ip = subnet_results[0].ip
        print(f"\n[2] Running Deep Port Scan on single host {target_ip} (Ports 1-1,000)...")
        deep_res = await deep_scan_host(target_ip, port_start=1, port_end=1000, concurrency=200)
        print(f"[*] Scanned {deep_res.total_ports_scanned} ports on {deep_res.ip}.")
        print(f"[*] Open Ports Found: {deep_res.open_ports_count}")
        for p in deep_res.open_ports:
            print(f"   * Port {p.port}/{p.protocol} - {p.service_hint} (Title: {p.title or 'N/A'})")


if __name__ == "__main__":
    asyncio.run(main())
