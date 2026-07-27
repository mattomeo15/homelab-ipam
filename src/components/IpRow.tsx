import React, { useState } from 'react';
import { IPRecord } from '../types';
import { ServiceCard } from './ServiceCard';
import {
  ChevronDown,
  ChevronRight,
  Edit2,
  Plus,
  Copy,
  Check,
  Globe,
  HardDrive,
  Cpu,
  Layers,
  Router,
  Radio
} from 'lucide-react';

interface IpRowProps {
  record: IPRecord;
  onEdit: (record: IPRecord) => void;
  onAddService: (ip: string) => void;
}

export const IpRow: React.FC<IpRowProps> = ({ record, onEdit, onAddService }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(record.services.length > 0);
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopyIp = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(record.ip);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const statusStyle =
    record.status === 'Active'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      : record.status === 'Reserved'
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
      : 'bg-slate-950 text-slate-500 border-slate-800/80';

  const typeIconMap = {
    'Physical Hardware': <Cpu className="w-3.5 h-3.5 text-blue-400 mr-1" />,
    'Macvlan Container': <Radio className="w-3.5 h-3.5 text-purple-400 mr-1" />,
    'Shared/Host Container': <Layers className="w-3.5 h-3.5 text-emerald-400 mr-1" />,
    'Gateway / Router': <Router className="w-3.5 h-3.5 text-amber-400 mr-1" />,
    Infrastructure: <HardDrive className="w-3.5 h-3.5 text-indigo-400 mr-1" />,
    Unassigned: null,
  };

  return (
    <div
      className={`bg-slate-900 border rounded-2xl transition-all shadow-sm ${
        record.status === 'Active'
          ? 'border-slate-800 hover:border-slate-700'
          : 'border-slate-900/80 opacity-75'
      }`}
    >
      {/* Parent IP Row Header */}
      <div
        onClick={() => record.services.length > 0 && setIsExpanded(!isExpanded)}
        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
      >
        <div className="flex items-center space-x-3.5">
          {record.services.length > 0 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-emerald-400" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          ) : (
            <span className="w-6"></span>
          )}

          <div className="flex items-center space-x-2">
            <span className="font-mono font-bold text-base text-slate-100 tracking-tight">
              {record.ip}
            </span>
            <button
              onClick={handleCopyIp}
              title="Copy IP Address"
              className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <span
            className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${statusStyle}`}
          >
            {record.status}
          </span>

          {record.typeTag && record.typeTag !== 'Unassigned' && (
            <span className="hidden md:inline-flex items-center text-xs px-2.5 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 font-medium">
              {typeIconMap[record.typeTag]}
              {record.typeTag}
            </span>
          )}
        </div>

        {/* Hostname & Badges */}
        <div className="flex items-center justify-between sm:justify-end space-x-3 flex-1">
          <div className="text-right truncate">
            <div className="text-sm font-semibold text-slate-200 truncate">
              {record.hostname || (
                <span className="text-slate-600 font-normal italic text-xs">
                  Unassigned / Free
                </span>
              )}
            </div>
            {record.macAddress && (
              <div className="font-mono text-[10px] text-slate-500 truncate">
                MAC: {record.macAddress}
              </div>
            )}
          </div>

          {/* Service badges summary when collapsed */}
          {!isExpanded && record.services.length > 0 && (
            <div className="hidden lg:flex items-center space-x-1">
              {record.services.slice(0, 3).map((s) => (
                <span
                  key={s.id}
                  className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-semibold"
                >
                  :{s.port} {s.name.slice(0, 12)}
                </span>
              ))}
              {record.services.length > 3 && (
                <span className="text-[10px] text-slate-500 px-1">
                  +{record.services.length - 3} more
                </span>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onAddService(record.ip)}
              className="p-1.5 text-slate-400 hover:text-emerald-400 bg-slate-950 hover:bg-slate-800 rounded-lg border border-slate-800 transition-colors"
              title="Add Nested Service / App Port"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onEdit(record)}
              className="px-2.5 py-1 text-xs bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 transition-colors flex items-center space-x-1"
            >
              <Edit2 className="w-3 h-3" />
              <span>Edit</span>
            </button>
          </div>
        </div>
      </div>

      {record.notes && (
        <div className="px-4 pb-3 -mt-1 text-xs text-slate-400 pl-12 border-b border-slate-800/40">
          {record.notes}
        </div>
      )}

      {/* Expanded Child Services Grid (Option A Layout) */}
      {isExpanded && record.services.length > 0 && (
        <div className="px-4 pb-4 pt-3 border-t border-slate-800/80 bg-slate-950/40 rounded-b-2xl">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Hosted Services & App Ports ({record.services.length})
            </span>
            <button
              onClick={() => onAddService(record.ip)}
              className="text-[11px] text-emerald-400 hover:underline font-medium"
            >
              + Add Port / Web UI
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {record.services.map((svc) => (
              <ServiceCard key={svc.id} ip={record.ip} service={svc} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
