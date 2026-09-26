import React, { useState, useCallback } from 'react';
import type { AtlanteanStatus, FieldData, AtlanteanSnapshotRecord } from '../services/atlanteanService';
import { createSnapshot } from '../services/atlanteanService';
import type { RefreshTelemetry } from '../hooks/useAtlantean';

import ActionCenter from './operations/ActionCenter';
import IntelligenceModeSelector from './operations/IntelligenceModeSelector';
import TaskController from './operations/TaskController';
import MemoryApprovalQueue from './operations/MemoryApprovalQueue';
import QuickOperations from './operations/QuickOperations';
import ModelRoutingControl from './operations/ModelRoutingControl';
import PrivacySovereigntyControls from './operations/PrivacySovereigntyControls';
import SnapshotRecoveryCenter from './operations/SnapshotRecoveryCenter';
import WorkflowAutomation from './operations/WorkflowAutomation';
import AdvancedDiagnostics from './operations/AdvancedDiagnostics';

// ── Section helpers ───────────────────────────────────────────────────────

interface SectionProps {
  id: string;
  title: string;
  badge?: string | number;
  badgeColor?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  tag?: string;
}

function Section({ id, title, badge, badgeColor, defaultOpen = false, children, tag }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/6 bg-white/[0.02] overflow-hidden">
      <button
        id={`ops-section-${id}`}
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-white/3 transition-colors group"
      >
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-gray-600 group-hover:text-gray-400 transition-colors select-none">
            {open ? '▾' : '▸'}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-300 group-hover:text-gray-200 transition-colors select-none">
            {title}
          </span>
          {tag && (
            <span className="text-[6px] font-bold uppercase tracking-widest text-gray-600 bg-white/5 rounded-[3px] px-1.5 py-0.5 select-none">
              {tag}
            </span>
          )}
        </div>
        {badge !== undefined && (
          <span className={`text-[8px] font-bold rounded-full px-2 py-0.5 select-none ${badgeColor ?? 'bg-white/8 text-gray-400'}`}>
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0.5 border-t border-white/5">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────

export interface OperationsPanelProps {
  status: AtlanteanStatus | null;
  fields: FieldData | null;
  isLoading: boolean;
  isRefreshingFields?: boolean;
  refreshTelemetry?: RefreshTelemetry;
  currentSessionId: string;
  onSnapshotRestored?: () => void;
  onSelectSnapshot?: (snap: AtlanteanSnapshotRecord) => void;
  onToast?: (msg: string) => void;
  onOpenProfile?: () => void;
  onExportSyncPackage?: () => Promise<void>;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function OperationsPanel({
  status,
  fields,
  isLoading,
  isRefreshingFields,
  refreshTelemetry,
  currentSessionId,
  onSnapshotRestored,
  onSelectSnapshot,
  onToast,
  onOpenProfile,
  onExportSyncPackage,
}: OperationsPanelProps) {
  const [openTab, setOpenTab] = useState<string | null>(null);

  const handleOpenTab = useCallback((tab: string) => {
    setOpenTab(tab);
    // Scroll to the matching section after a tick
    requestAnimationFrame(() => {
      const el = document.getElementById(`ops-section-${tab}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const handleCreateSnapshot = useCallback(async () => {
    await createSnapshot(undefined, currentSessionId);
  }, [currentSessionId]);

  const handleExportPackage = useCallback(async () => {
    if (onExportSyncPackage) {
      await onExportSyncPackage();
    } else {
      onToast?.('Export: use the sync export button in the main toolbar.');
    }
  }, [onExportSyncPackage, onToast]);

  return (
    <div className="flex flex-col gap-2">
      {/* ── Action Center (always visible) ── */}
      <div className="rounded-xl border border-white/6 bg-white/[0.02] p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300">Action Center</p>
        </div>
        <ActionCenter
          status={status}
          sessionId={currentSessionId}
          onOpenTab={handleOpenTab}
        />
      </div>

      {/* ── Quick Operations ── */}
      <Section id="quick" title="Quick Operations" defaultOpen>
        <QuickOperations
          sessionId={currentSessionId}
          onCreateSnapshot={handleCreateSnapshot}
          onExportPackage={handleExportPackage}
        />
      </Section>

      {/* ── Intelligence Mode ── */}
      <Section id="mode" title="Intelligence Mode" defaultOpen>
        <IntelligenceModeSelector onChange={mode => onToast?.(`Mode set to ${mode}`)} />
      </Section>

      {/* ── Task Controller ── */}
      <Section id="task" title="Task Controller" tag="framework">
        <TaskController onOpenProfile={onOpenProfile} />
      </Section>

      {/* ── Memory Approval Queue ── */}
      <Section id="memory" title="Memory Approval Queue" tag="framework">
        <MemoryApprovalQueue />
      </Section>

      {/* ── Model & Routing Control ── */}
      <Section id="routing" title="Model & Routing" defaultOpen={false}>
        <ModelRoutingControl onNotify={onToast} />
      </Section>

      {/* ── Privacy & Sovereignty ── */}
      <Section id="privacy" title="Privacy & Sovereignty" defaultOpen={false}>
        <PrivacySovereigntyControls sessionId={currentSessionId} onNotify={onToast} />
      </Section>

      {/* ── Snapshot & Recovery ── */}
      <Section id="recovery" title="Snapshot & Recovery" defaultOpen={false}>
        <SnapshotRecoveryCenter
          sessionId={currentSessionId}
          onSnapshotRestored={onSnapshotRestored}
          onNotify={onToast}
          onSelectSnapshot={onSelectSnapshot}
        />
      </Section>

      {/* ── Workflow Automation ── */}
      <Section id="workflows" title="Workflow Automation" defaultOpen={false}>
        <WorkflowAutomation
          sessionId={currentSessionId}
          onNotify={onToast}
          onCreateSnapshot={handleCreateSnapshot}
          onExportPackage={handleExportPackage}
        />
      </Section>

      {/* ── Advanced Diagnostics (collapse existing panel) ── */}
      <AdvancedDiagnostics
        status={status}
        fields={fields}
        isLoading={isLoading}
        isRefreshingFields={isRefreshingFields}
        refreshTelemetry={refreshTelemetry}
      />

      {/* Bottom spacer */}
      <div className="h-4" />
    </div>
  );
}
