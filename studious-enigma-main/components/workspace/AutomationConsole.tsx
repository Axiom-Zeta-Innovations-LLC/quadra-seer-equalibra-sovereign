import React, { useCallback, useEffect, useState } from 'react';
import * as autoSvc from '../../services/automationService';
import type { AutomationPlan, ExecutionResult } from '../../services/automationService';
import ActionPlanReview from './ActionPlanReview';
import ApprovedRootsManager from './ApprovedRootsManager';

interface Props {
  sessionId: string;
  onInsertToChatContext?: (text: string) => void;
  onToast?: (msg: string) => void;
}

type ConsolePage = 'console' | 'roots' | 'quarantine' | 'audit';

export default function AutomationConsole({ sessionId, onInsertToChatContext, onToast }: Props) {
  const [page, setPage] = useState<ConsolePage>('console');
  const [request, setRequest] = useState('');
  const [plan, setPlan] = useState<AutomationPlan | null>(null);
  const [execResult, setExecResult] = useState<ExecutionResult | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [quarantine, setQuarantine] = useState<autoSvc.QuarantineItem[]>([]);
  const [auditLog, setAuditLog] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    autoSvc.getCapabilities().then(c => setAvailable(c.available)).catch(() => setAvailable(false));
  }, []);

  const loadQuarantine = useCallback(async () => {
    setQuarantine(await autoSvc.listQuarantine());
  }, []);

  const loadAudit = useCallback(async () => {
    setAuditLog(await autoSvc.getAuditLog(30));
  }, []);

  useEffect(() => {
    if (page === 'quarantine') void loadQuarantine();
    if (page === 'audit') void loadAudit();
  }, [page, loadQuarantine, loadAudit]);

  // Parse natural-language request as a simple shell_run plan for demo purposes
  const handleSubmit = async () => {
    if (!request.trim() || busy) return;
    setBusy(true);
    setPlan(null);
    setExecResult(null);
    try {
      const newPlan = await autoSvc.submitPlan(
        [{ type: 'shell_run', params: { command: request.trim(), cwd: null } }],
        request.trim(),
        sessionId,
      );
      setPlan(newPlan);
    } catch (e) {
      onToast?.(`Plan failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  const handleApprove = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      await autoSvc.approvePlan(plan.plan_id, plan.approval_token ?? '');
      const result = await autoSvc.executePlan(plan.plan_id, sessionId);
      setExecResult(result);
      setPlan({ ...plan, approved: true });
      onToast?.('Execution complete');
    } catch (e) {
      onToast?.(`Execution failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  const handleReject = async () => {
    if (!plan) return;
    await autoSvc.rejectPlan(plan.plan_id);
    setPlan(null);
    setExecResult(null);
    onToast?.('Plan rejected');
  };

  const pages: { id: ConsolePage; label: string }[] = [
    { id: 'console',    label: 'Console' },
    { id: 'roots',      label: 'Roots' },
    { id: 'quarantine', label: 'Quarantine' },
    { id: 'audit',      label: 'Audit' },
  ];

  return (
    <div className="space-y-3">
      {/* Sub-nav */}
      <div className="flex gap-1">
        {pages.map(p => (
          <button key={p.id} onClick={() => setPage(p.id)}
            className={`flex-1 py-1 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all
              ${page === p.id ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30' : 'text-gray-600 hover:text-gray-400'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Console page */}
      {page === 'console' && (
        <div className="space-y-3">
          {available === false && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-[9px] font-bold text-amber-300">Automation Unavailable</p>
              <p className="text-[8px] text-gray-500 mt-0.5">Add at least one approved filesystem root to enable automation.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <textarea
              value={request}
              onChange={e => setRequest(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void handleSubmit(); }}
              rows={3}
              placeholder="Describe an automation task… (Ctrl+Enter to submit)"
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-[10px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-[var(--color-primary)]/40 resize-none font-mono"
            />
            <button onClick={() => void handleSubmit()} disabled={!request.trim() || busy}
              className="w-full py-2 rounded-xl bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/25 text-[var(--color-primary)] text-[9px] font-bold uppercase tracking-widest hover:bg-[var(--color-primary)]/25 transition-all active:scale-95 disabled:opacity-40">
              {busy ? 'Processing…' : 'Generate Plan →'}
            </button>
          </div>

          {/* Plan review */}
          {plan && (
            <ActionPlanReview
              plan={plan}
              onApprove={() => void handleApprove()}
              onReject={() => void handleReject()}
              busy={busy}
            />
          )}

          {/* Execution output */}
          {execResult && (
            <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-2">
              <p className="text-[9px] font-bold text-gray-300">Execution Output</p>
              {execResult.results.map((r, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] font-bold font-mono ${r.status === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.status.toUpperCase()} — {r.action_type}
                    </span>
                    <span className="text-[7px] text-gray-700">{r.duration_ms}ms</span>
                  </div>
                  {r.output && (
                    <pre className="text-[8px] text-gray-400 font-mono bg-black/40 rounded-lg px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-words">{r.output}</pre>
                  )}
                  {r.error && (
                    <p className="text-[8px] text-red-400 font-mono">{r.error}</p>
                  )}
                  {r.files_quarantined.length > 0 && (
                    <p className="text-[8px] text-amber-400">⚡ {r.files_quarantined.length} file(s) quarantined</p>
                  )}
                </div>
              ))}
              {execResult.results.some(r => r.output) && (
                <button onClick={() => {
                  const text = execResult.results.map(r => `[${r.action_type}]\n${r.output || r.error || ''}`).join('\n\n');
                  onInsertToChatContext?.(`[Automation Output]\n${text}`);
                  onToast?.('Output inserted');
                }}
                  className="text-[8px] text-[var(--color-primary)] hover:underline">
                  Insert output into chat →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Roots page */}
      {page === 'roots' && <ApprovedRootsManager onToast={onToast} />}

      {/* Quarantine page */}
      {page === 'quarantine' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[8px] font-bold text-gray-600 uppercase tracking-widest">Quarantined Files</p>
            <button onClick={() => void loadQuarantine()} className="text-[8px] text-gray-600 hover:text-gray-400">↺</button>
          </div>
          {quarantine.length === 0 ? (
            <p className="text-[9px] text-gray-600 italic">No quarantined files.</p>
          ) : quarantine.map(item => (
            <div key={item.quarantine_path} className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-2.5">
              <p className="text-[9px] text-gray-300 font-mono truncate">{item.original_path}</p>
              <p className="text-[8px] text-gray-600 mt-0.5">{new Date(item.quarantined_at * 1000).toLocaleString()}</p>
              <div className="flex gap-1.5 mt-2">
                <button onClick={async () => { await autoSvc.restoreQuarantine(item.quarantine_path); onToast?.('Restored'); void loadQuarantine(); }}
                  className="flex-1 py-1 rounded-lg border border-emerald-500/20 text-emerald-400 text-[8px] font-bold hover:bg-emerald-500/10 transition-all">
                  Restore
                </button>
                <button onClick={async () => { await autoSvc.purgeQuarantine(item.quarantine_path); onToast?.('Purged permanently'); void loadQuarantine(); }}
                  className="py-1 px-2 rounded-lg border border-red-500/20 text-red-500 text-[8px] hover:bg-red-500/10 hover:text-red-400 transition-all">
                  Purge
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Audit page */}
      {page === 'audit' && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[8px] font-bold text-gray-600 uppercase tracking-widest">Audit Log</p>
            <button onClick={() => void loadAudit()} className="text-[8px] text-gray-600 hover:text-gray-400">↺</button>
          </div>
          {auditLog.length === 0 ? (
            <p className="text-[9px] text-gray-600 italic">No audit events.</p>
          ) : auditLog.map((event, i) => (
            <div key={i} className="rounded-lg border border-white/5 bg-black/20 px-2.5 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-bold font-mono text-gray-400">{String(event.event_type ?? '')}</span>
                <span className="text-[7px] text-gray-700 font-mono">
                  {event.timestamp ? new Date(Number(event.timestamp) * 1000).toLocaleString() : ''}
                </span>
              </div>
              {event.summary && <p className="text-[8px] text-gray-500 mt-0.5">{String(event.summary)}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
