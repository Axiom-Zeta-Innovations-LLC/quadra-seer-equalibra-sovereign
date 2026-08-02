/**
 * Operations service layer.
 * Intelligence modes, privacy settings, workflows, and operations types.
 */

import { resolveAtlanteanApiBaseOrThrow, getAtlanteanAuthHeaders } from './atlanteanService';
import { getSettings, saveSettings } from './settingsService';

// ── Intelligence Modes ────────────────────────────────────────────────────

export type IntelligenceMode =
  | 'sovereign'
  | 'private_hybrid'
  | 'maximum'
  | 'research'
  | 'fast'
  | 'deep_reasoning';

export interface IntelligenceModePolicy {
  mode: IntelligenceMode;
  localOnly: boolean;
  preferLocal: boolean;
  allowExternalModels: boolean;
  verificationDepth: number;
  reasoningBudget: number;
  retrievalDepth: number;
  prioritizeLatency: boolean;
  label: string;
  description: string;
  privacyLevel: 'maximum' | 'high' | 'standard';
  speedRating: 1 | 2 | 3 | 4 | 5;
  reasoningRating: 1 | 2 | 3 | 4 | 5;
  externalWarning?: string;
}

const MODE_POLICIES: Record<IntelligenceMode, IntelligenceModePolicy> = {
  sovereign: {
    mode: 'sovereign',
    localOnly: true,
    preferLocal: true,
    allowExternalModels: false,
    verificationDepth: 2,
    reasoningBudget: 4,
    retrievalDepth: 3,
    prioritizeLatency: false,
    label: 'Sovereign',
    description: 'Local processing only. No external model or API calls. Maximum privacy.',
    privacyLevel: 'maximum',
    speedRating: 3,
    reasoningRating: 3,
  },
  private_hybrid: {
    mode: 'private_hybrid',
    localOnly: false,
    preferLocal: true,
    allowExternalModels: true,
    verificationDepth: 2,
    reasoningBudget: 4,
    retrievalDepth: 3,
    prioritizeLatency: false,
    label: 'Private Hybrid',
    description: 'Prefer local. Use approved external services only when local capability is insufficient.',
    privacyLevel: 'high',
    speedRating: 3,
    reasoningRating: 4,
    externalWarning: 'May route to approved external providers with explicit consent.',
  },
  maximum: {
    mode: 'maximum',
    localOnly: false,
    preferLocal: false,
    allowExternalModels: true,
    verificationDepth: 3,
    reasoningBudget: 6,
    retrievalDepth: 4,
    prioritizeLatency: false,
    label: 'Maximum Intelligence',
    description: 'Strongest available model and tools. Prioritizes answer quality over local execution.',
    privacyLevel: 'standard',
    speedRating: 2,
    reasoningRating: 5,
    externalWarning: 'Will route to external providers. Content may be processed externally.',
  },
  research: {
    mode: 'research',
    localOnly: false,
    preferLocal: true,
    allowExternalModels: true,
    verificationDepth: 3,
    reasoningBudget: 8,
    retrievalDepth: 5,
    prioritizeLatency: false,
    label: 'Research',
    description: 'Deep retrieval, source checking, multi-step analysis. Evidence-first reasoning.',
    privacyLevel: 'high',
    speedRating: 1,
    reasoningRating: 5,
    externalWarning: 'May use external sources for retrieval according to privacy rules.',
  },
  fast: {
    mode: 'fast',
    localOnly: false,
    preferLocal: true,
    allowExternalModels: false,
    verificationDepth: 0,
    reasoningBudget: 1,
    retrievalDepth: 1,
    prioritizeLatency: true,
    label: 'Fast',
    description: 'Minimize latency and compute. Reduced verification and analysis depth.',
    privacyLevel: 'high',
    speedRating: 5,
    reasoningRating: 2,
  },
  deep_reasoning: {
    mode: 'deep_reasoning',
    localOnly: false,
    preferLocal: true,
    allowExternalModels: false,
    verificationDepth: 3,
    reasoningBudget: 12,
    retrievalDepth: 5,
    prioritizeLatency: false,
    label: 'Deep Reasoning',
    description: 'Maximum reasoning cycles, verification depth, and memory retrieval. Increases latency.',
    privacyLevel: 'high',
    speedRating: 1,
    reasoningRating: 5,
  },
};

const INTELLIGENCE_MODE_KEY = 'ops.intelligence_mode';

export function getModePolicy(mode: IntelligenceMode): IntelligenceModePolicy {
  return MODE_POLICIES[mode];
}

export function getAllModePolicies(): IntelligenceModePolicy[] {
  return Object.values(MODE_POLICIES);
}

export function getIntelligenceMode(): IntelligenceMode {
  try {
    const stored = localStorage.getItem(INTELLIGENCE_MODE_KEY) as IntelligenceMode | null;
    if (stored && stored in MODE_POLICIES) return stored;
  } catch { /* ignore */ }
  return 'sovereign';
}

