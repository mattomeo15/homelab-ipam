import net from 'net';
import dns from 'dns';
import http from 'http';
import https from 'https';
import { store, IPRecord, ServiceItem } from './ipam-store';

const COMMON_PORTS: Record<number, string> = {
  21: 'FTP Service',
  22: 'SSH Shell',
  53: 'DNS Resolver',
  80: 'HTTP Web UI',
  81: 'Nginx Proxy Manager',
  135: 'RPC Endpoint',
  139: 'NetBIOS Session',
  443: 'HTTPS Web UI',
  445: 'SMB / Windows Share',
  1900: 'UPnP / SSDP',
  3000: 'Grafana / Web App',
  3001: 'Uptime Kuma',
  3389: 'RDP Remote Desktop',
  5000: 'Docker Registry / Web UI',
  5001: 'Synology DSM / QNAP',
  5353: 'mDNS / Bonjour',
  5800: 'VNC Web UI',
  5900: 'VNC Display',
  6789: 'NZBGet',
  7000: 'AirPlay Service',
  7860: 'AI Web UI',
  7878: 'Radarr',
  8000: 'Web Service',
  8006: 'Proxmox VE Web UI',
  8008: 'Google Cast / Matrix',
  8009: 'Google Cast',
  8080: 'Web UI / Traefik / QNAP',
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
  22300: 'IP-Freely App',
  32400: 'Plex Media Server',
  62078: 'Apple Mobile Device Sync'
};

const WEB_PORTS = [80, 81, 443, 3000, 3001, 5000, 5001, 5800, 7860, 7878, 8000, 8006, 8008, 8080, 8081, 8096, 8123, 8443, 8888, 8989, 9000, 9090, 9091, 9696, 22300, 32400];

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
          'User-Agent': 'IP-Freely-Scanner/1.0 (Mozilla/5.0)'
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

const TITLE_BLACKLIST = [
  'login',
  'sign in',
  'unauthorized',
  '400 bad request',
  '401 unauthorized',
  'dashboard',
  'home',
  'web ui'
];

export function isBlacklistedTitle(title: string): boolean {
  if (!title) return true;
  const tLower = title.toLowerCase().trim();
  if (tLower.includes('home assistant') || tLower.includes('homeassistant')) {
    return false;
  }
  return TITLE_BLACKLIST.some((term) => tLower.includes(term));
}

export function isContainerId(hostname: string): boolean {
  if (!hostname) return false;
  return /^[a-f0-9]{12}$/i.test(hostname.trim());
}

export function stripHostnameSuffixes(hostname: string): string {
  if (!hostname) return '';
  let curr = hostname.trim();
  let prev = '';
  while (curr !== prev) {
    prev = curr;
    curr = curr.replace(/(-|_)?(macvlan|docker|container|app)$/i, '');
  }
  return curr;
}

export function sanitizeHostname(hostname: string, isGuess = false): string | null {
  if (!hostname) return null;

  // 2. CONTAINER ID DETECTION
  if (isContainerId(hostname)) {
    return null;
  }

  // 3. SUFFIX STRIPPING
  let clean = stripHostnameSuffixes(hostname);
  if (!clean) return null;

  if (isContainerId(clean)) {
    return null;
  }

  // 4. CONFIDENCE FLAG (?)
  if (isGuess && !clean.endsWith('?')) {
    clean = `${clean}?`;
  }

  return clean;
}

