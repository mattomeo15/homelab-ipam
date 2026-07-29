import os
import sys
import json
import asyncio
from typing import List, Optional
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, Response, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

# Ensure current module directory is in sys.path
APP_DIR = os.path.dirname(os.path.abspath(__file__))
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

try:
    from backend.app.database import (
        init_db,
        get_db_connection,
        get_all_ips_db,
        update_ip_db,
        clear_all_data_db,
        DB_PATH
    )
    from backend.app.display_name_engine import resolve_device_display_name
    from backend.app.scanner import scan_subnet, get_active_subnet
    from backend.app.exporter import generate_markdown_export, generate_text_export
except ImportError:
    from database import (
        init_db,
        get_db_connection,
        get_all_ips_db,
        update_ip_db,
        clear_all_data_db,
        DB_PATH
    )
    from display_name_engine import resolve_device_display_name
    from scanner import scan_subnet, get_active_subnet
    from exporter import generate_markdown_export, generate_text_export

# Initialize Database at startup
init_db()

# Resolve workspace root, templates, and public asset paths
ROOT_DIR = os.path.dirname(os.path.dirname(APP_DIR))
TEMPLATES_DIR = os.path.join(ROOT_DIR, "frontend", "templates")
PUBLIC_DIR = os.path.join(ROOT_DIR, "frontend", "public")

app = FastAPI(title="IP-Freely", version="1.0.0")

templates = Jinja2Templates(directory=TEMPLATES_DIR)

if os.path.exists(PUBLIC_DIR):
    app.mount("/public", StaticFiles(directory=PUBLIC_DIR), name="public")


@app.get("/favicon.png")
@app.get("/favicon.ico")
@app.get("/apple-touch-icon.png")
async def get_favicon():
    fav_path = os.path.join(PUBLIC_DIR, "favicon.png")
    if os.path.exists(fav_path):
        return FileResponse(fav_path, media_type="image/png")
    logo_path = os.path.join(PUBLIC_DIR, "logo.png")
    if os.path.exists(logo_path):
        return FileResponse(logo_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="Favicon not found")


@app.get("/logo.png")
async def get_logo():
    logo_path = os.path.join(PUBLIC_DIR, "logo.png")
    if os.path.exists(logo_path):
        return FileResponse(logo_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="Logo not found")


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
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/ips")
async def get_all_ips():
    return get_all_ips_db()


@app.get("/api/stats")
async def get_stats():
    conn = get_db_connection()
    rows = conn.execute("SELECT ip, status, services FROM ips").fetchall()
    conn.close()

    active = sum(1 for r in rows if r["status"] == "Active")
    reserved = sum(1 for r in rows if r["status"] == "Reserved")
    free = sum(1 for r in rows if r["status"] == "Free")
    total_services = 0
    ip_list = []
    for r in rows:
        ip_list.append(r["ip"])
        svcs = json.loads(r["services"] or "[]")
        total_services += len(svcs)

    subnet = get_active_subnet(ip_list)
    return {
        "total": len(rows),
        "active": active,
        "reserved": reserved,
        "free": free,
        "services": total_services,
        "subnet": subnet
    }


@app.get("/api/status")
async def get_status():
    stats = await get_stats()
    return {
        "subnet": stats["subnet"],
        "stats": stats,
        "scanProgress": scan_progress
    }


@app.get("/api/subnet")
async def get_subnet():
    stats = await get_stats()
    return {"subnet": stats["subnet"]}


@app.put("/api/ips/{ip}")
async def update_ip(ip: str, data: IPUpdateModel):
    tag = data.typeTag if data.typeTag is not None else (data.type_tag or "Physical Hardware")
    mac = data.macAddress if data.macAddress is not None else (data.mac_address or "")
    svc_list = [s.dict() for s in data.services]
    update_ip_db(ip, data.hostname, data.status, tag, mac, data.notes or "", svc_list)
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
        for item in discovered:
            if item["status"] == "Active":
                ip = item["ip"]
                row = conn.execute("SELECT * FROM ips WHERE ip=?", (ip,)).fetchone()
                if row:
                    existing_services = json.loads(row["services"] or "[]")
                    existing_ports = {s["port"] for s in existing_services}

                    for new_svc in item["services"]:
                        if new_svc["port"] not in existing_ports:
                            existing_services.append(new_svc)
                        else:
                            for s in existing_services:
                                if s["port"] == new_svc["port"] and new_svc.get("title_detected"):
                                    s["name"] = new_svc["name"]
                                    s["url"] = new_svc["url"]

                    row_host = (row["hostname"] or "").strip()
                    item_host = (item.get("hostname", "") or "").strip()

                    if row_host and not row_host.startswith("host-"):
                        final_hostname = row_host
                    elif item_host and not item_host.startswith("host-"):
                        final_hostname = item_host
                    else:
                        final_hostname = row_host or item_host or f"host-{ip.split('.')[-1]}"

                    row_mac = (row["mac_address"] or "").strip()
                    item_mac = (item.get("mac_address", "") or "").strip()
                    final_mac = row_mac if row_mac else item_mac

                    row_type = row["type_tag"] or "Unassigned"
                    item_type = item.get("type_tag", "Physical Hardware")

                    if row_type in ["Unassigned", "Physical Hardware"] and item_type != "Unassigned":
                        final_type = item_type
                    elif item_type in ["Gateway / Router", "Infrastructure", "Macvlan Container", "Shared/Host Container"]:
                        final_type = item_type
                    else:
                        final_type = row_type

                    conn.execute(
                        "UPDATE ips SET hostname=?, status='Active', type_tag=?, mac_address=?, services=? WHERE ip=?",
                        (final_hostname, final_type, final_mac, json.dumps(existing_services), ip)
                    )
                else:
                    conn.execute(
                        "INSERT INTO ips (ip, hostname, status, type_tag, mac_address, notes, services) VALUES (?, ?, 'Active', ?, '', '', ?)",
                        (ip, item["hostname"], item["type_tag"], json.dumps(item["services"]))
                    )
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


@app.post("/api/clear")
@app.delete("/api/clear")
async def clear_all_data():
    clear_all_data_db()
    return {"message": "All saved IP-Freely data has been cleared successfully"}


@app.get("/api/scan/progress")
async def get_scan_progress():
    return scan_progress


@app.get("/api/export/md")
@app.get("/export/md")
async def export_md():
    records = get_all_ips_db()
    content = generate_markdown_export(records)
    return Response(
        content=content,
        media_type="text/markdown",
        headers={"Content-Disposition": "attachment; filename=homelab-ipam-192.168.2.0.md"}
    )


@app.get("/api/export/txt")
@app.get("/export/txt")
async def export_txt():
    records = get_all_ips_db()
    content = generate_text_export(records)
    return Response(
        content=content,
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=homelab-ipam-192.168.2.0.txt"}
    )


@app.get("/api/export/json")
async def export_json():
    records = get_all_ips_db()
    return Response(
        content=json.dumps(records, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=homelab-ipam-backup.json"}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=3000, reload=True)