export function setIntelligenceMode(mode: IntelligenceMode): void {
  try {
    localStorage.setItem(INTELLIGENCE_MODE_KEY, mode);
  } catch { /* ignore */ }
  const policy = MODE_POLICIES[mode];
  const settings = getSettings();
  settings.cloudEscalationConsent = policy.allowExternalModels;
  if (policy.localOnly) settings.llmProvider = 'local';
  saveSettings(settings);
}

// ── Privacy Settings ──────────────────────────────────────────────────────

export interface PrivacySettings {
  localOnlyLock: boolean;
  askBeforeExternalModel: boolean;
  askBeforeExternalTool: boolean;
  telemetryDisabled: boolean;
  webAccessDisabled: boolean;
  redactPiiBeforeCloud: boolean;
  blockedProviders: string[];
  autoDeleteTempFiles: boolean;
  encryptExportedMemories: boolean;
  sovereignLockdown: boolean;
}

const PRIVACY_SETTINGS_KEY = 'ops.privacy_settings';

const defaultPrivacy: PrivacySettings = {
  localOnlyLock: false,
  askBeforeExternalModel: true,
  askBeforeExternalTool: true,
  telemetryDisabled: false,
  webAccessDisabled: false,
  redactPiiBeforeCloud: true,
  blockedProviders: [],
  autoDeleteTempFiles: true,
  encryptExportedMemories: true,
  sovereignLockdown: false,
};

export function getPrivacySettings(): PrivacySettings {
  try {
    const raw = localStorage.getItem(PRIVACY_SETTINGS_KEY);
    if (!raw) return { ...defaultPrivacy };
    return { ...defaultPrivacy, ...JSON.parse(raw) };
  } catch {
    return { ...defaultPrivacy };
  }
}

