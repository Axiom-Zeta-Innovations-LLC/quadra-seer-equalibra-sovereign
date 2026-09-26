import React, { useState } from 'react';
import {
  listWorkflows,
  saveWorkflows,
  createWorkflow,
  deleteWorkflow,
  updateWorkflow,
  type Workflow,
  type IntelligenceMode,
  type WorkflowTriggerType,
} from '../../services/operationsService';
import {
  createSnapshot,
  replayIntegrityProof,
  resolveAtlanteanApiBaseOrThrow,
  getAtlanteanAuthHeaders,
} from '../../services/atlanteanService';

const MODE_LABELS: Record<IntelligenceMode, string> = {
  sovereign: 'Sovereign',
  private_hybrid: 'Private Hybrid',
  maximum: 'Maximum',
  research: 'Research',
  fast: 'Fast',
  deep_reasoning: 'Deep Reasoning',
};

const TRIGGER_LABELS: Record<WorkflowTriggerType, string> = {
  manual: 'Manual',
  scheduled: 'Scheduled',
  file_uploaded: 'File Uploaded',
  task_completed: 'Task Complete',
  snapshot_overdue: 'Snapshot Overdue',
  startup: 'On Startup',
};

function statusColor(s?: 'success' | 'failed' | 'running') {
  if (s === 'success') return 'text-emerald-400';
  if (s === 'failed') return 'text-red-400';
  if (s === 'running') return 'text-[var(--color-primary)] animate-pulse';
  return 'text-gray-600';
}

function statusIcon(s?: 'success' | 'failed' | 'running') {
  if (s === 'success') return '✓';
  if (s === 'failed') return '✕';
  if (s === 'running') return '●';
  return '—';
}

interface Props {
  sessionId: string;
  onNotify?: (msg: string) => void;
  onCreateSnapshot?: () => Promise<void>;
  onExportPackage?: () => Promise<void>;
}

