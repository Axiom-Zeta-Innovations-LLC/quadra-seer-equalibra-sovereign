/**
 * Atlantean Intelligence Service
 * 
 * TypeScript client for the Atlantean Backend API.
 * This replaces traditional state management with field-based intelligence.
 */

import { getRoutingControls } from './settingsService';

// ── Auth helpers ──────────────────────────────────────────────────────────────
// When VITE_API_TOKEN is set the backend requires "Authorization: Bearer <token>"
// on all non-health endpoints.  This wrapper injects it transparently.

export function getAtlanteanAuthHeaders(): Record<string, string> {
    const token = (import.meta.env.VITE_API_TOKEN as string | undefined) ?? '';
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

/** Authenticated fetch — injects Authorization header when a token is configured. */
async function _aFetch(url: string, init?: RequestInit): Promise<Response> {
    const authH = getAtlanteanAuthHeaders();
    const headers = new Headers(init?.headers);
    if (authH['Authorization']) headers.set('Authorization', authH['Authorization']);
    return fetch(url, { ...init, headers });
}
// ─────────────────────────────────────────────────────────────────────────────

function normalizeAtlanteanApiBase(raw: string): string {
  const trimmed = String(raw).trim();

  // Relative paths used during local development.
  if (trimmed.startsWith('/')) {
    const base = trimmed.replace(/\/$/, '');
    if (base.endsWith('/api/atlantean')) {
      return base;
    }
    if (base.endsWith('/api')) {
      return `${base}/atlantean`;
    }
    if (base === '' || base === '/') {
      return '/api/atlantean';
    }
    return base;
  }

  // Absolute URLs are normalized but remain optional for local-first usage.
  try {
    const url = new URL(trimmed);
    const pathname = (url.pathname || '/').replace(/\/$/, '');

    if (pathname.endsWith('/api/atlantean')) {
      return url.toString().replace(/\/$/, '');
    }
    if (pathname.endsWith('/api')) {
      url.pathname = `${pathname}/atlantean`;
      return url.toString().replace(/\/$/, '');
    }
    if (pathname === '' || pathname === '/') {
      url.pathname = '/api/atlantean';
      return url.toString().replace(/\/$/, '');
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    // Fallback: non-URL strings keep existing behavior with slash normalization.
    const base = trimmed.replace(/\/$/, '');
    if (base.endsWith('/api/atlantean')) {
      return base;
    }
    if (base.endsWith('/api')) {
      return `${base}/atlantean`;
    }
    return base;
  }
}

export function resolveAtlanteanApiBaseOrThrow(): string {
  const configured = import.meta.env.VITE_API_BASE;
  if (configured && String(configured).trim()) {
    return normalizeAtlanteanApiBase(String(configured));
  }
  return '/api/atlantean';
}

function resolveAtlanteanHealthUrlOrThrow(): string {
  return '/health';
}

function getAtlanteanApiBase(): string {
  return resolveAtlanteanApiBaseOrThrow();
}

function getAtlanteanHealthUrl(): string {
  return resolveAtlanteanHealthUrlOrThrow();
}

// ── Ollama connection helpers ─────────────────────────────────────────────────

export async function fetchOllamaAddress(): Promise<string> {
  try {
    const base = resolveAtlanteanApiBaseOrThrow();
    const res = await fetch(`${base}/config/ollama`, { headers: getAtlanteanAuthHeaders() });
    if (!res.ok) return '';
    const data = await res.json();
    return (data.ollama_address as string) || '';
  } catch {
    return '';
  }
}

export async function applyOllamaAddress(host: string): Promise<{ success: boolean; message: string; reachable: boolean }> {
  const base = resolveAtlanteanApiBaseOrThrow();
  const res = await fetch(`${base}/config/ollama`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAtlanteanAuthHeaders() },
    body: JSON.stringify({ ollama_address: host }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { success: false, message: data.error || 'Failed to update Ollama address.', reachable: false };
  }
  return {
    success: Boolean(data.success),
    message: data.message || 'Ollama address updated.',
    reachable: Boolean(data.reachable),
  };
}
// ─────────────────────────────────────────────────────────────────────────────
const ATLANTEAN_SESSION_STORAGE_KEY = 'atlantean.session_id';

function generateSessionId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `atl-${Date.now()}-${rand}`;
}

export function getStableSessionId(): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 'default';
  }

  try {
    const existing = window.localStorage.getItem(ATLANTEAN_SESSION_STORAGE_KEY);
    if (existing && existing.trim()) {
      return existing;
    }

    const created = generateSessionId();
    window.localStorage.setItem(ATLANTEAN_SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return 'default';
  }
}

