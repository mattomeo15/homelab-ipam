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

export interface SubnetStats {
  total: number;
  active: number;
  free: number;
  reserved: number;
  totalServices: number;
  subnet: string;
  lastScanTime?: string;
}

export interface ScanProgressState {
  scannedCount: number;
  total: number;
  currentIp: string;
  isScanning: boolean;
  discoveredServices: number;
  log: string[];
}

export interface DockerFileItem {
  name: string;
  content: string;
}
