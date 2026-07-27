import React from 'react';
import { ScanProgressState } from '../types';
import { RefreshCw, CheckCircle, Terminal, Sparkles, X } from 'lucide-react';

interface ScanProgressModalProps {
  progress: ScanProgressState;
  onClose: () => void;
}

export const ScanProgressModal: React.FC<ScanProgressModalProps> = ({
  progress,
  onClose,
}) => {
  if (!progress.isScanning && progress.scannedCount === 0) return null;

  const percentage = Math.min(
    100,
    Math.round((progress.scannedCount / progress.total) * 100)
  );

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl relative overflow-hidden">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <RefreshCw
                className={`w-6 h-6 ${progress.isScanning ? 'animate-spin' : ''}`}
              />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {progress.isScanning
                  ? 'Subnet Auto-Discovery in Progress'
                  : 'Subnet Scan Complete!'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Probing 192.168.2.1 – .254 for reverse DNS, open ports, & Web UI titles.
              </p>
            </div>
          </div>
          {!progress.isScanning && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-slate-400">
              Probing: <span className="text-emerald-400 font-bold">{progress.currentIp || '192.168.2.254'}</span>
            </span>
            <span className="text-slate-200 font-bold">{percentage}% ({progress.scannedCount}/254)</span>
          </div>

          <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-teal-400 rounded-full transition-all duration-300"
              style={{ width: `${percentage}%` }}
            ></div>
          </div>
        </div>

        {/* Discovered Counter Banner */}
        <div className="mb-4 p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400 flex items-center">
            <Sparkles className="w-4 h-4 text-emerald-400 mr-1.5" />
            Auto-Discovered Services:
          </span>
          <span className="font-bold text-emerald-400 font-mono text-sm">
            +{progress.discoveredServices}
          </span>
        </div>

        {/* Live Scanner Log Terminal */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] h-40 overflow-y-auto space-y-1 text-slate-300">
          <div className="text-slate-500 flex items-center mb-1">
            <Terminal className="w-3 h-3 mr-1" />
            <span>Scanner Log Terminal:</span>
          </div>
          {progress.log.map((line, idx) => (
            <div
              key={idx}
              className={
                line.includes('Discovered')
                  ? 'text-emerald-400 font-semibold'
                  : 'text-slate-400'
              }
            >
              {line}
            </div>
          ))}
        </div>

        {!progress.isScanning && (
          <div className="mt-5 flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-xl font-medium shadow-lg shadow-emerald-950/40"
            >
              Done & View Inventory
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