export function setStableSessionId(sessionId: string): string {
  const normalized = String(sessionId || '').trim();
  const effective = normalized || generateSessionId();

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(ATLANTEAN_SESSION_STORAGE_KEY, effective);
    } catch {
      // Ignore storage failures and still return the effective id.
    }
  }

  return effective;
}

export function createAndSetStableSessionId(): string {
  return setStableSessionId(generateSessionId());
}

function resolveSessionId(sessionId?: string): string {
  return sessionId || getStableSessionId();
}

export interface AtlanteanStatus {
  device_id: string;
  version: number;
  last_update: string;
  learning_capacity: number;
  cold_memory_items: number;
  fingerprint: string | null;
  field_stats: {
    phi1_mean: number;
    phi5_mean: number;
    Phi: number;
  };
  sync?: SyncStatusMetadata;
}

export interface SyncConflictCounters {
  total_merges: number;
  concurrent_merges: number;
  remote_updates_applied: number;
  noop_merges: number;
}

export interface SyncStatusMetadata {
  last_merged_device: string | null;
  last_merge_strategy: string | null;
  last_merged_at: string | null;
  conflict_counters: SyncConflictCounters;
}

export interface FieldData {
  phi1: number[][];
  phi5: number[][];
  Phi: number;
  version: number;
  timestamp: number;
  learning_capacity: number;
  stats: {
    phi1_mean: number;
    phi1_std: number;
    phi5_mean: number;
    phi5_std: number;
  };
}

export interface QueryResponse {
  response: string;
  status: AtlanteanStatus;
}

export interface ChatHistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  session_id: string;
}

export interface ColdManifest {
  manifest_id: string;
  attached_at?: number;
  detached_at?: number | null;
  detached?: boolean;
  item_ids?: string[];
  metadata?: Record<string, any>;
}

export interface AtlanteanSnapshotRecord {
  id: string;
  session_id: string;
  label?: string;
  created_at?: number | string;
  version?: number;
  source?: string;
  phase_lock?: {
    phi1_mean: number;
    phi5_mean: number;
    Phi: number;
  };
  hrm?: Record<string, any>;
}

export interface ReplayIntegrityProof {
  session_id: string;
  events_total: number;
  events_verified: number;
  replay_state_hash: string | null;
  live_state_hash: string;
  match: boolean;
  valid: boolean;
  issues: Array<Record<string, any>>;
  replay_head_hash: string;
  verified_up_to_seq: number | null;
}

export interface SoulFileBundle {
  schema_version: number;
  exported_at: number;
  session_id: string;
  identity: Record<string, any> | null;
  events: Array<Record<string, any>>;
  checkpoints: Array<Record<string, any>>;
  hot_state_hash: string;
  hot_state: Record<string, any>;
  hrm_state: Record<string, any>;
}

export type LearningEventType =
  | 'user_confirmation'
  | 'user_correction'
  | 'user_positive_feedback'
  | 'user_negative_feedback'
  | 'prediction_success'
  | 'prediction_failure'
  | 'simulation_complete'
  | 'voice_session_end'
  | 'helpful_response'
  | 'unhelpful_response'
  | 'clarification_needed'
  | 'high_engagement'
  | 'low_engagement';

/**
 * Get current intelligence status
 */
