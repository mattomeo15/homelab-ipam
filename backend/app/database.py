"""
IP Freely - Backend Database Module
Handles SQLite connection, schema initialization, and CRUD operations for backend/data/ipam.db.
"""

import os
import sqlite3
import json
from typing import List, Dict, Any, Optional

# Set default database path to backend/data/ipam.db
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.getenv("DATABASE_DIR", os.path.join(BASE_DIR, "data"))
DB_PATH = os.getenv("DATABASE_PATH", os.path.join(DATA_DIR, "ipam.db"))

os.makedirs(DATA_DIR, exist_ok=True)


def get_db_connection():
    """
    Returns a SQLite connection with dict-like row factory and timeout guard.
    """
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.row_factory = sqlite3.Row
    return conn


def _get_initial_subnet_prefix() -> str:
    try:
        from scanner import get_active_subnet
        active_subnet = get_active_subnet()
        if "/" in active_subnet:
            active_subnet = active_subnet.split("/")[0]
        parts = active_subnet.split(".")
        if len(parts) == 4:
            return f"{parts[0]}.{parts[1]}.{parts[2]}"
    except Exception:
        pass
    return "192.168.2"


def init_db():
    """
    Initializes the SQLite database schema and populates initial subnet records if empty.
    Recovers automatically if database file is corrupted or malformed.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ips (
                ip TEXT PRIMARY KEY,
                hostname TEXT,
                scanned_hostname TEXT DEFAULT '',
                hostname_source TEXT DEFAULT 'Fallback',
                status TEXT,
                type_tag TEXT,
                mac_address TEXT,
                notes TEXT,
                services TEXT,
                latency_ms REAL DEFAULT 0.0,
                os_family TEXT DEFAULT 'Unknown',
                device_model TEXT DEFAULT '',
                first_discovered TEXT DEFAULT '',
                last_seen TEXT DEFAULT '',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()

        # Schema migration check for existing DBs
        cursor.execute("PRAGMA table_info(ips)")
        cols = [col["name"] for col in cursor.fetchall()]
        col_defs = {
            "hostname_source": "TEXT DEFAULT 'Fallback'",
            "scanned_hostname": "TEXT DEFAULT ''",
            "latency_ms": "REAL DEFAULT 0.0",
            "os_family": "TEXT DEFAULT 'Unknown'",
            "device_model": "TEXT DEFAULT ''",
            "first_discovered": "TEXT DEFAULT ''",
            "last_seen": "TEXT DEFAULT ''"
        }
        for col_name, col_type in col_defs.items():
            if col_name not in cols:
                try:
                    cursor.execute(f"ALTER TABLE ips ADD COLUMN {col_name} {col_type}")
                    conn.commit()
                except Exception:
                    pass

        cursor.execute("SELECT COUNT(*) FROM ips")
        count = cursor.fetchone()[0]
        if count == 0:
            prefix = _get_initial_subnet_prefix()
            for i in range(1, 255):
                ip = f"{prefix}.{i}"
                cursor.execute(
                    "INSERT INTO ips (ip, hostname, hostname_source, status, type_tag, mac_address, notes, services) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (ip, "", "", "Free", "Unassigned", "", "", json.dumps([]))
                )
            conn.commit()
        else:
            # Clean up legacy mock placeholder hostnames if present
            mock_hosts = (
                'gateway.homelab.local', 'pihole-01.homelab.local', 'pihole-dns.homelab.local',
                'pve-node1.homelab.local', 'docker-host-01', 'pve-host01.homelab.local',
                'truenas-storage.homelab.local', 'synology-ds920plus', 'idrac-pve-server', 'homeassistant-macvlan'
            )
            placeholders = ','.join('?' * len(mock_hosts))
            cursor.execute(
                f"UPDATE ips SET hostname='', hostname_source='', status='Free', type_tag='Unassigned', mac_address='', notes='', services='[]' WHERE hostname IN ({placeholders})",
                mock_hosts
            )
            conn.commit()
        conn.close()
    except sqlite3.DatabaseError as e:
        print(f"Database error encountered: {e}. Resetting database...")
        if os.path.exists(DB_PATH):
            try:
                os.remove(DB_PATH)
            except Exception:
                pass
        # Retry once after removing corrupted DB
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ips (
                ip TEXT PRIMARY KEY,
                hostname TEXT,
                hostname_source TEXT DEFAULT '',
                status TEXT,
                type_tag TEXT,
                mac_address TEXT,
                notes TEXT,
                services TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        prefix = _get_initial_subnet_prefix()
        for i in range(1, 255):
            ip = f"{prefix}.{i}"
            cursor.execute(
                "INSERT INTO ips (ip, hostname, hostname_source, status, type_tag, mac_address, notes, services) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (ip, "", "", "Free", "Unassigned", "", "", json.dumps([]))
            )
        conn.commit()
        conn.close()


def clear_all_data_db():
    """
    Purges all rows in the ips table and re-initializes factory default state.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM ips")
    conn.commit()
    conn.close()
    init_db()


