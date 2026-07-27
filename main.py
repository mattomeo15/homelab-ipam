import os
import sqlite3
import json
import asyncio
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import List, Optional

from scanner import scan_subnet
from exporter import generate_markdown_export, generate_text_export

DB_PATH = "/data/ipam.db"
os.makedirs("/data", exist_ok=True)

app = FastAPI(title="Homelab IPAM")

# SQLite DB Initialization
def init_db():
    conn = sqlite3.connect(DB_PATH)
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
    
    # Check if DB is empty; if so, populate 192.168.2.1 - 192.168.2.254 defaults
    cursor.execute("SELECT COUNT(*) FROM ips")
    count = cursor.fetchone()[0]
    if count == 0:
        default_services = {
            "192.168.2.1": {
                "hostname": "gateway.homelab.local",
                "status": "Active",
                "type_tag": "Gateway / Router",
                "mac_address": "AA:BB:CC:DD:EE:01",
                "notes": "Main Router / OPNsense Firewall",
                "services": [
                    {"id": "1", "name": "OPNsense WebGUI", "port": 443, "protocol": "https", "url": "https://192.168.2.1:443"},
                    {"id": "2", "name": "DNS Resolver (Unbound)", "port": 53, "protocol": "tcp", "url": ""}
                ]
            },
            "192.168.2.2": {
                "hostname": "pihole-dns.homelab.local",
                "status": "Active",
                "type_tag": "Macvlan Container",
                "mac_address": "02:42:C0:A8:02:02",
                "notes": "Primary DNS & AdBlocker",
                "services": [
                    {"id": "1", "name": "Pi-hole Admin Console", "port": 80, "protocol": "http", "url": "http://192.168.2.2/admin"},
                    {"id": "2", "name": "DNS Server", "port": 53, "protocol": "tcp", "url": ""}
                ]
            },
            "192.168.2.10": {
                "hostname": "pve-node1.homelab.local",
                "status": "Active",
                "type_tag": "Physical Hardware",
                "mac_address": "70:85:C2:10:99:A4",
                "notes": "Proxmox VE Hypervisor Host",
                "services": [
                    {"id": "1", "name": "Proxmox VE Web UI", "port": 8006, "protocol": "https", "url": "https://192.168.2.10:8006"},
                    {"id": "2", "name": "SSH Shell", "port": 22, "protocol": "tcp", "url": ""}
                ]
            },
            "192.168.2.200": {
                "hostname": "docker-host-01",
                "status": "Active",
                "type_tag": "Shared/Host Container",
                "mac_address": "52:54:00:12:34:56",
                "notes": "Primary Docker Host running multiple container apps",
                "services": [
                    {"id": "1", "name": "Portainer CE", "port": 9000, "protocol": "http", "url": "http://192.168.2.200:9000"},
                    {"id": "2", "name": "Nginx Proxy Manager", "port": 81, "protocol": "http", "url": "http://192.168.2.200:81"},
                    {"id": "3", "name": "Home Assistant", "port": 8123, "protocol": "http", "url": "http://192.168.2.200:8123"},
                    {"id": "4", "name": "Jellyfin Media", "port": 8096, "protocol": "http", "url": "http://192.168.2.200:8096"},
                    {"id": "5", "name": "Uptime Kuma", "port": 3001, "protocol": "http", "url": "http://192.168.2.200:3001"}
                ]
            }
        }
        
        for i in range(1, 255):
            ip = f"192.168.2.{i}"
            if ip in default_services:
                data = default_services[ip]
                cursor.execute(
                    "INSERT INTO ips (ip, hostname, status, type_tag, mac_address, notes, services) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (ip, data["hostname"], data["status"], data["type_tag"], data["mac_address"], data["notes"], json.dumps(data["services"]))
                )
            else:
                cursor.execute(
                    "INSERT INTO ips (ip, hostname, status, type_tag, mac_address, notes, services) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (ip, "", "Free", "Unassigned", "", "", json.dumps([]))
                )
        conn.commit()
    conn.close()

init_db()

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

templates = Jinja2Templates(directory="templates")

scan_progress = {
    "scannedCount": 0,
    "total": 254,
    "currentIp": "",
    "isScanning": False,
    "discoveredServices": 0,
    "log": []
}

class ServiceModel(BaseModel):
    id: Optional[str] = None
    name: str
    port: int
    protocol: str = "http"
    url: str = ""

class IPUpdateModel(BaseModel):
    hostname: str
    status: str
    type_tag: Optional[str] = "Physical Hardware"
    typeTag: Optional[str] = None
    mac_address: Optional[str] = ""
    macAddress: Optional[str] = None
    notes: Optional[str] = ""
    services: List[ServiceModel] = []

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

@app.get("/api/ips")
async def get_all_ips():
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM ips ORDER BY CAST(substr(ip, 13) AS INTEGER)").fetchall()
    conn.close()
    
    records = []
    for row in rows:
        record = dict(row)
        record["services"] = json.loads(record["services"] or "[]")
        # Ensure compatibility with both camelCase and snake_case
        record["typeTag"] = record.get("type_tag", "Unassigned")
        record["macAddress"] = record.get("mac_address", "")
        records.append(record)
    return records

@app.get("/api/stats")
async def get_stats():
    conn = get_db_connection()
    rows = conn.execute("SELECT status, services FROM ips").fetchall()
    conn.close()
    
    active = sum(1 for r in rows if r["status"] == "Active")
    reserved = sum(1 for r in rows if r["status"] == "Reserved")
    free = sum(1 for r in rows if r["status"] == "Free")
    total_services = 0
    for r in rows:
        svcs = json.loads(r["services"] or "[]")
        total_services += len(svcs)
        
    return {
        "total": len(rows),
        "active": active,
        "reserved": reserved,
        "free": free,
        "services": total_services
    }

