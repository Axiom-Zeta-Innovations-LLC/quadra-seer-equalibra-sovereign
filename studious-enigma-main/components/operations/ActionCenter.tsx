import React, { useCallback, useEffect, useState } from 'react';
import type { AtlanteanStatus, ReplayIntegrityProof } from '../../services/atlanteanService';
import { replayIntegrityProof, resolveAtlanteanApiBaseOrThrow, getAtlanteanAuthHeaders } from '../../services/atlanteanService';
import { getProcessStatus, startBackend, type ProcessStatus } from '../../services/runtimeService';
import { getSettings } from '../../services/settingsService';

type Severity = 'info' | 'warning' | 'urgent' | 'critical';

interface ActionCard {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  component: string;
  primaryLabel: string;
  onPrimary: () => Promise<void>;
  secondaryLabel?: string;
  onSecondary?: () => void;
  dismissible: boolean;
}

const SEV_COLORS: Record<Severity, string> = {
  info:     'border-cyan-500/30 bg-cyan-500/5',
  warning:  'border-amber-500/30 bg-amber-500/5',
  urgent:   'border-orange-500/30 bg-orange-500/5',
  critical: 'border-red-500/30 bg-red-500/5',
};

const SEV_DOT: Record<Severity, string> = {
  info:     'bg-cyan-400',
  warning:  'bg-amber-400',
  urgent:   'bg-orange-400',
  critical: 'bg-red-500 animate-pulse',
};

const SEV_TEXT: Record<Severity, string> = {
  info:    'text-cyan-300',
  warning: 'text-amber-300',
  urgent:  'text-orange-300',
  critical:'text-red-400',
};

function Sev({ sev }: { sev: Severity }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest ${SEV_TEXT[sev]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${SEV_DOT[sev]}`} />
      {sev}
    </span>
  );
}

interface Props {
  status: AtlanteanStatus | null;
  sessionId: string;
  onOpenTab?: (tab: string) => void;
}

export default function ActionCenter({ status, sessionId, onOpenTab }: Props) {
  const [cards, setCards] = useState<ActionCard[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const buildCards = useCallback(async () => {
    const next: ActionCard[] = [];

    // --- Backend connectivity ---
    let processes: ProcessStatus[] = [];
    let backendRunning = false;
    try {
      const r = await getProcessStatus();
      processes = r.processes ?? [];
      backendRunning = processes.some(p => p.running && p.healthy);
    } catch { /* ignore */ }

    if (!status) {
      next.push({
        id: 'backend-offline',
        title: 'Intelligence backend is offline',
        description: 'The Atlantean backend is not responding. Local inference is unavailable.',
        severity: 'critical',
        component: 'Backend',
        primaryLabel: 'Start Local Backend',
        onPrimary: async () => {
          await startBackend('ollama');
          window.location.reload();
        },
        dismissible: false,
      });
    }

    // --- Local model status ---
    if (status && !backendRunning) {
      const settings = getSettings();
      if (settings.llmProvider === 'local') {
        next.push({
          id: 'local-model-stopped',
          title: 'Local inference backend not detected',
          description: 'Ollama or llama.cpp is not running. Queries will fail without a local model.',
          severity: 'urgent',
          component: 'Runtime',
          primaryLabel: 'Start Ollama',
          onPrimary: async () => { await startBackend('ollama'); },
          dismissible: true,
        });
      }
    }

    // --- API key missing ---
    const settings = getSettings();
    if (settings.llmProvider !== 'local' && !settings.apiKeys[settings.llmProvider]) {
      next.push({
        id: 'api-key-missing',
        title: 'API key not configured',
        description: `Provider "${settings.llmProvider}" requires an API key. Open Profile to add it.`,
        severity: 'urgent',
        component: 'Routing',
        primaryLabel: 'Open Profile',
        onPrimary: async () => { onOpenTab?.('profile'); },
        dismissible: true,
      });
    }

    // --- Replay integrity ---
    if (status) {
      try {
        const proof = await replayIntegrityProof(sessionId) as ReplayIntegrityProof;
        if (proof.events_total > 0 && !proof.match) {
          next.push({
            id: 'replay-mismatch',
            title: 'Replay verification failed',
            description: `${proof.issues.length} ledger issue(s) detected. State integrity cannot be confirmed.`,
            severity: 'critical',
            component: 'Ledger',
            primaryLabel: 'Run Repair',
            onPrimary: async () => { onOpenTab?.('recovery'); },
            secondaryLabel: 'View Details',
            onSecondary: () => { onOpenTab?.('diagnostics'); },
            dismissible: false,
          });
        }
      } catch { /* non-fatal */ }
    }

    // --- Cold memory items ---
    if (status && status.cold_memory_items > 300) {
      next.push({
        id: 'memory-high',
        title: 'Memory approaching retention limit',
        description: `${status.cold_memory_items} items in cold memory. Consider applying retention controls.`,
        severity: 'warning',
        component: 'Memory',
        primaryLabel: 'Apply Retention',
        onPrimary: async () => {
          const base = resolveAtlanteanApiBaseOrThrow();
          const h = getAtlanteanAuthHeaders();
          await fetch(`${base}/retention/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...h },
            body: JSON.stringify({ session_id: sessionId }),
          });
        },
        dismissible: true,
      });
    }

    setCards(next);
  }, [status, sessionId, onOpenTab]);

  useEffect(() => {
    void buildCards();
    const interval = setInterval(() => void buildCards(), 60_000);
    return () => clearInterval(interval);
  }, [buildCards]);

  const visible = cards.filter(c => !dismissed.has(c.id));

  const run = async (card: ActionCard) => {
    setBusy(b => ({ ...b, [card.id]: true }));
    setErrors(e => { const n = { ...e }; delete n[card.id]; return n; });
    try {
      await card.onPrimary();
      void buildCards();
    } catch (err) {
      setErrors(e => ({ ...e, [card.id]: err instanceof Error ? err.message : 'Action failed' }));
    } finally {
      setBusy(b => ({ ...b, [card.id]: false }));
    }
  };

  return (
    <div className="space-y-2">
      {visible.length === 0 ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[10px] font-mono text-emerald-300 uppercase tracking-wider">No action required</span>
          </div>
          <p className="mt-1 text-[9px] text-gray-500">All monitored systems are operating normally.</p>
        </div>
      ) : (
        visible.map(card => (
          <div key={card.id} className={`rounded-xl border p-3 ${SEV_COLORS[card.severity]}`}>
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div>
                <Sev sev={card.severity} />
                <p className="mt-1 text-[10px] font-bold text-white">{card.title}</p>
                <p className="text-[9px] text-gray-400 mt-0.5 leading-relaxed">{card.description}</p>
              </div>
              {card.dismissible && (
                <button
                  onClick={() => setDismissed(d => new Set([...d, card.id]))}
                  className="text-gray-600 hover:text-gray-300 text-[10px] font-mono shrink-0 p-1"
                  title="Dismiss"
                >✕</button>
              )}
            </div>
            {errors[card.id] && (
              <p className="text-[9px] text-red-400 mb-1.5 font-mono">{errors[card.id]}</p>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => void run(card)}
                disabled={busy[card.id]}
                className="flex-1 py-1.5 rounded-lg bg-[var(--color-primary)] text-black text-[9px] font-bold uppercase tracking-widest hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy[card.id] ? 'Working…' : card.primaryLabel}
              </button>
              {card.secondaryLabel && card.onSecondary && (
                <button
                  onClick={card.onSecondary}
                  className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-[9px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95"
                >
                  {card.secondaryLabel}
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
