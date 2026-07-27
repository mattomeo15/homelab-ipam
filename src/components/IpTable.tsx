import React, { useState, useMemo } from 'react';
import { IPRecord } from '../types';
import { ChevronDown, ChevronRight, ExternalLink, Copy, Check } from 'lucide-react';

interface IpTableProps {
  records: IPRecord[];
  sortMode: string;
  viewFilter: 'all' | 'assigned' | 'active';
  hasSearchQuery: boolean;
  onSortToggle: (key: string) => void;
  onEdit: (record: IPRecord) => void;
  onAddService: (ip: string) => void;
}

const isWebPort = (port: number, protocol?: string): boolean => {
  if (protocol === 'http' || protocol === 'https') return true;
  const webPorts = [80, 443, 8080, 8443, 9000, 3000, 8123, 5000, 9090, 8000, 9443, 7860, 8888, 3001, 8081];
  return webPorts.includes(port);
};

export const IpTable: React.FC<IpTableProps> = ({
  records,
  sortMode,
  viewFilter,
  hasSearchQuery,
  onSortToggle,
  onEdit,
  onAddService,
}) => {
  const [expandedIps, setExpandedIps] = useState<Set<string>>(new Set());
  const [expandedRanges, setExpandedRanges] = useState<Set<string>>(new Set());
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  const toggleExpandIp = (ip: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedIps((prev) => {
      const next = new Set(prev);
      if (next.has(ip)) next.delete(ip);
      else next.add(ip);
      return next;
    });
  };

  const toggleExpandRange = (rangeKey: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedRanges((prev) => {
      const next = new Set(prev);
      if (next.has(rangeKey)) next.delete(rangeKey);
      else next.add(rangeKey);
      return next;
    });
  };

  const handleCopy = (ip: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 1500);
  };

  const getTypeStyle = (typeTag?: string) => {
    switch (typeTag) {
      case 'Physical Hardware':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'Macvlan Container':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'Shared/Host Container':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'Gateway / Router':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      default:
        return 'bg-slate-950 text-slate-500 border-slate-800';
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
      case 'Reserved':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/30';
      default:
        return 'bg-slate-950 text-slate-500 border border-slate-800';
    }
  };

  // Range grouping for contiguous free IPs
  const displayItems = useMemo(() => {
    const isIpSort = sortMode === 'ip-asc' || sortMode === 'ip-desc';
    if (viewFilter !== 'all' || !isIpSort || hasSearchQuery) {
      return records.map((r) => ({ type: 'single' as const, record: r }));
    }

    const items: Array<
      | { type: 'single'; record: IPRecord }
      | {
          type: 'range-collapsed';
          rangeKey: string;
          startIp: string;
          endIp: string;
          count: number;
          firstRecord: IPRecord;
        }
      | {
          type: 'range-header';
          rangeKey: string;
          startIp: string;
          endIp: string;
          count: number;
        }
    > = [];

    let i = 0;
    while (i < records.length) {
      const current = records[i];
      if (current.status === 'Free') {
        let j = i;
        while (j + 1 < records.length && records[j + 1].status === 'Free') {
          const ipCurr = parseInt(records[j].ip.split('.').pop() || '0', 10);
          const ipNext = parseInt(records[j + 1].ip.split('.').pop() || '0', 10);
          if (Math.abs(ipNext - ipCurr) === 1) {
            j++;
          } else {
            break;
          }
        }

        if (j > i) {
          const rangeKey = `${records[i].ip}-${records[j].ip}`;
          const rangeRecords = records.slice(i, j + 1);

          if (expandedRanges.has(rangeKey)) {
            items.push({
              type: 'range-header',
              rangeKey,
              startIp: records[i].ip,
              endIp: records[j].ip,
              count: rangeRecords.length,
            });
            rangeRecords.forEach((r) => items.push({ type: 'single', record: r }));
          } else {
            items.push({
              type: 'range-collapsed',
              rangeKey,
              startIp: records[i].ip,
              endIp: records[j].ip,
              count: rangeRecords.length,
              firstRecord: records[i],
            });
          }
          i = j + 1;
          continue;
        }
      }
      items.push({ type: 'single', record: current });
      i++;
    }

    return items;
  }, [records, sortMode, viewFilter, hasSearchQuery, expandedRanges]);

  return (
    <div className="w-full overflow-x-hidden">
      {/* --- DESKTOP TABLE VIEW (width > 768px) --- */}
      <div className="hidden md:block bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/90 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px] select-none">
                <th
                  className="py-2.5 px-3 w-40 cursor-pointer hover:text-white transition-colors"
                  onClick={() => onSortToggle('ip')}
                >
                  <div className="flex items-center space-x-1">
                    <span>IP Address</span>
                    <span
                      className={`text-[10px] font-mono ${
                        sortMode.startsWith('ip')
                          ? 'text-emerald-400 font-bold'
                          : 'text-slate-500'
                      }`}
                    >
                      {sortMode === 'ip-asc'
                        ? '▲'
                        : sortMode === 'ip-desc'
                        ? '▼'
                        : '▲▼'}
                    </span>
                  </div>
                </th>
                <th
                  className="py-2.5 px-3 cursor-pointer hover:text-white transition-colors"
                  onClick={() => onSortToggle('name')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Device / Host Name</span>
                    <span
                      className={`text-[10px] font-mono ${
                        sortMode.startsWith('name')
                          ? 'text-emerald-400 font-bold'
                          : 'text-slate-500'
                      }`}
                    >
                      {sortMode === 'name-asc'
                        ? '▲'
                        : sortMode === 'name-desc'
                        ? '▼'
                        : '▲▼'}
                    </span>
                  </div>
                </th>
                <th
                  className="py-2.5 px-3 w-40 cursor-pointer hover:text-white transition-colors"
                  onClick={() => onSortToggle('type')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Type Badge</span>
                    <span
                      className={`text-[10px] font-mono ${
                        sortMode.startsWith('type') || sortMode === 'type'
                          ? 'text-emerald-400 font-bold'
                          : 'text-slate-500'
                      }`}
                    >
                      {sortMode === 'type-asc' || sortMode === 'type'
                        ? '▲'
                        : sortMode === 'type-desc'
                        ? '▼'
                        : '▲▼'}
                    </span>
                  </div>
                </th>
                <th
                  className="py-2.5 px-3 cursor-pointer hover:text-white transition-colors"
                  onClick={() => onSortToggle('ports')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Port Summary Badges</span>
                    <span
                      className={`text-[10px] font-mono ${
                        sortMode.startsWith('ports')
                          ? 'text-emerald-400 font-bold'
                          : 'text-slate-500'
                      }`}
                    >
                      {sortMode === 'ports-desc'
                        ? '▼'
                        : sortMode === 'ports-asc'
                        ? '▲'
                        : '▲▼'}
                    </span>
                  </div>
                </th>
                <th className="py-2.5 px-3 w-28 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {displayItems.map((item) => {
                if (item.type === 'range-collapsed') {
                  return (
                    <tr
                      key={item.rangeKey}
                      onClick={(e) => toggleExpandRange(item.rangeKey, e)}
                      className="h-9 border-b border-slate-800/50 bg-slate-950/30 hover:bg-slate-800/30 transition-colors select-none cursor-pointer"
                    >
                      <td className="py-1.5 px-3 font-mono font-bold text-slate-400 whitespace-nowrap opacity-60">
                        <div className="flex items-center space-x-1.5">
                          <ChevronRight className="w-3.5 h-3.5 inline text-slate-500" />
                          <span>
                            {item.startIp} – {item.endIp}
                          </span>
                        </div>
                      </td>
                      <td className="py-1.5 px-3 font-medium text-slate-500 italic">
                        Unassigned Range ({item.count} IPs)
                      </td>
                      <td className="py-1.5 px-3 whitespace-nowrap opacity-50">
                        <span className="text-[10px] px-2 py-0.5 rounded border border-slate-800 text-slate-500 font-medium">
                          Unassigned
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-slate-600 italic text-[11px]">-</td>
                      <td
                        className="py-1.5 px-3 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => onEdit(item.firstRecord)}
                          className="opacity-100 text-[10px] px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded font-medium shadow-sm transition-colors"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                }

                if (item.type === 'range-header') {
                  return (
                    <tr
                      key={`hdr-${item.rangeKey}`}
                      onClick={(e) => toggleExpandRange(item.rangeKey, e)}
                      className="h-8 border-b border-slate-800/80 bg-slate-900/90 text-slate-400 select-none cursor-pointer"
                    >
                      <td colSpan={5} className="py-1 px-3 text-[11px] font-semibold text-emerald-400">
                        <div className="flex items-center space-x-2">
                          <ChevronDown className="w-3.5 h-3.5 inline" />
                          <span>
                            Expanded Range: {item.startIp} – {item.endIp} ({item.count} Unassigned IPs)
                          </span>
                          <span className="text-[10px] text-slate-500">(Click to collapse)</span>
                        </div>
                      </td>
                    </tr>
                  );
                }

                const r = item.record;
                const isFree = r.status === 'Free';
                const hasServices = r.services && r.services.length > 0;
                const isExpanded = expandedIps.has(r.ip);

                return (
                  <React.Fragment key={r.ip}>
                    <tr
                      onClick={(e) => hasServices && toggleExpandIp(r.ip, e)}
                      className={`h-9 border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors select-none ${
                        isFree ? 'opacity-40 hover:opacity-100 bg-slate-950/40' : 'bg-slate-900/60'
                      } ${hasServices ? 'cursor-pointer' : ''}`}
                    >
                      <td className="py-1.5 px-3 font-mono font-bold text-slate-100 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          {hasServices ? (
                            <span className="text-emerald-400 font-bold text-xs">
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 inline" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 inline" />
                              )}
                            </span>
                          ) : (
                            <span className="w-3.5"></span>
                          )}
                          <span className="tracking-tight">{r.ip}</span>
                          <button
                            onClick={(e) => handleCopy(r.ip, e)}
                            title="Copy IP"
                            className="opacity-0 hover:opacity-100 focus:opacity-100 text-slate-500 hover:text-slate-300 ml-1 transition-opacity"
                          >
                            {copiedIp === r.ip ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="py-1.5 px-3 font-medium text-slate-200 truncate max-w-[200px]">
                        {r.hostname ? (
                          <span>{r.hostname}</span>
                        ) : (
                          <span className="text-slate-600 font-normal italic">Unassigned</span>
                        )}
                      </td>

                      <td className="py-1.5 px-3 whitespace-nowrap">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded border font-medium ${getTypeStyle(
                            r.typeTag
                          )}`}
                        >
                          {r.typeTag || 'Unassigned'}
                        </span>
                      </td>

                      <td className="py-1.5 px-3">
                        {hasServices ? (
                          <div className="flex flex-wrap items-center gap-1">
                            {r.services.map((s) => {
                              const isWeb = isWebPort(s.port, s.protocol);
                              return (
                                <a
                                  key={s.id || s.port}
                                  href={s.url || `http://${r.ip}:${s.port}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  title={`${s.name} (${s.protocol || 'http'})`}
                                  className={`inline-flex items-center font-mono font-bold text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                    isWeb
                                      ? 'bg-cyan-950/90 text-cyan-300 border-cyan-800/80 hover:border-cyan-400'
                                      : 'bg-slate-800/90 text-slate-400 border-slate-700 hover:border-slate-500'
                                  }`}
                                >
                                  <span>:{s.port}</span>
                                </a>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-slate-600 italic text-[11px]">-</span>
                        )}
                      </td>

                      <td
                        className="py-1.5 px-3 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => onEdit(r)}
                          className="text-[10px] px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded font-medium shadow-sm transition-colors"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>

                    {/* DESKTOP SUB-LIST TABLE */}
                    {isExpanded && hasServices && (
                      <tr className="bg-slate-950/90 border-b border-slate-800">
                        <td colSpan={5} className="p-3 pl-8">
                          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
                              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                                Child Hosted Services ({r.services.length})
                              </span>
                              {r.notes && (
                                <span className="text-xs text-slate-400 italic">{r.notes}</span>
                              )}
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="bg-slate-950/80 text-slate-400 text-[10px] font-semibold uppercase tracking-wider border-b border-slate-800">
                                    <th className="py-1.5 px-3">Service / App Name</th>
                                    <th className="py-1.5 px-3">Internal Container / Bridge IP</th>
                                    <th className="py-1.5 px-3">Port & Protocol</th>
                                    <th className="py-1.5 px-3 text-right">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/60">
                                  {r.services.map((s) => {
                                    const isWeb = isWebPort(s.port, s.protocol);
                                    const containerIp = s.containerIp || `${r.ip}:${s.port}`;
                                    const targetUrl = s.url || `http://${r.ip}:${s.port}`;

                                    return (
                                      <tr key={s.id || s.port} className="hover:bg-slate-900/80">
                                        <td className="py-1.5 px-3 font-semibold text-slate-200">
                                          {s.name}
                                        </td>
                                        <td className="py-1.5 px-3 font-mono text-[11px] text-slate-400">
                                          {containerIp}
                                        </td>
                                        <td className="py-1.5 px-3 font-mono text-[11px]">
                                          <span
                                            className={
                                              isWeb ? 'text-cyan-400 font-bold' : 'text-slate-400'
                                            }
                                          >
                                            :{s.port}
                                          </span>
                                          <span className="text-slate-500 text-[10px] ml-1">
                                            ({s.protocol || 'http'})
                                          </span>
                                        </td>
                                        <td className="py-1.5 px-3 text-right">
                                          <a
                                            href={targetUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-medium transition-colors shadow-sm"
                                          >
                                            <span>Open App</span>
                                            <ExternalLink className="w-3 h-3 ml-0.5 inline" />
                                          </a>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- MOBILE STACKED CARDS VIEW (width <= 768px) --- */}
      <div className="block md:hidden space-y-2.5">
        {displayItems.map((item) => {
          if (item.type === 'range-collapsed') {
            return (
              <div
                key={item.rangeKey}
                onClick={(e) => toggleExpandRange(item.rangeKey, e)}
                className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 shadow-sm cursor-pointer hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-1.5 font-mono text-xs font-bold text-slate-400">
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      {item.startIp} – {item.endIp}
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded border border-slate-800 text-slate-500 font-medium">
                    Unassigned
                  </span>
                </div>
                <div className="text-xs text-slate-500 italic mb-2">
                  Unassigned Range ({item.count} IPs)
                </div>
                <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onEdit(item.firstRecord)}
                    className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-medium shadow-sm transition-colors"
                  >
                    Edit
                  </button>
                </div>
              </div>
            );
          }

          if (item.type === 'range-header') {
            return (
              <div
                key={`m-hdr-${item.rangeKey}`}
                onClick={(e) => toggleExpandRange(item.rangeKey, e)}
                className="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-2.5 text-xs text-emerald-400 cursor-pointer flex items-center justify-between"
              >
                <span>
                  ▼ Range: {item.startIp} – {item.endIp} ({item.count} IPs)
                </span>
                <span className="text-[10px] text-slate-500">(Tap to collapse)</span>
              </div>
            );
          }

          const r = item.record;
          const isFree = r.status === 'Free';
          const hasServices = r.services && r.services.length > 0;
          const isExpanded = expandedIps.has(r.ip);

          return (
            <div
              key={`m-${r.ip}`}
              onClick={(e) => hasServices && toggleExpandIp(r.ip, e)}
              className={`bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-md space-y-2.5 text-xs select-none ${
                isFree ? 'opacity-60 hover:opacity-100 bg-slate-950/40' : ''
              } ${hasServices ? 'cursor-pointer hover:border-slate-700' : ''}`}
            >
              {/* Top Row: IP Address & Type Badge */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-1.5">
                  {hasServices && (
                    <span className="text-emerald-400 font-bold text-xs">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 inline" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 inline" />
                      )}
                    </span>
                  )}
                  <span className="font-mono font-bold text-sm text-slate-100">{r.ip}</span>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded border font-medium flex-shrink-0 ${getTypeStyle(
                    r.typeTag
                  )}`}
                >
                  {r.typeTag || 'Unassigned'}
                </span>
              </div>

              {/* Middle Row: Hostname & Status */}
              <div className="flex items-center justify-between gap-2 border-t border-slate-800/60 pt-2">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Hostname
                  </span>
                  <span className="font-semibold text-slate-200 break-all">
                    {r.hostname ? r.hostname : <span className="text-slate-600 italic font-normal">Unassigned</span>}
                  </span>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${getStatusStyle(r.status)}`}>
                    {r.status}
                  </span>
                </div>
              </div>

              {/* Bottom Row: Ports & Action */}
              <div className="border-t border-slate-800/60 pt-2 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-0.5">
                    Ports
                  </span>
                  {hasServices ? (
                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      {r.services.map((s) => {
                        const isWeb = isWebPort(s.port, s.protocol);
                        return (
                          <a
                            key={`m-p-${s.id || s.port}`}
                            href={s.url || `http://${r.ip}:${s.port}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className={`inline-flex items-center font-mono font-bold text-[10px] px-1.5 py-0.5 rounded border ${
                              isWeb
                                ? 'bg-cyan-950/90 text-cyan-300 border-cyan-800/80'
                                : 'bg-slate-800/90 text-slate-400 border-slate-700'
                            }`}
                          >
                            :{s.port}
                          </a>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-slate-600 italic text-xs">No open ports</span>
                  )}
                </div>

                <div className="flex-shrink-0 self-end" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onEdit(r)}
                    className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium rounded-lg shadow-sm transition-colors"
                  >
                    Edit
                  </button>
                </div>
              </div>

              {/* Mobile Expanded Child Services */}
              {isExpanded && hasServices && (
                <div
                  className="mt-3 pt-2.5 border-t border-slate-800 bg-slate-950/80 rounded-lg p-2.5 space-y-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-400 border-b border-slate-800 pb-1.5">
                    <span>Hosted Services ({r.services.length})</span>
                    {r.notes && (
                      <span className="text-[10px] text-slate-400 italic truncate max-w-[150px]">
                        {r.notes}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 pt-1">
                    {r.services.map((s) => {
                      const isWeb = isWebPort(s.port, s.protocol);
                      const targetUrl = s.url || `http://${r.ip}:${s.port}`;

                      return (
                        <div
                          key={`m-svc-${s.id || s.port}`}
                          className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-200 text-xs">{s.name}</span>
                            <span
                              className={`font-mono text-xs ${
                                isWeb ? 'text-cyan-400 font-bold' : 'text-slate-400'
                              }`}
                            >
                              :{s.port}{' '}
                              <span className="text-[10px] text-slate-500">
                                ({s.protocol || 'http'})
                              </span>
                            </span>
                          </div>
                          <a
                            href={targetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors min-h-[44px]"
                          >
                            <span>Open App</span>
                            <ExternalLink className="w-3.5 h-3.5 ml-0.5" />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
