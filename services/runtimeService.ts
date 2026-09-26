/**
 * runtimeService.ts — Frontend API client for Steps 1-10.
 *
 * Covers hardware probe, backend lifecycle, model management,
 * port checking and runtime recommendations.
 */

import { resolveAtlanteanApiBaseOrThrow, getAtlanteanAuthHeaders } from './atlanteanService';

const _base = () => resolveAtlanteanApiBaseOrThrow();
const _headers = () => ({ 'Content-Type': 'application/json', ...getAtlanteanAuthHeaders() });

async function _get<T = any>(path: string): Promise<T> {
    const r = await fetch(`${_base()}${path}`, { headers: _headers() });
    if (!r.ok) throw new Error(`${path} → ${r.status}`);
    return r.json() as Promise<T>;
}

async function _post<T = any>(path: string, body: unknown): Promise<T> {
    const r = await fetch(`${_base()}${path}`, {
        method: 'POST',
        headers: _headers(),
        body: JSON.stringify(body),
    });
    if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText })) as { error: string };
        throw new Error(err.error || r.statusText);
    }
    return r.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface GpuInfo {
    index: number;
    name: string;
    vram_total_mb: number | null;
    vram_used_mb: number | null;
    vram_free_mb: number | null;
    temp_c: number | null;
    util_pct: number | null;
    vendor: 'nvidia' | 'amd' | 'intel' | 'apple' | string;
    compute_api: string;
}

export interface HardwareProbe {
    timestamp: number;
    platform: string;
    cpu: { name: string; physical_cores: number | null; logical_cores: number | null; util_pct: number | null; arch: string };
    ram: { total_mb: number | null; available_mb: number | null; used_mb: number | null; percent: number | null };
    gpus: GpuInfo[];
    apple_silicon: { name: string; unified_memory_mb: number | null } | null;
    npu: { name: string; compute_api: string } | null;
    best_vram_mb: number | null;
    recommended_tier: 'small_quantized' | 'medium' | 'multi_agent';
    compute_backends_available: string[];
}

export interface RuntimeRecommendation {
    backend: string;
    n_gpu_layers: number;
    context_size: number;
    compute_type: string;
    vram_mb: number | null;
    ram_mb: number | null;
    extra_args: string[];
    notes: string[];
}

export interface ProcessStatus {
    name: string;
    pid: number | null;
    running: boolean;
    port: number;
    uptime_s: number | null;
    healthy: boolean;
    recent_log: string[];
}

export interface ModelInfo {
    name: string;
    type: 'language' | 'vision' | 'speech' | 'voice';
    size_mb: number | null;
    source: string;
    path?: string;
    digest?: string;
    modified?: string;
}

export interface PullProgress {
    model: string;
    status: string;
    digest: string;
    completed: number;
    total: number;
    percent: number;
}

// ── Step 1 & 8 – Hardware probe ─────────────────────────────────────────────

export const getHardwareProbe = (refresh = false): Promise<HardwareProbe> =>
    _get(`/hardware/probe${refresh ? '?refresh=1' : ''}`);

// ── Step 7 – Runtime recommendation ────────────────────────────────────────

export const getRuntimeRecommendation = (
    modelName: string,
    backend: 'ollama' | 'llama.cpp' = 'ollama',
): Promise<{ recommendation: RuntimeRecommendation; probe_summary: Record<string, any> }> =>
    _post('/runtime/recommend', { model_name: modelName, backend });

// ── Step 5 – Start / stop ───────────────────────────────────────────────────

export const getProcessStatus = (): Promise<{ processes: ProcessStatus[]; backends: any }> =>
    _get('/runtime/status');

export const startBackend = (
    backend: 'ollama' | 'llama.cpp',
    options: {
        port?: number;
        model_path?: string;
        n_gpu_layers?: number;
        ctx_size?: number;
    } = {},
): Promise<{ success: boolean; port: number; pid?: number }> =>
    _post('/runtime/start', { backend, ...options });

export const stopBackend = (name: string): Promise<{ success: boolean }> =>
    _post('/runtime/stop', { name });

// ── Steps 2 & 3 – Backend install ──────────────────────────────────────────

export const installBackend = (
    backend: 'ollama' | 'llama.cpp',
    platformKey?: string,
): Promise<{ success: boolean; path?: string; log?: string[]; error?: string }> =>
    _post('/runtime/install', { backend, platform_key: platformKey });

// ── Step 4 & 9 – Model list ────────────────────────────────────────────────

export const listModels = (): Promise<{
    models: { language: ModelInfo[]; speech: ModelInfo[]; voice: ModelInfo[] };
    counts: Record<string, number>;
}> => _get('/models/list');

// ── Step 4 – Pull model with SSE progress ──────────────────────────────────

export function pullModel(
    modelName: string,
    onProgress: (p: PullProgress) => void,
    onDone: () => void,
    onError: (e: string) => void,
): () => void {
    const ctrl = new AbortController();
    const base = resolveAtlanteanApiBaseOrThrow();
    const authH = getAtlanteanAuthHeaders();

    fetch(`${base}/models/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({ model: modelName }),
        signal: ctrl.signal,
    })
        .then(async (res) => {
            if (!res.ok) { onError(`HTTP ${res.status}`); return; }
            const reader = res.body?.getReader();
            if (!reader) { onError('No response body'); return; }
            const dec = new TextDecoder();
            let buf = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                const lines = buf.split('\n');
                buf = lines.pop() ?? '';
                for (const line of lines) {
                    const trimmed = line.replace(/^data:\s*/, '').trim();
                    if (!trimmed) continue;
                    try {
                        const evt = JSON.parse(trimmed) as PullProgress;
                        onProgress(evt);
                        if (evt.status === 'success' || evt.status === 'error') {
                            if (evt.status === 'error') onError((evt as any).error || 'Pull failed');
                            else onDone();
                            return;
                        }
                    } catch {}
                }
            }
            onDone();
        })
        .catch((e) => { if (e.name !== 'AbortError') onError(String(e)); });

    return () => ctrl.abort();
}

export const importModel = (
    path: string,
    name?: string,
): Promise<{ success: boolean; model_name?: string; error?: string }> =>
    _post('/models/import', { path, name });

export const deleteModel = (model: string): Promise<{ success: boolean }> =>
    _post('/models/delete', { model });

// ── Step 6 – Port utilities ─────────────────────────────────────────────────

export const checkPorts = (
    ports: number[],
): Promise<{ ports: Record<number, { free: boolean; port: number }> }> =>
    _get(`/ports/check?ports=${ports.join(',')}`);
