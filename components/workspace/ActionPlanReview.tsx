import React from 'react';
import type { AutomationPlan } from '../../services/automationService';

const RISK_CONFIG = {
  1: { label: 'Low Risk',    color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25' },
  2: { label: 'Medium Risk', color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25' },
  3: { label: 'High Risk',   color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/25' },
};

interface Props {
  plan: AutomationPlan;
  onApprove: () => void;
  onReject: () => void;
  busy?: boolean;
}

export default function ActionPlanReview({ plan, onApprove, onReject, busy }: Props) {
  const rc = RISK_CONFIG[plan.risk_level] ?? RISK_CONFIG[1];
  return (
    <div className={`rounded-xl border p-4 space-y-3 ${rc.border} ${rc.bg}`}>
      {/* Header */}
      <div className="flex items-start gap-2 justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-gray-200">{plan.summary}</p>
          <p className="text-[8px] text-gray-600 font-mono mt-0.5">Plan ID: {plan.plan_id}</p>
        </div>
        <span className={`px-2 py-1 rounded-lg text-[8px] font-bold uppercase tracking-widest ${rc.color} ${rc.bg} border ${rc.border}`}>
          {rc.label}
        </span>
      </div>

      {/* Actions list */}
      <div className="space-y-1.5">
        <p className="text-[8px] font-bold text-gray-600 uppercase tracking-widest">
          {plan.actions.length} Action{plan.actions.length !== 1 ? 's' : ''}
        </p>
        {plan.actions.map((action, i) => {
          const arc = RISK_CONFIG[action.risk_level] ?? RISK_CONFIG[1];
          return (
            <div key={i} className="rounded-lg border border-white/6 bg-black/20 px-2.5 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`text-[8px] font-bold font-mono ${arc.color}`}>{action.type}</span>
                <span className={`px-1 rounded text-[7px] font-bold uppercase ${arc.color}`}>L{action.risk_level}</span>
              </div>
              <dl className="space-y-0.5">
                {Object.entries(action.params).map(([k, v]) => (
                  <div key={k} className="flex items-start gap-2">
                    <dt className="text-[8px] text-gray-600 font-mono shrink-0 min-w-[60px]">{k}:</dt>
                    <dd className="text-[8px] text-gray-300 font-mono break-all">{JSON.stringify(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>

      {/* Warning for high-risk */}
      {plan.risk_level >= 2 && (
        <div className={`rounded-lg border px-2.5 py-2 ${plan.risk_level === 3 ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
          <p className={`text-[8px] font-bold ${plan.risk_level === 3 ? 'text-red-400' : 'text-amber-400'}`}>
            {plan.risk_level === 3
              ? '⚠ High-risk plan — this includes destructive or powerful operations. Review each action carefully.'
              : '⚡ Medium-risk plan — review actions before approving.'}
          </p>
        </div>
      )}

      {/* Approve / Reject */}
      {!plan.approved && (
        <div className="flex gap-2 pt-1">
          <button onClick={onReject} disabled={busy}
            className="flex-1 py-2 rounded-xl border border-red-500/25 bg-red-500/8 text-red-400 text-[9px] font-bold uppercase tracking-widest hover:bg-red-500/15 transition-all active:scale-95 disabled:opacity-50">
            Reject
          </button>
          <button onClick={onApprove} disabled={busy}
            className="flex-1 py-2 rounded-xl border border-emerald-500/25 bg-emerald-500/8 text-emerald-400 text-[9px] font-bold uppercase tracking-widest hover:bg-emerald-500/15 transition-all active:scale-95 disabled:opacity-50">
            {busy ? 'Processing…' : 'Approve & Execute'}
          </button>
        </div>
      )}

      {plan.approved && (
        <p className="text-center text-[8px] text-emerald-400 font-bold py-1">✓ Approved — executing…</p>
      )}
    </div>
  );
}
