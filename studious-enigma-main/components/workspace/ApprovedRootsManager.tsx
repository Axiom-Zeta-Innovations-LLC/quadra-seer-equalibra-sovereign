import React, { useCallback, useEffect, useState } from 'react';
import * as autoSvc from '../../services/automationService';

interface Props {
  onToast?: (msg: string) => void;
}

export default function ApprovedRootsManager({ onToast }: Props) {
  const [roots, setRoots] = useState<string[]>([]);
  const [newRoot, setNewRoot] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await autoSvc.getApprovedRoots();
    setRoots(r);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAdd = async () => {
    if (!newRoot.trim() || busy) return;
    setBusy(true);
    try {
      const r = await autoSvc.addApprovedRoot(newRoot.trim());
      setRoots(r);
      setNewRoot('');
      onToast?.('Root added');
    } catch (e) {
      onToast?.(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  const handleRemove = async (path: string) => {
    setBusy(true);
    try {
      const r = await autoSvc.removeApprovedRoot(path);
      setRoots(r);
      onToast?.('Root removed');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2">
      <p className="text-[8px] font-bold text-gray-600 uppercase tracking-widest">Approved Filesystem Roots</p>
      <p className="text-[8px] text-gray-600">Automation actions can only access paths inside these directories.</p>

      {roots.length === 0 ? (
        <p className="text-[9px] text-amber-400 italic">⚠ No approved roots — automation is disabled until you add at least one directory.</p>
      ) : (
        <div className="space-y-1">
          {roots.map(r => (
            <div key={r} className="flex items-center gap-2 rounded-lg border border-white/6 bg-white/2 px-2.5 py-2">
              <span className="flex-1 font-mono text-[9px] text-gray-300 truncate">{r}</span>
              <button onClick={() => void handleRemove(r)} disabled={busy}
                className="text-[8px] text-red-600 hover:text-red-400 transition-colors disabled:opacity-50">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1.5">
        <input
          type="text"
          value={newRoot}
          onChange={e => setNewRoot(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void handleAdd(); }}
          placeholder="e.g. /home/user/projects"
          className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-[9px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-[var(--color-primary)]/40 font-mono"
        />
        <button onClick={() => void handleAdd()} disabled={!newRoot.trim() || busy}
          className="px-3 py-1.5 rounded-xl bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/25 text-[var(--color-primary)] text-[8px] font-bold hover:bg-[var(--color-primary)]/25 transition-all disabled:opacity-50">
          {busy ? '…' : 'Add'}
        </button>
      </div>
    </div>
  );
}
