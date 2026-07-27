import fs from 'fs';
import path from 'path';

export interface ServiceItem {
  id: string;
  name: string;
  port: number;
  protocol: 'http' | 'https' | 'tcp';
  url: string;
  category?: string;
  description?: string;
  autoDiscovered?: boolean;
}

export interface IPRecord {
  ip: string;
  hostname: string;
  status: 'Active' | 'Free' | 'Reserved';
  typeTag: 'Physical Hardware' | 'Macvlan Container' | 'Shared/Host Container' | 'Gateway / Router' | 'Infrastructure' | 'Unassigned';
  macAddress?: string;
  notes?: string;
  services: ServiceItem[];
  lastSeen?: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'ipam.json');

export class IPAMStore {
  private records: Map<string, IPRecord> = new Map();

  constructor() {
    this.ensureDirectory();
    this.loadData();
  }

  private ensureDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadData() {
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed: IPRecord[] = JSON.parse(raw);
        parsed.forEach((rec) => this.records.set(rec.ip, rec));
        if (this.records.size === 254) return;
      } catch (err) {
        console.error('Failed to parse ipam.json, re-seeding default database:', err);
      }
    }
    this.seedDefaults();
  }

  private seedDefaults() {
    this.records.clear();
    const defaultsMap: Record<string, Partial<IPRecord>> = {
      '192.168.2.1': {
        hostname: 'gateway.homelab.local',
        status: 'Active',
        typeTag: 'Gateway / Router',
        macAddress: '70:85:C2:A1:00:01',
        notes: 'OPNsense Core Router / Firewall with Unbound DNS & DHCP Server',
        services: [
          { id: 'svc-1', name: 'OPNsense WebGUI', port: 443, protocol: 'https', url: 'https://192.168.2.1:443', category: 'Security' },
          { id: 'svc-2', name: 'DNS Resolver (Unbound)', port: 53, protocol: 'tcp', url: '', category: 'Networking' }
        ]
      },
      '192.168.2.2': {
        hostname: 'pihole-01.homelab.local',
        status: 'Active',
        typeTag: 'Macvlan Container',
        macAddress: '02:42:C0:A8:02:02',
        notes: 'Primary Network-wide AdBlocker & Local DNS authority',
        services: [
          { id: 'svc-1', name: 'Pi-hole Admin Console', port: 80, protocol: 'http', url: 'http://192.168.2.2/admin', category: 'DNS' },
          { id: 'svc-2', name: 'DNS Server', port: 53, protocol: 'tcp', url: '', category: 'DNS' }
        ]
      },
      '192.168.2.10': {
        hostname: 'pve-host01.homelab.local',
        status: 'Active',
        typeTag: 'Physical Hardware',
        macAddress: 'A4:BB:6D:22:98:10',
        notes: 'Proxmox VE Hypervisor Host (AMD EPYC 16-Core, 128GB ECC)',
        services: [
          { id: 'svc-1', name: 'Proxmox VE Web UI', port: 8006, protocol: 'https', url: 'https://192.168.2.10:8006', category: 'Virtualization' },
          { id: 'svc-2', name: 'SSH Terminal', port: 22, protocol: 'tcp', url: '', category: 'Management' }
        ]
      },
      '192.168.2.15': {
        hostname: 'truenas-storage.homelab.local',
        status: 'Active',
        typeTag: 'Physical Hardware',
        macAddress: '00:25:90:E4:11:02',
        notes: 'TrueNAS CORE ZFS Storage Server (64TB RAIDZ2)',
        services: [
          { id: 'svc-1', name: 'TrueNAS Dashboard', port: 443, protocol: 'https', url: 'https://192.168.2.15:443', category: 'Storage' },
          { id: 'svc-2', name: 'SMB Share (NFS/CIFS)', port: 445, protocol: 'tcp', url: '', category: 'Storage' }
        ]
      },
      '192.168.2.50': {
        hostname: 'homeassistant-macvlan',
        status: 'Active',
        typeTag: 'Macvlan Container',
        macAddress: '02:42:C0:A8:02:32',
        notes: 'Home Assistant OS Instance controlling IoT & Zigbee bridge',
        services: [
          { id: 'svc-1', name: 'Home Assistant UI', port: 8123, protocol: 'http', url: 'http://192.168.2.50:8123', category: 'Smart Home' }
        ]
      },
      '192.168.2.200': {
        hostname: 'docker-app-node01',
        status: 'Active',
        typeTag: 'Shared/Host Container',
        macAddress: '52:54:00:FA:99:20',
        notes: 'Primary Docker Swarm / Standalone Host running multiple app containers',
        services: [
          { id: 'svc-1', name: 'Portainer CE', port: 9000, protocol: 'http', url: 'http://192.168.2.200:9000', category: 'Docker Management' },
          { id: 'svc-2', name: 'Nginx Proxy Manager', port: 81, protocol: 'http', url: 'http://192.168.2.200:81', category: 'Reverse Proxy' },
          { id: 'svc-3', name: 'Jellyfin Media Server', port: 8096, protocol: 'http', url: 'http://192.168.2.200:8096', category: 'Media' },
          { id: 'svc-4', name: 'Uptime Kuma Status', port: 3001, protocol: 'http', url: 'http://192.168.2.200:3001', category: 'Monitoring' },
          { id: 'svc-5', name: 'Grafana Dashboard', port: 3000, protocol: 'http', url: 'http://192.168.2.200:3000', category: 'Monitoring' },
          { id: 'svc-6', name: 'Transmission Torrent', port: 9091, protocol: 'http', url: 'http://192.168.2.200:9091', category: 'Downloads' }
        ]
      },
      '192.168.2.220': {
        hostname: 'synology-ds920plus',
        status: 'Active',
        typeTag: 'Physical Hardware',
        macAddress: '00:11:32:8F:7E:11',
        notes: 'Backup NAS Drive for Hyper Backup & Surveillance Station',
        services: [
          { id: 'svc-1', name: 'Synology DSM Manager', port: 5001, protocol: 'https', url: 'https://192.168.2.220:5001', category: 'Storage' }
        ]
      },
      '192.168.2.250': {
        hostname: 'idrac-pve-server',
        status: 'Reserved',
        typeTag: 'Infrastructure',
        macAddress: '00:1E:67:89:AB:CD',
        notes: 'Dell Out-of-Band Management Controller (iDRAC 9)',
        services: [
          { id: 'svc-1', name: 'iDRAC 9 Console', port: 443, protocol: 'https', url: 'https://192.168.2.250:443', category: 'Management' }
        ]
      }
    };

    for (let i = 1; i <= 254; i++) {
      const ip = `192.168.2.${i}`;
      if (defaultsMap[ip]) {
        const item = defaultsMap[ip]!;
        this.records.set(ip, {
          ip,
          hostname: item.hostname || '',
          status: item.status || 'Active',
          typeTag: item.typeTag || 'Physical Hardware',
          macAddress: item.macAddress || '',
          notes: item.notes || '',
          services: item.services || [],
          lastSeen: 'Active now'
        });
      } else {
        this.records.set(ip, {
          ip,
          hostname: '',
          status: 'Free',
          typeTag: 'Unassigned',
          macAddress: '',
          notes: '',
          services: []
        });
      }
    }
    this.saveData();
  }

  public saveData() {
    try {
      const arr = Array.from(this.records.values());
      fs.writeFileSync(DB_FILE, JSON.stringify(arr, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save ipam.json:', err);
    }
  }

  public getAll(): IPRecord[] {
    return Array.from(this.records.values()).sort((a, b) => {
      const numA = parseInt(a.ip.split('.')[3], 10);
      const numB = parseInt(b.ip.split('.')[3], 10);
      return numA - numB;
    });
  }

  public getByIp(ip: string): IPRecord | undefined {
    return this.records.get(ip);
  }

  public update(ip: string, updates: Partial<IPRecord>): IPRecord {
    const existing = this.records.get(ip);
    if (!existing) {
      throw new Error(`IP address ${ip} not found`);
    }
    const updated: IPRecord = {
      ...existing,
      ...updates,
      ip
    };
    this.records.set(ip, updated);
    this.saveData();
    return updated;
  }

  public getStats() {
    const all = this.getAll();
    const active = all.filter((r) => r.status === 'Active').length;
    const free = all.filter((r) => r.status === 'Free').length;
    const reserved = all.filter((r) => r.status === 'Reserved').length;
    const totalServices = all.reduce((sum, r) => sum + r.services.length, 0);

    return {
      total: all.length,
      active,
      free,
      reserved,
      totalServices,
      subnet: '192.168.2.0/24',
      lastScanTime: new Date().toISOString()
    };
  }
}

export const store = new IPAMStore();
