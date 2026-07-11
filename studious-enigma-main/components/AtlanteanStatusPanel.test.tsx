import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AtlanteanStatusPanel from './AtlanteanStatusPanel';

vi.mock('../services/atlanteanService', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    replayIntegrityProof: vi.fn().mockResolvedValue({
      session_id: 'sess-1',
      events_total: 0,
      events_verified: 0,
      replay_state_hash: null,
      live_state_hash: 'hash',
      match: false,
      valid: true,
      issues: [],
      replay_head_hash: 'head',
      verified_up_to_seq: null,
    }),
  };
});

describe('AtlanteanStatusPanel', () => {
  it('renders sync metadata counters and refresh indicator', () => {
    render(
      <AtlanteanStatusPanel
        isLoading={false}
        isRefreshingFields={true}
        refreshTelemetry={{
          status: {
            count: 6,
            lastMs: 18,
            averageMs: 22,
            lastStartedAt: Date.now() - 20,
            lastCompletedAt: Date.now(),
          },
          fields: {
            count: 9,
            lastMs: 33,
            averageMs: 41,
            lastStartedAt: Date.now() - 35,
            lastCompletedAt: Date.now(),
          },
        }}
        status={{
          device_id: 'quadra-seer-default',
          version: 12,
          last_update: new Date().toISOString(),
          learning_capacity: 0.62,
          cold_memory_items: 19,
          fingerprint: 'abc123',
          field_stats: {
            phi1_mean: 0.32,
            phi5_mean: 0.18,
            Phi: 0.41,
          },
          sync: {
            last_merged_device: 'quadra-seer-remote-01',
            last_merge_strategy: 'conservative',
            last_merged_at: new Date().toISOString(),
            conflict_counters: {
              total_merges: 4,
              concurrent_merges: 1,
              remote_updates_applied: 2,
              noop_merges: 1,
            },
          },
        }}
        fields={{
          phi1: [[0.1, 0.2], [0.3, 0.4]],
          phi5: [[0.2, 0.1], [0.4, 0.2]],
          Phi: 0.41,
          version: 12,
          timestamp: Date.now(),
          learning_capacity: 0.62,
          stats: {
            phi1_mean: 0.25,
            phi1_std: 0.1,
            phi5_mean: 0.23,
            phi5_std: 0.1,
          },
        }}
      />,
    );

    expect(screen.getByText('Sync Metadata')).toBeTruthy();
    expect(screen.getByText(/Total 4/)).toBeTruthy();
    expect(screen.getByText(/Concurrent 1/)).toBeTruthy();
    expect(screen.getByText(/Applied 2/)).toBeTruthy();
    expect(screen.getByText(/No-op 1/)).toBeTruthy();
    expect(screen.getByText('Updating field telemetry...')).toBeTruthy();
    expect(screen.getByText('Refresh Performance')).toBeTruthy();
    expect(screen.getByText(/Status Refresh/)).toBeTruthy();
    expect(screen.getByText(/Field Refresh/)).toBeTruthy();
    expect(screen.getByText(/Last 18ms/)).toBeTruthy();
    expect(screen.getByText(/Avg 41ms/)).toBeTruthy();
  });
});
