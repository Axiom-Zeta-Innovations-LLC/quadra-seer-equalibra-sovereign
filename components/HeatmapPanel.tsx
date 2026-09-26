import React, { useEffect, useState } from 'react';
import Icon from './Icon';
import FieldHeatmap from './FieldHeatmap';
import { getFields, type FieldData } from '../services/atlanteanService';

interface HeatmapPanelProps {
  currentSessionId: string;
}

const HEATMAP_HEIGHT_STORAGE_KEY = 'atlantean.heatmap.height';
const MIN_HEATMAP_HEIGHT = 80;
const MAX_HEATMAP_HEIGHT = 220;

const HeatmapPanel: React.FC<HeatmapPanelProps> = ({ currentSessionId }) => {
  const [liveFields, setLiveFields] = useState<FieldData | null>(null);
  const [loadingFields, setLoadingFields] = useState(false);
  const [heatmapHeight, setHeatmapHeight] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(HEATMAP_HEIGHT_STORAGE_KEY);
      const value = Number(raw);
      if (Number.isFinite(value)) {
        return Math.max(MIN_HEATMAP_HEIGHT, Math.min(MAX_HEATMAP_HEIGHT, value));
      }
    } catch {
      // Ignore localStorage failures and use default.
    }
    return 96;
  });

  const updateHeatmapHeight = (nextValue: number) => {
    const clamped = Math.max(MIN_HEATMAP_HEIGHT, Math.min(MAX_HEATMAP_HEIGHT, nextValue));
    setHeatmapHeight(clamped);
    try {
      localStorage.setItem(HEATMAP_HEIGHT_STORAGE_KEY, String(clamped));
    } catch {
      // Ignore persistence failures.
    }
  };

  const loadLiveFields = async (showLoader: boolean = false) => {
    if (showLoader) setLoadingFields(true);
    try {
      const fields = await getFields(currentSessionId);
      setLiveFields(fields);
    } catch (error) {
      console.error('Failed to load field heatmap:', error);
      setLiveFields(null);
    } finally {
      if (showLoader) setLoadingFields(false);
    }
  };

  useEffect(() => {
    loadLiveFields(true);
    const interval = setInterval(() => {
      loadLiveFields();
    }, 6000);
    return () => clearInterval(interval);
  }, [currentSessionId]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-black/20">
      <div className="border-b border-white/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="eye" className="w-4 h-4 text-cyan-300" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400">
              Real-time Field Heatmap
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-mono uppercase tracking-widest text-gray-500">Size</span>
              <input
                type="range"
                min={MIN_HEATMAP_HEIGHT}
                max={MAX_HEATMAP_HEIGHT}
                step={4}
                value={heatmapHeight}
                onChange={(e) => updateHeatmapHeight(Number(e.target.value))}
                className="w-20 accent-cyan-400"
                aria-label="Resize field heatmap"
              />
            </div>
            <button
              onClick={() => loadLiveFields(true)}
              disabled={loadingFields}
              className="text-[8px] font-mono uppercase tracking-widest text-gray-500 hover:text-gray-300 disabled:opacity-50 transition-colors"
            >
              {loadingFields ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {loadingFields && !liveFields ? (
          <div className="text-[9px] font-mono text-gray-500">Loading field map...</div>
        ) : liveFields ? (
          <div className="space-y-2">
            <FieldHeatmap title="phi1 Decision Surface" field={liveFields.phi1} heightPx={heatmapHeight} />
            <FieldHeatmap title="phi5 Learning Surface" field={liveFields.phi5} heightPx={Math.max(72, Math.round(heatmapHeight * 0.82))} />
            <div className="flex items-center justify-between text-[8px] font-mono uppercase tracking-widest text-gray-500">
              <span>Learning capacity {(liveFields.learning_capacity * 100).toFixed(1)}%</span>
              <span>Phi {liveFields.Phi.toFixed(3)}</span>
            </div>
          </div>
        ) : (
          <div className="text-[9px] font-mono text-gray-500">Field map unavailable.</div>
        )}
      </div>
    </div>
  );
};

export default HeatmapPanel;
