import asyncio
import socket
import re
import os
import struct
import aiohttp
from typing import List, Dict, Any, Optional

try:
    from backend.app.display_name_engine import resolve_device_display_name
except ImportError:
    try:
        from .display_name_engine import resolve_device_display_name
    except ImportError:
        from display_name_engine import resolve_device_display_name

def get_active_subnet(db_ips: Optional[List[str]] = None) -> str:
    # 1. Environment Variable Override
    env_subnet = os.environ.get("TARGET_SUBNET")
    if env_subnet and env_subnet.strip():
        return env_subnet.strip()

    # 2. Derive from active IP list if provided
    if db_ips and len(db_ips) > 0:
        prefix_counts = {}
        for ip in db_ips:
            parts = ip.split(".")
            if len(parts) == 4:
                prefix = f"{parts[0]}.{parts[1]}.{parts[2]}.0/24"
                prefix_counts[prefix] = prefix_counts.get(prefix, 0) + 1
        if prefix_counts:
            best_prefix = max(prefix_counts, key=prefix_counts.get)
            if prefix_counts[best_prefix] >= 10:
                return best_prefix

    # 3. Socket UDP probe to local interface address
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        if local_ip and not local_ip.startswith("127."):
            parts = local_ip.split(".")
            if len(parts) == 4:
                return f"{parts[0]}.{parts[1]}.{parts[2]}.0/24"
    except Exception:
        pass

    # 4. Fallback default
    return "192.168.2.0/24"

COMMON_PORTS = {
    21: "FTP Service",
    22: "SSH Shell",
    53: "DNS Resolver",
    80: "HTTP Web UI",
    81: "Nginx Proxy Manager",
    135: "RPC Endpoint",
    137: "NetBIOS Name Service",
    139: "NetBIOS Session",
    443: "HTTPS Web UI",
    445: "SMB / Windows Share",
    1900: "UPnP / SSDP",
    3000: "Grafana / Web App",
    3001: "Uptime Kuma",
    3389: "RDP Remote Desktop",
    5000: "Docker Registry / Web UI",
    5001: "Synology DSM / QNAP",
    5353: "mDNS / Zeroconf",
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
    22300: "IP-Freely App",
    32400: "Plex Media Server",
    62078: "Apple Mobile Device Sync"
}

WEB_PORTS = [80, 81, 443, 3000, 3001, 5000, 5001, 5800, 7860, 7878, 8000, 8006, 8008, 8080, 8081, 8096, 8123, 8443, 8888, 8989, 9000, 9090, 9091, 9696, 22300, 32400]

