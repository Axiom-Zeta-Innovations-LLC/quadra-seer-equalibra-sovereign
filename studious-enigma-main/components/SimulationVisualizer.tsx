
import React, { useEffect, useRef, useState, useMemo } from 'react';
import Chart from 'chart.js/auto';
import { useTheme } from '../context/ThemeContext';
import { Message } from '../types';
import Icon from './Icon';

interface SimulationVisualizerProps {
    history: any[];
    messages: Message[];
    recallSimulations: (searchQuery: string, limit?: number) => Promise<any[]>;
    simulationWrites: number;
}

type VizMode = 'memory' | 'temporal' | 'phase' | 'vector';
type MemorySort = 'latest' | 'highest_confidence';
type OutcomeFilter = 'all' | 'success' | 'partial' | 'failure' | 'unknown';

type MemorySimulation = {
    id: string;
    scenario: string;
    outcome: string;
    outcomeGroup: Exclude<OutcomeFilter, 'all'>;
    confidence: number;
    timestamp: number;
    raw: any;
};

const SimulationVisualizer: React.FC<SimulationVisualizerProps> = ({
    history,
    messages,
    recallSimulations,
    simulationWrites,
}) => {
    const chartContainer = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);
    const terminalEndRef = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();
    const [mode, setMode] = useState<VizMode>('memory');
    const [searchQuery, setSearchQuery] = useState('');
    const [memoryResults, setMemoryResults] = useState<any[]>([]);
    const [memorySort, setMemorySort] = useState<MemorySort>('latest');
    const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
    const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
    const [isMemoryLoading, setIsMemoryLoading] = useState(false);
    const [memoryError, setMemoryError] = useState<string | null>(null);

    const normalizeOutcomeGroup = (value: string): Exclude<OutcomeFilter, 'all'> => {
        const normalized = value.toLowerCase().trim();
        if (normalized.includes('success') || normalized === 'optimal' || normalized === 'complete') {
            return 'success';
        }
        if (normalized.includes('partial') || normalized.includes('mixed')) {
            return 'partial';
        }
        if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('aborted')) {
            return 'failure';
        }
        return 'unknown';
    };

    const loadMemoryResults = async (query: string = searchQuery) => {
        try {
            setIsMemoryLoading(true);
            setMemoryError(null);
            const results = await recallSimulations(query || '', 60);
            setMemoryResults(Array.isArray(results) ? results : []);
            setSelectedMemoryId(null);
        } catch (err) {
            setMemoryResults([]);
            setSelectedMemoryId(null);
            setMemoryError(err instanceof Error ? err.message : 'Failed to load cold memory results');
        } finally {
            setIsMemoryLoading(false);
        }
    };

    useEffect(() => {
        if (mode !== 'memory') return;
        void loadMemoryResults(searchQuery);
    }, [mode, simulationWrites]);

    useEffect(() => {
        if (mode === 'vector') {
            terminalEndRef.current?.scrollIntoView({ behavior: 'auto' });
        }
    }, [history, mode]);

    const latestChartData = useMemo(() => 
        messages.filter(m => m.chartData).pop()?.chartData,
    [messages]);

    const normalizedMemoryResults = useMemo<MemorySimulation[]>(() => {
        return memoryResults.map((item, idx) => {
            const scenario = item?.scenario || item?.content?.scenario || 'Untitled simulation';
            const outcome = String(item?.content?.outcome || item?.outcome || 'unknown');
            const confidenceRaw = Number(item?.confidence ?? item?.content?.confidence ?? 0);
            const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0;
            const tsRaw = Number(item?.timestamp ?? item?.content?.timestamp ?? Date.now());
            const timestamp = Number.isFinite(tsRaw) ? tsRaw : Date.now();

            return {
                id: String(item?.id || item?.key || `${scenario}-${timestamp}-${idx}`),
                scenario,
                outcome,
                outcomeGroup: normalizeOutcomeGroup(outcome),
                confidence,
                timestamp,
                raw: item,
            };
        });
    }, [memoryResults]);

    const filteredAndSortedMemoryResults = useMemo(() => {
        const base = normalizedMemoryResults.filter((entry) => {
            if (outcomeFilter === 'all') {
                return true;
            }
            return entry.outcomeGroup === outcomeFilter;
        });

        const sorted = [...base];
        if (memorySort === 'highest_confidence') {
            sorted.sort((a, b) => b.confidence - a.confidence || b.timestamp - a.timestamp);
        } else {
            sorted.sort((a, b) => b.timestamp - a.timestamp || b.confidence - a.confidence);
        }
        return sorted;
    }, [memorySort, normalizedMemoryResults, outcomeFilter]);

    const selectedMemory = useMemo(() => {
        if (!selectedMemoryId) {
            return null;
        }
        return filteredAndSortedMemoryResults.find((entry) => entry.id === selectedMemoryId) || null;
    }, [filteredAndSortedMemoryResults, selectedMemoryId]);

    useEffect(() => {
        if (!chartContainer.current || mode === 'vector' || mode === 'memory') {
            if (chartInstance.current) {
                chartInstance.current.destroy();
                chartInstance.current = null;
            }
            return;
        }

        const ctx = chartContainer.current.getContext('2d');
        if (!ctx) return;
        
        const styles = getComputedStyle(document.documentElement);
        const primaryColor = styles.getPropertyValue('--color-primary').trim() || '#4ade80';
        const accentColor = styles.getPropertyValue('--color-accent').trim() || '#facc15';
        const textColorSecondary = styles.getPropertyValue('--color-text-secondary').trim() || '#aaa';
        const borderColor = styles.getPropertyValue('--color-border').trim() || 'rgba(255,255,255,0.1)';

        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        try {
            if (mode === 'temporal') {
                const validHistory = history.slice(-50);
                chartInstance.current = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: validHistory.map(d => d.timestamp),
                        datasets: [
                            { 
                                label: 'Processing Load', 
                                data: validHistory.map(d => d.load), 
                                borderColor: accentColor, 
                                backgroundColor: `${accentColor}22`, 
                                fill: true, 
                                tension: 0.3,
                                pointRadius: validHistory.map(d => d.is_live_event ? 3 : 0),
                                pointBackgroundColor: accentColor,
                                borderWidth: 2
                            },
                            { 
                                label: 'Neural Stability', 
                                data: validHistory.map(d => d.stability), 
                                borderColor: primaryColor, 
                                backgroundColor: `${primaryColor}11`, 
                                fill: true, 
                                tension: 0.4,
                                pointRadius: 0,
                                borderWidth: 1.5
                            }
                        ],
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: { duration: history.some(h => h.is_live_event) ? 0 : 400 },
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { display: false },
                            y: { 
                                min: 0, 
                                max: 1, 
                                ticks: { color: textColorSecondary, font: { size: 8 } }, 
                                grid: { color: borderColor } 
                            }
                        }
                    },
                });
            } else if (mode === 'phase') {
                const data = latestChartData || { labels: ['Stability', 'Coherence', 'Drift', 'Load', 'Entropy'], datasets: [{ data: [0.8, 0.7, 0.2, 0.3, 0.1] }], type: 'radar' };
                
                chartInstance.current = new Chart(ctx, {
                    type: 'radar',
                    data: {
                        labels: data.labels,
                        datasets: (data.datasets || []).map(ds => ({
                            ...ds,
                            borderColor: accentColor,
                            backgroundColor: `${accentColor}22`,
                            pointBackgroundColor: primaryColor,
                            borderWidth: 1
                        }))
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: { duration: 400 },
                        scales: {
                            r: { 
                                min: 0, 
                                max: 1, 
                                angleLines: { color: borderColor }, 
                                grid: { color: borderColor }, 
                                pointLabels: { color: textColorSecondary, font: { size: 9 } }, 
                                ticks: { display: false } 
                            }
                        },
                        plugins: { legend: { display: false } }
                    }
                });
            }
        } catch (err) {
            console.error("Chart Error:", err);
        }

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
                chartInstance.current = null;
            }
        };
    }, [history, latestChartData, theme, mode]);

    return (
        <div className="flex-1 flex flex-col min-h-0 transform-gpu">
            <div className="flex items-center justify-between px-5 py-4 border-b bg-black/10" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-2.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${history[history.length-1]?.is_live_event ? 'bg-green-500 animate-ping shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}></div>
                    <span className="text-[10px] font-black tracking-[0.2em] uppercase text-white opacity-90">Telemetry Dashboard</span>
                </div>
                <div className="flex gap-1.5">
                    <button onClick={() => setMode('memory')} className={`p-1.5 rounded transition-all ${mode === 'memory' ? 'bg-white/10 text-[var(--color-accent)]' : 'text-gray-500 hover:text-white'}`} title="Cold Memory"><Icon name="archive" className="w-4 h-4" /></button>
                    <button onClick={() => setMode('temporal')} className={`p-1.5 rounded transition-all ${mode === 'temporal' ? 'bg-white/10 text-[var(--color-accent)]' : 'text-gray-500 hover:text-white'}`}><Icon name="swatch" className="w-4 h-4" /></button>
                    <button onClick={() => setMode('phase')} className={`p-1.5 rounded transition-all ${mode === 'phase' ? 'bg-white/10 text-[var(--color-accent)]' : 'text-gray-500 hover:text-white'}`}><Icon name="sparkles" className="w-4 h-4" /></button>
                    <button onClick={() => setMode('vector')} className={`p-1.5 rounded transition-all ${mode === 'vector' ? 'bg-white/10 text-[var(--color-accent)]' : 'text-gray-500 hover:text-white'}`}><Icon name="eye" className="w-4 h-4" /></button>
                </div>
            </div>

            <div className="flex-1 min-h-0 relative bg-black/5 overflow-hidden">
                {mode === 'memory' ? (
                    <div className="h-full overflow-y-auto p-4 space-y-3 scrollbar-hide" data-testid="simulation-memory-mode">
                        <div className="flex items-center gap-2">
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        void loadMemoryResults(searchQuery);
                                    }
                                }}
                                placeholder="Search simulations in cold memory..."
                                className="flex-1 px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-lg text-gray-200 focus:outline-none focus:border-[var(--color-accent)]"
                            />
                            <button
                                onClick={() => void loadMemoryResults(searchQuery)}
                                className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-[var(--color-accent)] text-black"
                            >
                                Recall
                            </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg p-1">
                                <button
                                    onClick={() => setMemorySort('latest')}
                                    data-testid="memory-sort-latest"
                                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${memorySort === 'latest' ? 'bg-[var(--color-accent)] text-black' : 'text-gray-300 hover:bg-white/10'}`}
                                >
                                    Latest
                                </button>
                                <button
                                    onClick={() => setMemorySort('highest_confidence')}
                                    data-testid="memory-sort-highest-confidence"
                                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${memorySort === 'highest_confidence' ? 'bg-[var(--color-accent)] text-black' : 'text-gray-300 hover:bg-white/10'}`}
                                >
                                    Highest Confidence
                                </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                                {(['all', 'success', 'partial', 'failure', 'unknown'] as OutcomeFilter[]).map((filter) => (
                                    <button
                                        key={filter}
                                        onClick={() => setOutcomeFilter(filter)}
                                        data-testid={`memory-filter-${filter}`}
                                        className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border ${outcomeFilter === filter ? 'bg-white/15 text-white border-white/30' : 'bg-transparent text-gray-400 border-white/10 hover:text-gray-200 hover:border-white/20'}`}
                                    >
                                        {filter}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {isMemoryLoading && (
                            <div className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Loading cold memory...</div>
                        )}

                        {memoryError && (
                            <div className="text-[10px] font-mono text-red-300 border border-red-500/20 bg-red-500/10 rounded-lg px-3 py-2">
                                {memoryError}
                            </div>
                        )}

                        {!isMemoryLoading && !memoryError && filteredAndSortedMemoryResults.length === 0 && (
                            <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 py-6 text-center">
                                No cold-memory simulations found.
                            </div>
                        )}

                        {selectedMemory && (
                            <div className="rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-[10px] font-black uppercase tracking-wider text-[var(--color-accent)]">
                                        Simulation Detail
                                    </div>
                                    <button
                                        onClick={() => setSelectedMemoryId(null)}
                                        className="text-[10px] font-bold uppercase tracking-wide text-gray-300 hover:text-white"
                                    >
                                        Close
                                    </button>
                                </div>
                                <div className="mt-2 text-xs text-gray-100 leading-relaxed">{selectedMemory.scenario}</div>
                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] font-mono text-gray-300">
                                    <div className="rounded-md bg-black/20 px-2 py-1">
                                        Outcome: <span className="text-white">{selectedMemory.outcome}</span>
                                    </div>
                                    <div className="rounded-md bg-black/20 px-2 py-1">
                                        Confidence: <span className="text-white">{(selectedMemory.confidence * 100).toFixed(1)}%</span>
                                    </div>
                                    <div className="rounded-md bg-black/20 px-2 py-1">
                                        Time: <span className="text-white">{new Date(selectedMemory.timestamp).toLocaleString()}</span>
                                    </div>
                                </div>
                                <pre className="mt-2 max-h-40 overflow-auto text-[10px] leading-relaxed text-gray-300 bg-black/20 rounded-md p-2 scrollbar-hide">
{JSON.stringify(selectedMemory.raw, null, 2)}
                                </pre>
                            </div>
                        )}

                        {filteredAndSortedMemoryResults.map((item) => {
                            const created = Number.isNaN(item.timestamp) ? 'Unknown time' : new Date(item.timestamp).toLocaleString();
                            const isSelected = selectedMemoryId === item.id;

                            return (
                                <button
                                    type="button"
                                    key={item.id}
                                    onClick={() => setSelectedMemoryId(item.id)}
                                    data-testid={`memory-card-${item.id}`}
                                    className={`w-full text-left rounded-lg border p-3 transition-colors ${isSelected ? 'border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent)]">{item.outcome}</span>
                                        <span className="text-[10px] font-mono text-gray-500">{created}</span>
                                    </div>
                                    <div className="text-xs text-gray-200 leading-relaxed">{item.scenario}</div>
                                    <div className="mt-2 text-[10px] font-mono text-gray-400">
                                        Confidence {(item.confidence * 100).toFixed(1)}% | Type {item.outcomeGroup}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ) : mode === 'vector' ? (
                    <div className="h-full overflow-y-auto font-mono text-[9px] p-5 space-y-3 scrollbar-hide">
                        {history.slice(-60).map((packet, idx) => (
                            <div key={idx} className={`border-l pl-3 py-1.5 group hover:bg-white/5 transition-colors ${packet.is_live_event ? 'border-[var(--color-accent)]' : 'border-white/5'}`}>
                                <div className={`${packet.is_live_event ? 'text-[var(--color-accent)]' : 'text-[var(--color-primary)]'} opacity-40 font-bold mb-1`}>
                                    [{packet.timestamp}] {packet.is_live_event ? 'NEURAL_STRESS_EVENT' : 'SYSTEM_HEARTBEAT'}
                                </div>
                                <div className="text-gray-600 break-all leading-relaxed">{JSON.stringify(packet)}</div>
                            </div>
                        ))}
                        <div ref={terminalEndRef} />
                    </div>
                ) : (
                    <div className="absolute inset-0 p-6 flex items-center justify-center">
                        <canvas ref={chartContainer} className="w-full h-full"></canvas>
                    </div>
                )}
            </div>
            
            <footer className="px-5 py-4 bg-black/20 border-t border-white/5 flex flex-col gap-2">
                <div className="flex justify-between items-center text-[9px] font-mono tracking-widest text-gray-500 uppercase">
                    <span>{mode === 'memory' ? 'Cold Results' : 'Packets Processed'}</span>
                    <span className="text-white">{mode === 'memory' ? filteredAndSortedMemoryResults.length : history.length}</span>
                </div>
                <div className="flex justify-between items-center text-[9px] font-mono tracking-widest text-gray-500 uppercase">
                    <span>{mode === 'memory' ? 'Query' : 'Signal Coherence'}</span>
                    <span className="text-[var(--color-accent)] font-bold">
                        {mode === 'memory'
                            ? (searchQuery.trim() ? searchQuery : 'ALL')
                            : `${history.length > 0 ? (history[history.length-1].coherence * 100).toFixed(2) : '0.00'}%`}
                    </span>
                </div>
            </footer>
        </div>
    );
};

export default React.memo(SimulationVisualizer);
