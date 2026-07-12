import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatInterface from './ChatInterface';

const prepareSyncPackageMock = vi.fn();
const mergeSyncPackageMock = vi.fn();
const refreshStatusMock = vi.fn();
const refreshFieldsMock = vi.fn();
const storeSimulationMock = vi.fn();
const recallSimulationsMock = vi.fn();
const triggerEventMock = vi.fn();
const setMessagesMock = vi.fn();
const clearMessagesMock = vi.fn();
const refreshTelemetryMock = {
  status: {
    count: 3,
    lastMs: 14,
    averageMs: 19,
    lastStartedAt: 1000,
    lastCompletedAt: 1014,
  },
  fields: {
    count: 5,
    lastMs: 28,
    averageMs: 31,
    lastStartedAt: 2000,
    lastCompletedAt: 2028,
  },
};

let mockedBridgeError: string | null = null;

vi.mock('../hooks/useAtlantean', () => ({
  useAtlantean: () => ({
    messages: [],
    status: null,
    fields: null,
    isLoading: false,
    isRefreshingFields: false,
    error: mockedBridgeError,
    refreshTelemetry: refreshTelemetryMock,
    setMessages: setMessagesMock,
    clearMessages: clearMessagesMock,
    triggerEvent: triggerEventMock,
    storeSimulation: storeSimulationMock,
    recallSimulations: recallSimulationsMock,
    prepareSyncPackage: prepareSyncPackageMock,
    mergeSyncPackage: mergeSyncPackageMock,
    refreshStatus: refreshStatusMock,
    refreshFields: refreshFieldsMock,
  }),
}));

vi.mock('../services/queryService', () => ({
  default: vi.fn(),
  streamQueryTokens: vi.fn((_input: string, opts: { onError: (e: string) => void }) => {
    // Immediately signal error so the fallback full-response path runs in tests.
    opts.onError('Mock: streaming not available');
    return () => {};
  }),
}));

vi.mock('../services/simulationService', () => ({
  resetSimulation: vi.fn(),
  runSimulationStep: vi.fn(() => ({
    stability: 0.5,
    coherence: 0.6,
    load: 0.2,
    drift: 0.1,
    q_entropy: 0.3,
  })),
}));

vi.mock('../hooks/useSpeechToText', () => ({
  useSpeechToText: () => ({
    isListening: false,
    startListening: vi.fn(),
    stopListening: vi.fn(),
  }),
}));

vi.mock('../hooks/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    isSpeaking: false,
    speak: vi.fn().mockResolvedValue(undefined),
  }),
  wakeAudioContext: vi.fn().mockResolvedValue({ state: 'running' }),
  getAudioState: vi.fn(() => ({ state: 'running' })),
}));

vi.mock('../hooks/useLiveSession', () => ({
  useLiveSession: () => ({
    start: vi.fn(),
    stop: vi.fn(),
    isActive: false,
    isModelSpeaking: false,
    volume: 0,
    lastEndReason: 'idle',
  }),
}));

vi.mock('../services/settingsService', () => ({
  getTtsVoice: vi.fn(() => 'Kore'),
  setTtsVoice: vi.fn(),
}));

vi.mock('../services/atlanteanService', () => ({
  createAndSetStableSessionId: vi.fn(() => 'session-test'),
  getChatHistory: vi.fn().mockResolvedValue({ messages: [] }),
  setStableSessionId: vi.fn(),
}));

vi.mock('./ChatMessage', () => ({
  default: () => <div data-testid="chat-message" />,
}));

vi.mock('./TypingIndicator', () => ({
  default: () => <div data-testid="typing-indicator" />,
}));

vi.mock('./SimulationVisualizer', () => ({
  default: () => <div data-testid="simulation-visualizer" />,
}));

vi.mock('./AtlanteanStatusPanel', () => ({
  default: () => <div data-testid="status-panel" />,
}));

vi.mock('./NeuralArchives', () => ({
  default: () => <div data-testid="archives-panel" />,
}));

vi.mock('./VoiceModeOverlay', () => ({
  default: () => null,
}));