OUI_VENDOR_MAP = {
    # Raspberry Pi
    "DC:A6:32": "Raspberry Pi", "B8:27:EB": "Raspberry Pi", "E4:5F:01": "Raspberry Pi",
    "D8:3A:DD": "Raspberry Pi", "28:CD:C1": "Raspberry Pi", "2C:CF:67": "Raspberry Pi",

    # Apple
    "AC:BC:32": "Apple Device", "DC:A6:32": "Apple Device", "F4:0F:24": "Apple Device",
    "00:11:24": "Apple Device", "00:17:F2": "Apple Device", "00:1C:B3": "Apple Device",
    "00:1E:52": "Apple Device", "00:23:12": "Apple Device", "00:25:00": "Apple Device",
    "00:26:08": "Apple Device", "04:0C:CE": "Apple Device", "08:00:07": "Apple Device",
    "10:93:E9": "Apple Device", "14:10:9F": "Apple Device", "18:20:32": "Apple Device",
    "1C:1B:B2": "Apple Device", "20:3C:AE": "Apple Device", "24:24:0E": "Apple Device",
    "28:0B:5C": "Apple Device", "2C:1F:23": "Apple Device", "30:07:4D": "Apple Device",
    "34:08:BC": "Apple Device", "38:09:A5": "Apple Device", "3C:07:54": "Apple Device",
    "40:30:04": "Apple Device", "44:00:10": "Apple Device", "48:43:7C": "Apple Device",
    "4C:32:75": "Apple Device", "50:01:D9": "Apple Device", "54:26:96": "Apple Device",
    "58:1F:AA": "Apple Device", "5C:87:9C": "Apple Device", "60:03:08": "Apple Device",
    "64:20:99": "Apple Device", "68:09:27": "Apple Device", "6C:09:D6": "Apple Device",
    "70:11:24": "Apple Device", "74:1B:B2": "Apple Device", "78:31:C1": "Apple Device",
    "7C:01:91": "Apple Device", "80:00:6E": "Apple Device", "84:29:99": "Apple Device",
    "88:1F:A1": "Apple Device", "8C:2D:AA": "Apple Device", "90:27:E4": "Apple Device",
    "94:10:3E": "Apple Device", "98:00:C6": "Apple Device", "9C:04:EB": "Apple Device",

    # Espressif / Smart Home / IoT
    "E8:6B:EA": "Espressif IoT", "18:FE:34": "Espressif IoT", "24:0A:C4": "Espressif IoT",
    "30:AE:A4": "Espressif IoT", "84:0D:8E": "Espressif IoT", "A4:CF:12": "Espressif IoT",
    "CC:50:E3": "Espressif IoT", "D8:A0:1D": "Espressif IoT", "EC:FA:BC": "Espressif IoT",

    # Ubiquiti / UniFi
    "F4:92:BF": "Ubiquiti UniFi", "74:83:C2": "Ubiquiti UniFi", "B4:FB:E4": "Ubiquiti UniFi",
    "18:E8:29": "Ubiquiti UniFi", "70:A7:41": "Ubiquiti UniFi", "DC:9F:DB": "Ubiquiti UniFi",
    "00:15:6D": "Ubiquiti UniFi", "04:18:D6": "Ubiquiti UniFi", "24:A4:3C": "Ubiquiti UniFi",

    # Synology / QNAP
    "00:11:32": "Synology NAS", "00:08:9B": "QNAP NAS", "24:5E:BE": "Synology NAS",

    # Amazon
    "FC:65:DE": "Amazon Echo", "68:54:5A": "Amazon FireTV", "38:F7:CD": "Amazon Device",
    "44:65:0D": "Amazon Echo", "A0:02:DC": "Amazon Echo", "74:75:48": "Amazon Device",

    # Google
    "14:C1:4E": "Google Cast", "00:1A:11": "Google Nest", "A4:77:33": "Google Home",
    "D8:6C:63": "Google Chromecast", "E8:02:60": "Google Pixel", "3C:5A:B4": "Google Device",
    "54:60:09": "Google Device", "F8:8F:CA": "Google Home",

    # VMware / VirtualBox / QEMU / Hyper-V
    "00:0C:29": "VMware Virtual Host", "00:50:56": "VMware Virtual Host",
    "08:00:27": "VirtualBox Host", "52:54:00": "QEMU Virtual Host", "00:15:5D": "Hyper-V Host",

    # ASUS / TP-Link / Netgear
    "70:85:C2": "ASUS Device", "00:14:85": "ASUS Router", "F8:32:E4": "ASUS Router",
    "50:C7:BF": "TP-Link Device", "E8:48:B8": "TP-Link Smart Plug", "C0:25:E9": "TP-Link Device",
    "28:80:88": "Netgear Router", "A0:04:60": "Netgear Router",

    # Philips Hue / Sonos / Roku / Samsung / LG
    "00:17:88": "Philips Hue Bridge", "00:0E:58": "Sonos Speaker", "94:9F:3E": "Sonos Speaker",
    "00:0D:4B": "Roku Player", "B0:EE:45": "Roku Player", "00:00:F0": "Samsung Smart TV",
    "E4:E0:A6": "Samsung Smart TV", "00:1C:62": "LG Smart TV", "A8:23:FE": "LG Smart TV"
}

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

