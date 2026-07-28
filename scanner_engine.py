"""
IP Freely - Asynchronous Network Scanning Engine
Handles Stage 1 Host Discovery, Stage 2 Multi-Protocol Name Resolution,
Stage 3 Port Checking & HTTP Title/Favicon Scraping, and Stage 4 Identity Resolution.
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
# DATACLASSES
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


# Target port mappings for common homelab and web services
TARGET_PORTS: Dict[int, str] = {
    80: "HTTP Web UI",
    81: "Nginx Proxy Manager",
    443: "HTTPS Web UI",
    8000: "Portainer / Web App",
    8080: "Alternative HTTP / Proxy",
    8096: "Jellyfin Media Server",
    8123: "Home Assistant UI",
    9000: "Portainer UI / Fast management",
    9090: "Cockpit / Prometheus",
    61208: "Glances System Monitor",
}


# -----------------------------------------------------------------------------
# STAGE 1: HOST DISCOVERY (PING SWEEP)
# -----------------------------------------------------------------------------

async def ping_host(ip: str, timeout: float = 0.5) -> bool:
    """
    Check if a host is responsive via system ICMP ping or fallback TCP connection check.
    """
    # 1. Try quick system ICMP ping
    try:
        proc = await asyncio.create_subprocess_exec(
            "ping",
            "-c", "1",
            "-W", "1",
            ip,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        ret = await asyncio.wait_for(proc.wait(), timeout=1.0)
        if ret == 0:
            return True
    except Exception:
        pass

    # 2. Fallback: Quick TCP probe on essential ports (80, 443, 22, 135, 445, 8080)
    for port in (80, 443, 22, 135, 445, 8080):
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(ip, port),
                timeout=timeout,
            )
            writer.close()
            await writer.wait_closed()
            return True
        except (OSError, asyncio.TimeoutError):
            continue

    return False


async def discover_live_hosts(subnet_cidr: str, concurrency: int = 50) -> List[str]:
    """
    Scans a target CIDR subnet for responsive hosts using bounded concurrency.
    """
    network = ipaddress.ip_network(subnet_cidr, strict=False)
    semaphore = asyncio.Semaphore(concurrency)
    live_hosts: List[str] = []

    async def worker(ip_str: str):
        async with semaphore:
            if await ping_host(ip_str):
                live_hosts.append(ip_str)

    tasks = [worker(str(ip)) for ip in network.hosts()]
    await asyncio.gather(*tasks)
    return sorted(live_hosts, key=lambda ip: ipaddress.ip_address(ip))


# -----------------------------------------------------------------------------
# STAGE 2: MULTI-PROTOCOL NAME RESOLUTION
# -----------------------------------------------------------------------------

async def resolve_ptr(ip: str, timeout: float = 1.0) -> Optional[str]:
    """
    Reverse DNS PTR lookup using asyncio.
    """
    loop = asyncio.get_running_loop()
    try:
        res = await asyncio.wait_for(
            loop.run_in_executor(None, socket.gethostbyaddr, ip),
            timeout=timeout,
        )
        hostname = res[0]
        if hostname and hostname != ip:
            return hostname
    except Exception:
        pass
    return None


async def query_netbios(ip: str, timeout: float = 1.0) -> Optional[str]:
    """
    Sends a raw NetBIOS Name Query packet (UDP Port 137) to discover Samba/Windows hostnames.
    """
    loop = asyncio.get_running_loop()
    # NetBIOS wildcard NBSTAT query packet payload (38 bytes)
    query_pkt = (
        b"\x00\x01\x00\x10\x00\x01\x00\x00\x00\x00\x00\x00"
        b"\x20\x43\x4b\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41"
        b"\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x00\x00\x21\x00\x01"
    )

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(timeout)
        sock.setblocking(False)

        await loop.sock_sendto(sock, query_pkt, (ip, 137))
        data, _ = await asyncio.wait_for(loop.sock_recv(sock, 1024), timeout=timeout)
        sock.close()

        # Parse NetBIOS response payload
        if len(data) > 56:
            num_names = data[56]
            if num_names > 0 and len(data) >= 57 + 18:
                raw_name = data[57:72].decode("ascii", errors="ignore").strip()
                if raw_name:
                    return raw_name
    except Exception:
        pass
    return None


async def query_mdns(ip: str, timeout: float = 1.2) -> Optional[str]:
    """
    mDNS reverse query to resolve .local hostnames.
    """
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


# -----------------------------------------------------------------------------
# STAGE 3: PORT & HTTP TITLE SCRAPING
# -----------------------------------------------------------------------------

async def check_port_and_scrape_http(
    ip: str,
    port: int,
    service_hint: str,
    timeout: float = 1.5,
) -> Optional[DiscoveredService]:
    """
    Probes an individual port on a target IP.
    If open and web-oriented, fetches the HTTP <title> tag and favicon location.
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

    service = DiscoveredService(
        port=port,
        protocol="TCP",
        service_name=service_hint,
    )

    web_ports = {80, 81, 443, 8000, 8080, 8096, 8123, 9000, 9090, 61208}
    if port in web_ports:
        scheme = "https" if port == 443 else "http"
        url = f"{scheme}://{ip}:{port}/"
        service.url_path = url

        try:
            async with httpx.AsyncClient(verify=False, timeout=timeout, follow_redirects=True) as client:
                resp = await client.get(url)
                if resp.status_code < 500:
                    html_content = resp.text

                    title_match = re.search(r"<title[^>]*>(.*?)</title>", html_content, re.IGNORECASE | re.DOTALL)
                    if title_match:
                        clean_title = re.sub(r"\s+", " ", title_match.group(1)).strip()
                        if clean_title:
                            service.title = clean_title

                    icon_match = re.search(
                        r'<link[^>]+rel=["\'](?:shortcut )?icon["\'][^>]+href=["\']([^"\']+)["\']',
                        html_content,
                        re.IGNORECASE,
                    )
                    if icon_match:
                        icon_path = icon_match.group(1)
                        if icon_path.startswith("http"):
                            service.favicon_url = icon_path
                        else:
                            service.favicon_url = f"{scheme}://{ip}:{port}/{icon_path.lstrip('/')}"
        except Exception:
            pass

    return service