def get_all_ips_db() -> List[Dict[str, Any]]:
    """
    Retrieves all IP records ordered by numeric IP octets.
    """
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM ips").fetchall()
    conn.close()

    records = []
    for row in rows:
        record = dict(row)
        record["services"] = json.loads(record["services"] or "[]")
        record["typeTag"] = record.get("type_tag", "Unassigned")
        record["macAddress"] = record.get("mac_address", "")
        record["hostnameSource"] = record.get("hostname_source", "Fallback") or "Fallback"
        record["hostname_source"] = record.get("hostname_source", "Fallback") or "Fallback"
        record["scannedHostname"] = record.get("scanned_hostname", "") or ""
        record["scanned_hostname"] = record.get("scanned_hostname", "") or ""
        record["latencyMs"] = record.get("latency_ms", 0.0) or 0.0
        record["latency_ms"] = record.get("latency_ms", 0.0) or 0.0
        record["osFamily"] = record.get("os_family", "Unknown") or "Unknown"
        record["os_family"] = record.get("os_family", "Unknown") or "Unknown"
        record["deviceModel"] = record.get("device_model", "") or ""
        record["device_model"] = record.get("device_model", "") or ""
        record["firstDiscovered"] = record.get("first_discovered", "") or ""
        record["first_discovered"] = record.get("first_discovered", "") or ""
        record["lastSeen"] = record.get("last_seen", "") or ""
        record["last_seen"] = record.get("last_seen", "") or ""
        records.append(record)

    def _ip_tuple(rec):
        try:
            return tuple(int(p) for p in rec["ip"].split("."))
        except Exception:
            return (0, 0, 0, 0)

    records.sort(key=_ip_tuple)
    return records


def update_ip_db(
    ip: str,
    hostname: str,
    status: str,
    type_tag: str,
    mac_address: str,
    notes: str,
    services: list,
    hostname_source: str = "",
    scanned_hostname: str = "",
    latency_ms: float = 0.0,
    os_family: str = "Unknown",
    device_model: str = "",
    first_discovered: str = "",
    last_seen: str = ""
) -> None:
    """
    Updates an IP record in the database.
    """
    conn = get_db_connection()
    conn.execute(
        "UPDATE ips SET hostname=?, hostname_source=?, scanned_hostname=?, status=?, type_tag=?, mac_address=?, notes=?, services=?, latency_ms=?, os_family=?, device_model=?, first_discovered=?, last_seen=? WHERE ip=?",
        (
            hostname,
            hostname_source or "Fallback",
            scanned_hostname or "",
            status,
            type_tag,
            mac_address,
            notes or "",
            json.dumps(services),
            latency_ms or 0.0,
            os_family or "Unknown",
            device_model or "",
            first_discovered or "",
            last_seen or "",
            ip
        )
    )
    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    print("Database initialized at:", DB_PATH)
