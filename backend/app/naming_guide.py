"""
Hostname Resolution Naming Guide Content Module.
Defines the 7-step waterfall hierarchy rules and custom naming lock explanations as a list structure.
"""

NAMING_GUIDE = [
    {
        "rule": "Rule 1: Multicast DNS",
        "badge": "mDNS",
        "description": "Listens on UDP port 5353 for .local multicast announcements.",
        "how_it_works": "The scanner broadcasts to 224.0.0.251 on UDP 5353. Devices like Apple TVs, Smart TVs, and printers reply with their .local domain name (e.g., 'living-room-tv.local'). The scanner strips '.local' to extract the hostname."
    },
    {
        "rule": "Rule 2: NetBIOS Name Service",
        "badge": "NetBIOS",
        "description": "Queries UDP port 137 for legacy Windows and Samba computer names.",
        "how_it_works": "Sends a status query packet on UDP 137. Windows PCs and Linux Samba servers reply directly with their active 16-character SMB computer name (e.g., 'DESKTOP-MAIN')."
    },
    {
        "rule": "Rule 3: Universal Plug and Play",
        "badge": "UPnP",
        "description": "Discovers SSDP device metadata on UDP port 1900.",
        "how_it_works": "Sends an SSDP M-SEARCH broadcast on UDP 1900. Media players, routers, and smart devices reply with an HTTP link to an XML descriptor file. The scanner parses tags like <friendlyName> or <modelName> (e.g., 'Sonos Era 100')."
    },
    {
        "rule": "Rule 4: Web Interface HTML Title",
        "badge": "HTML Title",
        "description": "Extracts the <title> tag from open web server ports.",
        "how_it_works": "Sends an HTTP GET request to web ports (80, 443, 8006, 8123). It inspects the raw HTML response and cleans up text inside <title>...</title> to find friendly names (e.g., 'Proxmox VE' or 'Home Assistant')."
    },
    {
        "rule": "Rule 5: Reverse DNS PTR Lookup",
        "badge": "Reverse DNS",
        "description": "Queries local DNS PTR records for official domain assignments.",
        "how_it_works": "Asks your local router or DNS server 'Who owns this IP address?'. If your DHCP server recorded a hostname when the device joined the network, DNS returns that domain (e.g., 'nas.home.arpa')."
    },
    {
        "rule": "Rule 6: MAC Address Manufacturer",
        "badge": "MAC OUI",
        "description": "Looks up the hardware vendor prefix from the IEEE OUI database.",
        "how_it_works": "Takes the first 6 characters (OUI prefix) of the device's MAC address and matches them against IEEE's registered vendor database (e.g., 'Apple Device' or 'Raspberry Pi Trading Device')."
    },
    {
        "rule": "Rule 7: Fallback Hostname",
        "badge": "Fallback",
        "description": "Generates a clean default placeholder when no protocols respond.",
        "how_it_works": "If none of the network discovery probes reply, the scanner uses the last octet of the IP address to create a standard label (e.g., 'host-200')."
    },
    {
        "rule": "Custom Naming Lock 🔒",
        "badge": "Custom",
        "description": "User-defined custom hostname override.",
        "how_it_works": "When you manually edit a device's name, it is locked. Background network scans will continue updating IP telemetry but will NEVER overwrite your custom display name."
    }
]