def _make_mdns_ptr_query(ip: str) -> bytes:
    parts = ip.split('.')[::-1]
    rev_ip = ".".join(parts) + ".in-addr.arpa"
    packet = bytearray(b"\x00\x00\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00")
    for label in rev_ip.split('.'):
        lbl = label.encode('ascii')
        packet.append(len(lbl))
        packet.extend(lbl)
    packet.append(0)
    packet.extend(b"\x00\x0c\x00\x01")
    return bytes(packet)

def _parse_mdns_response(data: bytes) -> Optional[str]:
    try:
        if len(data) < 12:
            return None
        ancount = int.from_bytes(data[6:8], 'big')
        if ancount == 0:
            return None
        
        offset = 12
        qdcount = int.from_bytes(data[4:6], 'big')
        for _ in range(qdcount):
            while offset < len(data):
                length = data[offset]
                if length == 0:
                    offset += 1
                    break
                elif (length & 0xC0) == 0xC0:
                    offset += 2
                    break
                else:
                    offset += 1 + length
            offset += 4
            
        for _ in range(ancount):
            if offset >= len(data):
                break
            while offset < len(data):
                length = data[offset]
                if length == 0:
                    offset += 1
                    break
                elif (length & 0xC0) == 0xC0:
                    offset += 2
                    break
                else:
                    offset += 1 + length
            if offset + 10 > len(data):
                break
            rtype = int.from_bytes(data[offset:offset+2], 'big')
            rdlength = int.from_bytes(data[offset+8:offset+10], 'big')
            offset += 10
            
            if rtype == 12:
                curr = offset
                rdata_end = offset + rdlength
                labels = []
                while curr < rdata_end and curr < len(data):
                    length = data[curr]
                    if length == 0:
                        break
                    elif (length & 0xC0) == 0xC0:
                        ptr = int.from_bytes(data[curr:curr+2], 'big') & 0x3FFF
                        curr = ptr
                        continue
                    else:
                        curr += 1
                        labels.append(data[curr:curr+length].decode('utf-8', errors='ignore'))
                        curr += length
                if labels:
                    full_name = ".".join(labels)
                    clean = re.sub(r'\.(local|lan|home|home.arpa|domain)\.?$', '', full_name, flags=re.I)
                    clean = re.sub(r'\._[a-zA-Z0-9-]+\._[tcp|udp].*$', '', clean, flags=re.I)
                    if clean and not clean.startswith('http') and len(clean) >= 2:
                        return clean
            offset += rdlength
    except Exception:
        pass
    return None

async def query_mdns_hostname(ip: str, timeout: float = 0.5) -> Optional[str]:
    loop = asyncio.get_event_loop()
    
    def _udp_mdns():
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(timeout)
        try:
            query = _make_mdns_ptr_query(ip)
            sock.sendto(query, (ip, 5353))
            data, _ = sock.recvfrom(2048)
            return _parse_mdns_response(data)
        except Exception:
            return None
        finally:
            sock.close()

    try:
        res = await loop.run_in_executor(None, _udp_mdns)
        if res:
            return res
    except Exception:
        pass

    try:
        import zeroconf
        zc = zeroconf.Zeroconf()
        info = zc.get_service_info("_services._dns-sd._udp.local.", f"{ip}.local.", timeout=int(timeout * 1000))
        zc.close()
        if info and info.server:
            srv = info.server.rstrip('.').replace('.local', '')
            if srv and len(srv) >= 2:
                return srv
    except Exception:
        pass

    return None

def _build_netbios_query() -> bytes:
    header = b"\x80\x00\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00"
    qname = b"\x20CKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\x00"
    qtype_qclass = b"\x00\x21\x00\x01"
    return header + qname + qtype_qclass

def _parse_netbios_response(data: bytes) -> Optional[str]:
    try:
        if len(data) < 57:
            return None
        num_names = data[56]
        offset = 57
        for _ in range(num_names):
            if offset + 18 > len(data):
                break
            name_bytes = data[offset:offset+15]
            name_type = data[offset+15]
            flags = int.from_bytes(data[offset+16:offset+18], 'big')
            offset += 18
            
            if name_type == 0x00 and not (flags & 0x8000):
                name = name_bytes.decode('latin-1', errors='ignore').strip()
                if name and not name.startswith('IS~') and name != 'WORKGROUP':
                    return name
    except Exception:
        pass
    return None

