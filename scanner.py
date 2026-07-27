import asyncio
import socket
import re
import aiohttp
from typing import List, Dict, Any, Optional

COMMON_PORTS = {
    22: "SSH",
    53: "DNS",
    80: "HTTP Web UI",
    81: "Nginx Proxy Manager",
    443: "HTTPS Web UI",
    3000: "Grafana / Web App",
    3001: "Uptime Kuma",
    5000: "Web Service / Registry",
    5800: "VNC Web UI",
    6789: "NZBGet",
    7860: "AI Web UI",
    7878: "Radarr",
    8000: "Web Service",
    8008: "Matrix / Web UI",
    8080: "Web UI / Traefik",
    8081: "Web UI / Sabnzbd",
    8096: "Jellyfin",
    8123: "Home Assistant",
    8443: "Secure Web UI / Unifi",
    8888: "Jupyter / Web UI",
    8989: "Sonarr",
    9000: "Portainer CE",
    9090: "Cockpit / Prometheus",
    9696: "Prowlarr",
    22300: "Homelab App",
    32400: "Plex Media Server"
}

WEB_PORTS = [80, 81, 443, 3000, 3001, 5000, 5800, 7860, 7878, 8000, 8008, 8080, 8081, 8096, 8123, 8443, 8888, 8989, 9000, 9090, 9696, 22300, 32400]

async def fetch_web_title(session: aiohttp.ClientSession, ip: str, port: int) -> Optional[str]:
    protocol = "https" if port in [443, 8443] else "http"
    url = f"{protocol}://{ip}:{port}"
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=1.8), ssl=False) as response:
            if response.status < 500:
                html = await response.text(errors='ignore')
                match = re.search(r'<title[^>]*>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
                if match:
                    title = match.group(1).strip()
                    # Clean up HTML title string
                    title = re.sub(r'\s+', ' ', title)
                    if len(title) > 0 and len(title) < 80:
                        return title
    except Exception:
        pass
    return None

async def check_port(ip: str, port: int, timeout: float = 0.8) -> bool:
    try:
        conn = asyncio.open_connection(ip, port)
        _, writer = await asyncio.wait_for(conn, timeout=timeout)
        writer.close()
        await writer.wait_closed()
        return True
    except Exception:
        return False

def get_hostname(ip: str) -> str:
    try:
        hostname, _, _ = socket.gethostbyaddr(ip)
        return hostname
    except Exception:
        return ""

async def scan_single_ip(ip: str, session: aiohttp.ClientSession, sem: asyncio.Semaphore) -> Dict[str, Any]:
    async with sem:
        hostname = await asyncio.to_thread(get_hostname, ip)
        open_services = []
        
        # Probe ports concurrently for this IP
        port_tasks = [check_port(ip, port) for port in COMMON_PORTS.keys()]
        results = await asyncio.gather(*port_tasks)
        
        active_ports = []
        for port, is_open in zip(COMMON_PORTS.keys(), results):
            if is_open:
                active_ports.append(port)
                
        # For active web ports, attempt title scraping
        for port in active_ports:
            default_name = COMMON_PORTS.get(port, f"Service on {port}")
            detected_title = None
            if port in WEB_PORTS:
                detected_title = await fetch_web_title(session, ip, port)
                
            service_name = detected_title if detected_title else default_name
            protocol = "https" if port in [443, 8443] else "http"
            
            open_services.append({
                "port": port,
                "name": service_name,
                "protocol": protocol,
                "url": f"{protocol}://{ip}:{port}",
                "auto_discovered": True,
                "title_detected": bool(detected_title)
            })

        # Determine status and device type tag
        is_active = len(open_services) > 0 or bool(hostname)
        
        type_tag = "Physical Hardware"
        if len(open_services) > 1:
            type_tag = "Shared/Host Container"
        elif any(s["port"] in [9000, 8080, 8123] for s in open_services):
            type_tag = "Macvlan Container"
        elif ip.endswith(".1"):
            type_tag = "Gateway / Router"
            
        return {
            "ip": ip,
            "status": "Active" if is_active else "Free",
            "hostname": hostname or (f"host-{ip.split('.')[-1]}" if is_active else ""),
            "type_tag": type_tag if is_active else "Unassigned",
            "services": open_services,
            "last_seen": "Just now" if is_active else None
        }

async def scan_subnet(subnet_prefix: str = "192.168.2", start: int = 1, end: int = 254) -> List[Dict[str, Any]]:
    sem = asyncio.Semaphore(30)
    async with aiohttp.ClientSession() as session:
        tasks = [
            scan_single_ip(f"{subnet_prefix}.{i}", session, sem)
            for i in range(start, end + 1)
        ]
        return await asyncio.gather(*tasks)