export async function getStatus(sessionId?: string): Promise<AtlanteanStatus> {
  const sid = resolveSessionId(sessionId);
  const response = await _aFetch(`${getAtlanteanApiBase()}/status?session_id=${encodeURIComponent(sid)}`);
  if (!response.ok) {
    throw new Error(`Failed to get status: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Process user query through Atlantean-powered LLM
 * 
 * @param input User's message
 * @param llmProvider Which LLM to use (gemini, edenai, etc.)
 * @param apiKey Optional API key for the LLM provider
 * @returns LLM response and updated status
 */
export async function query(
  input: string,
  llmProvider: 'local' | 'gemini' | 'edenai' | 'mock' = 'local',
  apiKey?: string,
  // history parameter kept for API compatibility but is no longer forwarded —
  // the backend reconstructs context from Atlantean cold memory server-side.
  _history: Array<{ role: string; content: string }> = [],
  sessionId?: string
): Promise<QueryResponse> {
  const sid = resolveSessionId(sessionId);
  const body: any = { 
    input, 
    llm_provider: llmProvider,
    session_id: sid,
  };
  
  if (apiKey) {
    body.api_key = apiKey;
  }

  // Step 25: forward client routing controls if configured.
  try {
    const rc = getRoutingControls();
    if (rc.modelTierPreference && rc.modelTierPreference !== 'auto') {
      body.model_tier_preference = rc.modelTierPreference;
    }
    if (rc.localBackendHint && rc.localBackendHint !== 'auto') {
      body.local_backend_hint = rc.localBackendHint;
    }
  } catch {
    // Settings unavailable — continue without hints.
  }

  // history is intentionally NOT forwarded to the backend.

  const response = await _aFetch(`${getAtlanteanApiBase()}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    throw new Error(`Query failed: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Get field visualization data
 */
export async function getFields(sessionId?: string): Promise<FieldData> {
  const sid = resolveSessionId(sessionId);
  const response = await _aFetch(`${getAtlanteanApiBase()}/fields?session_id=${encodeURIComponent(sid)}`);
  if (!response.ok) {
    throw new Error(`Failed to get fields: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Load persisted chat history for a session.
 */
export async function getChatHistory(
  limit: number = 80,
  sessionId?: string
): Promise<{ session_id: string; messages: ChatHistoryMessage[] }> {
  const sid = resolveSessionId(sessionId);
  const params = new URLSearchParams({
    session_id: sid,
    limit: String(limit),
  });
  const response = await _aFetch(`${getAtlanteanApiBase()}/chat/history?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to get chat history: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Trigger a learning event
 * 
 * Call this when user provides feedback or interactions complete.
 * This is how the intelligence learns!
 * 
 * @param event Type of learning event
 * @param data Event-specific data
 */
export async function triggerLearningEvent(
  event: LearningEventType,
  data: Record<string, any> = {},
  sessionId?: string
): Promise<{ success: boolean; status: AtlanteanStatus }> {
  const sid = resolveSessionId(sessionId);
  const response = await _aFetch(`${getAtlanteanApiBase()}/learning-event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event, data, session_id: sid }),
  });
  
  if (!response.ok) {
    throw new Error(`Learning event failed: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Store a simulation in cold memory
 */
export async function storeSimulation(
  simulation: any,
  confidence: number = 0.5,
  sessionId?: string
): Promise<{ success: boolean }> {
  const sid = resolveSessionId(sessionId);
  const response = await _aFetch(`${getAtlanteanApiBase()}/simulation/store`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ simulation, confidence, session_id: sid }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to store simulation: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * List all stored simulations directly from backend (reliable, no embedding)
 */
export async function recallSimulations(
  searchQuery: string,
  limit: number = 50,
  sessionId?: string
): Promise<any[]> {
  const sid = resolveSessionId(sessionId);
  // Prefer /list (direct Redis listing). Fallback to /recall for backward compatibility.
  const listResponse = await _aFetch(
    `${getAtlanteanApiBase()}/simulation/list?limit=${limit}&session_id=${encodeURIComponent(sid)}`
  );
  if (listResponse.ok) {
    const data = await listResponse.json();
    return data.simulations || [];
  }

  if (listResponse.status !== 404) {
    throw new Error(`Failed to list simulations: ${listResponse.statusText}`);
  }

  const recallResponse = await _aFetch(`${getAtlanteanApiBase()}/simulation/recall`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: searchQuery, limit, session_id: sid }),
  });

  if (!recallResponse.ok) {
    throw new Error(`Failed to recall simulations: ${recallResponse.statusText}`);
  }

  const recallData = await recallResponse.json();
  return recallData.simulations || [];
}

/**
 * Create a labeled snapshot for Neural Archives
 */
export async function createSnapshot(
  label?: string,
  sessionId?: string
): Promise<{ snapshot: any }> {
  const sid = resolveSessionId(sessionId);
  const response = await _aFetch(`${getAtlanteanApiBase()}/snapshot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ label, session_id: sid }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create snapshot: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * List indexed snapshots for Neural Archives
 */
export async function listSnapshots(
  limit: number = 50,
  sessionId?: string
): Promise<{ session_id: string; snapshots: AtlanteanSnapshotRecord[] }> {
  const sid = resolveSessionId(sessionId);
  const params = new URLSearchParams({
    session_id: sid,
    limit: String(limit),
  });

  const response = await _aFetch(`${getAtlanteanApiBase()}/snapshots?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to list snapshots: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Restore hot-memory state from a saved snapshot
 */
export async function restoreSnapshot(
  snapshotId: string,
  sessionId?: string
): Promise<{ success: boolean; session_id: string; snapshot_id: string; status: AtlanteanStatus }> {
  const sid = resolveSessionId(sessionId);
  const response = await _aFetch(`${getAtlanteanApiBase()}/snapshot/restore`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      snapshot_id: snapshotId,
      session_id: sid,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to restore snapshot: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Delete a snapshot from archive index
 */
export async function deleteSnapshot(
  snapshotId: string,
  sessionId?: string
): Promise<{ success: boolean; session_id: string; snapshot_id: string; remaining: number }> {
  const sid = resolveSessionId(sessionId);
  const response = await _aFetch(`${getAtlanteanApiBase()}/snapshot/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      snapshot_id: snapshotId,
      session_id: sid,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to delete snapshot: ${response.statusText}`);
  }

  return response.json();
}

/**
 * List cold-memory manifests for detachable memory management
 */
export async function listColdManifests(
  includeDetached: boolean = false,
  sessionId?: string
): Promise<{ session_id: string; manifests: ColdManifest[] }> {
  const sid = resolveSessionId(sessionId);
  const params = new URLSearchParams();
  if (includeDetached) params.set('include_detached', 'true');
  params.set('session_id', sid);
  const suffix = params.toString() ? `?${params.toString()}` : '';

  const response = await _aFetch(`${getAtlanteanApiBase()}/cold/manifests${suffix}`);
  if (!response.ok) {
    throw new Error(`Failed to list cold manifests: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Export a detachable cold-memory manifest bundle
 */
export async function exportColdManifest(
  manifestId: string,
  sessionId?: string
): Promise<{ session_id: string; manifest: any }> {
  const sid = resolveSessionId(sessionId);
  const params = new URLSearchParams({ manifest_id: manifestId });
  params.set('session_id', sid);

  const response = await _aFetch(`${getAtlanteanApiBase()}/cold/manifest/export?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to export cold manifest: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Import a detachable cold-memory manifest bundle
 */
export async function importColdManifest(
  manifest: any,
  sessionId?: string
): Promise<{ session_id: string; result: any }> {
  const sid = resolveSessionId(sessionId);
  const body: any = { manifest };
  body.session_id = sid;

  const response = await _aFetch(`${getAtlanteanApiBase()}/cold/manifest/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Failed to import cold manifest: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Tombstone a cold-memory item while preserving lineage
 */
export async function tombstoneColdItem(
  itemId: string,
  reason: string = 'manual',
  sessionId?: string
): Promise<{ success: boolean; session_id: string; item_id: string; reason: string }> {
  const sid = resolveSessionId(sessionId);
  const body: any = {
    item_id: itemId,
    reason,
    session_id: sid,
  };

  const response = await _aFetch(`${getAtlanteanApiBase()}/cold/tombstone`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Failed to tombstone cold item: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Prepare sync package for multi-device
 */
export async function prepareSyncPackage(): Promise<{ package: any }> {
  const sid = resolveSessionId();
  const response = await _aFetch(`${getAtlanteanApiBase()}/sync/prepare?session_id=${encodeURIComponent(sid)}`);
  if (!response.ok) {
    throw new Error(`Failed to prepare sync: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Merge sync package from another device
 */
export async function mergeSyncPackage(
  syncPackage: any,
  strategy: 'conservative' | 'field_average' | 'last_write_wins' | 'max_energy' | 'max_plasticity' = 'conservative'
): Promise<{ success: boolean; status: AtlanteanStatus; sync?: any; session_id?: string }> {
  const sid = resolveSessionId();
  const response = await _aFetch(`${getAtlanteanApiBase()}/sync/merge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ package: syncPackage, strategy, session_id: sid }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to merge sync: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Reset intelligence state (for testing/debugging)
 */
export async function resetIntelligence(): Promise<{ success: boolean }> {
  const response = await _aFetch(`${getAtlanteanApiBase()}/reset`, {
    method: 'POST',
  });
  
  if (!response.ok) {
    throw new Error(`Failed to reset: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Manually save intelligence state
 */
export async function saveState(): Promise<{ success: boolean }> {
  const response = await _aFetch(`${getAtlanteanApiBase()}/save`, {
    method: 'POST',
  });
  
  if (!response.ok) {
    throw new Error(`Failed to save: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Check if Atlantean backend is running
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await _aFetch(getAtlanteanHealthUrl());
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Deterministic replay integrity proof (ledger-derived state hash vs live state hash)
 */
export async function replayIntegrityProof(
  sessionId?: string
): Promise<ReplayIntegrityProof> {
  const sid = resolveSessionId(sessionId);
  const params = new URLSearchParams();
  params.set('session_id', sid);
  const suffix = params.toString() ? `?${params.toString()}` : '';

  const response = await _aFetch(`${getAtlanteanApiBase()}/integrity/replay${suffix}`);
  if (!response.ok) {
    throw new Error(`Failed replay proof: ${response.statusText}`);
  }
  return response.json();
}

// Step 26: Operator dashboard routing settings.
export interface RoutingSettingsData {
  provider: {
    default: string;
    allow_cloud_escalation: boolean;
    require_cloud_escalation_consent: boolean;
    allow_outbound_network: boolean;
    local_backend: string;
    local_model: string;
  };
  model_tiers: {
    light: string;
    standard: string;
    heavy: string;
    pressure_threshold: number;
  };
  hrm_compute_budget: {
    enabled: boolean;
    hrm_max_ms_per_query: number;
    rcm_max_ms_per_query: number;
    max_total_ms_per_window: number;
    window_seconds: number;
  };
  reasoning_budgets: {
    enabled: boolean;
    cycles_simple: number;
    cycles_analytical: number;
    cycles_deep: number;
    cycles_file_assisted: number;
  };
}

/**
 * Return active runtime routing configuration (Step 25/26).
 */
export async function getRoutingSettings(): Promise<RoutingSettingsData> {
  const response = await _aFetch(`${getAtlanteanApiBase()}/routing/settings`);
  if (!response.ok) {
    throw new Error(`Failed to get routing settings: ${response.statusText}`);
  }
  return response.json();
}

// Step 27: one-click diagnostics bundle.
export interface DiagnosticsBundle {
  schema_version: number;
  bundle_type: string;
  exported_at: number;
  session_id: string;
  routing: Record<string, any>;
  ledger: Record<string, any>;
  replay_proof: Record<string, any>;
  hot_memory: Record<string, any>;
  hrm: Record<string, any>;
  recent_telemetry: Array<Record<string, any>>;
  environment: Record<string, any>;
}

/**
 * Export a diagnostics bundle for troubleshooting local deployments (Step 27).
 */
export async function getDiagnosticsBundle(sessionId?: string): Promise<{ bundle: DiagnosticsBundle }> {
  const sid = resolveSessionId(sessionId);
  const params = new URLSearchParams();
  params.set('session_id', sid);
  const response = await _aFetch(`${getAtlanteanApiBase()}/diagnostics/export?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to export diagnostics: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Export complete signed intelligence state for user-owned portability.
 */
export async function exportSoulFile(
  sessionId?: string
): Promise<{ bundle: SoulFileBundle }> {
  const sid = resolveSessionId(sessionId);
  const params = new URLSearchParams();
  params.set('session_id', sid);
  const suffix = params.toString() ? `?${params.toString()}` : '';

  const response = await _aFetch(`${getAtlanteanApiBase()}/export${suffix}`);
  if (!response.ok) {
    throw new Error(`Failed to export soul file: ${response.statusText}`);
  }
  return response.json();
}