@app.put("/api/ips/{ip}")
async def update_ip(ip: str, data: IPUpdateModel):
    tag = data.typeTag if data.typeTag is not None else (data.type_tag or "Physical Hardware")
    mac = data.macAddress if data.macAddress is not None else (data.mac_address or "")
    conn = get_db_connection()
    conn.execute(
        "UPDATE ips SET hostname=?, status=?, type_tag=?, mac_address=?, notes=?, services=? WHERE ip=?",
        (data.hostname, data.status, tag, mac, data.notes or "", json.dumps([s.dict() for s in data.services]), ip)
    )
    conn.commit()
    conn.close()
    return {"status": "success", "ip": ip}

async def perform_background_scan():
    global scan_progress
    if scan_progress["isScanning"]:
        return

    scan_progress["scannedCount"] = 0
    scan_progress["total"] = 254
    scan_progress["currentIp"] = "192.168.2.1"
    scan_progress["isScanning"] = True
    scan_progress["discoveredServices"] = 0
    scan_progress["log"] = ["[Scanner] Initializing parallel subnet scan for 192.168.2.1 - 192.168.2.254..."]

    try:
        discovered = await scan_subnet("192.168.2", 1, 254, progress_dict=scan_progress)
        conn = get_db_connection()
        updated_count = 0
        for item in discovered:
            if item["status"] == "Active":
                ip = item["ip"]
                row = conn.execute("SELECT * FROM ips WHERE ip=?", (ip,)).fetchone()
                if row:
                    existing_services = json.loads(row["services"] or "[]")
                    existing_ports = {s["port"] for s in existing_services}
                    
                    # Update or merge services
                    for new_svc in item["services"]:
                        if new_svc["port"] not in existing_ports:
                            existing_services.append(new_svc)
                        else:
                            # Update service title if a title was newly detected
                            for s in existing_services:
                                if s["port"] == new_svc["port"] and new_svc.get("title_detected"):
                                    s["name"] = new_svc["name"]
                                    s["url"] = new_svc["url"]
                            
                    row_host = row["hostname"] or ""
                    item_host = item.get("hostname", "")
                    
                    # Update hostname if newly discovered hostname exists and row is empty/generic (host-X)
                    if item_host and not item_host.startswith("host-"):
                        final_hostname = item_host
                    elif not row_host or row_host.startswith("host-"):
                        final_hostname = item_host or row_host
                    else:
                        final_hostname = row_host

                    # Update type_tag if current row type is Unassigned/Physical Hardware or if scanned item tag is specific
                    row_type = row["type_tag"] or "Unassigned"
                    item_type = item.get("type_tag", "Physical Hardware")
                    
                    if row_type in ["Unassigned", "Physical Hardware"] and item_type != "Unassigned":
                        final_type = item_type
                    elif item_type in ["Gateway / Router", "Infrastructure", "Macvlan Container", "Shared/Host Container"]:
                        final_type = item_type
                    else:
                        final_type = row_type
                    
                    conn.execute(
                        "UPDATE ips SET hostname=?, status='Active', type_tag=?, services=? WHERE ip=?",
                        (final_hostname, final_type, json.dumps(existing_services), ip)
                    )
                    updated_count += 1
                else:
                    conn.execute(
                        "INSERT INTO ips (ip, hostname, status, type_tag, mac_address, notes, services) VALUES (?, ?, 'Active', ?, '', '', ?)",
                        (ip, item["hostname"], item["type_tag"], json.dumps(item["services"]))
                    )
                    updated_count += 1
        conn.commit()
        conn.close()
        scan_progress["log"].append(f"[Scanner] Scan finished. {scan_progress['discoveredServices']} new services auto-discovered.")
    except Exception as e:
        scan_progress["log"].append(f"[Scanner] Error during scan: {str(e)}")
    finally:
        scan_progress["isScanning"] = False

@app.post("/api/scan")
async def trigger_scan():
    if not scan_progress["isScanning"]:
        asyncio.create_task(perform_background_scan())
    return {"message": "Scan started", "status": scan_progress}

@app.get("/api/scan/progress")
async def get_scan_progress():
    return scan_progress

@app.get("/api/export/md")
@app.get("/export/md")
async def export_md():
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM ips ORDER BY CAST(substr(ip, 13) AS INTEGER)").fetchall()
    conn.close()
    
    records = []
    for r in rows:
        d = dict(r)
        d["services"] = json.loads(d["services"] or "[]")
        records.append(d)
        
    content = generate_markdown_export(records)
    return Response(
        content=content,
        media_type="text/markdown",
        headers={"Content-Disposition": "attachment; filename=homelab-ipam-192.168.2.0.md"}
    )

@app.get("/api/export/txt")
@app.get("/export/txt")
async def export_txt():
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM ips ORDER BY CAST(substr(ip, 13) AS INTEGER)").fetchall()
    conn.close()
    
    records = []
    for r in rows:
        d = dict(r)
        d["services"] = json.loads(d["services"] or "[]")
        records.append(d)
        
    content = generate_text_export(records)
    return Response(
        content=content,
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=homelab-ipam-192.168.2.0.txt"}
    )

@app.get("/api/export/json")
async def export_json():
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM ips ORDER BY CAST(substr(ip, 13) AS INTEGER)").fetchall()
    conn.close()
    
    records = []
    for r in rows:
        d = dict(r)
        d["services"] = json.loads(d["services"] or "[]")
        records.append(d)
        
    return Response(
        content=json.dumps(records, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=homelab-ipam-backup.json"}
    )
