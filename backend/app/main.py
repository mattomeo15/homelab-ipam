import os
import sys
import json
import asyncio
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import FastAPI, Request, HTTPException, WebSocket, WebSocketDisconnect
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
    from backend.app.naming_guide import NAMING_GUIDE
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
    from naming_guide import NAMING_GUIDE

# Ensure data directory exists before database init
db_dir = os.path.dirname(DB_PATH) if 'DB_PATH' in globals() else os.path.join(APP_DIR, "..", "data")
if db_dir and not os.path.exists(db_dir):
    os.makedirs(db_dir, exist_ok=True)

# Initialize Database at startup
init_db()

# Safe path resolution for both Local Dev and Docker containers
ROOT_DIR = os.path.dirname(os.path.dirname(APP_DIR))

# Search candidate locations for templates and public assets
possible_template_dirs = [
    os.path.join(ROOT_DIR, "frontend", "templates"),
    os.path.join(APP_DIR, "..", "..", "frontend", "templates"),
    os.path.join(APP_DIR, "frontend", "templates"),
    os.path.join(APP_DIR, "templates"),
    "/app/frontend/templates",
    "/app/templates"
]

possible_public_dirs = [
    os.path.join(ROOT_DIR, "frontend", "public"),
    os.path.join(APP_DIR, "..", "..", "frontend", "public"),
    os.path.join(APP_DIR, "frontend", "public"),
    os.path.join(APP_DIR, "public"),
    "/app/frontend/public",
    "/app/public"
]

TEMPLATES_DIR = next((d for d in possible_template_dirs if os.path.exists(d)), possible_template_dirs[0])
PUBLIC_DIR = next((d for d in possible_public_dirs if os.path.exists(d)), possible_public_dirs[0])

# Print paths on startup for easy debugging via 'docker logs'
print(f"[IPAM Startup] Using TEMPLATES_DIR: {TEMPLATES_DIR} (Exists: {os.path.exists(TEMPLATES_DIR)})")
print(f"[IPAM Startup] Using PUBLIC_DIR: {PUBLIC_DIR} (Exists: {os.path.exists(PUBLIC_DIR)})")

app = FastAPI(title="IP-Freely", version="1.0.0")

templates = Jinja2Templates(directory=TEMPLATES_DIR)

# Wrap TemplateResponse to seamlessly handle both (name, context) and (request=request, name=name) across Starlette/FastAPI versions
_orig_template_response = templates.TemplateResponse

def _compat_template_response(*args, **kwargs):
    req = kwargs.pop("request", None)
    name = kwargs.pop("name", None)
    context = kwargs.pop("context", None)

    if not req and len(args) > 0 and isinstance(args[0], Request):
        req = args[0]
        args = args[1:]

    if not name and len(args) > 0 and isinstance(args[0], str):
        name = args[0]
        args = args[1:]

    if not context and len(args) > 0 and isinstance(args[0], dict):
        context = args[0]

    if context is None:
        context = {}

    if req and "request" not in context:
        context["request"] = req

    if name:
        try:
            return _orig_template_response(name, context)
        except TypeError:
            pass

    if req and name:
        try:
            return _orig_template_response(request=req, name=name, context=context)
        except TypeError:
            pass

    return _orig_template_response(*args, **kwargs)

templates.TemplateResponse = _compat_template_response

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
    hostname_source: Optional[str] = ""
    hostnameSource: Optional[str] = None
    scanned_hostname: Optional[str] = ""
    scannedHostname: Optional[str] = None
    reset_hostname: Optional[bool] = False
    status: str
    type_tag: Optional[str] = "Physical Hardware"
    typeTag: Optional[str] = None
    mac_address: Optional[str] = ""
    macAddress: Optional[str] = None
    notes: Optional[str] = ""
    services: List[ServiceModel] = []
    latency_ms: Optional[float] = 0.0
    latencyMs: Optional[float] = None
    os_family: Optional[str] = "Unknown"
    osFamily: Optional[str] = None
    device_model: Optional[str] = ""
    deviceModel: Optional[str] = None
    first_discovered: Optional[str] = ""
    firstDiscovered: Optional[str] = None
    last_seen: Optional[str] = ""
    lastSeen: Optional[str] = None


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        pass


