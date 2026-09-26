import React, { useState } from 'react';
import {
  getAllModePolicies,
  getIntelligenceMode,
  setIntelligenceMode,
  type IntelligenceMode,
  type IntelligenceModePolicy,
} from '../../services/operationsService';

function SpeedBar({ value }: { value: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          className={`h-1.5 w-3 rounded-[2px] transition-colors ${i <= value ? 'bg-[var(--color-primary)]' : 'bg-white/10'}`}
        />
      ))}
    </div>
  );
}

function PrivacyBadge({ level }: { level: 'maximum' | 'high' | 'standard' }) {
  const cfg = {
    maximum: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    high:    'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    standard:'bg-amber-500/15 text-amber-300 border-amber-500/30',
  }[level];
  return (
    <span className={`inline-block border rounded-[4px] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-widest ${cfg}`}>
      {level} privacy
    </span>
  );
}

function ModeCard({
  policy,
  active,
  onSelect,
}: {
  policy: IntelligenceModePolicy;
  active: boolean;
  onSelect: (mode: IntelligenceMode) => void;
}) {
  return (
    <button
      onClick={() => onSelect(policy.mode)}
      className={`w-full text-left rounded-xl border p-3 transition-all active:scale-[0.98]
        ${active
          ? 'border-[var(--color-primary)]/60 bg-[var(--color-primary)]/10 shadow-[0_0_10px_var(--color-primary)/8]'
          : 'border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/5'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full border-2 shrink-0 mt-0.5
            ${active ? 'border-[var(--color-primary)] bg-[var(--color-primary)]' : 'border-white/20 bg-transparent'}`}
          />
          <span className={`text-[11px] font-bold ${active ? 'text-[var(--color-primary)]' : 'text-gray-200'}`}>
            {policy.label}
          </span>
        </div>
        <PrivacyBadge level={policy.privacyLevel} />
      </div>

      <p className="mt-1.5 ml-4 text-[9px] text-gray-400 leading-relaxed">{policy.description}</p>

      {policy.externalWarning && (
        <p className="mt-1 ml-4 text-[8px] text-amber-400/80 leading-relaxed">
          ⚠ {policy.externalWarning}
        </p>
      )}

      <div className="mt-2 ml-4 grid grid-cols-2 gap-x-4 gap-y-1">
        <div>
          <p className="text-[7px] uppercase tracking-widest text-gray-600 mb-0.5">Speed</p>
          <SpeedBar value={policy.speedRating} />
        </div>
        <div>
          <p className="text-[7px] uppercase tracking-widest text-gray-600 mb-0.5">Reasoning</p>
          <SpeedBar value={policy.reasoningRating} />
        </div>
      </div>

      <div className="mt-2 ml-4 flex flex-wrap gap-x-4 gap-y-0.5">
        <span className="text-[7px] text-gray-600 font-mono">
          Verification: {policy.verificationDepth}
        </span>
        <span className="text-[7px] text-gray-600 font-mono">
          Reasoning: {policy.reasoningBudget}
        </span>
        {policy.localOnly && (
          <span className="text-[7px] text-emerald-600 font-mono">local-only</span>
        )}
        {policy.prioritizeLatency && (
          <span className="text-[7px] text-cyan-600 font-mono">latency-first</span>
        )}
      </div>
    </button>
  );
}

interface Props {
  onChange?: (mode: IntelligenceMode) => void;
}

export default function IntelligenceModeSelector({ onChange }: Props) {
  const [current, setCurrent] = useState<IntelligenceMode>(getIntelligenceMode);
  const policies = getAllModePolicies();

  const handleSelect = (mode: IntelligenceMode) => {
    setIntelligenceMode(mode);
    setCurrent(mode);
    onChange?.(mode);
  };

  return (
    <div className="space-y-2">
      {policies.map(policy => (
        <ModeCard
          key={policy.mode}
          policy={policy}
          active={current === policy.mode}
          onSelect={handleSelect}
        />
      ))}
    </div>
  );
}
