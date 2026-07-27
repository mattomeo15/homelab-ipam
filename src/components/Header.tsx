import React, { useState, useRef, useEffect } from 'react';
import { Network, Play, Plus, FileText, Code2, ChevronDown, Sun, Moon, Trash2, Upload } from 'lucide-react';

interface HeaderProps {
  subnet: string;
  onScan: () => void;
  isScanning: boolean;
  onOpenAddModal: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onClearData: () => void;
  onOpenImportModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  subnet,
  onScan,
  isScanning,
  onOpenAddModal,
  theme,
  onToggleTheme,
  onClearData,
  onOpenImportModal,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="bg-slate-900/90 border-b border-slate-800/90 px-3 sm:px-6 py-2.5 sticky top-0 z-30 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        {/* Branding */}
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          <div className="p-1.5 sm:p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 flex-shrink-0">
            <Network className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5 sm:space-x-2">
              <h1 className="text-xs sm:text-base font-bold tracking-tight text-white leading-tight truncate">
                HOMELAB IPAM
              </h1>
              <span className="text-[9px] sm:text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono font-semibold px-1.5 sm:px-2 py-0.5 rounded-full flex-shrink-0">
                {subnet}
              </span>
            </div>
          </div>
        </div>

        {/* Single Compact Settings ⚙️ Dropdown Button */}
        <div className="relative inline-block text-left" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="inline-flex items-center space-x-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-md sm:rounded-lg border border-slate-700 font-medium text-[11px] sm:text-xs transition-colors shadow-sm focus:outline-none"
          >
            <span>Settings ⚙️</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-1 z-50 divide-y divide-slate-800/80">
              {/* Actions */}
              <div className="py-1">
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    onScan();
                  }}
                  disabled={isScanning}
                  className="w-full text-left flex items-center px-3 py-2 text-xs text-emerald-400 hover:bg-slate-800 transition-colors font-medium disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 mr-2 text-emerald-400 fill-current" />
                  {isScanning ? 'Scanning Subnet...' : 'Scan Subnet'}
                </button>
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    onOpenAddModal();
                  }}
                  className="w-full text-left flex items-center px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 transition-colors font-medium"
                >
                  <Plus className="w-3.5 h-3.5 mr-2 text-emerald-400" />
                  + Add Entry
                </button>
              </div>

              {/* Theme Toggle */}
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  Appearance
                </div>
                <button
                  onClick={onToggleTheme}
                  className="w-full text-left flex items-center px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  {theme === 'dark' ? (
                    <>
                      <Moon className="w-3.5 h-3.5 mr-2 text-indigo-400" />
                      Theme: Dark 🌙
                    </>
                  ) : (
                    <>
                      <Sun className="w-3.5 h-3.5 mr-2 text-amber-500" />
                      Theme: Light ☀️
                    </>
                  )}
                </button>
              </div>

              {/* Export Tools & Data Management */}
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  Export Tools
                </div>
                <a
                  href="/api/export/md"
                  download
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 mr-2 text-emerald-400" />
                  Export Markdown (.md)
                </a>
                <a
                  href="/api/export/txt"
                  download
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 mr-2 text-indigo-400" />
                  Export Text Log (.txt)
                </a>
                <a
                  href="/api/export/json"
                  download
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <Code2 className="w-3.5 h-3.5 mr-2 text-cyan-400" />
                  Export JSON Backup
                </a>
              </div>

              {/* Data Import */}
              <div className="py-1 border-b border-slate-800">
                <div className="px-3 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  Data Import
                </div>
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    onOpenImportModal();
                  }}
                  className="w-full text-left flex items-center px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 mr-2 text-emerald-400" />
                  Import Inventory (.md / paste)
                </button>
              </div>

              {/* Reset & Clear */}
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  Data Reset
                </div>
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    onClearData();
                  }}
                  className="w-full text-left flex items-center px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2 text-rose-400" />
                  Clear Saved Data
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
