import net from 'net';
import dns from 'dns';
import http from 'http';
import https from 'https';
import { store, IPRecord, ServiceItem } from './ipam-store';

const COMMON_PORTS: Record<number, string> = {
  22: 'SSH',
  53: 'DNS Resolver',
  80: 'HTTP Web UI',
  81: 'Nginx Proxy Manager',
  443: 'HTTPS Web UI',
  3000: 'Grafana / Web App',
  3001: 'Uptime Kuma',
  5000: 'Docker Registry / Flask',
  5001: 'Synology DSM',
  5800: 'VNC Web UI',
  6789: 'NZBGet',
  7860: 'AI Web UI',
  7878: 'Radarr',
  8000: 'Web Service',
  8006: 'Proxmox VE Web UI',
  8008: 'Matrix Synapse',
  8080: 'Web UI / Traefik',
  8081: 'SABnzbd',
  8096: 'Jellyfin Media Server',
  8123: 'Home Assistant',
  8443: 'UniFi Controller / Web UI',
  8888: 'JupyterLab',
  8989: 'Sonarr',
  9000: 'Portainer CE',
  9090: 'Cockpit / Prometheus',
  9091: 'Transmission Web',
  9696: 'Prowlarr',
  22300: 'Homelab Web App',
  32400: 'Plex Media Server'
};

const WEB_PORTS = [80, 81, 443, 3000, 3001, 5000, 5001, 5800, 7860, 7878, 8000, 8006, 8080, 8081, 8096, 8123, 8443, 8888, 8989, 9000, 9090, 9091, 9696, 22300, 32400];

export interface ScanProgress {
  scannedCount: number;
  total: number;
  currentIp: string;
  isScanning: boolean;
  discoveredServices: number;
  log: string[];
}

let activeScanProgress: ScanProgress = {
  scannedCount: 0,
  total: 254,
  currentIp: '',
  isScanning: false,
  discoveredServices: 0,
  log: []
};

export function getScanProgress(): ScanProgress {
  return activeScanProgress;
}

function checkTcpPort(host: string, port: number, timeoutMs = 600): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = false;

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      status = true;
      socket.destroy();
    });
    socket.on('timeout', () => {
      socket.destroy();
    });
    socket.on('error', () => {
      socket.destroy();
    });
    socket.on('close', () => {
      resolve(status);
    });

    socket.connect(port, host);
  });
}

function fetchWebTitle(host: string, port: number, timeoutMs = 1200): Promise<string | null> {
  return new Promise((resolve) => {
    const isHttps = [443, 8443, 8006, 5001].includes(port);
    const client = isHttps ? https : http;
    const protocol = isHttps ? 'https' : 'http';

    const req = client.get(
      `${protocol}://${host}:${port}`,
      {
        timeout: timeoutMs,
        rejectUnauthorized: false,
        headers: {
          'User-Agent': 'Homelab-IPAM-Scanner/1.0 (Mozilla/5.0)'
        }
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 50000) {
            req.destroy();
          }
        });
        res.on('end', () => {
          const match = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          if (match && match[1]) {
            let title = match[1].replace(/\s+/g, ' ').trim();
            if (title.length > 0 && title.length < 80) {
              resolve(title);
              return;
            }
          }
          resolve(null);
        });
      }
    );

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

function deriveHostnameFromTitle(title: string): string | null {
  if (!title) return null;
  const tLower = title.toLowerCase();

  if (tLower.includes('proxmox') || tLower.includes('pve')) {
    const match = title.match(/([\w-]+)\s*-\s*proxmox/i);
    if (match && match[1]?.trim()) return match[1].trim().toLowerCase();
    return 'proxmox-pve';
  }
  if (tLower.includes('opnsense')) {
    const match = title.match(/([\w.-]+)\s*-\s*opnsense/i);
    if (match && match[1]?.trim()) return match[1].trim().toLowerCase();
    return 'opnsense-gateway';
  }
  if (tLower.includes('pfsense')) return 'pfsense-gateway';
  if (tLower.includes('pi-hole') || tLower.includes('pihole')) return 'pihole-dns';
  if (tLower.includes('home assistant')) return 'homeassistant';
  if (tLower.includes('portainer')) return 'docker-portainer';
  if (tLower.includes('truenas') || tLower.includes('freenas')) return 'truenas-storage';
  if (tLower.includes('synology') || tLower.includes('dsm')) return 'synology-nas';
  if (tLower.includes('unifi')) return 'unifi-controller';
  if (tLower.includes('jellyfin')) return 'jellyfin-media';
  if (tLower.includes('plex')) return 'plex-server';
  if (tLower.includes('uptime kuma')) return 'uptime-kuma';
  if (tLower.includes('grafana')) return 'grafana-app';
  if (tLower.includes('nginx proxy manager')) return 'npm-proxy-host';

  const clean = title.replace(/[^a-zA-Z0-9\s-]/g, '').trim().toLowerCase().replace(/\s+/g, '-');
  if (clean.length >= 2 && clean.length <= 25 && !['welcome', 'login', 'index', 'home', '404', 'dashboard'].some((w) => clean.includes(w))) {
    return clean;
  }
  return null;
}

