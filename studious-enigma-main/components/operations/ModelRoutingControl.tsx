import React, { useCallback, useEffect, useState } from 'react';
import {
  getProcessStatus,
  startBackend,
  stopBackend,
  listModels,
  type ProcessStatus,
  type ModelInfo,
} from '../../services/runtimeService';
import { getRoutingSettings, type RoutingSettingsData } from '../../services/atlanteanService';
import { getSettings, setLlmProvider, setRoutingControls, type LlmProvider } from '../../services/settingsService';

interface ProviderOption {
  id: LlmProvider;
  label: string;
  local: boolean;
  description: string;
}

const PROVIDERS: ProviderOption[] = [
  { id: 'local', label: 'Local (Ollama)', local: true, description: 'Fully local. No data sent externally.' },
  { id: 'openai', label: 'OpenAI', local: false, description: 'GPT models via OpenAI API.' },
  { id: 'anthropic', label: 'Anthropic', local: false, description: 'Claude models via Anthropic API.' },
  { id: 'google', label: 'Google AI', local: false, description: 'Gemini models via Google AI.' },
];

function StatusDot({ running, healthy }: { running: boolean; healthy: boolean }) {
  const color = !running ? 'bg-red-500' : healthy ? 'bg-emerald-500' : 'bg-amber-500';
  return <span className={`w-1.5 h-1.5 rounded-full ${color} ${running && !healthy ? 'animate-pulse' : ''}`} />;
}

function UptimeStr({ s }: { s: number | null }) {
  if (!s) return null;
  if (s < 60) return <>{s}s</>;
  if (s < 3600) return <>{Math.floor(s / 60)}m</>;
  return <>{Math.floor(s / 3600)}h</>;
}

interface Props {
  onNotify?: (msg: string) => void;
}

