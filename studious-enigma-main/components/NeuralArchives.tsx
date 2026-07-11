
import React, { useEffect, useState } from 'react';
import {
  createSnapshot,
  deleteSnapshot,
  listSnapshots,
  restoreSnapshot,
  type AtlanteanSnapshotRecord,
} from '../services/atlanteanService';
import Icon from './Icon';
import HeatmapPanel from './HeatmapPanel';

interface NeuralArchivesProps {
  currentSessionId: string;
  onNewSession: () => void;
  onRestoredSnapshot?: () => Promise<void> | void;
}

const NeuralArchives: React.FC<NeuralArchivesProps> = ({
  currentSessionId,
  onNewSession,
  onRestoredSnapshot,
}) => {
  const [archives, setArchives] = useState<AtlanteanSnapshotRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [busySnapshotId, setBusySnapshotId] = useState<string | null>(null);
  const [mode, setMode] = useState<'snapshots' | 'fields'>('snapshots');

  const loadArchives = async () => {
    try {
      setLoading(true);
      const data = await listSnapshots(80, currentSessionId);
      setArchives(data.snapshots || []);
    } catch (error) {
      console.error('Failed to load snapshots:', error);
      setArchives([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadArchives();
  }, [currentSessionId]);

  const handleCreateSnapshot = async () => {
    try {
      setIsCreatingSnapshot(true);
      await createSnapshot(undefined, currentSessionId);
      await loadArchives();
    } catch (error) {
      console.error('Failed to create snapshot:', error);
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const handleRestore = async (snapshotId: string) => {
    try {
      setBusySnapshotId(snapshotId);
      await restoreSnapshot(snapshotId, currentSessionId);
      if (onRestoredSnapshot) {
        await onRestoredSnapshot();
      }
    } catch (error) {
      console.error('Failed to restore snapshot:', error);
    } finally {
      setBusySnapshotId(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent, snapshotId: string) => {
    e.stopPropagation();
    if (confirm('Confirm permanent deletion of this neural snapshot?')) {
      try {
        setBusySnapshotId(snapshotId);
        await deleteSnapshot(snapshotId, currentSessionId);
        await loadArchives();
      } catch (error) {
        console.error('Failed to delete snapshot:', error);
      } finally {
        setBusySnapshotId(null);
      }
    }
  };

  const formatSnapshotDate = (value?: number | string): string => {
    if (typeof value === 'number') {
      return new Date(value).toLocaleDateString();
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return new Date(parsed).toLocaleDateString();
      }
      const direct = new Date(value);
      if (!Number.isNaN(direct.getTime())) {
        return direct.toLocaleDateString();
      }
    }
    return 'Unknown date';
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-black/20">
      <div className="p-4 border-b border-white/5">
        <div className="mb-3 flex items-center gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
          <button
            onClick={() => setMode('snapshots')}
            className={`flex-1 py-2 text-[9px] font-bold uppercase tracking-[0.2em] rounded transition-all ${mode === 'snapshots' ? 'bg-white/10 text-[var(--color-primary)]' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Snapshots
          </button>
          <button
            onClick={() => setMode('fields')}
            className={`flex-1 py-2 text-[9px] font-bold uppercase tracking-[0.2em] rounded transition-all ${mode === 'fields' ? 'bg-white/10 text-[var(--color-primary)]' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Field View
          </button>
        </div>
        <button 
          onClick={onNewSession}
          className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--color-primary)] text-black font-bold text-[10px] uppercase tracking-[0.2em] rounded-xl hover:opacity-90 transition-all active:scale-95"
        >
          <Icon name="sparkles" className="w-4 h-4" />
          Initialize New Link
        </button>
        <button
          onClick={handleCreateSnapshot}
          disabled={isCreatingSnapshot}
          className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 bg-white/5 text-gray-200 font-bold text-[10px] uppercase tracking-[0.18em] rounded-xl border border-white/10 hover:bg-white/10 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name="archive" className="w-3.5 h-3.5" />
          {isCreatingSnapshot ? 'Capturing...' : 'Capture Snapshot'}
        </button>
      </div>

      {mode === 'fields' ? (
        <HeatmapPanel currentSessionId={currentSessionId} />
      ) : (
      <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-20">
            <Icon name="refresh" className="w-8 h-8 animate-spin" />
            <span className="text-[10px] font-mono uppercase tracking-widest">Scanning Storage...</span>
          </div>
        ) : archives.length === 0 ? (
          <div className="text-center py-20 opacity-30">
            <p className="text-[10px] font-mono uppercase tracking-widest">No Snapshots Found</p>
          </div>
        ) : (
          archives.map((snapshot) => (
            <div 
              key={snapshot.id}
              onClick={() => handleRestore(snapshot.id)}
              className={`group relative p-4 rounded-xl border transition-all cursor-pointer transform-gpu hover:translate-x-1 ${
                busySnapshotId === snapshot.id
                  ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)] shadow-[0_0_15px_rgba(74,222,128,0.1)]'
                  : 'bg-white/5 border-white/5 hover:border-white/20'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className={`text-[8px] font-mono uppercase tracking-tighter ${busySnapshotId === snapshot.id ? 'text-[var(--color-primary)]' : 'text-gray-600'}`}>
                  SNAP: {snapshot.id.split('-')[0]}
                </span>
                <button 
                  onClick={(e) => handleDelete(e, snapshot.id)}
                  disabled={busySnapshotId === snapshot.id}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-600 hover:text-red-500 transition-all"
                >
                  <Icon name="trash" className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className={`text-xs line-clamp-2 leading-relaxed ${busySnapshotId === snapshot.id ? 'text-white font-bold' : 'text-gray-300'}`}>
                {snapshot.label || 'Phase lock snapshot'}
              </p>
              <div className="mt-2 text-[9px] font-mono uppercase tracking-wider text-gray-500">
                Phi: {snapshot.phase_lock?.Phi?.toFixed?.(3) ?? 'n/a'}
              </div>
              <div className="mt-3 flex items-center gap-2 text-[8px] font-mono text-gray-500 uppercase tracking-widest">
                <Icon name="clock" className="w-3 h-3" />
                {formatSnapshotDate(snapshot.created_at)}
              </div>
              {busySnapshotId === snapshot.id && (
                <div className="mt-2 text-[9px] uppercase tracking-wider text-[var(--color-primary)] font-mono">
                  Applying snapshot...
                </div>
              )}
            </div>
          ))
        )}
      </div>
      )}
      
      <div className="p-4 border-t border-white/5 bg-black/40">
        <div className="flex items-center gap-2 text-[9px] font-mono text-gray-600 uppercase">
          <Icon name="archive" className="w-3 h-3" />
          <span>Atlantean Snapshot Index</span>
        </div>
      </div>
    </div>
  );
};

export default NeuralArchives;