function classifyDeviceType(ip: string, openPorts: number[], titlesConcat: string): 'Gateway / Router' | 'Macvlan Container' | 'Shared/Host Container' | 'Infrastructure' | 'Physical Hardware' {
  const titles = titlesConcat.toLowerCase();

  // 1. Gateway / Router
  if (ip.endsWith('.1') || ip.endsWith('.254') || ['opnsense', 'pfsense', 'router', 'gateway', 'unifi security', 'udm', 'openwrt'].some((k) => titles.includes(k))) {
    return 'Gateway / Router';
  }

  // 2. Infrastructure
  if (openPorts.includes(8006) || openPorts.includes(9090) || ['proxmox', 'pve', 'idrac', 'ilo', 'esxi', 'vsphere', 'unifi switch', 'cockpit'].some((k) => titles.includes(k))) {
    return 'Infrastructure';
  }

  // 3. Shared/Host Container
  if (openPorts.includes(9000) || openPorts.includes(81) || openPorts.includes(8080) || openPorts.length >= 3) {
    return 'Shared/Host Container';
  }

  // 4. Macvlan Container
  const macvlanPorts = [8123, 7878, 8989, 9696, 8096, 32400, 3001, 8081, 9091, 5800];
  if (openPorts.some((p) => macvlanPorts.includes(p)) || titles.includes('pi-hole') || titles.includes('home assistant') || openPorts.length <= 2) {
    if (openPorts.length > 0 && !(openPorts.includes(22) && openPorts.includes(445))) {
      return 'Macvlan Container';
    }
  }

  return 'Physical Hardware';
}

async function resolveHostname(ip: string): Promise<string> {
  try {
    const hostnames = await dns.promises.reverse(ip);
    if (hostnames && hostnames.length > 0) {
      return hostnames[0];
    }
  } catch (e) {
    // Reverse DNS resolution silent catch
  }
  return '';
}