async def query_netbios_hostname(ip: str, timeout: float = 0.5) -> Optional[str]:
    loop = asyncio.get_event_loop()
    def _send_netbios():
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(timeout)
        try:
            pkt = _build_netbios_query()
            sock.sendto(pkt, (ip, 137))
            data, _ = sock.recvfrom(1024)
            return _parse_netbios_response(data)
        except Exception:
            return None
        finally:
            sock.close()

    try:
        return await loop.run_in_executor(None, _send_netbios)
    except Exception:
        return None

async def query_upnp_ssdp_name(session: aiohttp.ClientSession, ip: str, timeout: float = 0.8) -> Optional[str]:
    upnp_urls = [
        f"http://{ip}:1900/description.xml",
        f"http://{ip}:1900/device-desc.xml",
        f"http://{ip}:8080/description.xml",
        f"http://{ip}:49152/description.xml"
    ]
    for url in upnp_urls:
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=timeout), ssl=False) as resp:
                if resp.status == 200:
                    text = await resp.text(errors='ignore')
                    match = re.search(r'<friendlyName[^>]*>(.*?)</friendlyName>', text, re.I)
                    if match and match.group(1).strip():
                        fname = match.group(1).strip()
                        clean = re.sub(r'[^a-zA-Z0-9\s-]', '', fname).strip()
                        clean = re.sub(r'\s+', '-', clean)
                        if len(clean) >= 2:
                            return clean
        except Exception:
            pass

    loop = asyncio.get_event_loop()
    def _ssdp_udp():
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(timeout)
        try:
            msg = (
                "M-SEARCH * HTTP/1.1\r\n"
                f"HOST: {ip}:1900\r\n"
                'MAN: "ssdp:discover"\r\n'
                "MX: 1\r\n"
                "ST: ssdp:all\r\n\r\n"
            ).encode('utf-8')
            sock.sendto(msg, (ip, 1900))
            data, _ = sock.recvfrom(2048)
            resp_str = data.decode('utf-8', errors='ignore')
            match = re.search(r'SERVER:\s*([^\r\n]+)', resp_str, re.I)
            if match:
                srv = match.group(1).strip()
                if "/" in srv:
                    brand = srv.split("/")[0].strip()
                    if len(brand) >= 2 and brand.lower() not in ["upnp", "http"]:
                        return brand
        except Exception:
            return None
        finally:
            sock.close()

    try:
        return await loop.run_in_executor(None, _ssdp_udp)
    except Exception:
        return None

def lookup_mac_oui(mac: str) -> Optional[str]:
    if not mac:
        return None
    mac_clean = mac.upper().replace("-", ":").replace(".", "")
    if len(mac_clean) >= 8 and ":" in mac_clean:
        prefix = mac_clean[:8]
        if prefix in OUI_VENDOR_MAP:
            return f"{OUI_VENDOR_MAP[prefix]}-{prefix.replace(':', '')[-4:]}"

    try:
        import netaddr
        eui = netaddr.EUI(mac)
        org = eui.oui.registration().org
        if org:
            clean_org = org.split()[0].replace(",", "").strip()
            if len(clean_org) >= 2:
                return f"{clean_org}-Device"
    except Exception:
        pass

    return None

TITLE_BLACKLIST = [
    "login", "sign in", "unauthorized", "400 bad request",
    "401 unauthorized", "dashboard", "home", "web ui"
]

def is_blacklisted_title(title: str) -> bool:
    if not title:
        return True
    t_lower = title.lower().strip()
    if "home assistant" in t_lower or "homeassistant" in t_lower:
        return False
    for item in TITLE_BLACKLIST:
        if item in t_lower:
            return True
    return False

def is_container_id(hostname: str) -> bool:
    if not hostname:
        return False
    return bool(re.match(r'^[a-fA-F0-9]{12}$', hostname.strip()))

