import React, { useCallback, useEffect, useState } from 'react';
import { resolveAtlanteanApiBaseOrThrow, getAtlanteanAuthHeaders } from '../../services/atlanteanService';

interface PrivacyStatus {
  network_mode: 'offline' | 'local-network-only' | 'external-access-enabled';
  outbound_network: boolean;
  cloud_escalation: boolean;
  allow_browser_speech_fallback: boolean;
  require_local_stt: boolean;
  active_provider: string;
  stt_engine: string;
  embedding_model: string | null;
  vector_db_path: string | null;
  vector_backend: string | null;
  journal_dir: string;
  automation_roots: string[];
  semantic_search_available: boolean;
  automation_available: boolean;
}

const MODE_STYLES = {
  'offline':                   { label: 'OFFLINE — NO EXTERNAL CALLS', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  'local-network-only':        { label: 'LOCAL NETWORK ONLY',           color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  'external-access-enabled':   { label: 'EXTERNAL ACCESS ENABLED',      color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
};

interface Props {
  compact?: boolean;
}

export default function PrivacyStatusBar({ compact }: Props) {
  const [status, setStatus] = useState<PrivacyStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = resolveAtlanteanApiBaseOrThrow();
      const r = await fetch(`${base}/privacy/status`, { headers: getAtlanteanAuthHeaders() });
      if (r.ok) setStatus(await r.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const i = setInterval(() => void load(), 30_000);
    return () => clearInterval(i);
  }, [load]);

  const mode = status?.network_mode ?? 'offline';
  const { label, color } = MODE_STYLES[mode] ?? MODE_STYLES['offline'];

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(v => !v)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[8px] font-bold uppercase tracking-widest transition-all hover:opacity-80 ${color}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${mode === 'offline' ? 'bg-emerald-400' : mode === 'local-network-only' ? 'bg-cyan-400' : 'bg-amber-400 animate-pulse'}`} />
        {label}
        {!compact && <span className="opacity-60">{expanded ? '▴' : '▾'}</span>}
      </button>

      {expanded && status && (
        <div className="absolute top-full left-0 mt-1 z-50 w-80 rounded-xl border border-white/10 bg-black/95 backdrop-blur-xl p-3 shadow-2xl">
          <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest mb-2">Privacy & Sovereignty Status</p>
          <div className="space-y-1.5">
            {[
              ['Outbound Network', status.outbound_network ? '⚠ Allowed' : '✓ Blocked', !status.outbound_network],
              ['Cloud Escalation', status.cloud_escalation ? '⚠ Enabled' : '✓ Disabled', !status.cloud_escalation],
              ['Browser Speech Fallback', status.allow_browser_speech_fallback ? '⚠ Allowed' : '✓ Blocked', !status.allow_browser_speech_fallback],
              ['Active Provider', status.active_provider, null],
              ['STT Engine', status.stt_engine, null],
              ['Embedding Model', status.embedding_model ?? 'not installed', null],
              ['Vector DB Path', status.vector_db_path ?? '—', null],
              ['Automation Roots', status.automation_roots.length > 0 ? `${status.automation_roots.length} approved` : 'none', null],
              ['Journal Dir', status.journal_dir, null],
              ['Semantic Search', status.semantic_search_available ? '✓ Available' : '✕ Install deps', status.semantic_search_available],
              ['Automation', status.automation_available ? '✓ Available' : '✕ Unavailable', status.automation_available],
            ].map(([label, val, ok]) => (
              <div key={String(label)} className="flex items-center justify-between gap-2">
                <span className="text-[8px] text-gray-500">{label}</span>
                <span className={`text-[8px] font-mono truncate max-w-[160px] ${ok === true ? 'text-emerald-400' : ok === false ? 'text-amber-400' : 'text-gray-300'}`}>
                  {String(val)}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={() => { void load(); }}
            className="mt-2 w-full text-[8px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            {loading ? 'Refreshing…' : '↺ Refresh'}
          </button>
        </div>
      )}
    </div>
  );
}
