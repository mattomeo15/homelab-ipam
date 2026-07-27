import React from 'react';
import { Search } from 'lucide-react';

interface FilterToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewFilter: 'all' | 'assigned' | 'active';
  onViewFilterChange: (v: 'all' | 'assigned' | 'active') => void;
  selectedTag: string;
  onTagChange: (tag: string) => void;
  sortMode: string;
  onSortChange: (sort: string) => void;
  showingCount: number;
}

export const FilterToolbar: React.FC<FilterToolbarProps> = ({
  searchQuery,
  onSearchChange,
  viewFilter,
  onViewFilterChange,
  selectedTag,
  onTagChange,
  sortMode,
  onSortChange,
  showingCount,
}) => {
  return (
    <div className="bg-slate-900/90 border border-slate-800 p-1.5 sm:p-2 rounded-lg mb-3 shadow-sm flex flex-col md:flex-row items-stretch md:items-center gap-1.5 justify-between">
      {/* Search Input */}
      <div className="relative flex-1 min-w-[130px]">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search IP, host, port, notes..."
          className="w-full bg-slate-950 text-[11px] text-slate-200 placeholder-slate-500 pl-7 pr-2 py-1 h-7 rounded-md border border-slate-800 focus:outline-none focus:border-emerald-500 transition-colors"
        />
        <Search className="w-3 h-3 absolute left-2 top-2 text-slate-500" />
      </div>

      {/* Select Control Strip */}
      <div className="grid grid-cols-3 md:flex items-center gap-1 sm:gap-1.5 w-full md:w-auto">
        {/* View Mode Filter */}
        <select
          value={viewFilter}
          onChange={(e) => onViewFilterChange(e.target.value as 'all' | 'assigned' | 'active')}
          className="w-full md:w-auto bg-slate-950 text-[11px] text-slate-200 border border-slate-800 rounded-md px-1.5 sm:px-2 py-1 h-7 focus:outline-none focus:border-emerald-500 truncate"
        >
          <option value="all">All IPs</option>
          <option value="assigned">Assigned</option>
          <option value="active">Active</option>
        </select>

        {/* Device Type Filter */}
        <select
          value={selectedTag}
          onChange={(e) => onTagChange(e.target.value)}
          className="w-full md:w-auto bg-slate-950 text-[11px] text-slate-200 border border-slate-800 rounded-md px-1.5 sm:px-2 py-1 h-7 focus:outline-none focus:border-emerald-500 truncate"
        >
          <option value="all">All Types</option>
          <option value="Physical Hardware">Hardware</option>
          <option value="Macvlan Container">Macvlan</option>
          <option value="Shared/Host Container">Shared Host</option>
          <option value="Gateway / Router">Gateway</option>
          <option value="Infrastructure">Infra</option>
        </select>

        {/* Sort Dropdown */}
        <select
          value={sortMode}
          onChange={(e) => onSortChange(e.target.value)}
          className="w-full md:w-auto bg-slate-950 text-[11px] text-slate-200 border border-slate-800 rounded-md px-1.5 sm:px-2 py-1 h-7 focus:outline-none focus:border-emerald-500 truncate"
        >
          <option value="ip-asc">Sort: IP ▲</option>
          <option value="ip-desc">Sort: IP ▼</option>
          <option value="name-asc">Sort: Name (A-Z)</option>
          <option value="name-desc">Sort: Name (Z-A)</option>
          <option value="type-asc">Sort: Type (A-Z)</option>
          <option value="type-desc">Sort: Type (Z-A)</option>
          <option value="status">Sort: Active First</option>
          <option value="ports-desc">Sort: Open Ports</option>
        </select>
      </div>

      {/* Showing Count */}
      <div className="text-[10px] text-slate-500 font-mono hidden xl:block self-center px-1 flex-shrink-0">
        {showingCount} IPs
      </div>
    </div>
  );
};