def strip_hostname_suffixes(hostname: str) -> str:
    if not hostname:
        return ""
    curr = hostname.strip()
    while True:
        next_val = re.sub(r'(-|_)?(macvlan|docker|container|app)$', '', curr, flags=re.IGNORECASE)
        if next_val == curr:
            break
        curr = next_val
    return curr

def sanitize_hostname(hostname: str, is_guess: bool = False) -> Optional[str]:
    if not hostname:
        return None

    if is_container_id(hostname):
        return None

    clean = strip_hostname_suffixes(hostname)
    if not clean:
        return None

    if is_container_id(clean):
        return None

    if is_guess and not clean.endswith('?'):
        clean = f"{clean}?"

    return clean

def derive_hostname_from_title(title: Optional[str], open_ports: List[int]) -> tuple[Optional[str], bool]:
    valid_title = None
    if title and not is_blacklisted_title(title):
        valid_title = title.strip()

    if valid_title:
        t_lower = valid_title.lower()
        if "home assistant" in t_lower or "homeassistant" in t_lower:
            return ("homeassistant", False)
        if "qnap" in t_lower or "qts" in t_lower:
            return ("qnap-nas", False)
        if "bauhn" in t_lower or "android tv" in t_lower or "google tv" in t_lower or "smarttv" in t_lower:
            return ("android-tv", False)
        if "proxmox" in t_lower or "pve" in t_lower:
            match = re.search(r'([\w-]+)\s*-\s*proxmox', valid_title, re.I)
            if match and match.group(1).strip():
                return (match.group(1).strip().lower(), False)
            return ("proxmox-pve", False)
        if "opnsense" in t_lower:
            match = re.search(r'([\w.-]+)\s*-\s*opnsense', valid_title, re.I)
            if match and match.group(1).strip():
                return (match.group(1).strip().lower(), False)
            return ("opnsense-gateway", False)
        if "pfsense" in t_lower:
            return ("pfsense-gateway", False)
        if "pi-hole" in t_lower or "pihole" in t_lower:
            return ("pihole-dns", False)
        if "portainer" in t_lower:
            return ("docker-portainer", False)
        if "truenas" in t_lower or "freenas" in t_lower:
            return ("truenas-storage", False)
        if "synology" in t_lower or "dsm" in t_lower:
            return ("synology-nas", False)
        if "unifi" in t_lower:
            return ("unifi-controller", False)
        if "jellyfin" in t_lower:
            return ("jellyfin-media", False)
        if "plex" in t_lower:
            return ("plex-server", False)
        if "uptime kuma" in t_lower:
            return ("uptime-kuma", False)
        if "grafana" in t_lower:
            return ("grafana-app", False)
        if "nginx proxy manager" in t_lower:
            return ("npm-proxy-host", False)

        clean = re.sub(r'[^a-zA-Z0-9\s-]', '', valid_title).strip().lower()
        clean = re.sub(r'\s+', '-', clean)
        if 2 <= len(clean) <= 30:
            return (clean, False)

    if 8123 in open_ports:
        return ("Home Assistant", True)
    if 8006 in open_ports:
        return ("Proxmox VE", True)
    if 5001 in open_ports:
        return ("Synology NAS", True)
    if 32400 in open_ports:
        return ("Plex Media Server", True)
    if 8096 in open_ports:
        return ("Jellyfin", True)
    if 7878 in open_ports:
        return ("Radarr", True)
    if 8989 in open_ports:
        return ("Sonarr", True)
    if 9696 in open_ports:
        return ("Prowlarr", True)
    if 3001 in open_ports:
        return ("Uptime Kuma", True)
    if 9000 in open_ports:
        return ("Portainer", True)

    return (None, False)

