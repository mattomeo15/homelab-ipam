import React from 'react';
import { IPRecord, SubnetStats } from '../types';

interface StatsBarProps {
  stats: SubnetStats;
  records: IPRecord[];
}

export const StatsBar: React.FC<StatsBarProps> = ({ stats, records }) => {
  const hardwareCount = records.filter(
    (r) => r.typeTag === 'Physical Hardware'
  ).length;

  const containerCount = records.filter(
    (r) => r.typeTag === 'Macvlan Container' || r.typeTag === 'Shared/Host Container'
  ).length;

  const total = stats.total || 254;
  const free = stats.free || 0;
  const utilization = (((total - free) / total) * 100).toFixed(1) + '%';

  return (
    <div className="bg-slate-900/90 border border-slate-800/90 rounded-xl p-2 sm:p-2.5 mb-4 shadow-sm">
      <div className="grid grid-cols-3 sm:grid-cols-6 text-xs font-mono divide-y sm:divide-y-0 divide-slate-800/80">
        {/* 1. Active */}
        <div className="p-1.5 sm:p-2 text-center">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider truncate">
            ACTIVE IPS
          </span>
          <span className="text-sm sm:text-base font-bold text-emerald-400">
            {stats.active}
          </span>
        </div>

        {/* 2. Reserved */}
        <div className="p-1.5 sm:p-2 text-center border-l border-slate-800/80">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider truncate">
            RESERVED IPS
          </span>
          <span className="text-sm sm:text-base font-bold text-amber-400">
            {stats.reserved}
          </span>
        </div>

        {/* 3. Available */}
        <div className="p-1.5 sm:p-2 text-center border-l border-slate-800/80">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider truncate">
            AVAILABLE IPS
          </span>
          <span className="text-sm sm:text-base font-bold text-slate-300">
            {stats.free}
          </span>
        </div>

        {/* 4. Hardware */}
        <div className="p-1.5 sm:p-2 text-center sm:border-l border-slate-800/80">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider truncate">
            DEVICES
          </span>
          <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-blue-400">
            {hardwareCount}
          </span>
        </div>

        {/* 5. Container */}
        <div className="p-1.5 sm:p-2 text-center border-l border-slate-800/80">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider truncate">
            CONTAINERS
          </span>
          <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-purple-400">
            {containerCount}
          </span>
        </div>

        {/* 6. % Used */}
        <div className="p-1.5 sm:p-2 text-center border-l border-slate-800/80">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider truncate">
            IP % USED
          </span>
          <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-cyan-400">
            {utilization}
          </span>
        </div>
      </div>
    </div>
  );
};