export default function WorkflowAutomation({ sessionId, onNotify, onCreateSnapshot, onExportPackage }: Props) {
  const [workflows, setWorkflows] = useState<Workflow[]>(listWorkflows);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newMode, setNewMode] = useState<IntelligenceMode>('sovereign');

  const reload = () => setWorkflows(listWorkflows());

  const handleToggleEnabled = (id: string, enabled: boolean) => {
    updateWorkflow(id, { enabled });
    reload();
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Delete this workflow?')) return;
    deleteWorkflow(id);
    reload();
  };

  const handleRun = async (wf: Workflow) => {
    setBusy(b => ({ ...b, [wf.id]: true }));
    const start = Date.now();
    let runStatus: 'success' | 'failed' = 'success';
    try {
      for (const step of wf.steps) {
        if (step.type === 'create_snapshot') {
          if (onCreateSnapshot) await onCreateSnapshot();
          else await createSnapshot(undefined, sessionId);
        } else if (step.type === 'verify_replay') {
          await replayIntegrityProof(sessionId);
        } else if (step.type === 'export_sync_package') {
          if (onExportPackage) await onExportPackage();
        } else if (step.type === 'repair_corruption') {
          const base = resolveAtlanteanApiBaseOrThrow();
          const h = getAtlanteanAuthHeaders();
          await fetch(`${base}/recovery/repair`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...h },
            body: JSON.stringify({ session_id: sessionId }),
          });
        }
      }
      onNotify?.(`✓ Workflow "${wf.name}" completed`);
    } catch (e) {
      runStatus = 'failed';
      onNotify?.(`✕ Workflow "${wf.name}" failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      const durationMs = Date.now() - start;
      const history = [...wf.runHistory, { timestamp: Date.now(), status: runStatus, durationMs }];
      updateWorkflow(wf.id, {
        lastRun: Date.now(),
        lastRunStatus: runStatus,
        runHistory: history.slice(-20),
      });
      reload();
      setBusy(b => ({ ...b, [wf.id]: false }));
    }
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    createWorkflow({
      name: newName.trim(),
      description: newDesc.trim(),
      trigger: { type: 'manual' },
      steps: [{ type: 'create_snapshot', label: 'Capture Snapshot' }],
      policy: { intelligenceMode: newMode, localOnly: newMode === 'sovereign', approvalRequiredForExternal: true },
      enabled: true,
    });
    setNewName('');
    setNewDesc('');
    setNewMode('sovereign');
    setShowNew(false);
    reload();
    onNotify?.('Workflow created');
  };

  return (
    <div className="space-y-2">
      {/* Workflow list */}
      {workflows.map(wf => (
        <div key={wf.id} className={`rounded-xl border p-3 transition-all ${wf.enabled ? 'border-white/8 bg-white/3' : 'border-white/4 bg-white/[0.015] opacity-60'}`}>
          <div className="flex items-start gap-2 mb-1.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[10px] font-bold text-gray-200">{wf.name}</p>
                <span className="text-[7px] text-gray-700 font-mono bg-white/5 rounded-[3px] px-1">
                  {TRIGGER_LABELS[wf.trigger.type]}
                </span>
                <span className={`text-[7px] font-mono ${statusColor(wf.lastRunStatus)}`}>
                  {statusIcon(wf.lastRunStatus)}
                </span>
              </div>
              {wf.description && (
                <p className="text-[8px] text-gray-500 mt-0.5">{wf.description}</p>
              )}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[7px] text-gray-700 font-mono">{MODE_LABELS[wf.policy.intelligenceMode]}</span>
                <span className="text-[7px] text-gray-700">{wf.steps.length} step{wf.steps.length !== 1 ? 's' : ''}</span>
                {wf.lastRun && (
                  <span className="text-[7px] text-gray-700">
                    Last: {new Date(wf.lastRun).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
            {/* Enable toggle */}
            <button
              onClick={() => handleToggleEnabled(wf.id, !wf.enabled)}
              className={`relative w-7 rounded-full transition-all shrink-0 mt-0.5 ${wf.enabled ? 'bg-[var(--color-primary)]' : 'bg-white/15'}`}
              style={{ height: '16px' }}
            >
              <span className={`absolute top-[3px] w-[10px] h-[10px] rounded-full bg-white shadow-sm transition-all ${wf.enabled ? 'left-[13px]' : 'left-[3px]'}`} />
            </button>
          </div>

          {/* Steps preview */}
          <div className="flex flex-wrap gap-1 mb-2">
            {wf.steps.map((s, i) => (
              <span key={i} className="bg-black/20 border border-white/6 rounded-[4px] px-1.5 py-0.5 text-[7px] text-gray-500 font-mono">
                {s.label}
              </span>
            ))}
          </div>

          <div className="flex gap-1.5">
            {wf.trigger.type === 'manual' && (
              <button
                onClick={() => void handleRun(wf)}
                disabled={!wf.enabled || busy[wf.id]}
                className="flex-1 py-1 rounded-lg bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-[var(--color-primary)] text-[8px] font-bold uppercase tracking-widest hover:bg-[var(--color-primary)]/20 transition-all active:scale-95 disabled:opacity-40"
              >
                {busy[wf.id] ? 'Running…' : '▶ Run Now'}
              </button>
            )}
            <button
              onClick={() => handleDelete(wf.id)}
              className="py-1 px-2 rounded-lg bg-red-500/5 border border-red-500/10 text-red-600 text-[8px] hover:bg-red-500/10 hover:text-red-400 transition-all active:scale-95"
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      {/* Create new */}
      {showNew ? (
        <div className="rounded-xl border border-[var(--color-primary)]/25 bg-[var(--color-primary)]/5 p-3 space-y-2">
          <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest">New Workflow</p>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Workflow name…"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-[var(--color-primary)]/50"
          />
          <input
            type="text"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Description (optional)…"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-[var(--color-primary)]/50"
          />
          <div>
            <p className="text-[8px] text-gray-600 mb-1">Intelligence Mode</p>
            <select
              value={newMode}
              onChange={e => setNewMode(e.target.value as IntelligenceMode)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-gray-200 focus:outline-none"
            >
              {Object.entries(MODE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="flex-1 py-1.5 rounded-lg bg-[var(--color-primary)]/20 border border-[var(--color-primary)]/30 text-[var(--color-primary)] text-[9px] font-bold uppercase tracking-widest hover:bg-[var(--color-primary)]/30 transition-all active:scale-95 disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => setShowNew(false)}
              className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-[9px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowNew(true)}
          className="w-full py-2 rounded-xl border border-dashed border-white/10 text-gray-600 text-[9px] hover:border-white/20 hover:text-gray-400 transition-all"
        >
          ⊕ New Workflow
        </button>
      )}
    </div>
  );
}
