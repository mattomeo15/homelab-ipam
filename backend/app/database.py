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
                hostname_source TEXT DEFAULT '',
                status TEXT,
                type_tag TEXT,
                mac_address TEXT,
                notes TEXT,
                services TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()

        # Schema migration check for existing DBs
        cursor.execute("PRAGMA table_info(ips)")
        cols = [col["name"] for col in cursor.fetchall()]
        if "hostname_source" not in cols:
            cursor.execute("ALTER TABLE ips ADD COLUMN hostname_source TEXT DEFAULT ''")
            conn.commit()

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
        record["hostnameSource"] = record.get("hostname_source", "")
        record["hostname_source"] = record.get("hostname_source", "")
        records.append(record)

    def _ip_tuple(rec):
        try:
            return tuple(int(p) for p in rec["ip"].split("."))
        except Exception:
            return (0, 0, 0, 0)

    records.sort(key=_ip_tuple)
    return records


def update_ip_db(ip: str, hostname: str, status: str, type_tag: str, mac_address: str, notes: str, services: list, hostname_source: str = "") -> None:
    """
    Updates an IP record in the database.
    """
    conn = get_db_connection()
    conn.execute(
        "UPDATE ips SET hostname=?, hostname_source=?, status=?, type_tag=?, mac_address=?, notes=?, services=? WHERE ip=?",
        (hostname, hostname_source or "", status, type_tag, mac_address, notes or "", json.dumps(services), ip)
    )
    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    print("Database initialized at:", DB_PATH)