export function deriveHostnameFromTitle(title: string, openPorts: number[] = []): { name: string; isGuess: boolean } | null {
  // 1. TITLE BLACKLIST FILTER
  let validTitle: string | null = null;
  if (title && !isBlacklistedTitle(title)) {
    validTitle = title.trim();
  }

  if (validTitle) {
    const tLower = validTitle.toLowerCase();
    if (tLower.includes('home assistant') || tLower.includes('homeassistant')) return { name: 'homeassistant', isGuess: false };
    if (tLower.includes('qnap') || tLower.includes('qts')) return { name: 'qnap-nas', isGuess: false };
    if (tLower.includes('bauhn') || tLower.includes('android tv') || tLower.includes('google tv') || tLower.includes('smarttv')) return { name: 'bauhn-android-tv', isGuess: false };
    if (tLower.includes('proxmox') || tLower.includes('pve')) {
      const match = validTitle.match(/([\w-]+)\s*-\s*proxmox/i);
      if (match && match[1]?.trim()) return { name: match[1].trim().toLowerCase(), isGuess: false };
      return { name: 'proxmox-pve', isGuess: false };
    }
    if (tLower.includes('opnsense')) {
      const match = validTitle.match(/([\w.-]+)\s*-\s*opnsense/i);
      if (match && match[1]?.trim()) return { name: match[1].trim().toLowerCase(), isGuess: false };
      return { name: 'opnsense-gateway', isGuess: false };
    }
    if (tLower.includes('pfsense')) return { name: 'pfsense-gateway', isGuess: false };
    if (tLower.includes('pi-hole') || tLower.includes('pihole')) return { name: 'pihole-dns', isGuess: false };
    if (tLower.includes('portainer')) return { name: 'docker-portainer', isGuess: false };
    if (tLower.includes('truenas') || tLower.includes('freenas')) return { name: 'truenas-storage', isGuess: false };
    if (tLower.includes('synology') || tLower.includes('dsm')) return { name: 'synology-nas', isGuess: false };
    if (tLower.includes('unifi')) return { name: 'unifi-controller', isGuess: false };
    if (tLower.includes('jellyfin')) return { name: 'jellyfin-media', isGuess: false };
    if (tLower.includes('plex')) return { name: 'plex-server', isGuess: false };
    if (tLower.includes('uptime kuma')) return { name: 'uptime-kuma', isGuess: false };
    if (tLower.includes('grafana')) return { name: 'grafana-app', isGuess: false };
    if (tLower.includes('nginx proxy manager')) return { name: 'npm-proxy-host', isGuess: false };

    const clean = validTitle.replace(/[^a-zA-Z0-9\s-]/g, '').trim().toLowerCase().replace(/\s+/g, '-');
    if (clean.length >= 2 && clean.length <= 30) {
      return { name: clean, isGuess: false };
    }
  }

  // 2. PORT SIGNATURE GUESS
  if (openPorts.includes(8123)) return { name: 'Home Assistant', isGuess: true };
  if (openPorts.includes(8006)) return { name: 'Proxmox VE', isGuess: true };
  if (openPorts.includes(5001)) return { name: 'Synology NAS', isGuess: true };
  if (openPorts.includes(32400)) return { name: 'Plex Media Server', isGuess: true };
  if (openPorts.includes(8096)) return { name: 'Jellyfin', isGuess: true };
  if (openPorts.includes(7878)) return { name: 'Radarr', isGuess: true };
  if (openPorts.includes(8989)) return { name: 'Sonarr', isGuess: true };
  if (openPorts.includes(9696)) return { name: 'Prowlarr', isGuess: true };
  if (openPorts.includes(3001)) return { name: 'Uptime Kuma', isGuess: true };
  if (openPorts.includes(9000)) return { name: 'Portainer', isGuess: true };

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

          let derivedResult = deriveHostnameFromTitle('', openPorts);
          if (!derivedResult) {
            for (const s of updatedServices) {
              if (s.name) {
                const res = deriveHostnameFromTitle(s.name, openPorts);
                if (res) {
                  derivedResult = res;
                  break;
                }
              }
            }
          }

          let derivedHost: string | null = null;
          if (derivedResult) {
            derivedHost = sanitizeHostname(derivedResult.name, derivedResult.isGuess);
          }

          const existingHost = existing?.hostname || '';
          let finalHostname = '';

          if (existingHost && !existingHost.startsWith('host-') && !isContainerId(existingHost)) {
            finalHostname = sanitizeHostname(existingHost, false) || existingHost;
          } else if (derivedHost) {
            finalHostname = derivedHost;
          } else if (hostname && !hostname.startsWith('host-')) {
            finalHostname = sanitizeHostname(hostname, false) || `host-${ip.split('.')[3]}`;
          } else {
            finalHostname = `host-${ip.split('.')[3]}`;
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
