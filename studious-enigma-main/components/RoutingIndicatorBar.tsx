/**
 * RoutingIndicatorBar – Step 26
 *
 * Compact operator dashboard strip showing live provider, backend, and
 * sovereignty policy state fetched from GET /api/atlantean/routing/settings.
 */

import React, { useEffect, useState } from 'react';
import { getRoutingSettings, RoutingSettingsData, resolveAtlanteanApiBaseOrThrow } from '../services/atlanteanService';

// ── helpers ──────────────────────────────────────────────────────────────────

function ProviderDot({ provider }: { provider: string }) {
  const color =
    provider === 'local'
      ? 'bg-emerald-400'
      : provider === 'mock'
      ? 'bg-amber-400'
      : 'bg-blue-400'; // cloud
  return <span className={`inline-block w-2 h-2 rounded-full ${color} mr-1 flex-shrink-0`} />;
}

interface BadgeProps {
  label: string;
  variant: 'ok' | 'warn' | 'info' | 'neutral';
  title?: string;
}

function Badge({ label, variant, title }: BadgeProps) {
  const colors: Record<string, string> = {
    ok: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
    warn: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
    info: 'text-blue-300 border-blue-500/40 bg-blue-500/10',
    neutral: 'text-gray-400 border-gray-600/40 bg-gray-600/10',
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded border text-[9px] font-bold tracking-wider ${colors[variant]}`}
      title={title}
    >
      {label}
    </span>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

interface RoutingIndicatorBarProps {
  /** Refresh interval in ms (default 60 000). */
  refreshIntervalMs?: number;
}

export default function RoutingIndicatorBar({
  refreshIntervalMs = 60_000,
}: RoutingIndicatorBarProps) {
  const [settings, setSettings] = useState<RoutingSettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceCaps, setVoiceCaps] = useState<{ stt: boolean; tts: boolean } | null>(null);
  const [hwTier, setHwTier] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await getRoutingSettings();
        if (!cancelled) {
          setSettings(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'routing unavailable');
        }
      }
      // Probe voice pipeline independently — don't let failure break routing display.
      try {
        const base = resolveAtlanteanApiBaseOrThrow();
        const resp = await fetch(`${base}/voice/capabilities`);
        if (!cancelled && resp.ok) {
          const d = await resp.json();
          setVoiceCaps({ stt: Boolean(d?.stt?.available), tts: Boolean(d?.tts?.available) });
        }
      } catch {
        // Voice capabilities probe is best-effort.
      }
      // Fetch hardware tier from deep health check.
      try {
        const deepResp = await fetch(`${base}/health/deep`);
        if (!cancelled && deepResp.ok) {
          const d = await deepResp.json();
          const tier = d?.hardware_tier as string | undefined;
          if (tier) setHwTier(tier);
        }
      } catch {
        // Hardware tier probe is best-effort.
      }
    };

    load();
    const interval = setInterval(load, refreshIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshIntervalMs]);

  if (error) {
    return (
      <div className="bg-black/40 px-3 py-2 rounded-lg border border-gray-700/40 flex items-center gap-2">
        <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">
          Routing — {error}
        </span>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="bg-black/40 px-3 py-2 rounded-lg border border-gray-700/40">
        <span className="text-[9px] font-mono text-gray-600 uppercase tracking-wider animate-pulse">
          Loading routing…
        </span>
      </div>
    );
  }

  const { provider, model_tiers, hrm_compute_budget, reasoning_budgets } = settings;
  const providerLabel = provider.default.toUpperCase();
  const backendLabel = provider.local_backend || 'local';
  const cloudBlocked = !provider.allow_cloud_escalation;
  const outboundBlocked = !provider.allow_outbound_network;

  return (
    <div className="bg-black/40 px-3 py-2.5 rounded-lg border border-purple-500/10 space-y-2">
      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
        Operator Routing
      </div>

      {/* Provider + Backend row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex items-center text-[10px] font-mono text-gray-300">
          <ProviderDot provider={provider.default} />
          <span>{providerLabel}</span>
        </div>
        <Badge
          label={backendLabel.toUpperCase()}
          variant="info"
          title={`Local model: ${provider.local_model}`}
        />
        <Badge
          label={`TIER ≤${model_tiers.heavy ? 'HEAVY' : 'STD'}`}
          variant="neutral"
          title={`Light: ${model_tiers.light || '—'} | Standard: ${model_tiers.standard || '—'} | Heavy: ${model_tiers.heavy || '—'}`}
        />
        {hwTier && (
          <Badge
            label={`HW: ${hwTier.replace('_', ' ')}`}
            variant="info"
            title={`Detected hardware tier: ${hwTier}`}
          />
        )}
      </div>

      {/* Policy state row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {cloudBlocked ? (
          <Badge label="CLOUD BLOCKED" variant="ok" title="ALLOW_CLOUD_ESCALATION=0" />
        ) : (
          <Badge label="CLOUD ALLOWED" variant="warn" title="ALLOW_CLOUD_ESCALATION=1" />
        )}
        {outboundBlocked ? (
          <Badge label="OUTBOUND OFF" variant="ok" title="ALLOW_OUTBOUND_NETWORK=0" />
        ) : (
          <Badge label="OUTBOUND ON" variant="warn" title="ALLOW_OUTBOUND_NETWORK=1" />
        )}
        {provider.require_cloud_escalation_consent && (
          <Badge label="CONSENT REQ" variant="ok" title="REQUIRE_CLOUD_ESCALATION_CONSENT=1" />
        )}
      </div>

      {/* Compute budget + reasoning row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {hrm_compute_budget.enabled ? (
          <Badge
            label={`HRM ≤${hrm_compute_budget.hrm_max_ms_per_query}ms`}
            variant="neutral"
            title={`HRM budget: max ${hrm_compute_budget.hrm_max_ms_per_query}ms/query, ${hrm_compute_budget.max_total_ms_per_window}ms/${hrm_compute_budget.window_seconds}s window`}
          />
        ) : (
          <Badge label="HRM BUDGET OFF" variant="warn" title="ATLANTEAN_ENABLE_HRM_COMPUTE_BUDGET=0" />
        )}
        {reasoning_budgets.enabled ? (
          <Badge
            label={`CYCLES S${reasoning_budgets.cycles_simple}/A${reasoning_budgets.cycles_analytical}/D${reasoning_budgets.cycles_deep}`}
            variant="neutral"
            title={`Reasoning cycles by class — simple: ${reasoning_budgets.cycles_simple}, analytical: ${reasoning_budgets.cycles_analytical}, deep: ${reasoning_budgets.cycles_deep}`}
          />
        ) : (
          <Badge label="REASONING OFF" variant="neutral" />
        )}
      </div>

      {/* Voice pipeline row */}
      {voiceCaps !== null && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            label={`STT ${voiceCaps.stt ? 'WHISPER' : 'BROWSER'}`}
            variant={voiceCaps.stt ? 'ok' : 'neutral'}
            title={voiceCaps.stt ? 'faster-whisper transcription active' : 'Browser Web Speech API (no local STT)'}
          />
          <Badge
            label={`TTS ${voiceCaps.tts ? 'PIPER' : 'BROWSER'}`}
            variant={voiceCaps.tts ? 'ok' : 'neutral'}
            title={voiceCaps.tts ? 'Piper offline TTS active' : 'Browser SpeechSynthesis (no local TTS)'}
          />
        </div>
      )}
    </div>
  );
}
