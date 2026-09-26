/**
 * automationService.ts — TypeScript client for the sandboxed automation API.
 */
import { resolveAtlanteanApiBaseOrThrow, getAtlanteanAuthHeaders } from './atlanteanService';

const _b = () => resolveAtlanteanApiBaseOrThrow();
const _h = () => ({ 'Content-Type': 'application/json', ...getAtlanteanAuthHeaders() });

// ── Types ──────────────────────────────────────────────────────────────────

export type RiskLevel = 1 | 2 | 3;

export interface AutomationAction {
  type: string;
  params: Record<string, unknown>;
  risk_level: RiskLevel;
  risk_label: string;
}

export interface AutomationPlan {
  plan_id: string;
  summary: string;
  risk_level: RiskLevel;
  risk_label: string;
  actions: AutomationAction[];
  created_at: number;
  session_id: string;
  approved: boolean;
  plan_hash: string;
  approval_token?: string;
}

export interface ExecutionActionResult {
  action_type: string;
  status: 'success' | 'failed' | 'cancelled' | 'timeout';
  output: string;
  error: string | null;
  files_created: string[];
  files_modified: string[];
  files_quarantined: string[];
  duration_ms: number;
}

export interface ExecutionResult {
  job_id: string;
  results: ExecutionActionResult[];
}

export interface QuarantineItem {
  quarantine_path: string;
  original_path: string;
  quarantined_at: number;
  job_id: string;
}

export interface AutomationCapabilities {
  available: boolean;
  action_types?: string[];
  risk_labels?: Record<string, string>;
  approved_roots?: string[];
  quarantine_count?: number;
}

// ── API calls ──────────────────────────────────────────────────────────────

export async function getCapabilities(): Promise<AutomationCapabilities> {
  const r = await fetch(`${_b()}/automation/capabilities`, { headers: _h() });
  return r.json();
}

export async function getApprovedRoots(): Promise<string[]> {
  const r = await fetch(`${_b()}/automation/approved-roots`, { headers: _h() });
  if (!r.ok) return [];
  const d = await r.json();
  return d.roots ?? [];
}

export async function addApprovedRoot(path: string): Promise<string[]> {
  const r = await fetch(`${_b()}/automation/approved-roots/add`, {
    method: 'POST', headers: _h(), body: JSON.stringify({ path }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(e.error || r.statusText);
  }
  const d = await r.json();
  return d.roots ?? [];
}

export async function removeApprovedRoot(path: string): Promise<string[]> {
  const r = await fetch(`${_b()}/automation/approved-roots/remove`, {
    method: 'POST', headers: _h(), body: JSON.stringify({ path }),
  });
  const d = await r.json();
  return d.roots ?? [];
}

export async function submitPlan(
  actions: Array<{ type: string; params: Record<string, unknown> }>,
  summary: string,
  sessionId: string,
): Promise<AutomationPlan> {
  const r = await fetch(`${_b()}/automation/plan`, {
    method: 'POST', headers: _h(),
    body: JSON.stringify({ actions, summary, session_id: sessionId }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(e.error || r.statusText);
  }
  const d = await r.json();
  return d.plan;
}

export async function approvePlan(planId: string, approvalToken: string): Promise<void> {
  const r = await fetch(`${_b()}/automation/approve`, {
    method: 'POST', headers: _h(),
    body: JSON.stringify({ plan_id: planId, approval_token: approvalToken }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(e.error || r.statusText);
  }
}

export async function rejectPlan(planId: string, reason = 'operator rejected'): Promise<void> {
  await fetch(`${_b()}/automation/reject`, {
    method: 'POST', headers: _h(),
    body: JSON.stringify({ plan_id: planId, reason }),
  });
}

export async function executePlan(planId: string, sessionId: string): Promise<ExecutionResult> {
  const r = await fetch(`${_b()}/automation/execute`, {
    method: 'POST', headers: _h(),
    body: JSON.stringify({ plan_id: planId, session_id: sessionId }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(e.error || r.statusText);
  }
  return r.json();
}

export async function getAuditLog(limit = 50): Promise<Record<string, unknown>[]> {
  const r = await fetch(`${_b()}/automation/jobs`, { headers: _h() });
  if (!r.ok) return [];
  const d = await r.json();
  return (d.events ?? []).slice(-limit).reverse();
}

export async function listQuarantine(): Promise<QuarantineItem[]> {
  const r = await fetch(`${_b()}/automation/quarantine`, { headers: _h() });
  if (!r.ok) return [];
  const d = await r.json();
  return d.items ?? [];
}

export async function restoreQuarantine(quarantinePath: string): Promise<string> {
  const r = await fetch(`${_b()}/automation/quarantine/restore`, {
    method: 'POST', headers: _h(), body: JSON.stringify({ quarantine_path: quarantinePath }),
  });
  if (!r.ok) throw new Error(`Restore failed: ${r.status}`);
  const d = await r.json();
  return d.restored_to;
}

export async function purgeQuarantine(quarantinePath: string): Promise<void> {
  await fetch(`${_b()}/automation/quarantine/purge`, {
    method: 'POST', headers: _h(), body: JSON.stringify({ quarantine_path: quarantinePath }),
  });
}