export default function ModelRoutingControl({ onNotify }: Props) {
  const [processes, setProcesses] = useState<ProcessStatus[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [routing, setRouting] = useState<RoutingSettingsData | null>(null);
  const [loadingProc, setLoadingProc] = useState(false);
  const [busyProc, setBusyProc] = useState<Record<string, boolean>>({});
  const currentProvider = getSettings().llmProvider;
  const [selectedProvider, setSelectedProvider] = useState<LlmProvider>(currentProvider || 'local');

  const refreshProcesses = useCallback(async () => {
    setLoadingProc(true);
    try {
      const { processes: procs } = await getProcessStatus();
      setProcesses(procs);
    } catch { /* ignore */ } finally {
      setLoadingProc(false);
    }
  }, []);

  const refreshModels = useCallback(async () => {
    try {
      const { models: m } = await listModels();
      setModels([...m.language, ...m.speech, ...m.voice]);
    } catch { /* ignore */ }
  }, []);

  const refreshRouting = useCallback(async () => {
    try {
      const r = await getRoutingSettings();
      setRouting(r);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void refreshProcesses();
    void refreshModels();
    void refreshRouting();
    const i = setInterval(() => void refreshProcesses(), 10_000);
    return () => clearInterval(i);
  }, [refreshProcesses, refreshModels, refreshRouting]);

  const handleStartStop = async (proc: ProcessStatus) => {
    setBusyProc(b => ({ ...b, [proc.name]: true }));
    try {
      if (proc.running) {
        await stopBackend(proc.name);
        onNotify?.(`Stopped ${proc.name}`);
      } else {
        await startBackend(proc.name as 'ollama' | 'llama.cpp');
        onNotify?.(`Starting ${proc.name}…`);
      }
      await refreshProcesses();
    } catch (e) {
      onNotify?.(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyProc(b => ({ ...b, [proc.name]: false }));
    }
  };

  const handleProviderChange = (p: LlmProvider) => {
    setSelectedProvider(p);
    setLlmProvider(p);
    onNotify?.(`Provider changed to ${p}`);
  };

  const handleRoutingChange = (key: keyof RoutingSettingsData, val: unknown) => {
    setRoutingControls({ [key]: val } as Record<string, unknown>);
    setRouting(r => r ? { ...r, [key]: val } : r);
  };

  return (
    <div className="space-y-4">
      {/* ─ Provider ─ */}
      <div>
        <p className="text-[8px] uppercase tracking-widest text-gray-600 mb-1.5">Provider</p>
        <div className="space-y-1.5">
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              onClick={() => handleProviderChange(p.id)}
              className={`w-full text-left flex items-center gap-3 rounded-xl border px-3 py-2 transition-all active:scale-[0.98]
                ${selectedProvider === p.id
                  ? 'border-[var(--color-primary)]/40 bg-[var(--color-primary)]/8'
                  : 'border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/5'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.local ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold ${selectedProvider === p.id ? 'text-[var(--color-primary)]' : 'text-gray-200'}`}>
                    {p.label}
                  </span>
                  {p.local && <span className="text-[6px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-500/10 rounded-[3px] px-1">local</span>}
                </div>
                <p className="text-[8px] text-gray-500 truncate">{p.description}</p>
              </div>
              {selectedProvider === p.id && (
                <span className="text-[var(--color-primary)] text-[10px] shrink-0">●</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ─ Runtime processes ─ */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[8px] uppercase tracking-widest text-gray-600">Runtime Processes</p>
          <button
            onClick={() => void refreshProcesses()}
            disabled={loadingProc}
            className="text-[8px] text-gray-600 hover:text-gray-300 transition-colors"
          >{loadingProc ? '…' : '↺'}</button>
        </div>

        {processes.length === 0 ? (
          <p className="text-[9px] text-gray-600 italic">No managed processes detected.</p>
        ) : (
          <div className="space-y-1.5">
            {processes.map(proc => (
              <div key={proc.name} className="rounded-xl border border-white/8 bg-white/3 px-3 py-2 flex items-center gap-3">
                <StatusDot running={proc.running} healthy={proc.healthy} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-gray-200">{proc.name}</span>
                    <span className="text-[7px] text-gray-600 font-mono">:{proc.port}</span>
                  </div>
                  <p className="text-[8px] text-gray-500">
                    {proc.running ? (
                      <>Running · {proc.pid && <span className="font-mono">pid {proc.pid}</span>} · <UptimeStr s={proc.uptime_s} /></>
                    ) : 'Stopped'}
                  </p>
                </div>
                <button
                  onClick={() => void handleStartStop(proc)}
                  disabled={busyProc[proc.name]}
                  className={`py-1 px-2.5 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50
                    ${proc.running
                      ? 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20'
                      : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'}`}
                >
                  {busyProc[proc.name] ? '…' : proc.running ? 'Stop' : 'Start'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─ Local models ─ */}
      {models.length > 0 && (
        <div>
          <p className="text-[8px] uppercase tracking-widest text-gray-600 mb-1.5">Local Models</p>
          <div className="space-y-1">
            {models.slice(0, 8).map(m => (
              <div key={m.name} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/4 transition-colors">
                <span className={`w-1 h-1 rounded-full ${m.type === 'language' ? 'bg-[var(--color-primary)]' : 'bg-cyan-400'}`} />
                <span className="flex-1 text-[9px] text-gray-300 font-mono truncate">{m.name}</span>
                {m.size_mb && (
                  <span className="text-[7px] text-gray-600">{(m.size_mb / 1024).toFixed(1)}GB</span>
                )}
                <span className="text-[7px] text-gray-700 uppercase">{m.type}</span>
              </div>
            ))}
            {models.length > 8 && (
              <p className="text-[8px] text-gray-600 text-center pt-1">+{models.length - 8} more</p>
            )}
          </div>
        </div>
      )}

      {/* ─ Cloud escalation toggle ─ */}
      {routing && (
        <div>
          <p className="text-[8px] uppercase tracking-widest text-gray-600 mb-1.5">Routing Controls</p>
          <div className="space-y-2">
            {[
              { key: 'local_only' as const, label: 'Force Local Only', description: 'Block all cloud routing' },
              { key: 'allow_cloud_fallback' as const, label: 'Allow Cloud Fallback', description: 'Use cloud when local insufficient' },
            ].map(({ key, label, description }) => {
              const val = (routing as Record<string, unknown>)[key];
              const checked = Boolean(val);
              return (
                <div key={key} className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/3 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-gray-200">{label}</p>
                    <p className="text-[8px] text-gray-500">{description}</p>
                  </div>
                  <button
                    onClick={() => handleRoutingChange(key as keyof RoutingSettingsData, !checked)}
                    className={`relative w-8 h-4.5 rounded-full transition-all shrink-0 ${checked ? 'bg-[var(--color-primary)]' : 'bg-white/15'}`}
                    style={{ height: '18px' }}
                  >
                    <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
