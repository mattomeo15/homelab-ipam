import fs from 'fs';
import path from 'path';
import os from 'os';

export function detectSubnet(records?: IPRecord[]): string {
  // 1. Environment Variable Override
  if (process.env.TARGET_SUBNET && process.env.TARGET_SUBNET.trim()) {
    return process.env.TARGET_SUBNET.trim();
  }

  // 2. Derive from active IP records if available
  if (records && records.length > 0) {
    const prefixCounts = new Map<string, number>();
    for (const rec of records) {
      const parts = rec.ip.split('.');
      if (parts.length === 4) {
        const prefix = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
        prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
      }
    }
    let bestSubnet = '';
    let maxCount = 0;
    for (const [sub, count] of prefixCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        bestSubnet = sub;
      }
    }
    if (bestSubnet && maxCount >= 10) {
      return bestSubnet;
    }
  }

  // 3. Detect from OS Network Interfaces
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const ifaceList = interfaces[name];
      if (!ifaceList) continue;
      for (const iface of ifaceList) {
        if (!iface.internal && iface.family === 'IPv4') {
          const parts = iface.address.split('.');
          if (parts.length === 4) {
            return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
          }
        }
      }
    }
  } catch (err) {
    console.error('Error detecting network interface subnet:', err);
  }

  // 4. Default Fallback
  return '192.168.2.0/24';
}

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
        const mockHostnames = new Set([
          'gateway.homelab.local', 'pihole-01.homelab.local', 'pihole-dns.homelab.local',
          'pve-host01.homelab.local', 'pve-node1.homelab.local', 'docker-host-01',
          'docker-app-node01', 'truenas-storage.homelab.local', 'synology-ds920plus',
          'idrac-pve-server', 'homeassistant-macvlan'
        ]);
        let hasMock = false;
        parsed.forEach((rec) => {
          if (mockHostnames.has(rec.hostname)) {
            hasMock = true;
          } else {
            this.records.set(rec.ip, rec);
          }
        });
        if (!hasMock && this.records.size === 254) return;
      } catch (err) {
        console.error('Failed to parse ipam.json, re-seeding default database:', err);
      }
    }
    this.seedDefaults();
  }

  private seedDefaults() {
    this.records.clear();
    for (let i = 1; i <= 254; i++) {
      const ip = `192.168.2.${i}`;
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
      subnet: detectSubnet(all),
      lastScanTime: new Date().toISOString()
    };
  }
}

export const store = new IPAMStore();