export async function runSubnetScan(): Promise<ScanProgress> {
  if (activeScanProgress.isScanning) {
    return activeScanProgress;
  }

  activeScanProgress = {
    scannedCount: 0,
    total: 254,
    currentIp: '192.168.2.1',
    isScanning: true,
    discoveredServices: 0,
    log: ['[Scanner] Initializing parallel subnet scan for 192.168.2.1 - 192.168.2.254...']
  };

  const subnetPrefix = '192.168.2';
  const batchSize = 25;

  for (let i = 1; i <= 254; i += batchSize) {
    const batchIPs: string[] = [];
    for (let j = i; j < Math.min(i + batchSize, 255); j++) {
      batchIPs.push(`${subnetPrefix}.${j}`);
    }

    await Promise.all(
      batchIPs.map(async (ip) => {
        activeScanProgress.currentIp = ip;
        const hostname = await resolveHostname(ip);

        // Check common ports
        const portCheckPromises = Object.keys(COMMON_PORTS).map(async (pStr) => {
          const port = parseInt(pStr, 10);
          const isOpen = await checkTcpPort(ip, port);
          return { port, isOpen };
        });

        const portResults = await Promise.all(portCheckPromises);
        const openPorts = portResults.filter((r) => r.isOpen).map((r) => r.port);

        if (openPorts.length > 0 || hostname) {
          const existing = store.getByIp(ip);
          const existingServices = existing ? [...existing.services] : [];
          const existingPortSet = new Set(existingServices.map((s) => s.port));

          const newlyFoundServices: ServiceItem[] = [];

          for (const port of openPorts) {
            let title = '';
            if (WEB_PORTS.includes(port)) {
              const detected = await fetchWebTitle(ip, port);
              if (detected) title = detected;
            }

            const defaultName = COMMON_PORTS[port] || `Service on :${port}`;
            const serviceName = title || defaultName;
            const protocol = [443, 8443, 8006, 5001].includes(port) ? 'https' : 'http';

            if (!existingPortSet.has(port)) {
              newlyFoundServices.push({
                id: `svc-auto-${port}-${Date.now()}`,
                name: serviceName,
                port,
                protocol,
                url: `${protocol}://${ip}:${port}`,
                autoDiscovered: true
              });
              activeScanProgress.discoveredServices++;
              activeScanProgress.log.push(`[Discovered] ${ip}:${port} -> "${serviceName}"`);
            }
          }

          // Combine and synchronize services live
          const updatedServices: ServiceItem[] = [];
          const livePortSet = new Set(openPorts);

          // Update existing services that are still live
          for (const s of existingServices) {
            if (livePortSet.has(s.port)) {
              let title = '';
              if (WEB_PORTS.includes(s.port)) {
                const detected = await fetchWebTitle(ip, s.port);
                if (detected) title = detected;
              }
              updatedServices.push({
                ...s,
                name: title || s.name || COMMON_PORTS[s.port] || `Service on :${s.port}`,
                url: s.url || `${s.protocol || 'http'}://${ip}:${s.port}`
              });
            } else if (!s.autoDiscovered) {
              // Keep user-manually created services even if port isn't detected open right now
              updatedServices.push(s);
            }
          }

          // Add newly discovered ports
          const existingPortMap = new Set(updatedServices.map((s) => s.port));
          for (const port of openPorts) {
            if (!existingPortMap.has(port)) {
              let title = '';
              if (WEB_PORTS.includes(port)) {
                const detected = await fetchWebTitle(ip, port);
                if (detected) title = detected;
              }

              const defaultName = COMMON_PORTS[port] || `Service on :${port}`;
              const serviceName = title || defaultName;
              const protocol = [443, 8443, 8006, 5001].includes(port) ? 'https' : 'http';

              updatedServices.push({
                id: `svc-auto-${port}-${Date.now()}`,
                name: serviceName,
                port,
                protocol,
                url: `${protocol}://${ip}:${port}`,
                autoDiscovered: true
              });
              activeScanProgress.discoveredServices++;
              activeScanProgress.log.push(`[Discovered] ${ip}:${port} -> "${serviceName}"`);
            }
          }

          const titlesConcat = updatedServices.map((s) => s.name).join(' ');
          const detectedTypeTag = classifyDeviceType(ip, openPorts, titlesConcat);
          
          let typeTag = existing?.typeTag || 'Unassigned';
          if (typeTag === 'Unassigned' || typeTag === 'Physical Hardware') {
            typeTag = detectedTypeTag;
          } else if (['Gateway / Router', 'Infrastructure', 'Macvlan Container', 'Shared/Host Container'].includes(detectedTypeTag)) {
            typeTag = detectedTypeTag;
          }

          let derivedHost: string | null = null;
          for (const s of updatedServices) {
            if (s.name) {
              const h = deriveHostnameFromTitle(s.name);
              if (h) {
                derivedHost = h;
                break;
              }
            }
          }

          const existingHost = existing?.hostname || '';
          let finalHostname = existingHost;

          if (hostname && !hostname.startsWith('host-')) {
            finalHostname = hostname;
          } else if (derivedHost) {
            finalHostname = derivedHost;
          } else if (!existingHost || existingHost.startsWith('host-')) {
            finalHostname = hostname || `host-${ip.split('.')[3]}`;
          }

          store.update(ip, {
            status: 'Active',
            hostname: finalHostname,
            typeTag,
            services: updatedServices,
            lastSeen: 'Scanned just now'
          });
        } else {
          // IP responded with no open ports and no DNS hostname
          const existing = store.getByIp(ip);
          if (existing && existing.status === 'Active') {
            // Check if all services were auto-discovered
            const hasManualServices = existing.services.some((s) => !s.autoDiscovered);
            if (!hasManualServices && !existing.notes) {
              store.update(ip, {
                status: 'Free',
                hostname: '',
                typeTag: 'Unassigned',
                services: [],
                lastSeen: ''
              });
            }
          }
        }

        activeScanProgress.scannedCount++;
      })
    );
  }

  activeScanProgress.isScanning = false;
  activeScanProgress.log.push(`[Scanner] Scan finished. ${activeScanProgress.discoveredServices} new services auto-discovered.`);
  return activeScanProgress;
}
