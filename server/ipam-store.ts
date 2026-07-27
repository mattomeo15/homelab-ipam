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

  public clearAll() {
    this.seedDefaults();
  }

  public importMarkdown(markdownText: string): number {
    if (!markdownText) return 0;
    const lines = markdownText.split('\n');
    let currentCategory: IPRecord['typeTag'] = 'Unassigned';
    let importedCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detect section categories, e.g., "## Gateway / Router"
      if (line.startsWith('##')) {
        const title = line.replace(/^##\s*/, '').trim().toLowerCase();
        if (title.includes('gateway') || title.includes('router')) {
          currentCategory = 'Gateway / Router';
        } else if (title.includes('macvlan')) {
          currentCategory = 'Macvlan Container';
        } else if (title.includes('shared') || title.includes('host container')) {
          currentCategory = 'Shared/Host Container';
        } else if (title.includes('infrastructure')) {
          currentCategory = 'Infrastructure';
        } else if (title.includes('physical') || title.includes('hardware')) {
          currentCategory = 'Physical Hardware';
        } else if (title.includes('unassigned')) {
          currentCategory = 'Unassigned';
        }
        continue;
      }

      // Check for table rows containing 192.168.
      if (line.startsWith('|') && (line.includes('192.168.2.') || line.includes('192.168.'))) {
        const parts = line.split('|').map((p) => p.trim());
        if (parts.length >= 7) {
          const ipRaw = parts[1].replace(/[`*]/g, '').trim();
          if (!ipRaw.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
            continue;
          }

          const hostnameRaw = parts[2].replace(/[`*]/g, '').trim();
          const statusRaw = parts[3].replace(/[`*]/g, '').trim() as IPRecord['status'];
          const servicesRaw = parts[4].trim();
          const macRaw = parts[5].replace(/[`*]/g, '').trim();
          const notesRaw = parts[6].replace(/[`*]/g, '').trim();

          const hostname = (hostnameRaw === '-' || hostnameRaw === '') ? '' : hostnameRaw;
          const macAddress = (macRaw === '-' || macRaw === '') ? '' : macRaw;
          const notes = (notesRaw === '-' || notesRaw === '') ? '' : notesRaw;
          const status = (statusRaw === 'Active' || statusRaw === 'Reserved' || statusRaw === 'Free') ? statusRaw : 'Active';

          // Parse nested services
          const parsedServices: ServiceItem[] = [];
          if (servicesRaw && servicesRaw !== '*None*' && servicesRaw !== '-' && servicesRaw !== '') {
            const svcItems: string[] = [];
            let temp = '';
            let openBrackets = 0;
            let openParens = 0;
            for (let j = 0; j < servicesRaw.length; j++) {
              const char = servicesRaw[j];
              if (char === '[') openBrackets++;
              else if (char === ']') openBrackets--;
              else if (char === '(') openParens++;
              else if (char === ')') openParens--;

              if (char === ',' && openBrackets === 0 && openParens === 0) {
                svcItems.push(temp.trim());
                temp = '';
              } else {
                temp += char;
              }
            }
            if (temp.trim() !== '') {
              svcItems.push(temp.trim());
            }

            svcItems.forEach((item, idx) => {
              const linkMatch = item.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
              let label = item;
              let url = '';
              if (linkMatch) {
                label = linkMatch[1];
                url = linkMatch[2];
              }

              const portMatch = label.match(/(.*?)\s*\((?::)?(\d+)\)/);
              let serviceName = label;
              let port = 80;
              if (portMatch) {
                serviceName = portMatch[1].trim();
                port = parseInt(portMatch[2], 10);
              }

              let protocol: 'http' | 'https' | 'tcp' = 'tcp';
              if (url.startsWith('https://')) {
                protocol = 'https';
              } else if (url.startsWith('http://')) {
                protocol = 'http';
              }

              parsedServices.push({
                id: `svc-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
                name: serviceName,
                port,
                protocol,
                url,
                autoDiscovered: true
              });
            });
          }

          const existing = this.records.get(ipRaw);
          const finalRecord: IPRecord = {
            ip: ipRaw,
            hostname: hostname || (existing ? existing.hostname : ''),
            status,
            typeTag: currentCategory,
            macAddress: macAddress || (existing ? existing.macAddress : ''),
            notes: notes || (existing ? existing.notes : ''),
            services: parsedServices.length > 0 ? parsedServices : (existing ? existing.services : []),
            lastSeen: status === 'Active' ? 'Active now' : undefined
          };

          this.records.set(ipRaw, finalRecord);
          importedCount++;
        }
      }
    }

    if (importedCount > 0) {
      this.saveData();
    }
    return importedCount;
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
