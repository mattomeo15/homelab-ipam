import React from 'react';
import { ServiceItem } from '../types';
import { ExternalLink, ShieldCheck, Box, Server, Sparkles, Trash2, Edit2 } from 'lucide-react';

interface ServiceCardProps {
  ip: string;
  service: ServiceItem;
  onEditService?: (service: ServiceItem) => void;
  onDeleteService?: (serviceId: string) => void;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({
  ip,
  service,
  onEditService,
  onDeleteService,
}) => {
  const isWeb = service.protocol === 'http' || service.protocol === 'https';
  const targetUrl = service.url || `${service.protocol}://${ip}:${service.port}`;

  return (
    <div className="group relative bg-slate-950/80 hover:bg-slate-900 border border-slate-800/90 hover:border-emerald-500/50 rounded-xl p-3 transition-all shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center space-x-2.5 truncate">
          <div className="p-1.5 bg-slate-900 text-emerald-400 rounded-lg border border-slate-800 group-hover:border-emerald-500/30 flex-shrink-0">
            <Box className="w-4 h-4" />
          </div>
          <div className="truncate">
            <div className="flex items-center space-x-1.5">
              <span className="font-semibold text-xs text-slate-100 group-hover:text-emerald-300 truncate">
                {service.name}
              </span>
              {service.autoDiscovered && (
                <span
                  title="Auto-discovered via HTML <title> inspection"
                  className="inline-flex items-center text-[10px] text-emerald-400 bg-emerald-950/60 px-1 py-0.2 rounded border border-emerald-800/40"
                >
                  <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                  Auto
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-500 truncate">
              {service.category || 'Container App'}
            </div>
          </div>
        </div>

        <span className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-800/80 font-bold flex-shrink-0">
          :{service.port}
        </span>
      </div>

      <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
        <span className="text-slate-500 uppercase tracking-wider font-mono text-[10px]">
          {service.protocol}
        </span>

        {isWeb ? (
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 font-medium hover:underline"
          >
            <span>Open App</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <span className="text-slate-500 italic">TCP Port</span>
        )}
      </div>
    </div>
  );
};