vi.mock('./ProfileModal', () => ({
  default: (props: any) => (
    <div data-testid="profile-modal-mock">
      <button data-testid="sync-export-trigger" onClick={() => props.onExportSyncPackage()}>
        export
      </button>
      <button
        data-testid="sync-import-trigger"
        onClick={() =>
          props.onImportSyncPackage(
            {
              name: 'sync.json',
              type: 'application/json',
              text: async () => JSON.stringify({ package: { test: 'payload' } }),
            },
          )
        }
      >
        import-valid
      </button>
      <button
        data-testid="sync-import-invalid-trigger"
        onClick={() =>
          props.onImportSyncPackage({
            name: 'invalid.json',
            type: 'application/json',
            text: async () => '"invalid-payload"',
          })
        }
      >
        import-invalid
      </button>
      <div data-testid="sync-status-text">{props.syncStatusText}</div>
    </div>
  ),
}));

describe('ChatInterface sync flows', () => {
  beforeEach(() => {
    prepareSyncPackageMock.mockReset();
    mergeSyncPackageMock.mockReset();
    refreshStatusMock.mockReset();
    refreshFieldsMock.mockReset();
    storeSimulationMock.mockReset();
    recallSimulationsMock.mockReset();
    triggerEventMock.mockReset();
    setMessagesMock.mockReset();
    clearMessagesMock.mockReset();

    prepareSyncPackageMock.mockResolvedValue({ test: 'export-package' });
    mergeSyncPackageMock.mockResolvedValue(undefined);
    refreshStatusMock.mockResolvedValue(undefined);
    refreshFieldsMock.mockResolvedValue(undefined);
    storeSimulationMock.mockResolvedValue(undefined);
    recallSimulationsMock.mockResolvedValue([]);
    triggerEventMock.mockResolvedValue(undefined);
    mockedBridgeError = null;
    window.localStorage.clear();

    Object.defineProperty(URL, 'createObjectURL', {
      writable: true,
      value: vi.fn(() => 'blob:sync'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window, 'prompt', {
      writable: true,
      value: vi.fn(() => 'sync-passphrase'),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports sync packages and surfaces success notification', async () => {
    render(<ChatInterface />);

    fireEvent.click(await screen.findByTestId('sync-export-trigger'));

    await waitFor(() => {
      expect(prepareSyncPackageMock).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText(/Sync export complete in/i)).toBeTruthy();
    expect(screen.getByTestId('sync-status-text').textContent).toMatch(/Encrypted sync package exported at/i);
  });

  it('imports valid payloads and surfaces success notification', async () => {
    render(<ChatInterface />);

    fireEvent.click(await screen.findByTestId('sync-import-trigger'));

    await waitFor(() => {
      expect(mergeSyncPackageMock).toHaveBeenCalledWith({ test: 'payload' });
    });

    expect(await screen.findByText(/Sync import and merge complete in/i)).toBeTruthy();
    expect(screen.getByTestId('sync-status-text').textContent).toMatch(/Sync merge completed at/i);
  });

  it('rejects invalid import payloads with non-blocking error notifications', async () => {
    render(<ChatInterface />);

    fireEvent.click(await screen.findByTestId('sync-import-invalid-trigger'));

    await waitFor(() => {
      expect(screen.getAllByText(/Sync merge failed:/i)).toHaveLength(2);
    });

    expect(mergeSyncPackageMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('sync-status-text').textContent).toMatch(/Sync merge failed:/i);
  });

  it('surfaces bridge errors through unified toast notifications', async () => {
    mockedBridgeError = 'Backend timeout';

    render(<ChatInterface />);

    expect(await screen.findByText(/Bridge operation error: Backend timeout/i)).toBeTruthy();
  });

  it('shows onboarding once and persists dismissal', async () => {
    render(<ChatInterface />);

    expect(await screen.findByText('Welcome To Phase 7')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Enter Console' }));

    await waitFor(() => {
      expect(screen.queryByText('Welcome To Phase 7')).toBeNull();
    });

    expect(window.localStorage.getItem('atlantean.onboarding.completed.v1')).toBe('true');
  });

  it('routes the sidebar to the status tab', async () => {
    window.localStorage.setItem('atlantean.onboarding.completed.v1', 'true');

    render(<ChatInterface />);

    expect(await screen.findByTestId('simulation-visualizer')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Status' }));

    expect(await screen.findByTestId('status-panel')).toBeTruthy();
  });
});