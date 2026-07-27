import React, { useState, useEffect, useMemo } from 'react';
import { IPRecord, SubnetStats, ScanProgressState } from './types';
import { Header } from './components/Header';
import { StatsBar } from './components/StatsBar';
import { FilterToolbar } from './components/FilterToolbar';
import { IpTable } from './components/IpTable';
import { EditIpModal } from './components/EditIpModal';
import { Server } from 'lucide-react';

export default function App() {
  const [ipRecords, setIpRecords] = useState<IPRecord[]>([]);
  const [stats, setStats] = useState<SubnetStats>({
    total: 254,
    active: 0,
    free: 254,
    reserved: 0,
    totalServices: 0,
    subnet: '192.168.2.0/24',
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewFilter, setViewFilter] = useState<'all' | 'assigned' | 'active'>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [sortMode, setSortMode] = useState<string>('ip-asc');

  const [scanProgress, setScanProgress] = useState<ScanProgressState>({
    scannedCount: 0,
    total: 254,
    currentIp: '',
    isScanning: false,
    discoveredServices: 0,
    log: [],
  });

  const [editModalRecord, setEditModalRecord] = useState<IPRecord | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);

  // Light / Dark Theme Mode
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('ipam_theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    localStorage.setItem('ipam_theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Fetch IP inventory and statistics
  const fetchData = async () => {
    try {
      const [ipsRes, statsRes] = await Promise.all([
        fetch('/api/ips'),
        fetch('/api/stats'),
      ]);
      if (ipsRes.ok && statsRes.ok) {
        const ipsData = await ipsRes.json();
        const statsData = await statsRes.json();
        setIpRecords(ipsData);
        setStats(statsData);
      }
    } catch (err) {
      console.error('Failed to load IPAM inventory:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Poll scan progress when scan is active
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (scanProgress.isScanning) {
      interval = setInterval(async () => {
        try {
          const res = await fetch('/api/scan/progress');
          if (res.ok) {
            const prog: ScanProgressState = await res.json();
            setScanProgress(prog);
            if (!prog.isScanning) {
              fetchData();
            }
          }
        } catch (e) {
          console.error(e);
        }
      }, 500);
    }
    return () => clearInterval(interval);
  }, [scanProgress.isScanning]);

  const handleStartScan = async () => {
    try {
      setScanProgress((prev) => ({
        ...prev,
        isScanning: true,
        scannedCount: 0,
        discoveredServices: 0,
        log: ['[Scanner] Triggering subnet auto-discovery scan...'],
      }));
      await fetch('/api/scan', { method: 'POST' });
    } catch (err) {
      console.error('Failed to start scan:', err);
      setScanProgress((prev) => ({ ...prev, isScanning: false }));
    }
  };

  const handleClearData = async () => {
    if (window.confirm('Are you sure you want to clear all saved IPAM data? This will reset all IP records, hostnames, notes, and custom services to default factory state.')) {
      try {
        const res = await fetch('/api/clear', { method: 'POST' });
        if (res.ok) {
          alert('All saved IPAM data has been cleared.');
          await fetchData();
        } else {
          alert('Failed to clear data.');
        }
      } catch (err) {
        console.error('Failed to clear data:', err);
        alert('Error clearing data.');
      }
    }
  };

  const handleSaveIpRecord = async (ip: string, updated: Partial<IPRecord>) => {
    try {
      const res = await fetch(`/api/ips/${ip}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to update IP:', err);
    }
  };

  const handleOpenEditModal = (record: IPRecord) => {
    setEditModalRecord(record);
    setIsEditModalOpen(true);
  };

  const handleAddServiceToIp = (ip: string) => {
    const rec = ipRecords.find((r) => r.ip === ip);
    if (rec) {
      handleOpenEditModal(rec);
    }
  };

  const handleSortToggle = (key: string) => {
    if (key === 'ip') {
      setSortMode((prev) => (prev === 'ip-asc' ? 'ip-desc' : 'ip-asc'));
    } else if (key === 'name') {
      setSortMode((prev) => (prev === 'name-asc' ? 'name-desc' : 'name-asc'));
    } else if (key === 'type') {
      setSortMode((prev) => (prev === 'type-asc' || prev === 'type' ? 'type-desc' : 'type-asc'));
    } else if (key === 'ports') {
      setSortMode((prev) => (prev === 'ports-desc' ? 'ports-asc' : 'ports-desc'));
    }
  };

  // Filter & Sort Logic
  const processedRecords = useMemo(() => {
    let filtered = ipRecords.filter((rec) => {
      // 1. View Filter Mode
      if (viewFilter === 'assigned' && rec.status === 'Free') return false;
      if (viewFilter === 'active' && rec.status !== 'Active') return false;

      // 2. Tag Filter
      if (selectedTag !== 'all' && rec.typeTag !== selectedTag) return false;

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchIp = rec.ip.toLowerCase().includes(q);
        const matchHost = (rec.hostname || '').toLowerCase().includes(q);
        const matchMac = (rec.macAddress || '').toLowerCase().includes(q);
        const matchNotes = (rec.notes || '').toLowerCase().includes(q);
        const matchServices = rec.services.some(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            String(s.port).includes(q) ||
            (s.category && s.category.toLowerCase().includes(q))
        );
        return matchIp || matchHost || matchMac || matchNotes || matchServices;
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      const ipA = parseInt(a.ip.split('.').pop() || '0', 10);
      const ipB = parseInt(b.ip.split('.').pop() || '0', 10);

      if (sortMode === 'ip-asc') return ipA - ipB;
      if (sortMode === 'ip-desc') return ipB - ipA;

      if (sortMode === 'name-asc') {
        const nameA = a.hostname || 'zzz';
        const nameB = b.hostname || 'zzz';
        return nameA.localeCompare(nameB);
      }
      if (sortMode === 'name-desc') {
        const nameA = a.hostname || 'zzz';
        const nameB = b.hostname || 'zzz';
        return nameB.localeCompare(nameA);
      }

      if (sortMode === 'type-asc' || sortMode === 'type') {
        const tagA = a.typeTag || 'zzz';
        const tagB = b.typeTag || 'zzz';
        return tagA.localeCompare(tagB);
      }
      if (sortMode === 'type-desc') {
        const tagA = a.typeTag || 'zzz';
        const tagB = b.typeTag || 'zzz';
        return tagB.localeCompare(tagA);
      }

      if (sortMode === 'status') {
        const order: Record<string, number> = { Active: 1, Reserved: 2, Free: 3 };
        return (order[a.status] || 9) - (order[b.status] || 9);
      }
      if (sortMode === 'ports-desc') return b.services.length - a.services.length;
      if (sortMode === 'ports-asc') return a.services.length - b.services.length;

      return ipA - ipB;
    });

    return filtered;
  }, [ipRecords, viewFilter, selectedTag, searchQuery, sortMode]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased flex flex-col overflow-x-hidden">
      {/* HEADER WITH EMBEDDED TOP CONTROLS & EXPORT DROPDOWN */}
      <Header
        subnet={stats.subnet}
        onScan={handleStartScan}
        isScanning={scanProgress.isScanning}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onClearData={handleClearData}
      />

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 overflow-y-auto min-w-0">
        {/* HORIZONTAL STATS BAR */}
        <StatsBar stats={stats} records={ipRecords} />

        {/* COMBINED CONTROL BAR */}
        <FilterToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          viewFilter={viewFilter}
          onViewFilterChange={setViewFilter}
          selectedTag={selectedTag}
          onTagChange={setSelectedTag}
          sortMode={sortMode}
          onSortChange={setSortMode}
          showingCount={processedRecords.length}
        />

        {/* Scanning Banner with Real-Time Progress Bar */}
        {scanProgress.isScanning && (
          <div className="mb-4 p-3.5 bg-slate-900 border border-emerald-500/30 rounded-xl shadow-lg relative overflow-hidden transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <div className="flex items-center space-x-2.5">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-emerald-400 border-t-transparent flex-shrink-0"></div>
                <div>
                  <div className="font-bold text-xs text-white flex items-center space-x-2">
                    <span>Subnet Auto-Discovery Scan Active</span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-mono font-semibold">
                      +{scanProgress.discoveredServices} Discovered
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Probing Target: <span className="font-mono text-emerald-400 font-bold">{scanProgress.currentIp || '192.168.2.1'}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3 text-xs font-mono self-end sm:self-center">
                <span className="text-slate-200 font-bold">
                  {Math.min(100, Math.round((scanProgress.scannedCount / scanProgress.total) * 100))}% ({scanProgress.scannedCount}/{scanProgress.total} IPs)
                </span>
              </div>
            </div>

            {/* Real-Time Progress Bar Track & Fill */}
            <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
              <div
                className="h-full bg-gradient-to-r from-emerald-600 via-teal-400 to-emerald-300 rounded-full transition-all duration-300 shadow-sm"
                style={{
                  width: `${Math.min(100, Math.round((scanProgress.scannedCount / scanProgress.total) * 100))}%`,
                }}
              ></div>
            </div>

            {/* Live Terminal Log Line */}
            {scanProgress.log.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span className="truncate max-w-[85%] text-slate-400 italic">
                  {scanProgress.log[scanProgress.log.length - 1]}
                </span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider hidden sm:inline">
                  Live Feed
                </span>
              </div>
            )}
          </div>
        )}

        {/* HIGH DENSITY IP LIST (TABLE ON DESKTOP, CARDS ON MOBILE) */}
        {processedRecords.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
            <Server className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-300">
              No matching IP records found
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Try clearing your search query or adjusting view filters.
            </p>
          </div>
        ) : (
          <IpTable
            records={processedRecords}
            sortMode={sortMode}
            viewFilter={viewFilter}
            hasSearchQuery={Boolean(searchQuery.trim())}
            onSortToggle={handleSortToggle}
            onEdit={handleOpenEditModal}
            onAddService={handleAddServiceToIp}
          />
        )}
      </main>

      {/* Edit IP Modal */}
      <EditIpModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        record={editModalRecord}
        onSave={handleSaveIpRecord}
      />
    </div>
  );
}
