/**
 * HardwarePanel.tsx — Steps 1–10 UI.
 *
 * Displays hardware probe results, backend status, model list,
 * download progress and runtime recommendations.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    checkPorts,
    deleteModel,
    getHardwareProbe,
    getProcessStatus,
    getRuntimeRecommendation,
    installBackend,
    listModels,
    ModelInfo,
    ProcessStatus,
    pullModel,
    PullProgress,
    startBackend,
    stopBackend,
    type HardwareProbe,
} from '../services/runtimeService';

// ── small badge ────────────────────────────────────────────────────────────
const Pill: React.FC<{ label: string; color?: string; title?: string }> = ({
    label, color = 'text-gray-400 border-gray-600/40 bg-gray-600/10', title,
}) => (
    <span
        className={`px-1.5 py-0.5 rounded border text-[9px] font-bold tracking-wider ${color}`}
        title={title}
    >
        {label}
    </span>
);

const GreenPill = (p: { label: string; title?: string }) =>
    <Pill {...p} color="text-emerald-300 border-emerald-500/40 bg-emerald-500/10" />;
const WarnPill  = (p: { label: string; title?: string }) =>
    <Pill {...p} color="text-amber-300 border-amber-500/40 bg-amber-500/10" />;

function mb(v: number | null | undefined, unit = 'MB') {
    if (v == null) return '—';
    return v >= 1024 ? `${(v / 1024).toFixed(1)} GB` : `${v} ${unit}`;
}

// ── main component ─────────────────────────────────────────────────────────
const HardwarePanel: React.FC = () => {
    const [probe,    setProbe]    = useState<HardwareProbe | null>(null);
    const [procs,    setProcs]    = useState<ProcessStatus[]>([]);
    const [models,   setModels]   = useState<Record<string, ModelInfo[]>>({});
    const [loading,  setLoading]  = useState(true);
    const [err,      setErr]      = useState<string | null>(null);
    const [pulling,  setPulling]  = useState<string | null>(null);
    const [progress, setProgress] = useState<PullProgress | null>(null);
    const [pullInput, setPullInput] = useState('');
    const cancelPullRef = useRef<(() => void) | null>(null);

    const refresh = useCallback(async () => {
        try {
            setLoading(true);
            const [hw, ps, ml] = await Promise.all([
                getHardwareProbe(true),
                getProcessStatus(),
                listModels(),
            ]);
            setProbe(hw);
            setProcs(ps.processes);
            setModels(ml.models as Record<string, ModelInfo[]>);
            setErr(null);
        } catch (e) {
            setErr(String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const handleStart = async (backend: 'ollama' | 'llama.cpp') => {
        try {
            await startBackend(backend);
            await refresh();
        } catch (e) { setErr(String(e)); }
    };

    const handleStop = async (name: string) => {
        await stopBackend(name);
        await refresh();
    };

    const handleInstall = async (backend: 'ollama' | 'llama.cpp') => {
        try {
            await installBackend(backend);
            await refresh();
        } catch (e) { setErr(String(e)); }
    };

    const handlePull = () => {
        const m = pullInput.trim();
        if (!m || pulling) return;
        setPulling(m);
        setProgress(null);
        const cancel = pullModel(
            m,
            (p) => setProgress(p),
            () => { setPulling(null); setProgress(null); setPullInput(''); refresh(); },
            (e) => { setErr(e); setPulling(null); setProgress(null); },
        );
        cancelPullRef.current = cancel;
    };

    const handleDelete = async (name: string) => {
        await deleteModel(name);
        await refresh();
    };

    if (loading && !probe) {
        return (
            <div className="p-4 text-xs text-gray-500 animate-pulse">
                Probing hardware…
            </div>
        );
    }

    return (
        <div className="space-y-5 text-xs text-gray-300">
            {err && (
                <div className="px-3 py-2 rounded bg-red-900/30 border border-red-700/40 text-red-300">
                    {err}
                </div>
            )}

            {/* ── Hardware ── */}
            {probe && (
                <section>
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                        Hardware
                    </h3>

                    {/* CPU */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="text-gray-200 font-medium truncate max-w-[200px]" title={probe.cpu.name}>
                            {probe.cpu.name}
                        </span>
                        <Pill label={`${probe.cpu.logical_cores ?? '?'}T`} title="Logical threads" />
                        <Pill label={`RAM ${mb(probe.ram.total_mb)}`} title={`Used: ${mb(probe.ram.used_mb)}`} />
                        {probe.ram.percent != null && (
                            <Pill label={`${probe.ram.percent.toFixed(0)}% used`}
                                  color={probe.ram.percent > 85 ? 'text-red-300 border-red-700/40 bg-red-900/20' : undefined} />
                        )}
                    </div>

                    {/* GPUs */}
                    {probe.gpus.map(g => (
                        <div key={g.index} className="flex flex-wrap items-center gap-1.5 mb-1 pl-1 border-l border-purple-700/30">
                            <span className="text-purple-300 font-medium truncate max-w-[180px]" title={g.name}>
                                {g.name}
                            </span>
                            <GreenPill label={g.compute_api.toUpperCase()} />
                            {g.vram_total_mb != null && (
                                <Pill label={`VRAM ${mb(g.vram_total_mb)}`} title={`Free: ${mb(g.vram_free_mb)}`} />
                            )}
                            {g.util_pct != null && <Pill label={`${g.util_pct}% GPU`} />}
                            {g.temp_c != null && <Pill label={`${g.temp_c}°C`}
                                color={g.temp_c > 80 ? 'text-red-300 border-red-700/40 bg-red-900/20' : undefined} />}
                        </div>
                    ))}

                    {/* Apple Silicon */}
                    {probe.apple_silicon && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-1 pl-1 border-l border-blue-700/30">
                            <span className="text-blue-300 font-medium">{probe.apple_silicon.name}</span>
                            <GreenPill label="METAL / MPS" />
                            <Pill label={`Unified ${mb(probe.apple_silicon.unified_memory_mb)}`} />
                        </div>
                    )}

                    {/* NPU */}
                    {probe.npu && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-1 pl-1 border-l border-cyan-700/30">
                            <span className="text-cyan-300 font-medium truncate max-w-[180px]">{probe.npu.name}</span>
                            <GreenPill label="NPU" title={probe.npu.compute_api} />
                        </div>
                    )}

                    <div className="mt-1.5 flex flex-wrap gap-1">
                        <Pill label={`Tier: ${probe.recommended_tier.replace('_', ' ')}`}
                              color="text-blue-300 border-blue-500/40 bg-blue-500/10" />
                        {probe.compute_backends_available.map(b => (
                            <Pill key={b} label={b.toUpperCase()} />
                        ))}
                    </div>
                </section>
            )}

            {/* ── Backend processes ── */}
            <section>
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Inference Backends
                </h3>
                {procs.length === 0 && (
                    <p className="text-gray-500 text-[10px] mb-2">No managed processes running.</p>
                )}
                {procs.map(p => (
                    <div key={p.name} className="flex items-center gap-2 mb-1.5">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p.healthy ? 'bg-emerald-400' : p.running ? 'bg-amber-400' : 'bg-gray-600'}`} />
                        <span className="font-mono text-gray-200">{p.name}</span>
                        <Pill label={`:${p.port}`} />
                        {p.uptime_s != null && <Pill label={`up ${p.uptime_s}s`} />}
                        <button onClick={() => handleStop(p.name)}
                            className="ml-auto text-[9px] px-1.5 py-0.5 rounded border border-red-700/40 text-red-300 hover:bg-red-900/20">
                            Stop
                        </button>
                    </div>
                ))}

                <div className="flex gap-2 mt-2">
                    {(['ollama', 'llama.cpp'] as const).map(b => (
                        <button key={b}
                            onClick={() => handleStart(b)}
                            className="px-2 py-1 rounded border border-gray-600/40 text-gray-300 hover:bg-white/5 text-[10px]">
                            Start {b}
                        </button>
                    ))}
                    <button onClick={refresh}
                        className="ml-auto px-2 py-1 rounded border border-gray-600/40 text-gray-400 hover:bg-white/5 text-[10px]">
                        ↻ Refresh
                    </button>
                </div>
            </section>

            {/* ── Pull model ── */}
            <section>
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Pull Model
                </h3>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={pullInput}
                        onChange={e => setPullInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handlePull()}
                        placeholder="llama3.1:8b-instruct-q4_K_M"
                        className="flex-1 px-2 py-1 bg-gray-800/50 border border-gray-700/50 rounded text-[11px] font-mono focus:outline-none"
                        disabled={!!pulling}
                    />
                    <button
                        onClick={handlePull}
                        disabled={!!pulling || !pullInput.trim()}
                        className="px-3 py-1 rounded border border-purple-600/40 text-purple-300 hover:bg-purple-900/20 text-[10px] disabled:opacity-50">
                        {pulling ? 'Pulling…' : 'Pull'}
                    </button>
                    {pulling && (
                        <button onClick={() => cancelPullRef.current?.()}
                            className="px-2 py-1 rounded border border-red-700/40 text-red-300 text-[10px]">
                            Cancel
                        </button>
                    )}
                </div>
                {progress && (
                    <div className="mt-2">
                        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-purple-500 transition-all"
                                 style={{ width: `${progress.percent}%` }} />
                        </div>
                        <p className="text-[9px] text-gray-500 mt-1">
                            {progress.status} — {progress.percent.toFixed(1)}%
                            {progress.total > 0 && ` (${mb(Math.round(progress.completed / 1024 / 1024))} / ${mb(Math.round(progress.total / 1024 / 1024))})`}
                        </p>
                    </div>
                )}
            </section>

            {/* ── Model list ── */}
            {Object.entries(models).map(([type, list]) => list.length === 0 ? null : (
                <section key={type}>
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                        {type} Models ({list.length})
                    </h3>
                    <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-hide">
                        {list.map((m, i) => (
                            <div key={i} className="flex items-center gap-2 group">
                                <span className="font-mono text-gray-200 truncate flex-1" title={m.path}>{m.name}</span>
                                {m.size_mb != null && <Pill label={mb(m.size_mb)} />}
                                <Pill label={m.source} />
                                {m.source === 'ollama' && (
                                    <button
                                        onClick={() => handleDelete(m.name)}
                                        className="opacity-0 group-hover:opacity-100 text-[9px] px-1.5 py-0.5 rounded border border-red-700/40 text-red-300 hover:bg-red-900/20 flex-shrink-0">
                                        ✕
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
};

export default HardwarePanel;