# -----------------------------------------------------------------------------
# STAGE 4: NAMING RESOLUTION ENGINE
# -----------------------------------------------------------------------------

def resolve_host_identity(host: DiscoveredHost) -> str:
    """
    Determines display_name based on strict priority hierarchy:
    1. Discovered mDNS / Bonjour Hostname
    2. Scraped HTTP Page Title
    3. NetBIOS Hostname
    4. Reverse DNS (PTR) Hostname
    5. Fallback: "Unidentified Host ({ip})"
    """
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
# COMPLETE SCAN ORCHESTRATOR
# -----------------------------------------------------------------------------

async def scan_single_host(ip: str) -> DiscoveredHost:
    """
    Performs Stage 2 and Stage 3 scans in parallel for a live IP host.
    """
    host = DiscoveredHost(ip=ip, is_online=True)

    # 1. Parallel Stage 2 Name Resolution
    ptr_task = asyncio.create_task(resolve_ptr(ip))
    netbios_task = asyncio.create_task(query_netbios(ip))
    mdns_task = asyncio.create_task(query_mdns(ip))

    # 2. Parallel Stage 3 Port Checks
    port_tasks = [
        asyncio.create_task(check_port_and_scrape_http(ip, port, name))
        for port, name in TARGET_PORTS.items()
    ]

    host.ptr_hostname = await ptr_task
    host.netbios_hostname = await netbios_task
    host.mdns_hostname = await mdns_task

    service_results = await asyncio.gather(*port_tasks)
    for svc in service_results:
        if svc is not None:
            host.services.append(svc)
            if svc.title and not host.http_title:
                host.http_title = svc.title

    # 3. Resolve final identity
    host.display_name = resolve_host_identity(host)
    return host


async def run_full_subnet_scan(subnet_cidr: str = "192.168.2.0/24", concurrency: int = 50) -> List[DiscoveredHost]:
    """
    Executes all 4 stages across a target CIDR subnet.
    """
    print(f"[*] Stage 1: Starting host discovery ping sweep on {subnet_cidr}...")
    live_ips = await discover_live_hosts(subnet_cidr, concurrency=concurrency)
    print(f"[+] Discovered {len(live_ips)} live host(s): {live_ips}")

    print("[*] Stage 2 & 3: Resolving names and scanning ports across live hosts...")
    scan_tasks = [scan_single_host(ip) for ip in live_ips]
    discovered_hosts: List[DiscoveredHost] = await asyncio.gather(*scan_tasks)

    return discovered_hosts


# -----------------------------------------------------------------------------
# ASYNC MAIN RUNNER EXAMPLE
# -----------------------------------------------------------------------------

async def main():
    target_subnet = "192.168.2.0/24"
    print("=== IP Freely Scanner Engine ===")
    print(f"Target Subnet: {target_subnet}\n")

    results = await run_full_subnet_scan(target_subnet, concurrency=50)

    print("\n" + "=" * 60)
    print(" SCAN RESULTS SUMMARY")
    print("=" * 60)

    for host in results:
        print(f"\nIP Address   : {host.ip}")
        print(f"Display Name : {host.display_name}")
        print(f"mDNS Name    : {host.mdns_hostname or 'N/A'}")
        print(f"HTTP Title   : {host.http_title or 'N/A'}")
        print(f"NetBIOS Name : {host.netbios_hostname or 'N/A'}")
        print(f"PTR Name     : {host.ptr_hostname or 'N/A'}")

        if host.services:
            print(" Open Services:")
            for svc in host.services:
                title_str = f" (Title: '{svc.title}')" if svc.title else ""
                print(f"   - Port {svc.port}/{svc.protocol} [{svc.service_name}]{title_str}")
        else:
            print(" Open Services: None detected on target port list")


if __name__ == "__main__":
    asyncio.run(main())
