import React, { useState } from 'react';
import { resolveAtlanteanApiBaseOrThrow, getAtlanteanAuthHeaders } from '../../services/atlanteanService';
import { getPinnedActions, savePinnedActions } from '../../services/operationsService';

type ActionId =
  | 'create_snapshot'
  | 'verify_replay'
  | 'apply_retention'
  | 'purge_temp'
  | 'search_memory'
  | 'export_package'
  | 'run_repair'
  | 'refresh_fields'
  | 'reload_backend';

interface QuickAction {
  id: ActionId;
  label: string;
  description: string;
  icon: string;
  color: string;
  handler: () => Promise<string>;
}

function useQuickActions(sessionId: string, onCreateSnapshot: () => Promise<void>, onExportPackage: () => Promise<void>) {
  const base = () => resolveAtlanteanApiBaseOrThrow();
  const h = () => ({ 'Content-Type': 'application/json', ...getAtlanteanAuthHeaders() });

  const ALL: QuickAction[] = [
    {
      id: 'create_snapshot',
      label: 'Snapshot',
      description: 'Capture current state',
      icon: '◎',
      color: 'text-[var(--color-primary)] border-[var(--color-primary)]/30 bg-[var(--color-primary)]/8 hover:bg-[var(--color-primary)]/15',
      handler: async () => {
        await onCreateSnapshot();
        return 'Snapshot created';
      },
    },
    {
      id: 'verify_replay',
      label: 'Verify',
      description: 'Replay integrity check',
      icon: '✓',
      color: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/8 hover:bg-emerald-500/15',
      handler: async () => {
        const r = await fetch(`${base()}/integrity/replay?session_id=${encodeURIComponent(sessionId)}`, { headers: h() });
        if (!r.ok) throw new Error(`Verify failed: ${r.status}`);
        const d = await r.json();
        return d.match ? 'Integrity verified ✓' : `Integrity issues: ${d.issues?.join(', ') ?? 'unknown'}`;
      },
    },
    {
      id: 'apply_retention',
      label: 'Retention',
      description: 'Apply retention policy',
      icon: '≡',
      color: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/8 hover:bg-cyan-500/15',
      handler: async () => {
        const r = await fetch(`${base()}/retention/apply`, {
          method: 'POST',
          headers: h(),
          body: JSON.stringify({ session_id: sessionId }),
        });
        if (!r.ok) throw new Error(`Retention failed: ${r.status}`);
        const d = await r.json();
        return `Retention applied: ${d.removed_count ?? 0} entries pruned`;
      },
    },
    {
      id: 'export_package',
      label: 'Export',
      description: 'Export encrypted package',
      icon: '↑',
      color: 'text-purple-300 border-purple-500/30 bg-purple-500/8 hover:bg-purple-500/15',
      handler: async () => {
        await onExportPackage();
        return 'Sync package exported';
      },
    },
    {
      id: 'search_memory',
      label: 'Search',
      description: 'Search cold memory',
      icon: '⌕',
      color: 'text-amber-300 border-amber-500/30 bg-amber-500/8 hover:bg-amber-500/15',
      handler: async () => {
        const query = window.prompt('Search memory:');
        if (!query) return 'Cancelled';
        const r = await fetch(`${base()}/search?query=${encodeURIComponent(query)}&session_id=${encodeURIComponent(sessionId)}&limit=5`, { headers: h() });
        if (!r.ok) throw new Error(`Search failed: ${r.status}`);
        const d = await r.json();
        return `Found ${(d.results ?? []).length} result(s)`;
      },
    },
    {
      id: 'purge_temp',
      label: 'Purge Temp',
      description: 'Delete temporary data',
      icon: '⊘',
      color: 'text-red-300 border-red-500/30 bg-red-500/8 hover:bg-red-500/15',
      handler: async () => {
        const r = await fetch(`${base()}/privacy/purge-session`, {
          method: 'POST',
          headers: h(),
          body: JSON.stringify({ session_id: sessionId }),
        });
        if (!r.ok) throw new Error(`Purge failed: ${r.status}`);
        return 'Temporary data purged';
      },
    },
    {
      id: 'run_repair',
      label: 'Repair',
      description: 'Run corruption repair',
      icon: '⚙',
      color: 'text-orange-300 border-orange-500/30 bg-orange-500/8 hover:bg-orange-500/15',
      handler: async () => {
        const r = await fetch(`${base()}/recovery/repair`, {
          method: 'POST',
          headers: h(),
          body: JSON.stringify({ session_id: sessionId }),
        });
        if (!r.ok) throw new Error(`Repair failed: ${r.status}`);
        const d = await r.json();
        return d.message ?? 'Repair completed';
      },
    },
    {
      id: 'refresh_fields',
      label: 'Refresh',
      description: 'Refresh field state',
      icon: '↻',
      color: 'text-gray-300 border-white/20 bg-white/5 hover:bg-white/10',
      handler: async () => {
        const r = await fetch(`${base()}/fields?session_id=${encodeURIComponent(sessionId)}`, { headers: h() });
        if (!r.ok) throw new Error(`Refresh failed: ${r.status}`);
        return 'Fields refreshed';
      },
    },
    {
      id: 'reload_backend',
      label: 'Reload',
      description: 'Reload backend process',
      icon: '⟲',
      color: 'text-gray-400 border-white/15 bg-white/3 hover:bg-white/8',
      handler: async () => {
        window.location.reload();
        return 'Reloading…';
      },
    },
  ];

  return ALL;
}

