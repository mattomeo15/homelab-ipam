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
    Returns a SQLite connection with dict-like row factory.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """
    Initializes the SQLite database schema and populates initial subnet records if empty.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ips (
            ip TEXT PRIMARY KEY,
            hostname TEXT,
            status TEXT,
            type_tag TEXT,
            mac_address TEXT,
            notes TEXT,
            services TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()

    cursor.execute("SELECT COUNT(*) FROM ips")
    count = cursor.fetchone()[0]
    if count == 0:
        for i in range(1, 255):
            ip = f"192.168.2.{i}"
            cursor.execute(
                "INSERT INTO ips (ip, hostname, status, type_tag, mac_address, notes, services) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (ip, "", "Free", "Unassigned", "", "", json.dumps([]))
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
            f"UPDATE ips SET hostname='', status='Free', type_tag='Unassigned', mac_address='', notes='', services='[]' WHERE hostname IN ({placeholders})",
            mock_hosts
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
    Retrieves all IP records ordered by numeric IP suffix.
    """
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM ips ORDER BY CAST(substr(ip, 13) AS INTEGER)").fetchall()
    conn.close()

    records = []
    for row in rows:
        record = dict(row)
        record["services"] = json.loads(record["services"] or "[]")
        record["typeTag"] = record.get("type_tag", "Unassigned")
        record["macAddress"] = record.get("mac_address", "")
        records.append(record)
    return records


def update_ip_db(ip: str, hostname: str, status: str, type_tag: str, mac_address: str, notes: str, services: list) -> None:
    """
    Updates an IP record in the database.
    """
    conn = get_db_connection()
    conn.execute(
        "UPDATE ips SET hostname=?, status=?, type_tag=?, mac_address=?, notes=?, services=? WHERE ip=?",
        (hostname, status, type_tag, mac_address, notes or "", json.dumps(services), ip)
    )
    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    print("Database initialized at:", DB_PATH)
