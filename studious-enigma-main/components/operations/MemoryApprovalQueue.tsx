import React, { useCallback, useEffect, useState } from 'react';
import type { MemoryProposal, ProposalSensitivity, ProposalStatus } from '../../services/operationsService';
import { getMemoryProposals } from '../../services/operationsService';

// NOTE: mock — no backend memory proposal queue exists yet. Replace with real API when ready.

const SENSITIVITY_STYLES: Record<ProposalSensitivity, string> = {
  low:          'bg-gray-500/15 text-gray-400',
  medium:       'bg-cyan-500/15 text-cyan-300',
  high:         'bg-amber-500/15 text-amber-300',
  confidential: 'bg-red-500/15 text-red-400',
};

const STATUS_STYLES: Record<ProposalStatus, string> = {
  pending:      'bg-amber-500/15 text-amber-300 border-amber-500/20',
  approved:     'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  rejected:     'bg-red-500/15 text-red-400 border-red-500/20',
  deferred:     'bg-gray-500/15 text-gray-400 border-gray-500/20',
  session_only: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
};

function ProposalCard({ proposal, onDecision }: {
  proposal: MemoryProposal;
  onDecision: (id: string, decision: ProposalStatus) => void;
}) {
  return (
    <div className={`rounded-xl border ${proposal.status === 'pending' ? 'border-amber-500/20 bg-amber-500/3' : 'border-white/6 bg-white/2'} p-3`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className={`text-[7px] font-bold uppercase tracking-widest rounded-[4px] px-1.5 py-0.5 ${SENSITIVITY_STYLES[proposal.sensitivity]}`}>
              {proposal.sensitivity}
            </span>
            <span className={`text-[7px] font-bold uppercase tracking-widest rounded-[4px] px-1.5 py-0.5 border ${STATUS_STYLES[proposal.status]}`}>
              {proposal.status}
            </span>
            {proposal.category && (
              <span className="text-[7px] text-gray-500 font-mono">{proposal.category}</span>
            )}
          </div>
          <p className="text-[10px] text-gray-200 leading-relaxed line-clamp-3">{proposal.text}</p>
          {proposal.conflictStatus !== 'none' && (
            <div className="mt-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 px-2 py-1">
              <p className="text-[8px] text-orange-400 font-bold">
                {proposal.conflictStatus === 'conflict' ? '⚠ Conflicts with existing memory' : '⚠ Possible duplicate'}
              </p>
              {proposal.conflictsWith && (
                <p className="text-[8px] text-gray-500 mt-0.5 italic line-clamp-2">{proposal.conflictsWith.text}</p>
              )}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[8px] font-mono text-gray-600">
            {Math.round(proposal.confidence * 100)}% conf
          </p>
          {proposal.retentionDays && (
            <p className="text-[7px] text-gray-700 mt-0.5">{proposal.retentionDays}d retain</p>
          )}
        </div>
      </div>

      <p className="text-[7px] text-gray-600 mb-2">
        Source: <span className="text-gray-500 font-mono">{proposal.source}</span>
        {proposal.project && <> · <span className="text-gray-500 font-mono">{proposal.project}</span></>}
      </p>

      {proposal.status === 'pending' && (
        <div className="flex gap-2">
          <button
            onClick={() => onDecision(proposal.id, 'approved')}
            className="flex-1 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[9px] font-bold uppercase tracking-widest hover:bg-emerald-500/30 transition-all active:scale-95"
          >
            Approve
          </button>
          <button
            onClick={() => onDecision(proposal.id, 'session_only')}
            className="flex-1 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[9px] font-bold uppercase tracking-widest hover:bg-blue-500/20 transition-all active:scale-95"
          >
            Session Only
          </button>
          <button
            onClick={() => onDecision(proposal.id, 'rejected')}
            className="flex-1 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-bold uppercase tracking-widest hover:bg-red-500/20 transition-all active:scale-95"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

export default function MemoryApprovalQueue() {
  const [proposals, setProposals] = useState<MemoryProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending'>('pending');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMemoryProposals();
      setProposals(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const i = setInterval(() => void load(), 30_000);
    return () => clearInterval(i);
  }, [load]);

  const handleDecision = useCallback((id: string, decision: ProposalStatus) => {
    // NOTE: mock — update local state only until backend queue endpoint is implemented
    setProposals(ps => ps.map(p => p.id === id ? { ...p, status: decision } : p));
  }, []);

  const pendingCount = proposals.filter(p => p.status === 'pending').length;
  const visible = filter === 'pending' ? proposals.filter(p => p.status === 'pending') : proposals;

  return (
    <div>
      {/* Filter + count */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-1">
          {(['pending', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`py-1 px-2.5 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all
                ${filter === f
                  ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30'
                  : 'text-gray-500 hover:text-gray-300'}`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="bg-amber-500/20 border border-amber-500/30 rounded-full px-2 py-0.5 text-[8px] text-amber-300 font-bold">
              {pendingCount} pending
            </span>
          )}
          <button
            onClick={() => void load()}
            disabled={loading}
            className="text-[8px] text-gray-600 hover:text-gray-300 transition-colors"
          >
            {loading ? '…' : '↺'}
          </button>
        </div>
      </div>

      {loading && proposals.length === 0 ? (
        <div className="text-[9px] text-gray-600 py-3 text-center font-mono">Loading proposals…</div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-white/6 bg-white/3 p-3 text-center">
          <span className="text-[9px] text-gray-500">
            {filter === 'pending' ? 'No pending memory proposals.' : 'No proposals found.'}
          </span>
          <p className="text-[8px] text-gray-700 mt-1 italic">
            Memory proposals appear when the agent proposes new knowledge for long-term retention.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(p => (
            <ProposalCard key={p.id} proposal={p} onDecision={handleDecision} />
          ))}
        </div>
      )}

      {visible.length > 0 && filter === 'pending' && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => proposals.filter(p => p.status === 'pending').forEach(p => handleDecision(p.id, 'approved'))}
            className="flex-1 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase tracking-widest hover:bg-emerald-500/20 transition-all active:scale-95"
          >
            Approve All
          </button>
          <button
            onClick={() => proposals.filter(p => p.status === 'pending').forEach(p => handleDecision(p.id, 'rejected'))}
            className="flex-1 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-bold uppercase tracking-widest hover:bg-red-500/20 transition-all active:scale-95"
          >
            Reject All
          </button>
        </div>
      )}
    </div>
  );
}
