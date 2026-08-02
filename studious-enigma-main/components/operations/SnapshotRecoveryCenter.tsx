import React, { useCallback, useEffect, useState } from 'react';
import {
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  deleteSnapshot,
  replayIntegrityProof,
  resolveAtlanteanApiBaseOrThrow,
  getAtlanteanAuthHeaders,
  type AtlanteanSnapshotRecord,
  type ReplayIntegrityProof,
} from '../../services/atlanteanService';

function formatDate(raw: number | string | undefined) {
  if (!raw) return '—';
  const d = typeof raw === 'number' ? new Date(raw * 1000) : new Date(raw);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function PhiBadge({ phi }: { phi: number }) {
  const color = phi >= 0.7 ? 'text-emerald-400' : phi >= 0.4 ? 'text-amber-400' : 'text-red-400';
  return <span className={`font-mono text-[9px] ${color}`}>φ={phi.toFixed(3)}</span>;
}

interface Props {
  sessionId: string;
  onSnapshotRestored?: () => void;
  onNotify?: (msg: string) => void;
  onSelectSnapshot?: (snap: AtlanteanSnapshotRecord) => void;
}

export default function SnapshotRecoveryCenter({ sessionId, onSnapshotRestored, onNotify, onSelectSnapshot }: Props) {
  const [snapshots, setSnapshots] = useState<AtlanteanSnapshotRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [proof, setProof] = useState<ReplayIntegrityProof | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { snapshots: snaps } = await listSnapshots(30, sessionId);
      setSnapshots(snaps);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const lbl = label.trim() || undefined;
      await createSnapshot(lbl, sessionId);
      setLabel('');
      setShowLabelInput(false);
      onNotify?.(`Snapshot created${lbl ? ` — ${lbl}` : ''}`);
      await refresh();
    } catch (e) {
      onNotify?.(`Snapshot failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (snap: AtlanteanSnapshotRecord) => {
    setBusy(b => ({ ...b, [snap.id]: true }));
    setErrors(e => { const n = { ...e }; delete n[snap.id]; return n; });
    try {
      await restoreSnapshot(snap.id, sessionId);
      onNotify?.(`Restored from ${snap.label ?? snap.id.slice(0, 8)}`);
      onSnapshotRestored?.();
    } catch (e) {
      setErrors(e2 => ({ ...e2, [snap.id]: e instanceof Error ? e.message : 'Restore failed' }));
    } finally {
      setBusy(b => ({ ...b, [snap.id]: false }));
    }
  };

  const handleDelete = async (snap: AtlanteanSnapshotRecord) => {
    if (!window.confirm(`Delete snapshot "${snap.label ?? snap.id.slice(0, 12)}"?`)) return;
    setBusy(b => ({ ...b, [`del-${snap.id}`]: true }));
    try {
      await deleteSnapshot(snap.id, sessionId);
      onNotify?.('Snapshot deleted');
      await refresh();
    } catch (e) {
      onNotify?.(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(b => ({ ...b, [`del-${snap.id}`]: false }));
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setProof(null);
    try {
      const p = await replayIntegrityProof(sessionId) as ReplayIntegrityProof;
      setProof(p);
      if (p.match) onNotify?.('Integrity verified ✓');
      else onNotify?.(`⚠ Integrity issues: ${p.issues.length} found`);
    } catch (e) {
      onNotify?.(`Verify error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setVerifying(false);
    }
  };

  const handleRepair = async () => {
    setRepairing(true);
    try {
      const base = resolveAtlanteanApiBaseOrThrow();
      const h = getAtlanteanAuthHeaders();
      const r = await fetch(`${base}/recovery/repair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...h },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const d = await r.json();
      onNotify?.(d.message ?? 'Repair complete');
      await refresh();
    } catch (e) {
      onNotify?.(`Repair error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Create snapshot */}
      <div className="rounded-xl border border-white/8 bg-white/3 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest">Capture State</p>
          <button
            onClick={() => setShowLabelInput(v => !v)}
            className="text-[8px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            {showLabelInput ? '⌃ hide label' : '+ add label'}
          </button>
        </div>
        {showLabelInput && (
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleCreate(); }}
            placeholder="Snapshot label (optional)…"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-gray-200 placeholder:text-gray-600 mb-2 focus:outline-none focus:border-[var(--color-primary)]/50"
          />
        )}
        <button
          onClick={() => void handleCreate()}
          disabled={creating}
          className="w-full py-2 rounded-lg bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/30 text-[var(--color-primary)] text-[9px] font-bold uppercase tracking-widest hover:bg-[var(--color-primary)]/25 transition-all active:scale-95 disabled:opacity-50"
        >
          {creating ? 'Capturing…' : '◎ Create Snapshot'}
        </button>
      </div>

      {/* Integrity panel */}
      <div className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-2">
        <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest">Integrity & Recovery</p>

        {proof && (
          <div className={`rounded-lg border p-2 ${proof.match ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-red-500/25 bg-red-500/5'}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`w-1.5 h-1.5 rounded-full ${proof.match ? 'bg-emerald-400' : 'bg-red-500'}`} />
              <span className={`text-[9px] font-bold ${proof.match ? 'text-emerald-300' : 'text-red-400'}`}>
                {proof.match ? 'Integrity verified' : 'Integrity mismatch'}
              </span>
            </div>
            <p className="text-[8px] text-gray-500">
              {proof.events_verified}/{proof.events_total} events verified
              {!proof.match && proof.issues.length > 0 && ` · ${proof.issues.length} issue(s)`}
            </p>
          </div>
        )}

        <div className="flex gap-1.5">
          <button
            onClick={() => void handleVerify()}
            disabled={verifying}
            className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-[9px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95 disabled:opacity-50"
          >
            {verifying ? 'Verifying…' : '✓ Verify'}
          </button>
          <button
            onClick={() => void handleRepair()}
            disabled={repairing}
            className="flex-1 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-300 text-[9px] font-bold uppercase tracking-widest hover:bg-orange-500/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {repairing ? 'Repairing…' : '⚙ Repair'}
          </button>
        </div>
      </div>

      {/* Snapshot list */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest">
            Archive ({snapshots.length})
          </p>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="text-[8px] text-gray-600 hover:text-gray-300 transition-colors"
          >{loading ? '…' : '↺'}</button>
        </div>

        {snapshots.length === 0 && !loading ? (
          <p className="text-[9px] text-gray-600 italic">No snapshots yet.</p>
        ) : (
          <div className="space-y-1.5">
            {snapshots.map(snap => (
              <div key={snap.id} className="rounded-xl border border-white/6 bg-white/3 p-2.5">
                <div className="flex items-start gap-2 mb-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-gray-200 truncate">
                      {snap.label ?? `Snapshot ${snap.id.slice(0, 8)}`}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <p className="text-[8px] text-gray-600">{formatDate(snap.created_at)}</p>
                      {snap.phase_lock && <PhiBadge phi={snap.phase_lock.Phi} />}
                      {snap.version && <span className="text-[7px] text-gray-700 font-mono">v{snap.version}</span>}
                    </div>
                  </div>
                </div>

                {errors[snap.id] && (
                  <p className="text-[8px] text-red-400 mb-1 font-mono">{errors[snap.id]}</p>
                )}

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => void handleRestore(snap)}
                    disabled={busy[snap.id]}
                    className="flex-1 py-1 rounded-lg bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-[var(--color-primary)] text-[8px] font-bold uppercase tracking-widest hover:bg-[var(--color-primary)]/20 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {busy[snap.id] ? '…' : 'Restore'}
                  </button>
                  {onSelectSnapshot && (
                    <button
                      onClick={() => onSelectSnapshot(snap)}
                      className="flex-1 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-[8px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95"
                    >
                      Preview
                    </button>
                  )}
                  <button
                    onClick={() => void handleDelete(snap)}
                    disabled={busy[`del-${snap.id}`]}
                    className="py-1 px-2 rounded-lg bg-red-500/5 border border-red-500/15 text-red-500 text-[8px] hover:bg-red-500/15 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {busy[`del-${snap.id}`] ? '…' : '✕'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