interface Props {
  sessionId: string;
  onCreateSnapshot: () => Promise<void>;
  onExportPackage: () => Promise<void>;
}

export default function QuickOperations({ sessionId, onCreateSnapshot, onExportPackage }: Props) {
  const actions = useQuickActions(sessionId, onCreateSnapshot, onExportPackage);
  const [pinned, setPinned] = useState(getPinnedActions);
  const [results, setResults] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState(false);

  const togglePin = (id: string) => {
    const next = pinned.includes(id)
      ? pinned.filter(p => p !== id)
      : [...pinned, id];
    setPinned(next);
    savePinnedActions(next);
  };

  const run = async (action: QuickAction) => {
    setBusy(b => ({ ...b, [action.id]: true }));
    setResults(r => { const n = { ...r }; delete n[action.id]; return n; });
    try {
      const msg = await action.handler();
      setResults(r => ({ ...r, [action.id]: msg }));
      setTimeout(() => setResults(r => { const n = { ...r }; delete n[action.id]; return n; }), 4000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed';
      setResults(r => ({ ...r, [action.id]: `⚠ ${msg}` }));
      setTimeout(() => setResults(r => { const n = { ...r }; delete n[action.id]; return n; }), 6000);
    } finally {
      setBusy(b => ({ ...b, [action.id]: false }));
    }
  };

  const pinnedActions = actions.filter(a => pinned.includes(a.id));
  const unpinnedActions = actions.filter(a => !pinned.includes(a.id));

  return (
    <div>
      {/* Pinned grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {pinnedActions.map(a => (
          <div key={a.id} className="relative group">
            <button
              onClick={() => void run(a)}
              disabled={busy[a.id]}
              className={`w-full flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl border text-center transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${a.color}`}
            >
              <span className="text-base leading-none">{a.icon}</span>
              <span className="text-[7.5px] font-bold uppercase tracking-wide leading-tight">{a.label}</span>
            </button>
            {editing && (
              <button
                onClick={() => togglePin(a.id)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[7px] flex items-center justify-center shadow-md z-10 hover:bg-red-600"
              >✕</button>
            )}
            {results[a.id] && !busy[a.id] && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-black/90 border border-white/10 rounded-lg px-2 py-1 text-[8px] text-white whitespace-nowrap z-20 pointer-events-none">
                {results[a.id]}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Edit / add more */}
      <div className="flex items-center justify-between mt-2">
        <button
          onClick={() => setEditing(e => !e)}
          className={`text-[8px] font-bold uppercase tracking-widest transition-colors ${editing ? 'text-[var(--color-primary)]' : 'text-gray-600 hover:text-gray-400'}`}
        >
          {editing ? '✓ Done' : '⊕ Customize'}
        </button>
        <span className="text-[7px] text-gray-700">{pinnedActions.length} pinned</span>
      </div>

      {/* All actions (customise mode) */}
      {editing && (
        <div className="mt-2 space-y-1 border-t border-white/6 pt-2">
          <p className="text-[8px] text-gray-600 mb-1.5">Tap + to pin an action</p>
          {unpinnedActions.map(a => (
            <div key={a.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/4 transition-colors">
              <span className="text-sm text-gray-400 w-5 text-center">{a.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-bold text-gray-300">{a.label}</p>
                <p className="text-[7px] text-gray-600">{a.description}</p>
              </div>
              <button
                onClick={() => togglePin(a.id)}
                className="text-[9px] text-[var(--color-primary)] hover:text-white font-bold transition-colors"
              >⊕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
