"""
IP Freely - Smart Display Name Inheritance Engine
Implements clean title sanitization, generic title filtering, and host display name resolution hierarchy.
"""

import re
from typing import Any, Dict, List, Optional, Union


# -----------------------------------------------------------------------------
# 1. CONSTANTS & GENERIC TITLE BLACKLIST
# -----------------------------------------------------------------------------

GENERIC_TITLES = {
    "login",
    "sign in",
    "signin",
    "index",
    "home",
    "dashboard",
    "default",
    "untitled",
    "blank",
    "welcome",
    "webui",
    "web ui",
    "admin",
    "administration",
    "page",
    "http web",
    "https web",
    "404",
    "404 not found",
    "not found",
    "403 forbidden",
    "forbidden",
    "500 internal server error",
    "502 bad gateway",
    "503 service unavailable",
    "301 moved permanently",
    "302 found", "unauthorized",
    "apache2 ubuntu default page",
    "welcome to nginx",
    "welcome to nginx!",
    "iis windows server",
    "router",
    "unassigned",
    "unidentified host",
}

# Standard management / dashboard ports prioritized for title promotion on multi-service hosts
PRIMARY_MANAGEMENT_PORTS = [
    80, 443, 9000, 8080, 8006, 8123, 8096, 3000, 3001, 7000, 5000, 5001, 8000, 8443, 8081, 8888, 9090, 61208
]


# -----------------------------------------------------------------------------
# 2. TITLE CLEANING UTILITY
# -----------------------------------------------------------------------------

def clean_service_title(raw_title: Optional[str]) -> Optional[str]:
    """
    Cleans raw HTTP page titles by removing common browser clutter (e.g. ' - Login', ' | Home'),
    stripping trailing noise ('?', '.'), and filtering out generic or useless titles.
    Returns a clean string suitable for UI display or None if invalid/generic.
    """
    if not raw_title or not isinstance(raw_title, str):
        return None

    title = raw_title.strip()
    if not title:
        return None

    # Remove trailing punctuation noise (e.g. trailing question marks or trailing dots)
    title = re.sub(r"[\?\.\s]+$", "", title).strip()

    # Strip common browser title suffixes / clutter
    title_clutter_patterns = [
        r"\s*[\-\|::·•—]\s*(Login|Sign\s*In|Dashboard|Home|Index|Web\s*UI|WebUI|Admin|Administration|Page)\s*$",
        r"^(Login|Sign\s*In|Dashboard|Home|Index|Welcome\s*to)\s*[\-\|::·•—]\s*",
        r"^Welcome\s+to\s+",
    ]

    for pattern in title_clutter_patterns:
        title = re.sub(pattern, "", title, flags=re.IGNORECASE).strip()

    # Remove double spaces
    title = re.sub(r"\s+", " ", title)

    # Check against generic blacklist
    normalized = title.lower()
    if normalized in GENERIC_TITLES:
        return None

    # Filter out numeric or short status codes like "404", "200 OK"
    if re.match(r"^\d{3}(\s+[A-Za-z]+)?$", title):
        return None

    if len(title) < 2:
        return None

    return title


def clean_hostname(raw_hostname: Optional[str]) -> Optional[str]:
    """
    Sanitizes raw mDNS, NetBIOS, or PTR hostnames.
    Removes trailing dots ('.'), question marks ('?'), and '.local' domain suffixes.
    Example: "Plex Media Server?" -> "Plex Media Server"
             "adguard.local." -> "adguard"
    """
    if not raw_hostname or not isinstance(raw_hostname, str):
        return None

    hostname = raw_hostname.strip()
    if not hostname:
        return None

    # Remove trailing dots and question marks
    hostname = re.sub(r"[\?\.\s]+$", "", hostname).strip()

    # Remove .local suffix if present
    if hostname.lower().endswith(".local"):
        hostname = hostname[:-6].strip()

    normalized = hostname.lower()
    if normalized in {"localhost", "unassigned", "unknown", "free", "none"}:
        return None

    return hostname if len(hostname) >= 2 else None


