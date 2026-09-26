import React, { useState } from 'react';
import { resolveAtlanteanApiBaseOrThrow, getAtlanteanAuthHeaders } from '../../services/atlanteanService';
import {
  getPrivacySettings,
  savePrivacySettings,
  getPrivacyLedger,
  activateSovereignLockdown,
  deactivateSovereignLockdown,
  type PrivacySettings,
} from '../../services/operationsService';
import { getSettings } from '../../services/settingsService';

function Toggle({
  checked,
  onChange,
  danger,
}: { checked: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-8 rounded-full transition-all shrink-0 ${checked
        ? danger ? 'bg-red-500' : 'bg-[var(--color-primary)]'
        : 'bg-white/15'}`}
      style={{ height: '18px' }}
    >
      <span
        className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`}
      />
    </button>
  );
}

interface RowProps {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
  disabled?: boolean;
  tag?: string;
}

function SettingRow({ label, description, value, onChange, danger, disabled, tag }: RowProps) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border bg-white/3 px-3 py-2 transition-all
      ${value && danger ? 'border-red-500/25 bg-red-500/5' : value ? 'border-white/12' : 'border-white/6'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className={`text-[10px] font-bold ${value && danger ? 'text-red-300' : 'text-gray-200'}`}>{label}</p>
          {tag && (
            <span className="text-[6px] font-bold uppercase tracking-widest text-gray-600 bg-white/5 rounded-[3px] px-1">
              {tag}
            </span>
          )}
        </div>
        {description && <p className="text-[8px] text-gray-500 mt-0.5">{description}</p>}
      </div>
      {!disabled && <Toggle checked={value} onChange={onChange} danger={danger} />}
    </div>
  );
}

interface Props {
  sessionId: string;
  onNotify?: (msg: string) => void;
}

