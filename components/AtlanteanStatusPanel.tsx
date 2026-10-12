import React, { useEffect, useMemo, useState } from 'react';
import {
  AtlanteanStatus,
  DiagnosticsBundle,
  FieldData,
  ReplayIntegrityProof,
  getDiagnosticsBundle,
  replayIntegrityProof,
} from '../services/atlanteanService';
import type { RefreshTelemetry as HookRefreshTelemetry } from '../hooks/useAtlantean';
import FieldHeatmap from './FieldHeatmap';
import RoutingIndicatorBar from './RoutingIndicatorBar';

interface AtlanteanStatusPanelProps {
  status: AtlanteanStatus | null;
  fields: FieldData | null;
  isLoading: boolean;
  isRefreshingFields?: boolean;
  refreshTelemetry?: HookRefreshTelemetry;
}

interface FieldHistorySample {
  timestamp: number;
  phi1_mean: number;
  phi5_mean: number;
  Phi: number;
  learning_capacity: number;
}

const HISTORY_LIMIT = 48;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function buildTrendPath(values: number[]): string {
  if (values.length === 0) return '';
  const width = 100;
  const height = 34;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - clamp01((v + 1) / 2) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return `M ${points.join(' L ')}`;
}

export default function AtlanteanStatusPanel({
  status,
  fields,
  isLoading,
  isRefreshingFields = false,
  refreshTelemetry,
}: AtlanteanStatusPanelProps) {
  const [proof, setProof] = useState<ReplayIntegrityProof | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [fieldHistory, setFieldHistory] = useState<FieldHistorySample[]>([]);
  const [isDiagExporting, setIsDiagExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadProof = async () => {
      if (!status) return;
      try {
        const nextProof = await replayIntegrityProof();
        if (!cancelled) {
          setProof(nextProof);
          setProofError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setProof(null);
          setProofError(err instanceof Error ? err.message : 'Replay proof failed');
        }
      }
    };

    loadProof();
    const interval = setInterval(loadProof, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [status?.version, status?.device_id]);

  useEffect(() => {
    if (!status) return;
    const sample: FieldHistorySample = {
      timestamp: Date.now(),
      phi1_mean: status.field_stats.phi1_mean,
      phi5_mean: status.field_stats.phi5_mean,
      Phi: status.field_stats.Phi,
      learning_capacity: status.learning_capacity,
    };

    setFieldHistory((prev) => {
      const last = prev[prev.length - 1];
      if (
        last &&
        Math.abs(last.phi1_mean - sample.phi1_mean) < 1e-6 &&
        Math.abs(last.phi5_mean - sample.phi5_mean) < 1e-6 &&
        Math.abs(last.Phi - sample.Phi) < 1e-6 &&
        Math.abs(last.learning_capacity - sample.learning_capacity) < 1e-6
      ) {
        return prev;
      }
      const next = [...prev, sample];
      return next.slice(-HISTORY_LIMIT);
    });
  }, [status?.version, status?.field_stats?.phi1_mean, status?.field_stats?.phi5_mean, status?.field_stats?.Phi, status?.learning_capacity]);

  if (isLoading && !status) {
    return (
      <div className="p-6 text-center">
        <div className="animate-pulse text-purple-400">Loading intelligence...</div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="p-6 text-center text-gray-500">
        Intelligence core offline
      </div>
    );
  }

  const learningCapacity = status.learning_capacity * 100;
  const phi1Mean = status.field_stats.phi1_mean;
  const phi5Mean = status.field_stats.phi5_mean;
  const Phi = status.field_stats.Phi;
  const sync = status.sync;
  const statusRefresh = refreshTelemetry?.status;
  const fieldRefresh = refreshTelemetry?.fields;

  const phiTrendPath = useMemo(() => buildTrendPath(fieldHistory.map((s) => s.Phi)), [fieldHistory]);
  const learningTrendPath = useMemo(
    () => buildTrendPath(fieldHistory.map((s) => s.learning_capacity * 2 - 1)),
    [fieldHistory]
  );

  const exportFieldState = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      status,
      fields,
      history: fieldHistory,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `atlantean-fields-${status.device_id}-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const exportDiagnosticsBundle = async () => {
    setIsDiagExporting(true);
    try {
      const { bundle } = await getDiagnosticsBundle();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `atlantean-diagnostics-${bundle.session_id.slice(0, 8)}-${Date.now()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail — button reverts to idle state.
    } finally {
      setIsDiagExporting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 p-4 rounded-xl border border-purple-500/20">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
          <h3 className="text-sm font-bold text-purple-300 uppercase tracking-wider">
            PhaseLock Coherence
          </h3>
          <span
            className={`ml-auto px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider border ${
              proofError
                ? 'text-amber-300 border-amber-400/30 bg-amber-500/10'
                : proof?.match
                ? 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10'
                : proof && proof.events_total === 0
                ? 'text-gray-400 border-gray-500/30 bg-gray-500/10'
                : 'text-red-300 border-red-400/30 bg-red-500/10'
            }`}
            title={
              proofError
                ? proofError
                : proof && proof.events_total === 0
                ? 'No events recorded yet — replay will activate after the first query'
                : proof && !proof.match
                ? proof.issues
                    .slice(0, 3)
                    .map((issue) => issue.type || 'unknown_issue')
                    .join(', ')
                : 'Replay integrity verified'
            }
          >
            {proofError ? 'REPLAY ERR' : proof?.match ? 'REPLAY OK' : proof && proof.events_total === 0 ? 'NO HISTORY' : 'REPLAY MISMATCH'}
          </span>
        </div>
        <div className="text-xs text-gray-400">
          Axiom Zeta • PhaseLock v{status.version} • {status.device_id.slice(0, 12)}...
        </div>
        {isRefreshingFields && (
          <div className="mt-2 text-[9px] font-mono uppercase tracking-wider text-cyan-300">
            Updating field telemetry...
          </div>
        )}
      </div>

      {/* Step 26: Operator routing indicators */}
      <RoutingIndicatorBar />

      {/* Intelligence Fields */}
      <div className="space-y-3">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
          <span>PhaseLock Field Topology</span>
          <span className="text-[9px] font-mono text-purple-400/80">Topological Lock</span>
        </div>

        {fields && (
          <div className="space-y-2">
            <FieldHeatmap title="phi1 Decision Topology" field={fields.phi1} heightPx={96} />
            <FieldHeatmap title="phi5 Plasticity Surface" field={fields.phi5} heightPx={88} />
          </div>
        )}

        {/* φ₁ - Decision Field */}
        <div className="bg-black/40 p-3 rounded-lg border border-blue-500/10">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-blue-300">φ₁ Decision Field</span>
            <span className="text-xs font-mono text-blue-400">{phi1Mean.toFixed(3)}</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-500"
              style={{ width: `${Math.abs(phi1Mean) * 100}%` }}
            ></div>
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            {phi1Mean > 0.5 ? 'High confidence' : phi1Mean < -0.5 ? 'Exploratory mode' : 'Balanced'}
          </div>
        </div>

        {/* φ₅ - Learning Field */}
        <div className="bg-black/40 p-3 rounded-lg border border-green-500/10">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-green-300">φ₅ Learning Field</span>
            <span className="text-xs font-mono text-green-400">{phi5Mean.toFixed(3)}</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-green-600 to-emerald-400 transition-all duration-500"
              style={{ width: `${Math.abs(phi5Mean) * 100}%` }}
            ></div>
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            {phi5Mean > 0.5 ? 'Active learning' : 'Pattern consolidation'}
          </div>
        </div>

        {/* Φ - Global Coherence */}
        <div className="bg-black/40 p-3 rounded-lg border border-purple-500/10">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-purple-300">Φ Global Coherence</span>
            <span className="text-xs font-mono text-purple-400">{Phi.toFixed(3)}</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-purple-600 to-pink-400 transition-all duration-500"
              style={{ width: `${Math.abs(Phi) * 50}%` }}
            ></div>
          </div>
        </div>

        {/* Learning Capacity */}
        <div className="bg-gradient-to-br from-amber-900/20 to-orange-900/20 p-3 rounded-lg border border-amber-500/20">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-amber-300">Learning Capacity</span>
            <span className="text-sm font-bold text-amber-400">{learningCapacity.toFixed(1)}%</span>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-amber-600 to-yellow-400 transition-all duration-500"
              style={{ width: `${learningCapacity}%` }}
            ></div>
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            {learningCapacity > 70 ? 'High plasticity' : learningCapacity < 30 ? 'Stable patterns' : 'Moderate adaptation'}
          </div>
        </div>
      </div>

      {/* Field Evolution */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Field Evolution
        </div>
        <div className="bg-black/40 p-3 rounded-lg border border-indigo-700/30 space-y-3">
          <div>
            <div className="mb-1 text-[10px] font-mono uppercase tracking-widest text-indigo-300">Phi Trend</div>
            <svg viewBox="0 0 100 34" className="w-full h-10 rounded bg-indigo-950/20 border border-indigo-800/30">
              <path d={phiTrendPath} fill="none" stroke="rgb(167 139 250)" strokeWidth="1.8" />
            </svg>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-mono uppercase tracking-widest text-amber-300">Learning Capacity Trend</div>
            <svg viewBox="0 0 100 34" className="w-full h-10 rounded bg-amber-950/20 border border-amber-800/30">
              <path d={learningTrendPath} fill="none" stroke="rgb(251 191 36)" strokeWidth="1.8" />
            </svg>
          </div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-gray-500">
            Samples: {fieldHistory.length}
          </div>
        </div>
      </div>

      {/* Memory Stats */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Refresh Performance
        </div>
        <div className="bg-black/40 p-3 rounded-lg border border-fuchsia-700/30 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-[10px] font-mono">
            <div className="rounded bg-fuchsia-950/20 border border-fuchsia-800/20 px-2 py-2">
              <div className="text-fuchsia-300 uppercase tracking-widest">Status Refresh</div>
              <div className="mt-1 text-gray-300">Last {statusRefresh?.lastMs ?? 0}ms</div>
              <div className="text-gray-400">Avg {statusRefresh?.averageMs ?? 0}ms</div>
              <div className="text-gray-500">Runs {statusRefresh?.count ?? 0}</div>
            </div>
            <div className="rounded bg-cyan-950/20 border border-cyan-800/20 px-2 py-2">
              <div className="text-cyan-300 uppercase tracking-widest">Field Refresh</div>
              <div className="mt-1 text-gray-300">Last {fieldRefresh?.lastMs ?? 0}ms</div>
              <div className="text-gray-400">Avg {fieldRefresh?.averageMs ?? 0}ms</div>
              <div className="text-gray-500">Runs {fieldRefresh?.count ?? 0}</div>
            </div>
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 font-mono gap-4">
            <span>
              Status: {statusRefresh?.lastCompletedAt ? new Date(statusRefresh.lastCompletedAt).toLocaleTimeString() : 'n/a'}
            </span>
            <span>
              Fields: {fieldRefresh?.lastCompletedAt ? new Date(fieldRefresh.lastCompletedAt).toLocaleTimeString() : 'n/a'}
            </span>
          </div>
        </div>
      </div>

      {/* Memory Stats */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Memory
        </div>
        <div className="bg-black/40 p-3 rounded-lg border border-gray-700/20 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Cold Memory Items</span>
            <span className="font-mono text-gray-300">{status.cold_memory_items}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Last Update</span>
            <span className="font-mono text-gray-300">
              {new Date(status.last_update).toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>

      {/* Sync Metadata */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Sync Metadata
        </div>
        <div className="bg-black/40 p-3 rounded-lg border border-cyan-700/30 space-y-2">
          <div className="flex justify-between text-xs gap-4">
            <span className="text-gray-400">Last Merged Device</span>
            <span className="font-mono text-gray-300 text-right">
              {sync?.last_merged_device ? `${sync.last_merged_device.slice(0, 18)}...` : 'none'}
            </span>
          </div>
          <div className="flex justify-between text-xs gap-4">
            <span className="text-gray-400">Merge Strategy</span>
            <span className="font-mono text-gray-300 text-right">
              {sync?.last_merge_strategy || 'n/a'}
            </span>
          </div>
          <div className="flex justify-between text-xs gap-4">
            <span className="text-gray-400">Last Merge Time</span>
            <span className="font-mono text-gray-300 text-right">
              {sync?.last_merged_at ? new Date(sync.last_merged_at).toLocaleString() : 'n/a'}
            </span>
          </div>
          <div className="pt-2 border-t border-cyan-800/30 grid grid-cols-2 gap-2 text-[10px] font-mono text-gray-400">
            <div className="rounded bg-cyan-900/10 px-2 py-1">Total {sync?.conflict_counters?.total_merges ?? 0}</div>
            <div className="rounded bg-amber-900/10 px-2 py-1">Concurrent {sync?.conflict_counters?.concurrent_merges ?? 0}</div>
            <div className="rounded bg-green-900/10 px-2 py-1">Applied {sync?.conflict_counters?.remote_updates_applied ?? 0}</div>
            <div className="rounded bg-gray-700/40 px-2 py-1">No-op {sync?.conflict_counters?.noop_merges ?? 0}</div>
          </div>
        </div>
      </div>

      {/* Stateless Indicator */}
      <div className="bg-gradient-to-r from-cyan-900/20 to-blue-900/20 p-3 rounded-lg border border-cyan-500/20">
        <div className="flex items-center gap-2 mb-1">
          <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs font-bold text-cyan-300">Stateless LLM</span>
        </div>
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Context from intelligence fields, not conversation history. Your AI owns its intelligence.
        </p>
      </div>

      <button
        onClick={exportFieldState}
        className="w-full px-3 py-2 rounded-lg border border-indigo-400/30 bg-indigo-500/10 text-[10px] font-mono uppercase tracking-widest text-indigo-200 hover:bg-indigo-500/20 transition-colors"
      >
        Export Field State
      </button>

      <button
        onClick={exportDiagnosticsBundle}
        disabled={isDiagExporting}
        className="w-full px-3 py-2 rounded-lg border border-amber-400/30 bg-amber-500/10 text-[10px] font-mono uppercase tracking-widest text-amber-200 hover:bg-amber-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isDiagExporting ? 'Exporting…' : 'Export Diagnostics Bundle'}
      </button>

      {fields && (
        <div className="text-[10px] text-gray-600 text-center pt-2">
          Field grid: {fields.phi1.length}×{fields.phi1[0]?.length || 0}
        </div>
      )}
    </div>
  );
}