# -----------------------------------------------------------------------------
# 3. DISPLAY NAME INHERITANCE ENGINE
# -----------------------------------------------------------------------------

def resolve_device_display_name(
    custom_alias: Optional[str] = None,
    services: Optional[List[Any]] = None,
    mdns_hostname: Optional[str] = None,
    ptr_hostname: Optional[str] = None,
    primary_hostname: Optional[str] = None,
    netbios_hostname: Optional[str] = None,
    ip_address: str = "0.0.0.0",
) -> str:
    """
    Calculates the final display_name for a device based on strict priority hierarchy:
    - Priority 1: User-defined custom_alias (if manually set).
    - Priority 2: Best valid Scraped HTTP Page Title from discovered services (filtered).
    - Priority 3: Discovered Service Name (e.g. "InvoiceShelf", "Portainer CE", "Jellyfin", "Frigate").
    - Priority 4: Cleaned mDNS / Zeroconf Hostname (sanitized).
    - Priority 5: Cleaned Reverse DNS (PTR) / Primary Hostname.
    - Priority 6: Fallback string "Unidentified Host ({ip})".
    """
    # Priority 1: User-defined custom_alias
    if custom_alias and custom_alias.strip():
        return custom_alias.strip()

    svc_list = services or []

    # Helper function to extract port, title, and service_name from dictionary or object
    def get_svc_info(svc: Any) -> tuple[int, Optional[str], Optional[str]]:
        if isinstance(svc, dict):
            port = int(svc.get("port", 0))
            title = svc.get("title") or svc.get("http_title")
            name = svc.get("service_name") or svc.get("name")
            return port, title, name
        else:
            port = getattr(svc, "port", 0)
            title = getattr(svc, "title", None) or getattr(svc, "http_title", None)
            name = getattr(svc, "service_name", None) or getattr(svc, "name", None)
            return port, title, name

    # Sort services so primary management/dashboard ports (80, 443, 9000, 8080, 8006, etc.) come first
    def port_priority(svc: Any) -> int:
        port, _, _ = get_svc_info(svc)
        if port in PRIMARY_MANAGEMENT_PORTS:
            return PRIMARY_MANAGEMENT_PORTS.index(port)
        return 1000 + port

    sorted_services = sorted(svc_list, key=port_priority)

    # Priority 2: Best valid Scraped HTTP Page Title from discovered services
    for svc in sorted_services:
        _, title, _ = get_svc_info(svc)
        cleaned_title = clean_service_title(title)
        if cleaned_title:
            return cleaned_title

    # Priority 3: Discovered Service Name (e.g. "InvoiceShelf", "Portainer CE", "Jellyfin")
    for svc in sorted_services:
        _, _, s_name = get_svc_info(svc)
        if s_name and isinstance(s_name, str):
            clean_sname = s_name.strip()
            # Ignore generic service names like "HTTP Web", "Unknown", "PortScan"
            if clean_sname and clean_sname.lower() not in {"unknown", "http web", "https web", "portscan", "custom service"}:
                return clean_sname

    # Priority 4: Cleaned mDNS / Zeroconf / NetBIOS Hostname
    cleaned_mdns = clean_hostname(mdns_hostname)
    if cleaned_mdns:
        return cleaned_mdns

    cleaned_netbios = clean_hostname(netbios_hostname)
    if cleaned_netbios:
        return cleaned_netbios

    # Priority 5: Cleaned Reverse DNS (PTR) or primary_hostname
    cleaned_ptr = clean_hostname(ptr_hostname)
    if cleaned_ptr:
        return cleaned_ptr

    cleaned_primary = clean_hostname(primary_hostname)
    if cleaned_primary:
        return cleaned_primary

    # Priority 6: Fallback string "Unidentified Host ({ip})"
    return f"Unidentified Host ({ip_address})"


if __name__ == "__main__":
    print("Display Name Engine ready.")