async def resolve_hostname_waterfall(
    ip: str,
    mac_addr: str,
    open_ports: List[int],
    first_title: Optional[str],
    session: aiohttp.ClientSession
) -> str:
    try:
        mdns_name = await query_mdns_hostname(ip, timeout=0.5)
        if mdns_name:
            clean = sanitize_hostname(mdns_name, is_guess=False)
            if clean and len(clean) >= 2:
                return clean
    except Exception:
        pass

    try:
        nb_name = await query_netbios_hostname(ip, timeout=0.5)
        if nb_name:
            clean = sanitize_hostname(nb_name, is_guess=False)
            if clean and len(clean) >= 2:
                return clean
    except Exception:
        pass

    try:
        upnp_name = await query_upnp_ssdp_name(session, ip, timeout=0.6)
        if upnp_name:
            clean = sanitize_hostname(upnp_name, is_guess=False)
            if clean and len(clean) >= 2:
                return clean
    except Exception:
        pass

    derived_name, is_guess = derive_hostname_from_title(first_title, open_ports)
    if derived_name:
        clean = sanitize_hostname(derived_name, is_guess=is_guess)
        if clean and len(clean) >= 2:
            return clean

    try:
        hostname, _, _ = socket.gethostbyaddr(ip)
        if hostname and not hostname.startswith("192.") and not hostname.startswith("host-"):
            clean_dns = re.sub(r'\.(local|lan|home|home.arpa|domain)\.?$', '', hostname, flags=re.I)
            clean = sanitize_hostname(clean_dns, is_guess=False)
            if clean and len(clean) >= 2:
                return clean
    except Exception:
        pass

    mac_vendor = lookup_mac_oui(mac_addr)
    if mac_vendor:
        clean = sanitize_hostname(mac_vendor, is_guess=True)
        if clean and len(clean) >= 2:
            return clean

    return f"host-{ip.split('.')[-1]}"

def classify_device_type(ip: str, open_services: List[Dict[str, Any]]) -> str:
    ports = [s["port"] for s in open_services]
    titles_concat = " ".join([s.get("name", "") for s in open_services]).lower()
    
    if ip.endswith(".1") or ip.endswith(".254") or any(k in titles_concat for k in ["opnsense", "pfsense", "router", "gateway", "unifi security", "udm", "openwrt"]):
        return "Gateway / Router"
        
    if 8006 in ports or 9090 in ports or any(k in titles_concat for k in ["proxmox", "pve", "idrac", "ilo", "esxi", "vsphere", "unifi switch", "cockpit"]):
        return "Infrastructure"
        
    if 9000 in ports or 81 in ports or 8080 in ports or len(open_services) >= 3:
        return "Shared/Host Container"
        
    macvlan_ports = {8123, 7878, 8989, 9696, 8096, 32400, 3001, 8081, 9091, 5800}
    if any(p in macvlan_ports for p in ports) or "pi-hole" in titles_concat or "home assistant" in titles_concat:
        if len(open_services) > 0 and not (22 in ports and 445 in ports):
            return "Macvlan Container"

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
                    if 0 < len(title) < 80:
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

async def scan_single_ip(ip: str, session: aiohttp.ClientSession, sem: asyncio.Semaphore, progress_dict: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    async with sem:
        if progress_dict is not None:
            progress_dict["currentIp"] = ip

        ping_ok_task = asyncio.create_task(ping_ip(ip))
        arp_mac_task = asyncio.to_thread(get_arp_mac, ip)

        open_services = []
        port_tasks = [check_port(ip, port) for port in COMMON_PORTS.keys()]
        results = await asyncio.gather(*port_tasks)
        
        active_ports = []
        for port, is_open in zip(COMMON_PORTS.keys(), results):
            if is_open:
                active_ports.append(port)
                
        first_title = None
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
        mac_addr = await arp_mac_task

        is_active = len(open_services) > 0 or is_pingable or bool(mac_addr)

        if is_active:
            hostname = await resolve_hostname_waterfall(ip, mac_addr, active_ports, first_title, session)
        else:
            hostname = ""

        type_tag = classify_device_type(ip, open_services) if is_active else "Unassigned"
            
        if progress_dict is not None:
            progress_dict["scannedCount"] += 1

        return {
            "ip": ip,
            "status": "Active" if is_active else "Free",
            "hostname": hostname,
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