export function savePrivacySettings(settings: PrivacySettings): void {
  try {
    localStorage.setItem(PRIVACY_SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

export function activateSovereignLockdown(): void {
  const s = getPrivacySettings();
  s.sovereignLockdown = true;
  s.localOnlyLock = true;
  savePrivacySettings(s);
  setIntelligenceMode('sovereign');
}

export function deactivateSovereignLockdown(): void {
  const s = getPrivacySettings();
  s.sovereignLockdown = false;
  s.localOnlyLock = false;
  savePrivacySettings(s);
}

// ── Privacy Ledger (session-scoped, in-memory) ────────────────────────────

export interface PrivacyLedger {
  sessionStart: number;
  localRequests: number;
  externalRequests: number;
  externalProviders: string[];
  toolCalls: number;
  memoriesCreated: number;
  memoriesAwaitingApproval: number;
  tempFilesCreated: number;
  dataPurged: number;
}

let _ledger: PrivacyLedger = {
  sessionStart: Date.now(),
  localRequests: 0,
  externalRequests: 0,
  externalProviders: [],
  toolCalls: 0,
  memoriesCreated: 0,
  memoriesAwaitingApproval: 0,
  tempFilesCreated: 0,
  dataPurged: 0,
};

export function getPrivacyLedger(): PrivacyLedger { return { ..._ledger }; }

export function resetPrivacyLedger(): void {
  _ledger = {
    sessionStart: Date.now(),
    localRequests: 0,
    externalRequests: 0,
    externalProviders: [],
    toolCalls: 0,
    memoriesCreated: 0,
    memoriesAwaitingApproval: 0,
    tempFilesCreated: 0,
    dataPurged: 0,
  };
}

// ── Workflows (localStorage) ──────────────────────────────────────────────

export type WorkflowTriggerType =
  | 'manual'
  | 'scheduled'
  | 'file_uploaded'
  | 'task_completed'
  | 'snapshot_overdue'
  | 'startup';

export interface WorkflowStep {
  type: string;
  label: string;
  params?: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  trigger: { type: WorkflowTriggerType; schedule?: string };
  steps: WorkflowStep[];
  policy: { intelligenceMode: IntelligenceMode; localOnly: boolean; approvalRequiredForExternal: boolean };
  enabled: boolean;
  createdAt: number;
  lastRun?: number;
  lastRunStatus?: 'success' | 'failed' | 'running';
  runHistory: Array<{ timestamp: number; status: 'success' | 'failed'; durationMs?: number }>;
}

const WORKFLOWS_KEY = 'ops.workflows';

function buildDefaultWorkflows(): Workflow[] {
  return [
    {
      id: 'wf-default-snapshot',
      name: 'Capture + Verify State',
      description: 'Creates a snapshot then runs replay verification.',
      trigger: { type: 'manual' },
      steps: [
        { type: 'create_snapshot', label: 'Capture Snapshot' },
        { type: 'verify_replay', label: 'Verify Replay Integrity' },
      ],
      policy: { intelligenceMode: 'sovereign', localOnly: true, approvalRequiredForExternal: false },
      enabled: true,
      createdAt: Date.now() - 86_400_000,
      runHistory: [],
    },
    {
      id: 'wf-default-export',
      name: 'Export Knowledge Package',
      description: 'Exports a full encrypted knowledge sync package for backup.',
      trigger: { type: 'manual' },
      steps: [{ type: 'export_sync_package', label: 'Export Encrypted Package' }],
      policy: { intelligenceMode: 'sovereign', localOnly: true, approvalRequiredForExternal: false },
      enabled: true,
      createdAt: Date.now() - 86_400_000,
      runHistory: [],
    },
    {
      id: 'wf-default-repair',
      name: 'Run Corruption Repair',
      description: 'Repairs ledger and snapshot corruption from the last verified state.',
      trigger: { type: 'manual' },
      steps: [{ type: 'repair_corruption', label: 'Repair State' }],
      policy: { intelligenceMode: 'sovereign', localOnly: true, approvalRequiredForExternal: false },
      enabled: true,
      createdAt: Date.now() - 86_400_000,
      runHistory: [],
    },
  ];
}

export function listWorkflows(): Workflow[] {
  try {
    const raw = localStorage.getItem(WORKFLOWS_KEY);
    if (!raw) return buildDefaultWorkflows();
    const parsed = JSON.parse(raw) as Workflow[];
    return parsed.length > 0 ? parsed : buildDefaultWorkflows();
  } catch {
    return buildDefaultWorkflows();
  }
}

export function saveWorkflows(workflows: Workflow[]): void {
  try {
    localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(workflows));
  } catch { /* ignore */ }
}

export function createWorkflow(wf: Omit<Workflow, 'id' | 'createdAt' | 'runHistory'>): Workflow {
  const nw: Workflow = {
    ...wf,
    id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    runHistory: [],
  };
  const all = listWorkflows();
  all.push(nw);
  saveWorkflows(all);
  return nw;
}

export function deleteWorkflow(id: string): void {
  saveWorkflows(listWorkflows().filter(w => w.id !== id));
}

export function updateWorkflow(id: string, updates: Partial<Workflow>): void {
  saveWorkflows(listWorkflows().map(w => w.id === id ? { ...w, ...updates } : w));
}

// ── Memory Proposals (types only — backend stub) ──────────────────────────

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'deferred' | 'session_only';
export type ProposalSensitivity = 'low' | 'medium' | 'high' | 'confidential';

export interface MemoryProposal {
  id: string;
  text: string;
  source: string;
  createdAt: number;
  confidence: number;
  category: string;
  project?: string;
  sensitivity: ProposalSensitivity;
  conflictStatus: 'none' | 'conflict' | 'duplicate';
  conflictsWith?: { id: string; text: string };
  retentionDays?: number;
  status: ProposalStatus;
}

// ── Task types (framework only — no active backend task runner) ───────────

export type TaskState =
  | 'queued' | 'initializing' | 'running' | 'paused'
  | 'awaiting_approval' | 'verifying' | 'completed' | 'failed' | 'cancelled';

export interface ActiveTask {
  id: string;
  name: string;
  type: string;
  stage: string;
  progress: number;
  model: string;
  isLocal: boolean;
  tools: string[];
  memoryStatus: string;
  verificationStatus: string;
  elapsedMs: number;
  intelligenceMode: IntelligenceMode;
  privacyBoundary: string;
  state: TaskState;
  startedAt: number;
}

// ── Quick-operation pin preferences ──────────────────────────────────────

const PINNED_ACTIONS_KEY = 'ops.pinned_actions';
const DEFAULT_PINNED = ['create_snapshot', 'verify_replay', 'search_memory', 'apply_retention'];

export function getPinnedActions(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_ACTIONS_KEY);
    return raw ? JSON.parse(raw) : [...DEFAULT_PINNED];
  } catch {
    return [...DEFAULT_PINNED];
  }
}

export function savePinnedActions(ids: string[]): void {
  try {
    localStorage.setItem(PINNED_ACTIONS_KEY, JSON.stringify(ids));
  } catch { /* ignore */ }
}

// ── Backend API calls ─────────────────────────────────────────────────────

const _base = () => resolveAtlanteanApiBaseOrThrow();
const _h = () => ({ 'Content-Type': 'application/json', ...getAtlanteanAuthHeaders() });

export async function purgeSession(sessionId: string): Promise<void> {
  const r = await fetch(`${_base()}/privacy/purge-session`, {
    method: 'POST',
    headers: _h(),
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!r.ok) throw new Error(`Purge failed: ${r.status}`);
}

export async function repairCorruption(sessionId: string): Promise<Record<string, unknown>> {
  const r = await fetch(`${_base()}/recovery/repair`, {
    method: 'POST',
    headers: _h(),
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!r.ok) throw new Error(`Repair failed: ${r.status}`);
  return r.json();
}

export async function getMemoryProposals(): Promise<MemoryProposal[]> {
  try {
    const r = await fetch(`${_base()}/memory/proposals`, { headers: _h() });
    if (!r.ok) return [];
    const d = await r.json();
    return d.proposals ?? [];
  } catch {
    return [];
  }
}

export async function getOperationsSummary(sessionId: string): Promise<Record<string, unknown>> {
  try {
    const r = await fetch(`${_base()}/operations/summary?session_id=${encodeURIComponent(sessionId)}`, { headers: _h() });
    if (!r.ok) return {};
    return r.json();
  } catch {
    return {};
  }
}