export default function PrivacySovereigntyControls({ sessionId, onNotify }: Props) {
  const [settings, setSettings] = useState<PrivacySettings>(getPrivacySettings);
  const ledger = getPrivacyLedger();
  const appSettings = getSettings();
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purging, setPurging] = useState(false);

  const update = (patch: Partial<PrivacySettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    savePrivacySettings(next);
  };

  const handleLockdown = () => {
    if (settings.sovereignLockdown) {
      deactivateSovereignLockdown();
      update({ sovereignLockdown: false, localOnlyLock: false });
      onNotify?.('Sovereign lockdown deactivated');
    } else {
      activateSovereignLockdown();
      update({ sovereignLockdown: true, localOnlyLock: true });
      onNotify?.('🔒 Sovereign lockdown active — all external routing blocked');
    }
  };

  const handlePurge = async () => {
    if (!confirmPurge) { setConfirmPurge(true); return; }
    setPurging(true);
    try {
      const base = resolveAtlanteanApiBaseOrThrow();
      const authH = getAtlanteanAuthHeaders();
      await fetch(`${base}/privacy/purge-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({ session_id: sessionId }),
      });
      onNotify?.('Session data purged');
    } catch (e) {
      onNotify?.(`Purge error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPurging(false);
      setConfirmPurge(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sovereign Lockdown Banner */}
      {settings.sovereignLockdown && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/8 p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Sovereign Lockdown Active</p>
          </div>
          <p className="text-[8px] text-red-300/70 mb-2">
            All external routing is blocked. Only local models and local data are in use.
          </p>
          <button
            onClick={handleLockdown}
            className="w-full py-1.5 rounded-lg bg-red-500/15 border border-red-500/25 text-red-300 text-[9px] font-bold uppercase tracking-widest hover:bg-red-500/25 transition-all"
          >
            Deactivate Lockdown
          </button>
        </div>
      )}

      {/* Privacy Ledger */}
      <div className="rounded-xl border border-white/6 bg-white/3 p-3">
        <p className="text-[8px] uppercase tracking-widest text-gray-600 mb-2">Session Privacy Ledger</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Local', ledger.localRequests, 'text-emerald-400'],
            ['External', ledger.externalRequests, ledger.externalRequests > 0 ? 'text-amber-400' : 'text-gray-500'],
            ['Tools', ledger.toolCalls, 'text-cyan-400'],
            ['Memories', ledger.memoriesCreated, 'text-[var(--color-primary)]'],
            ['Pending', ledger.memoriesAwaitingApproval, ledger.memoriesAwaitingApproval > 0 ? 'text-orange-400' : 'text-gray-500'],
            ['Purged', ledger.dataPurged, 'text-red-400'],
          ].map(([label, val, color]) => (
            <div key={String(label)} className="bg-black/20 rounded-lg p-2 text-center">
              <p className={`text-sm font-bold ${color}`}>{val}</p>
              <p className="text-[7px] uppercase tracking-widest text-gray-600 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
        {ledger.externalProviders.length > 0 && (
          <p className="mt-2 text-[8px] text-amber-400/70">
            External: {ledger.externalProviders.join(', ')}
          </p>
        )}
      </div>

      {/* Provider / cloud info */}
      <div className="rounded-xl border border-white/6 bg-white/3 px-3 py-2">
        <div className="flex items-center justify-between">
          <p className="text-[9px] text-gray-400">Current Provider</p>
          <span className={`text-[9px] font-bold ${appSettings.llmProvider === 'local' ? 'text-emerald-400' : 'text-amber-400'}`}>
            {appSettings.llmProvider === 'local' ? '◉ local' : `⬤ ${appSettings.llmProvider}`}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-[9px] text-gray-400">Cloud Escalation Consent</p>
          <span className={`text-[9px] font-bold ${appSettings.cloudEscalationConsent ? 'text-amber-400' : 'text-emerald-400'}`}>
            {appSettings.cloudEscalationConsent ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </div>

      {/* Settings rows */}
      <div className="space-y-1.5">
        <SettingRow
          label="Local-Only Lock"
          description="Block all cloud routing regardless of consent"
          value={settings.localOnlyLock}
          onChange={v => update({ localOnlyLock: v })}
        />
        <SettingRow
          label="Ask Before External Model"
          description="Prompt before routing any request to an external model"
          value={settings.askBeforeExternalModel}
          onChange={v => update({ askBeforeExternalModel: v })}
        />
        <SettingRow
          label="Ask Before External Tool"
          description="Prompt before invoking tools that make external API calls"
          value={settings.askBeforeExternalTool}
          onChange={v => update({ askBeforeExternalTool: v })}
        />
        <SettingRow
          label="Redact PII Before Cloud"
          description="Strip PII from context before sending to external providers"
          value={settings.redactPiiBeforeCloud}
          onChange={v => update({ redactPiiBeforeCloud: v })}
        />
        <SettingRow
          label="Disable Telemetry"
          description="Disable anonymous usage metrics"
          value={settings.telemetryDisabled}
          onChange={v => update({ telemetryDisabled: v })}
        />
        <SettingRow
          label="Disable Web Access"
          description="Block any web retrieval or URL fetch tools"
          value={settings.webAccessDisabled}
          onChange={v => update({ webAccessDisabled: v })}
        />
        <SettingRow
          label="Auto-Delete Temp Files"
          description="Remove intermediate files at session end"
          value={settings.autoDeleteTempFiles}
          onChange={v => update({ autoDeleteTempFiles: v })}
        />
        <SettingRow
          label="Encrypt Exported Memories"
          description="Require encryption for any exported memory packages"
          value={settings.encryptExportedMemories}
          onChange={v => update({ encryptExportedMemories: v })}
        />
      </div>

      {/* Actions */}
      <div className="space-y-1.5">
        <button
          onClick={handleLockdown}
          className={`w-full py-2 rounded-xl border text-[9px] font-bold uppercase tracking-widest transition-all active:scale-95
            ${settings.sovereignLockdown
              ? 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
              : 'border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/15'}`}
        >
          {settings.sovereignLockdown ? 'Deactivate Sovereign Lockdown' : '🔒 Activate Sovereign Lockdown'}
        </button>

        <button
          onClick={() => void handlePurge()}
          disabled={purging}
          className={`w-full py-2 rounded-xl border text-[9px] font-bold uppercase tracking-widest transition-all active:scale-95
            ${confirmPurge
              ? 'border-red-500/50 bg-red-500/20 text-red-300'
              : 'border-white/10 bg-white/3 text-gray-400 hover:bg-white/8'}`}
        >
          {purging ? 'Purging…' : confirmPurge ? 'Confirm Purge Session Data' : 'Purge Session Data'}
        </button>
        {confirmPurge && !purging && (
          <button
            onClick={() => setConfirmPurge(false)}
            className="w-full text-[8px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
