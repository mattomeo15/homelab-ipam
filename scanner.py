import asyncio
import socket
import re
import os
import aiohttp
from typing import List, Dict, Any, Optional

COMMON_PORTS = {
    21: "FTP Service",
    22: "SSH Shell",
    53: "DNS Resolver",
    80: "HTTP Web UI",
    81: "Nginx Proxy Manager",
    135: "RPC Endpoint",
    139: "NetBIOS Session",
    443: "HTTPS Web UI",
    445: "SMB / Windows Share",
    1900: "UPnP / SSDP",
    3000: "Grafana / Web App",
    3001: "Uptime Kuma",
    3389: "RDP Remote Desktop",
    5000: "Docker Registry / Web UI",
    5001: "Synology DSM / QNAP",
    5353: "mDNS / Bonjour",
    5800: "VNC Web UI",
    5900: "VNC Display",
    6789: "NZBGet",
    7000: "AirPlay Service",
    7860: "AI Web UI",
    7878: "Radarr",
    8000: "Web Service",
    8006: "Proxmox VE Web UI",
    8008: "Google Cast / Matrix",
    8009: "Google Cast",
    8080: "Web UI / Traefik / QNAP",
    8081: "Web UI / Sabnzbd",
    8096: "Jellyfin",
    8123: "Home Assistant",
    8443: "Secure Web UI / Unifi",
    8888: "Jupyter / Web UI",
    8989: "Sonarr",
    9000: "Portainer CE",
    9090: "Cockpit / Prometheus",
    9091: "Transmission Torrent",
    9696: "Prowlarr",
    22300: "Homelab App",
    32400: "Plex Media Server",
    62078: "Apple Mobile Device Sync"
}

WEB_PORTS = [80, 81, 443, 3000, 3001, 5000, 5001, 5800, 7860, 7878, 8000, 8006, 8008, 8080, 8081, 8096, 8123, 8443, 8888, 8989, 9000, 9090, 9091, 9696, 22300, 32400]

async def ping_ip(ip: str) -> bool:
    try:
        cmd = ["ping", "-c", "1", "-W", "1", ip] if os.name != "nt" else ["ping", "-n", "1", "-w", "400", ip]
        proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
        await proc.communicate()
        return proc.returncode == 0
    except Exception:
        return False

def get_arp_mac(ip: str) -> str:
    try:
        if os.path.exists("/proc/net/arp"):
            with open("/proc/net/arp", "r") as f:
                for line in f.readlines()[1:]:
                    parts = line.split()
                    if len(parts) >= 4 and parts[0] == ip:
                        mac = parts[3]
                        if mac and mac != "00:00:00:00:00:00":
                            return mac.upper()
    except Exception:
        pass
    return ""

def derive_hostname_from_title(title: str, ip: str, open_ports: List[int]) -> Optional[str]:
    # Priority check based on ports first
    if 8123 in open_ports:
        return "homeassistant"
    if 8006 in open_ports:
        return "proxmox-pve"
    if 5001 in open_ports:
        return "synology-nas"

    if not title:
        return None
    
    t_lower = title.lower()
    if "home assistant" in t_lower or "homeassistant" in t_lower:
        return "homeassistant"
    if "qnap" in t_lower or "qts" in t_lower:
        return "qnap-nas"
    if "bauhn" in t_lower or "android tv" in t_lower or "google tv" in t_lower or "smarttv" in t_lower:
        return "bauhn-android-tv"
    if "proxmox" in t_lower or "pve" in t_lower:
        match = re.search(r'([\w-]+)\s*-\s*proxmox', title, re.I)
        if match and match.group(1).strip():
            return match.group(1).strip().lower()
        return "proxmox-pve"
    if "opnsense" in t_lower:
        match = re.search(r'([\w.-]+)\s*-\s*opnsense', title, re.I)
        if match and match.group(1).strip():
            return match.group(1).strip().lower()
        return "opnsense-gateway"
    if "pfsense" in t_lower:
        return "pfsense-gateway"
    if "pi-hole" in t_lower or "pihole" in t_lower:
        return "pihole-dns"
    if "portainer" in t_lower:
        return "docker-portainer"
    if "truenas" in t_lower or "freenas" in t_lower:
        return "truenas-storage"
    if "synology" in t_lower or "dsm" in t_lower:
        return "synology-nas"
    if "unifi" in t_lower:
        return "unifi-controller"
    if "jellyfin" in t_lower:
        return "jellyfin-media"
    if "plex" in t_lower:
        return "plex-server"
    if "uptime kuma" in t_lower:
        return "uptime-kuma"
    if "grafana" in t_lower:
        return "grafana-app"
    if "nginx proxy manager" in t_lower:
        return "npm-proxy-host"
        
    clean = re.sub(r'[^a-zA-Z0-9\s-]', '', title).strip().lower()
    clean = re.sub(r'\s+', '-', clean)
    if 2 <= len(clean) <= 25 and not any(w in clean for w in ["welcome", "login", "index", "home", "404", "dashboard"]):
        return clean
        
    return None

