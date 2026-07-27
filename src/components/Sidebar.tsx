import React from 'react';
import { SubnetStats } from '../types';
import { Network, Code2 } from 'lucide-react';

interface SidebarProps {
  stats: SubnetStats;
  viewFilter: 'all' | 'assigned' | 'active';
  onViewFilterChange: (mode: 'all' | 'assigned' | 'active') => void;
  selectedTag: string;
  onTagChange: (tag: string) => void;
  sortMode: string;
  onSortChange: (sort: string) => void;
  onOpenDockerModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  stats,
  viewFilter,
  onViewFilterChange,
  selectedTag,
  onTagChange,
  sortMode,
  onSortChange,
  onOpenDockerModal,
}) => {
  const assignedCount = stats.active + stats.reserved;

  return (
    <aside className="w-full md:w-64 bg-slate-900/90 border-r border-slate-800/90 flex-shrink-0 flex flex-col justify-between p-4 border-b md:border-b-0">
      <div>
        {/* Header / Branding */}
        <div className="flex items-center space-x-2.5 pb-4 mb-4 border-b border-slate-800">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white leading-tight">HOMELAB IPAM</h1>
            <p className="text-[10px] text-emerald-400 font-mono font-semibold">{stats.subnet}</p>
          </div>
        </div>

        {/* Inline Compact Stats Pills */}
        <div className="mb-5 space-y-1.5 text-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Subnet Metrics</div>
          <div className="flex justify-between items-center bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
            <span className="text-slate-400">Active Hosts</span>
            <span className="font-bold font-mono text-emerald-400">{stats.active}</span>
          </div>
          <div className="flex justify-between items-center bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
            <span className="text-slate-400">Available IPs</span>
            <span className="font-bold font-mono text-slate-300">{stats.free}</span>
          </div>
          <div className="flex justify-between items-center bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
            <span className="text-slate-400">Reserved IPs</span>
            <span className="font-bold font-mono text-amber-400">{stats.reserved}</span>
          </div>
          <div className="flex justify-between items-center bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
            <span className="text-slate-400">Services/Ports</span>
            <span className="font-bold font-mono text-indigo-400">{stats.totalServices}</span>
          </div>
        </div>

        {/* View Filter Modes */}
        <div className="mb-5">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">View Mode</div>
          <div className="space-y-1">
            <button
              onClick={() => onViewFilterChange('all')}
              className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg font-medium border transition-colors flex items-center justify-between ${
                viewFilter === 'all'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span>All IPs (254)</span>
              <span className="text-[10px] opacity-80">254</span>
            </button>
            <button
              onClick={() => onViewFilterChange('assigned')}
              className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg font-medium border transition-colors flex items-center justify-between ${
                viewFilter === 'assigned'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span>Assigned Only</span>
              <span className="text-[10px] opacity-80">{assignedCount}</span>
            </button>
            <button
              onClick={() => onViewFilterChange('active')}
              className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg font-medium border transition-colors flex items-center justify-between ${
                viewFilter === 'active'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span>Active / Online</span>
              <span className="text-[10px] opacity-80">{stats.active}</span>
            </button>
          </div>
        </div>

        {/* Filter by Device Type */}
        <div className="mb-5">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Filter By Type</div>
          <select
            value={selectedTag}
            onChange={(e) => onTagChange(e.target.value)}
            className="w-full bg-slate-950 text-xs text-slate-300 border border-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Device Types</option>
            <option value="Physical Hardware">Physical Hardware</option>
            <option value="Macvlan Container">Macvlan Container</option>
            <option value="Shared/Host Container">Shared/Host Container</option>
            <option value="Gateway / Router">Gateway / Router</option>
            <option value="Infrastructure">Infrastructure</option>
          </select>
        </div>

        {/* Sorting Options */}
        <div>
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Sorting</div>
          <select
            value={sortMode}
            onChange={(e) => onSortChange(e.target.value)}
            className="w-full bg-slate-950 text-xs text-slate-300 border border-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="ip-asc">IP Address (1 → 254)</option>
            <option value="ip-desc">IP Address (254 → 1)</option>
            <option value="name-asc">Device Name (A-Z)</option>
            <option value="status">Status (Active First)</option>
            <option value="ports-desc">Most Open Ports</option>
            <option value="type">Device Type</option>
          </select>
        </div>
      </div>

      {/* Sidebar Footer Actions */}
      <div className="pt-4 mt-6 border-t border-slate-800 space-y-2">
        <button
          onClick={onOpenDockerModal}
          className="w-full text-center text-[11px] bg-slate-950 hover:bg-slate-800 text-slate-300 py-1.5 px-2 rounded border border-slate-800 transition-colors flex items-center justify-center space-x-1.5"
        >
          <Code2 className="w-3.5 h-3.5 text-indigo-400" />
          <span>Docker Stack & Code</span>
        </button>

        {/* Export Buttons */}
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <a
            href="/api/export/md"
            download
            className="text-center text-[11px] bg-slate-950 hover:bg-slate-800 text-slate-300 py-1.5 px-2 rounded border border-slate-800 transition-colors"
          >
            Markdown
          </a>
          <a
            href="/api/export/txt"
            download
            className="text-center text-[11px] bg-slate-950 hover:bg-slate-800 text-slate-300 py-1.5 px-2 rounded border border-slate-800 transition-colors"
          >
            Text Log
          </a>
        </div>
      </div>
    </aside>
  );
};
