import React, { useState } from 'react';
import AtlanteanStatusPanel from '../AtlanteanStatusPanel';
import type { AtlanteanStatus, FieldData } from '../../services/atlanteanService';
import type { RefreshTelemetry as HookRefreshTelemetry } from '../../hooks/useAtlantean';

interface Props {
  status: AtlanteanStatus | null;
  fields: FieldData | null;
  isLoading: boolean;
  isRefreshingFields?: boolean;
  refreshTelemetry?: HookRefreshTelemetry;
}

export default function AdvancedDiagnostics(props: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-white/6 bg-white/2">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left group"
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-600 group-hover:text-gray-400 transition-colors text-[9px]">
            {open ? '▾' : '▸'}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500 group-hover:text-gray-400 transition-colors">
            Advanced Diagnostics
          </span>
        </div>
        <span className={`text-[7px] font-bold uppercase tracking-wider rounded-[4px] px-1.5 py-0.5
          ${props.status ? 'text-emerald-600 bg-emerald-500/10' : 'text-gray-700 bg-white/4'}`}>
          {props.status ? 'online' : 'offline'}
        </span>
      </button>
      {open && (
        <div className="px-1 pb-2 border-t border-white/5">
          <AtlanteanStatusPanel {...props} />
        </div>
      )}
    </div>
  );
}