def classify_device_type(ip: str, open_services: List[Dict[str, Any]]) -> str:
    ports = [s["port"] for s in open_services]
    titles_concat = " ".join([s.get("name", "") for s in open_services]).lower()
    
    # 1. Gateway / Router
    if ip.endswith(".1") or ip.endswith(".254") or any(k in titles_concat for k in ["opnsense", "pfsense", "router", "gateway", "unifi security", "udm", "openwrt"]):
        return "Gateway / Router"
        
    # 2. Infrastructure
    if 8006 in ports or 9090 in ports or any(k in titles_concat for k in ["proxmox", "pve", "idrac", "ilo", "esxi", "vsphere", "unifi switch", "cockpit"]):
        return "Infrastructure"
        
    # 3. Shared/Host Container
    if 9000 in ports or 81 in ports or 8080 in ports or len(open_services) >= 3:
        return "Shared/Host Container"
        
    # 4. Macvlan Container
    macvlan_ports = {8123, 7878, 8989, 9696, 8096, 32400, 3001, 8081, 9091, 5800}
    if any(p in macvlan_ports for p in ports) or "pi-hole" in titles_concat or "home assistant" in titles_concat:
        if len(open_services) > 0 and not (22 in ports and 445 in ports):
            return "Macvlan Container"

    # 5. Physical Hardware fallback
    return "Physical Hardware"

async def fetch_web_title(session: aiohttp.ClientSession, ip: str, port: int) -> Optional[str]:
    protocol = "https" if port in [443, 8443, 8006, 5001] else "http"
    url = f"{protocol}://{ip}:{port}"
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=1.8), ssl=False) as response:
            if response.status < 500:
                html = await response.text(errors='ignore')
                match = re.search(r'<title[^>]*>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
                if match:
                    title = match.group(1).strip()
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

async def scan_single_ip(ip: str, session: aiohttp.ClientSession, sem: asyncio.Semaphore, progress_dict: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    async with sem:
        if progress_dict is not None:
            progress_dict["currentIp"] = ip

        ping_ok_task = asyncio.create_task(ping_ip(ip))
        hostname_task = asyncio.to_thread(get_hostname, ip)
        arp_mac_task = asyncio.to_thread(get_arp_mac, ip)

        open_services = []
        port_tasks = [check_port(ip, port) for port in COMMON_PORTS.keys()]
        results = await asyncio.gather(*port_tasks)
        
        active_ports = []
        for port, is_open in zip(COMMON_PORTS.keys(), results):
            if is_open:
                active_ports.append(port)
                
        # For active web ports, attempt title scraping
        first_title = None
        # Prioritize 8123 (Home Assistant), 8006 (Proxmox), 5001 (Synology), 8080/443 over others for title
        priority_web_ports = [p for p in [8123, 8006, 5001, 8080, 443, 80, 3001, 3000] if p in active_ports]
        other_web_ports = [p for p in active_ports if p in WEB_PORTS and p not in priority_web_ports]
        ordered_ports = priority_web_ports + other_web_ports

        for port in ordered_ports:
            default_name = COMMON_PORTS.get(port, f"Service on {port}")
            detected_title = None
            if port in WEB_PORTS:
                detected_title = await fetch_web_title(session, ip, port)
                if detected_title and not first_title:
                    first_title = detected_title
                
            service_name = detected_title if detected_title else default_name
            protocol = "https" if port in [443, 8443, 8006, 5001] else "http"
            
            open_services.append({
                "port": port,
                "name": service_name,
                "protocol": protocol,
                "url": f"{protocol}://{ip}:{port}",
                "auto_discovered": True,
                "title_detected": bool(detected_title)
            })
            if progress_dict is not None:
                progress_dict["discoveredServices"] += 1
                progress_dict["log"].append(f"[Discovered] {ip}:{port} -> \"{service_name}\"")

        is_pingable = await ping_ok_task
        hostname = await hostname_task
        mac_addr = await arp_mac_task

        # Determine if host is active
        is_active = len(open_services) > 0 or bool(hostname) or is_pingable or bool(mac_addr)
        
        derived_host = derive_hostname_from_title(first_title, ip, active_ports)
        final_host = hostname or derived_host or (f"host-{ip.split('.')[-1]}" if is_active else "")
        
        type_tag = classify_device_type(ip, open_services) if is_active else "Unassigned"
            
        if progress_dict is not None:
            progress_dict["scannedCount"] += 1

        return {
            "ip": ip,
            "status": "Active" if is_active else "Free",
            "hostname": final_host,
            "type_tag": type_tag,
            "mac_address": mac_addr,
            "services": open_services,
            "last_seen": "Just now" if is_active else None
        }

async def scan_subnet(subnet_prefix: str = "192.168.2", start: int = 1, end: int = 254, progress_dict: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    sem = asyncio.Semaphore(30)
    async with aiohttp.ClientSession() as session:
        tasks = [
            scan_single_ip(f"{subnet_prefix}.{i}", session, sem, progress_dict)
            for i in range(start, end + 1)
        ]
        return await asyncio.gather(*tasks)