@app.get("/", response_class=HTMLResponse)
@app.get("/index.html", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse(
        request=request, 
        name="index.html"
    )


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


@app.get("/api/naming-guide")
async def get_naming_guide():
    return NAMING_GUIDE


@app.put("/api/ips/{ip}")
async def update_ip(ip: str, data: IPUpdateModel):
    tag = data.typeTag if data.typeTag is not None else (data.type_tag or "Physical Hardware")
    mac = data.macAddress if data.macAddress is not None else (data.mac_address or "")
    svc_list = [s.dict() for s in data.services]
    
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM ips WHERE ip=?", (ip,)).fetchone()
    conn.close()
    
    row_dict = dict(row) if row else {}
    scanned = data.scannedHostname if data.scannedHostname is not None else (data.scanned_hostname or row_dict.get("scanned_hostname", ""))
    
    if data.reset_hostname:
        final_hostname = scanned or f"host-{ip.split('.')[-1]}"
        final_source = "Fallback"
    else:
        final_hostname = data.hostname
        user_src = data.hostnameSource if data.hostnameSource is not None else (data.hostname_source or "")
        if user_src == "Custom":
            final_source = "Custom"
        elif row_dict.get("hostname") and row_dict.get("hostname") != data.hostname:
            final_source = "Custom"
        else:
            final_source = user_src or row_dict.get("hostname_source", "Fallback") or "Fallback"

    lat = data.latencyMs if data.latencyMs is not None else (data.latency_ms if data.latency_ms is not None else row_dict.get("latency_ms", 0.0))
    os_fam = data.osFamily if data.osFamily is not None else (data.os_family or row_dict.get("os_family", "Unknown"))
    dev_mod = data.deviceModel if data.deviceModel is not None else (data.device_model or row_dict.get("device_model", ""))
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    first_disc = data.firstDiscovered if data.firstDiscovered is not None else (data.first_discovered or row_dict.get("first_discovered", now_str))
    last_seen = data.lastSeen if data.lastSeen is not None else (data.last_seen or row_dict.get("last_seen", now_str))
            
    update_ip_db(
        ip, final_hostname, data.status, tag, mac, data.notes or "", svc_list,
        final_source, scanned, lat, os_fam, dev_mod, first_disc, last_seen
    )
    return {"status": "success", "ip": ip}


async def perform_background_scan():
    global scan_progress
    if scan_progress["isScanning"]:
        return

    stats = await get_stats()
    raw_subnet = stats.get("subnet", "192.168.2")
    if "/" in raw_subnet:
        raw_subnet = raw_subnet.split("/")[0]
    parts = raw_subnet.split(".")
    if len(parts) >= 3:
        subnet_prefix = f"{parts[0]}.{parts[1]}.{parts[2]}"
    else:
        subnet_prefix = "192.168.2"

    scan_progress["scannedCount"] = 0
    scan_progress["total"] = 254
    scan_progress["currentIp"] = f"{subnet_prefix}.1"
    scan_progress["isScanning"] = True
    scan_progress["discoveredServices"] = 0
    scan_progress["log"] = [f"[Scanner] Initializing parallel subnet scan for {subnet_prefix}.1 - {subnet_prefix}.254..."]

    try:
        discovered = await scan_subnet(subnet_prefix, 1, 254, progress_dict=scan_progress)
        conn = get_db_connection()

        # If DB contains only unassigned/Free placeholder IPs from a default subnet that differs from active subnet, update placeholders
        active_count = conn.execute("SELECT COUNT(*) FROM ips WHERE status != 'Free'").fetchone()[0]
        if active_count == 0:
            existing_ip = conn.execute("SELECT ip FROM ips LIMIT 1").fetchone()
            if existing_ip:
                old_prefix = ".".join(existing_ip["ip"].split(".")[:3])
                if old_prefix != subnet_prefix:
                    conn.execute("DELETE FROM ips WHERE status = 'Free'")
                    for i in range(1, 255):
                        new_ip = f"{subnet_prefix}.{i}"
                        conn.execute(
                            "INSERT OR IGNORE INTO ips (ip, hostname, hostname_source, status, type_tag, mac_address, notes, services) VALUES (?, '', '', 'Free', 'Unassigned', '', '', '[]')",
                            (new_ip,)
                        )
                    conn.commit()

        for item in discovered:
            if item["status"] == "Active":
                ip = item["ip"]
                row = conn.execute("SELECT * FROM ips WHERE ip=?", (ip,)).fetchone()
                now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

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

                    row_dict = dict(row)
                    row_host = (row_dict.get("hostname") or "").strip()
                    row_source = row_dict.get("hostname_source", "") or ""
                    item_host = (item.get("hostname", "") or "").strip()
                    item_source = item.get("hostname_source", "") or ""
                    scanned_host = item.get("scanned_hostname", item_host)

                    if row_source == "Custom" and row_host:
                        # Custom naming lock: preserve custom hostname and source
                        final_hostname = row_host
                        final_source = "Custom"
                    elif item_host and not item_host.startswith("host-"):
                        final_hostname = item_host
                        final_source = item_source or "mDNS"
                    elif row_host:
                        final_hostname = row_host
                        final_source = row_source or "Fallback"
                    else:
                        final_hostname = item_host or f"host-{ip.split('.')[-1]}"
                        final_source = item_source or "Fallback"

                    row_mac = (row_dict.get("mac_address") or "").strip()
                    item_mac = (item.get("mac_address", "") or "").strip()
                    final_mac = item_mac if item_mac else row_mac

                    row_type = row_dict.get("type_tag") or "Unassigned"
                    item_type = item.get("type_tag", "Physical Hardware")

                    if row_type in ["Unassigned", "Physical Hardware"] and item_type != "Unassigned":
                        final_type = item_type
                    elif item_type in ["Gateway / Router", "Infrastructure", "Macvlan Container", "Shared/Host Container"]:
                        final_type = item_type
                    else:
                        final_type = row_type

                    first_disc = row_dict.get("first_discovered") or now_str
                    last_seen = now_str
                    lat = item.get("latency_ms", 0.0)
                    os_fam = item.get("os_family", "Unknown")
                    dev_mod = item.get("device_model") or row_dict.get("device_model", "")

                    conn.execute(
                        "UPDATE ips SET hostname=?, hostname_source=?, scanned_hostname=?, status='Active', type_tag=?, mac_address=?, services=?, latency_ms=?, os_family=?, device_model=?, first_discovered=?, last_seen=? WHERE ip=?",
                        (final_hostname, final_source, scanned_host, final_type, final_mac, json.dumps(existing_services), lat, os_fam, dev_mod, first_disc, last_seen, ip)
                    )
                else:
                    first_disc = now_str
                    last_seen = now_str
                    conn.execute(
                        "INSERT INTO ips (ip, hostname, hostname_source, scanned_hostname, status, type_tag, mac_address, notes, services, latency_ms, os_family, device_model, first_discovered, last_seen) VALUES (?, ?, ?, ?, 'Active', ?, '', '', ?, ?, ?, ?, ?, ?)",
                        (
                            ip, item["hostname"], item.get("hostname_source", "Fallback"),
                            item.get("scanned_hostname", item["hostname"]), item["type_tag"],
                            json.dumps(item["services"]), item.get("latency_ms", 0.0),
                            item.get("os_family", "Unknown"), item.get("device_model", ""),
                            first_disc, last_seen
                        )
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
        headers={"Content-Disposition": "attachment; filename=homelab-ipam-export.md"}
    )


@app.get("/api/export/txt")
@app.get("/export/txt")
async def export_txt():
    records = get_all_ips_db()
    content = generate_text_export(records)
    return Response(
        content=content,
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=homelab-ipam-export.txt"}
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