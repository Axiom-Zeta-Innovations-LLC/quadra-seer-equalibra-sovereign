import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveTask } from '../../services/operationsService';

// NOTE: mock — no backend task runner exists yet. Remove mock and wire to /api/atlantean/tasks/current when ready.

const MOCK_TASK: ActiveTask | null = null;  // null = idle

function ProgressRing({ value }: { value: number }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <svg width="44" height="44" className="-rotate-90">
      <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
      <circle
        cx="22" cy="22" r={r} fill="none"
        stroke="var(--color-primary)" strokeWidth="3"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        className="transition-all duration-700"
      />
    </svg>
  );
}

const STATE_LABEL: Record<string, string> = {
  queued: 'Queued',
  initializing: 'Initializing',
  running: 'Running',
  paused: 'Paused',
  awaiting_approval: 'Awaiting Approval',
  verifying: 'Verifying',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const STATE_COLOR: Record<string, string> = {
  queued: 'text-gray-400',
  initializing: 'text-cyan-400',
  running: 'text-[var(--color-primary)]',
  paused: 'text-amber-400',
  awaiting_approval: 'text-orange-400 animate-pulse',
  verifying: 'text-purple-400',
  completed: 'text-emerald-400',
  failed: 'text-red-400',
  cancelled: 'text-gray-500',
};

function formatElapsed(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

interface Props {
  onOpenProfile?: () => void;
}

export default function TaskController({ onOpenProfile: _ }: Props) {
  const [task, setTask] = useState<ActiveTask | null>(MOCK_TASK);
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    // NOTE: mock — no backend support yet
    setTask(null);
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 5_000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Elapsed timer when task is running
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (task?.state === 'running' || task?.state === 'verifying' || task?.state === 'initializing') {
      tickRef.current = setInterval(() => setElapsed(e => e + 1000), 1000);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [task?.id, task?.state]);

  if (!task) {
    return (
      <div className="rounded-xl border border-white/6 bg-white/3 p-3">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
          <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">No active task</span>
        </div>
        <p className="mt-1 text-[9px] text-gray-600">The reasoning engine is idle.</p>
        <p className="mt-2 text-[8px] text-gray-700 italic">
          Task monitoring requires a running workflow or agent task.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/4 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <ProgressRing value={task.progress} />
          <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-[var(--color-primary)]">
            {task.progress}%
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-white truncate">{task.name}</p>
          <p className={`text-[9px] font-mono mt-0.5 ${STATE_COLOR[task.state] ?? 'text-gray-400'}`}>
            {STATE_LABEL[task.state] ?? task.state}
          </p>
          <p className="text-[8px] text-gray-600 mt-0.5">{task.stage}</p>
        </div>
        <span className="text-[8px] text-gray-600 font-mono shrink-0">
          {formatElapsed(task.elapsedMs + elapsed)}
        </span>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-2">
        {[
          ['Model', task.model],
          ['Routing', task.isLocal ? '◉ Local' : '⬤ Cloud'],
          ['Privacy', task.privacyBoundary],
          ['Mode', task.intelligenceMode],
          ['Memory', task.memoryStatus],
          ['Verify', task.verificationStatus],
        ].map(([label, val]) => (
          <div key={label} className="bg-black/20 rounded-lg px-2 py-1.5">
            <p className="text-[7px] uppercase tracking-widest text-gray-600">{label}</p>
            <p className="text-[9px] text-gray-300 font-mono mt-0.5 truncate">{val}</p>
          </div>
        ))}
      </div>

      {/* Active tools */}
      {task.tools.length > 0 && (
        <div>
          <p className="text-[7px] uppercase tracking-widest text-gray-600 mb-1">Active Tools</p>
          <div className="flex flex-wrap gap-1">
            {task.tools.map(t => (
              <span key={t} className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 rounded-[4px] px-1.5 py-0.5 text-[8px] text-[var(--color-primary)] font-mono">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      {task.state === 'awaiting_approval' && (
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-2">
          <p className="text-[9px] text-orange-300 font-bold mb-2">Task requires your approval to continue</p>
          <div className="flex gap-2">
            <button className="flex-1 py-1.5 rounded-lg bg-orange-500/20 border border-orange-500/30 text-orange-300 text-[9px] font-bold uppercase tracking-widest hover:bg-orange-500/30 transition-all">
              Approve
            </button>
            <button className="flex-1 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-bold uppercase tracking-widest hover:bg-red-500/20 transition-all">
              Cancel
            </button>
          </div>
        </div>
      )}

      {(task.state === 'running' || task.state === 'initializing' || task.state === 'verifying') && (
        <div className="flex gap-2">
          <button className="flex-1 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[9px] font-bold uppercase tracking-widest hover:bg-amber-500/20 transition-all">
            Pause
          </button>
          <button className="flex-1 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-bold uppercase tracking-widest hover:bg-red-500/20 transition-all">
            Cancel
          </button>
        </div>
      )}

      {task.state === 'paused' && (
        <button className="w-full py-1.5 rounded-lg bg-[var(--color-primary)]/20 border border-[var(--color-primary)]/30 text-[var(--color-primary)] text-[9px] font-bold uppercase tracking-widest hover:bg-[var(--color-primary)]/30 transition-all">
          Resume
        </button>
      )}
    </div>
  );
}
