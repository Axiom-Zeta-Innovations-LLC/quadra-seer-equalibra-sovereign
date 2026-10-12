
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message, Role, UserProfile, FileData, ThinkingMode, ChartConfig } from '../types';
import streamChatResponse, { streamQueryTokens } from '../services/queryService';
import { resetSimulation, runSimulationStep } from '../services/simulationService';
import ChatMessage from './ChatMessage';
import TypingIndicator from './TypingIndicator';
import Icon from './Icon';
import SimulationVisualizer from './SimulationVisualizer';
import AtlanteanStatusPanel from './AtlanteanStatusPanel';
import OperationsPanel from './OperationsPanel';
import NeuralArchives from './NeuralArchives';
import HardwarePanel from './HardwarePanel';
import ProfileModal from './ProfileModal';
import VoiceModeOverlay from './VoiceModeOverlay';
import ToastCenter, { type ToastItem, type ToastKind } from './ToastCenter';
import { useSpeechToText } from '../hooks/useSpeechToText';
import SovereignWorkspace from './workspace/SovereignWorkspace';
import { useTextToSpeech, wakeAudioContext, getAudioState } from '../hooks/useTextToSpeech';
import { useLiveSession } from '../hooks/useLiveSession';
import { USER_PROFILE_KEY } from '../constants';
import { useAtlantean } from '../hooks/useAtlantean';
import { createAndSetStableSessionId, getChatHistory, setStableSessionId, restoreSnapshot, type AtlanteanSnapshotRecord } from '../services/atlanteanService';
import { getTtsVoice, setTtsVoice } from '../services/settingsService';
import { TtsVoice } from '../services/ttsService';
import { decryptSyncPayload, encryptSyncPayload, isEncryptedSyncPackage } from '../services/syncEnvelope';

const ONBOARDING_STORAGE_KEY = 'atlantean.onboarding.completed.v1';

const ChatInterface: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const {
    messages,
    status,
    fields,
    isLoading: atlanteanLoading,
    isRefreshingFields,
    setMessages,
    clearMessages,
    triggerEvent,
    storeSimulation,
    recallSimulations,
    prepareSyncPackage,
    mergeSyncPackage,
    refreshStatus,
    refreshFields,
    error: bridgeError,
    refreshTelemetry,
  } = useAtlantean();
  const [feedbackSent, setFeedbackSent] = useState<Record<string, 'positive' | 'negative' | 'correction'>>({});
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFileParsing, setIsFileParsing] = useState(false);
  const [simulationHistory, setSimulationHistory] = useState<any[]>(() => {
    resetSimulation();
    return Array.from({ length: 30 }, () => runSimulationStep(0.05, 0));
  });
  const [pendingFiles, setPendingFiles] = useState<FileData[]>([]);
  const [previewFileIndex, setPreviewFileIndex] = useState<number | null>(null);
  const [isProfileModalOpen, setProfileModalOpen] = useState(false);
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>(ThinkingMode.STANDARD);
  const [audioState, setAudioState] = useState(getAudioState());
  const [sidebarTab, setSidebarTab] = useState<'telemetry' | 'status' | 'operations' | 'archives' | 'hardware' | 'workspace'>('telemetry');
  const [ttsVoice, setTtsVoiceState] = useState<TtsVoice>(getTtsVoice());
  const [convoId, setConvoId] = useState<string>(createAndSetStableSessionId());
  const [simulationWrites, setSimulationWrites] = useState(0);
  const [syncStatusText, setSyncStatusText] = useState('No sync activity yet.');
  const [isSyncing, setIsSyncing] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<AtlanteanSnapshotRecord | null>(null);
  const [isRestoringPreview, setIsRestoringPreview] = useState(false);

  const [userProfile, setUserProfile] = useState<UserProfile>({
    username: 'Operator',
    avatar: '👤',
    bio: 'Intelligence analyst.'
  });

  const { isSpeaking, speak } = useTextToSpeech();
  const [interimInput, setInterimInput] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Track any in-flight streaming request so it can be cancelled on unmount.
  const activeStreamRef = useRef<(() => void) | null>(null);

  // Cancel stream on unmount to prevent state updates on an unmounted component.
  useEffect(() => () => { activeStreamRef.current?.(); }, []);

  const onFinalTranscript = useCallback((transcript: string) => {
    setInput(prev => prev ? `${prev.trim()} ${transcript}` : transcript);
    setInterimInput('');
  }, []);
  
  const onInterimTranscript = useCallback((transcript: string) => setInterimInput(transcript), []);
  
  const { isListening, startListening: baseStartListening, stopListening, sovereignModeBlocked } = useSpeechToText(onFinalTranscript, onInterimTranscript);
  const {
    start: baseStartLive,
    stop: stopLive,
    isActive: isLiveActive,
    isModelSpeaking,
    volume,
    lastEndReason,
  } = useLiveSession(ttsVoice);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const wasLiveActiveRef = useRef(false);
  const voiceMetricsRef = useRef({
    startedAt: 0,
    samples: 0,
    totalVolume: 0,
    peakVolume: 0,
    modelSpeakingSamples: 0,
  });
  const syncMetricsRef = useRef({
    exportCount: 0,
    importCount: 0,
    exportTotalMs: 0,
    importTotalMs: 0,
    lastExportMs: 0,
    lastImportMs: 0,
  });

  const toastTimersRef = useRef<Record<string, number>>({});

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = toastTimersRef.current[id];
    if (timer) {
      window.clearTimeout(timer);
      delete toastTimersRef.current[id];
    }
  }, []);

  const notify = useCallback((kind: ToastKind, message: string, durationMs = 4200) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts(prev => [...prev, { id, kind, message }]);
    const timer = window.setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete toastTimersRef.current[id];
    }, durationMs);
    toastTimersRef.current[id] = timer;
  }, []);

  const pushSimulationStep = useCallback((stressFactor: number, activity: number) => {
    const packet = runSimulationStep(stressFactor, activity);
    setSimulationHistory(prev => [...prev.slice(-99), packet]);
    return packet;
  }, []);

  const syncAudio = async () => {
      const state = await wakeAudioContext();
      setAudioState(state.state);
  };

  const startLive = async () => {
    await syncAudio();
    baseStartLive();
  };

  const handleLiveDisconnect = useCallback(() => {
    stopLive('user_disconnect');
  }, [stopLive]);

  const startListening = async () => {
    await syncAudio();
    baseStartListening();
  };

  const handleVoiceChange = (voice: TtsVoice) => {
    setTtsVoiceState(voice);
    setTtsVoice(voice);
  };

  const handlePreviewVoice = async (voice: TtsVoice) => {
    await syncAudio();
    await speak('Voice preview ready. Quadra Seer link is calibrated and online.', voice);
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setIsFileParsing(true);
    const newPendingFiles: FileData[] = [...pendingFiles];
    const { parseFile } = await import('../utils/fileParser');

    for (let i = 0; i < selectedFiles.length; i++) {
        try {
            const parsed = await parseFile(selectedFiles[i]);
            newPendingFiles.push(parsed);
        } catch (err) {
            console.error("File processing error:", err);
            alert(`Failed to process ${selectedFiles[i].name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }

    setPendingFiles(newPendingFiles);
    setIsFileParsing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewFileIndex(prev => {
      if (prev === null) return null;
      if (prev === index) return null;
      if (prev > index) return prev - 1;
      return prev;
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIdx = 0;
    while (size >= 1024 && unitIdx < units.length - 1) {
      size /= 1024;
      unitIdx += 1;
    }
    return `${size.toFixed(unitIdx === 0 ? 0 : 1)} ${units[unitIdx]}`;
  };

  const selectedPreviewFile =
    previewFileIndex !== null && previewFileIndex >= 0 && previewFileIndex < pendingFiles.length
      ? pendingFiles[previewFileIndex]
      : null;

  const selectedPreviewUrl = selectedPreviewFile
    ? `data:${selectedPreviewFile.type || 'application/octet-stream'};base64,${selectedPreviewFile.content}`
    : null;
  const learningCapacityPct = status ? Math.max(0, Math.min(100, status.learning_capacity * 100)) : null;

  const hydrateSessionMessages = useCallback(async () => {
    try {
      const data = await getChatHistory(80);
      const restored = (data.messages || []).map((msg, idx) => ({
        id: msg.id || `hist-${msg.timestamp}-${idx}`,
        role: msg.role === 'user' ? Role.USER : Role.BOT,
        content: msg.content,
      })) as Message[];
      setMessages(restored);
    } catch (err) {
      console.warn('Failed to hydrate Atlantean chat history:', err);
      setMessages([]);
    }
  }, [setMessages]);

  const handleExportSyncPackage = useCallback(async () => {
    const startedAt = performance.now();
    try {
      setIsSyncing(true);
      setSyncStatusText('Preparing sync package...');
      const pkg = await prepareSyncPackage();

      const payload = {
        schema_version: 1,
        exported_at: Date.now(),
        session_id: convoId,
        package: pkg,
      };

      const passphrase = window.prompt('Enter a passphrase to encrypt this sync package:');
      if (passphrase === null) {
        setSyncStatusText('Sync export cancelled before encryption.');
        notify('warning', 'Sync export cancelled.', 3000);
        return;
      }

      const trimmedPassphrase = passphrase.trim();
      if (!trimmedPassphrase) {
        throw new Error('A non-empty passphrase is required for sync export');
      }

      const package_envelope = await encryptSyncPayload(payload, trimmedPassphrase);
      const encryptedPayload = {
        schema_version: 2,
        exported_at: Date.now(),
        session_id: convoId,
        package_envelope,
      };

      const blob = new Blob([JSON.stringify(encryptedPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `atlantean-sync-${convoId}-${Date.now()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      const elapsedMs = Math.max(0, Math.round(performance.now() - startedAt));
      syncMetricsRef.current.exportCount += 1;
      syncMetricsRef.current.exportTotalMs += elapsedMs;
      syncMetricsRef.current.lastExportMs = elapsedMs;
      const avgMs = Math.round(syncMetricsRef.current.exportTotalMs / syncMetricsRef.current.exportCount);
      const exportedMsg = `Encrypted sync package exported at ${new Date().toLocaleTimeString()} (${elapsedMs}ms).`;
      setSyncStatusText(exportedMsg);
      notify('success', `Encrypted sync export complete in ${elapsedMs}ms (avg ${avgMs}ms).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export sync package';
      setSyncStatusText(`Sync export failed: ${message}`);
      notify('error', `Sync export failed: ${message}`, 6000);
    } finally {
      setIsSyncing(false);
    }
  }, [convoId, notify, prepareSyncPackage]);

  const handleImportSyncPackage = useCallback(async (file: File) => {
    const startedAt = performance.now();
    try {
      setIsSyncing(true);
      setSyncStatusText(`Importing ${file.name}...`);

      const raw = await file.text();
      const parsed = JSON.parse(raw);
      let incomingPackage = parsed?.package ?? parsed;

      if (isEncryptedSyncPackage(parsed)) {
        const passphrase = window.prompt('Enter passphrase to decrypt sync package:');
        if (passphrase === null) {
          setSyncStatusText('Sync import cancelled before decryption.');
          notify('warning', 'Sync import cancelled.', 3000);
          return;
        }

        const decryptedPayload = await decryptSyncPayload(parsed.package_envelope, passphrase);
        incomingPackage = decryptedPayload?.package ?? decryptedPayload;
      }

      if (!incomingPackage || typeof incomingPackage !== 'object') {
        throw new Error('Invalid sync package payload');
      }

      await mergeSyncPackage(incomingPackage);
      await Promise.all([refreshStatus(), refreshFields(), hydrateSessionMessages()]);

      const elapsedMs = Math.max(0, Math.round(performance.now() - startedAt));
      syncMetricsRef.current.importCount += 1;
      syncMetricsRef.current.importTotalMs += elapsedMs;
      syncMetricsRef.current.lastImportMs = elapsedMs;
      const avgMs = Math.round(syncMetricsRef.current.importTotalMs / syncMetricsRef.current.importCount);
      const mergedMsg = `Sync merge completed at ${new Date().toLocaleTimeString()} (${elapsedMs}ms).`;
      setSyncStatusText(mergedMsg);
      notify('success', `Sync import and merge complete in ${elapsedMs}ms (avg ${avgMs}ms).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import sync package';
      setSyncStatusText(`Sync merge failed: ${message}`);
      notify('error', `Sync merge failed: ${message}`, 6000);
    } finally {
      setIsSyncing(false);
    }
  }, [hydrateSessionMessages, mergeSyncPackage, notify, refreshFields, refreshStatus]);

  const loadSession = useCallback(async (id?: string) => {
    setIsReady(false);
    try {
      if (id && id.trim()) {
        setStableSessionId(id.trim());
      }
      await Promise.all([hydrateSessionMessages(), refreshStatus(), refreshFields()]);
      setConvoId(id?.trim() || convoId);
      setSimulationHistory(Array.from({ length: 30 }, () => runSimulationStep(0.05, 0)));
    } catch (e) {
      console.error('Session load failure:', e);
    } finally {
      setIsReady(true);
    }
  }, [convoId, hydrateSessionMessages, refreshFields, refreshStatus]);

  const startNewSession = useCallback(async () => {
    const newSessionId = createAndSetStableSessionId();
    setConvoId(newSessionId);
    clearMessages();
    resetSimulation();
    setSimulationHistory(Array.from({ length: 30 }, () => runSimulationStep(0.05, 0)));
    await Promise.all([refreshStatus(), refreshFields()]);
  }, [clearMessages, refreshFields, refreshStatus]);

  const handleSnapshotRestored = useCallback(async () => {
    await loadSession(convoId);
  }, [convoId, loadSession]);

  const handleRestoreFromPreview = useCallback(async (snapshotId: string) => {
    try {
      setIsRestoringPreview(true);
      await restoreSnapshot(snapshotId, convoId);
      setSelectedSnapshot(null);
      await handleSnapshotRestored();
      notify('success', 'Snapshot restored.');
    } catch (err) {
      notify('error', 'Failed to restore snapshot.');
    } finally {
      setIsRestoringPreview(false);
    }
  }, [convoId, handleSnapshotRestored, notify]);

  const formatSnapshotFullDate = (value?: number | string): string => {
    if (typeof value === 'number') return new Date(value).toLocaleString();
    if (typeof value === 'string') {
      const n = Number(value);
      if (!Number.isNaN(n)) return new Date(n).toLocaleString();
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString();
    }
    return 'Unknown';
  };

  useEffect(() => {
    const initData = async () => {
      try {
        const storedProfile = localStorage.getItem(USER_PROFILE_KEY);
        if (storedProfile) {
          try { setUserProfile(JSON.parse(storedProfile)); } catch (e) {}
        }
        await loadSession(convoId);
      } catch (error) {
        console.error("[System] Boot failure:", error);
      } finally {
        setIsReady(true);
      }
    };
    initData();
  }, [convoId, loadSession]);

  useEffect(() => {
    if (!isReady) return;
    try {
      const seen = localStorage.getItem(ONBOARDING_STORAGE_KEY);
      if (!seen) {
        setShowOnboarding(true);
      }
    } catch {
      setShowOnboarding(true);
    }
  }, [isReady]);

  const dismissOnboarding = () => {
    setShowOnboarding(false);
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch {
      // Ignore persistence failures.
    }
  };

  useEffect(() => {
    if (!isReady || isLoading) return;
    const interval = setInterval(() => {
        pushSimulationStep(0.05, 0);
    }, 4000);
    return () => clearInterval(interval);
  }, [isReady, isLoading, pushSimulationStep]);

  useEffect(() => {
    if (!bridgeError) {
      return;
    }
    notify('error', `Bridge operation error: ${bridgeError}`, 6000);
  }, [bridgeError, notify]);

  useEffect(() => {
    return () => {
      Object.values(toastTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      toastTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (isLiveActive) {
      voiceMetricsRef.current.startedAt = Date.now();
      voiceMetricsRef.current.samples = 0;
      voiceMetricsRef.current.totalVolume = 0;
      voiceMetricsRef.current.peakVolume = 0;
      voiceMetricsRef.current.modelSpeakingSamples = 0;
      wasLiveActiveRef.current = true;
      return;
    }

    if (wasLiveActiveRef.current) {
      wasLiveActiveRef.current = false;
      const elapsedMs = Math.max(0, Date.now() - voiceMetricsRef.current.startedAt);
      const samples = Math.max(voiceMetricsRef.current.samples, 1);
      const avgVolume = voiceMetricsRef.current.totalVolume / samples;
      const speakingRatio = voiceMetricsRef.current.modelSpeakingSamples / samples;

      void triggerEvent('voice_session_end', {
        duration_seconds: Number((elapsedMs / 1000).toFixed(2)),
        average_volume: Number(avgVolume.toFixed(2)),
        peak_volume: Number(voiceMetricsRef.current.peakVolume.toFixed(2)),
        model_speaking_ratio: Number(speakingRatio.toFixed(3)),
        disconnect_reason: lastEndReason,
        thinking_mode: thinkingMode,
        voice: ttsVoice,
        pipeline: 'local',
      }).catch((error) => {
        console.warn("Learning signal 'voice_session_end' failed:", error);
      });
    }
  }, [isLiveActive, lastEndReason, thinkingMode, triggerEvent, ttsVoice]);

  useEffect(() => {
    if (!isLiveActive) return;
    voiceMetricsRef.current.samples += 1;
    voiceMetricsRef.current.totalVolume += volume;
    voiceMetricsRef.current.peakVolume = Math.max(voiceMetricsRef.current.peakVolume, volume);
    if (isModelSpeaking) {
      voiceMetricsRef.current.modelSpeakingSamples += 1;
    }
  }, [isLiveActive, isModelSpeaking, volume]);

  useEffect(() => {
    if (isReady && chatEndRef.current) {
        requestAnimationFrame(() => {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
    }
  }, [messages, isLoading, isReady, interimInput]);

  const handleMessageFeedback = useCallback(async (
    messageId: string,
    feedback: 'positive' | 'negative' | 'correction'
  ) => {
    if (feedbackSent[messageId]) {
      return;
    }

    const eventMap = {
      positive: 'user_positive_feedback',
      negative: 'user_negative_feedback',
      correction: 'user_correction',
    } as const;

    const strengthMap = {
      positive: 0.8,
      negative: 0.6,
      correction: 0.7,
    } as const;

    try {
      await triggerEvent(eventMap[feedback], {
        message_id: messageId,
        feedback,
        strength: strengthMap[feedback],
        timestamp: Date.now(),
        mode: thinkingMode,
      });
      setFeedbackSent(prev => ({ ...prev, [messageId]: feedback }));
    } catch (error) {
      console.warn(`Feedback learning signal '${feedback}' failed:`, error);
    }
  }, [feedbackSent, thinkingMode, triggerEvent]);

  const handleSendMessage = async () => {
    if (isLoading || (input.trim() === '' && pendingFiles.length === 0)) return;

    const emitLearningSignal = (
      event: 'high_engagement' | 'helpful_response' | 'unhelpful_response' | 'clarification_needed',
      data: Record<string, any> = {}
    ) => {
      void triggerEvent(event, data).catch((error) => {
        console.warn(`Learning signal '${event}' failed:`, error);
      });
    };

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: Role.USER,
      content: input.trim() || `Process input stream.`,
      attachments: pendingFiles.map(f => f.name)
    };
    
    pushSimulationStep(0.3, 0.4);
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);

    const currentFiles = [...pendingFiles];
    const currentInput = input.trim() || (currentFiles.length > 0 ? 'Analyze the attached documents and summarize key points.' : input);
    emitLearningSignal('high_engagement', {
      input_length: userMsg.content.length,
      attachments: currentFiles.length,
    });

    setInput('');
    setPendingFiles([]);
    setIsLoading(true);
    if (isListening) stopListening();

    const botId = `b-${Date.now()}`;
    setMessages(prev => [...prev, { id: botId, role: Role.BOT, content: '', isStreaming: true }]);

    let outcomePacket = pushSimulationStep(0.1, 0.2);
    let simulationOutcome: 'success' | 'failure' = 'success';

    try {
        // ── Streaming path (token-by-token via SSE) ──────────────────────
        let streamingSucceeded = false;
        // Cancel any previous in-flight stream before starting a new one.
        activeStreamRef.current?.();
        activeStreamRef.current = null;

        await new Promise<void>((resolve) => {
            let settled = false;
            const settle = () => {
                if (!settled) { settled = true; activeStreamRef.current = null; resolve(); }
            };
            const timeout = window.setTimeout(() => {
                activeStreamRef.current?.(); settle();
            }, 90_000);

            const cancelStream = streamQueryTokens(currentInput, {
                files: currentFiles,
                sessionId: convoId,
                onToken: (token) => {
                    streamingSucceeded = true;
                    setMessages(prev => prev.map(m =>
                        m.id === botId
                            ? { ...m, content: (m.content || '') + token, isStreaming: true }
                            : m
                    ));
                },
                onDone: ({ response }) => {
                    clearTimeout(timeout);
                    let chartData: ChartConfig | undefined;
                    let mermaidData: string | undefined;
                    const chartMatches = [...response.matchAll(/```chart-data\s*([\s\S]*?)\s*```/g)];
                    if (chartMatches.length > 0) {
                        try { chartData = JSON.parse(chartMatches[chartMatches.length - 1][1]); } catch {}
                    }
                    const mermaidMatches = [...response.matchAll(/```mermaid\s*([\s\S]*?)\s*```/g)];
                    if (mermaidMatches.length > 0) {
                        mermaidData = mermaidMatches[mermaidMatches.length - 1][1];
                    }
                    setMessages(prev => prev.map(m =>
                        m.id === botId
                            ? { ...m, content: response, isStreaming: false, chartData, mermaidData }
                            : m
                    ));
                    emitLearningSignal('helpful_response', { response_length: response.length, mode: thinkingMode });
                    outcomePacket = pushSimulationStep(0.2, 0.8);
                    settle();
                },
                onError: () => {
                    clearTimeout(timeout);
                    settle(); // fall through to full-response path
                },
            });
            // Store cancel in ref so the unmount cleanup effect can abort the stream.
            activeStreamRef.current = () => { cancelStream(); clearTimeout(timeout); settle(); };
        });

        // ── Fallback: full JSON response (if streaming didn't produce output) ──
        if (!streamingSucceeded) {
            const result = await streamChatResponse(nextMessages, currentInput, currentFiles, thinkingMode);
            const responseText = typeof result?.response === 'string' ? result.response : '';

            if (responseText) {
                let chartData: ChartConfig | undefined;
                let mermaidData: string | undefined;
                const chartMatches = [...responseText.matchAll(/```chart-data\s*([\s\S]*?)\s*```/g)];
                if (chartMatches.length > 0) {
                    try { chartData = JSON.parse(chartMatches[chartMatches.length - 1][1]); } catch {}
                }
                const mermaidMatches = [...responseText.matchAll(/```mermaid\s*([\s\S]*?)\s*```/g)];
                if (mermaidMatches.length > 0) {
                    mermaidData = mermaidMatches[mermaidMatches.length - 1][1];
                }
                setMessages(prev => prev.map(m =>
                    m.id === botId ? { ...m, content: responseText, isStreaming: false, chartData, mermaidData } : m
                ));
                emitLearningSignal('helpful_response', { response_length: responseText.length, mode: thinkingMode });
                outcomePacket = pushSimulationStep(0.2, 0.8);
            }
        }
    } catch (err: any) {
        simulationOutcome = 'failure';
        const message = err instanceof Error ? err.message : 'Request failed';
        const userFacingError = `ERROR: ${message}`;
        // If the backend reports a missing API key, hint the user to check Profile settings.
        const keyHint = /no.*api.?key|api.?key.*missing|api.?key.*not.*configured/i.test(message)
          ? ' Check Profile → Model Routing to configure a cloud provider key.'
          : '';
        const displayError = userFacingError + keyHint;
        emitLearningSignal('unhelpful_response', {
          error: message,
          mode: thinkingMode,
        });
        outcomePacket = pushSimulationStep(1.0, 0);
        setMessages(prev => prev.map(m => m.id === botId ? { ...m, content: displayError, isStreaming: false } : m));
    } finally {
      void triggerEvent('simulation_complete', {
        outcome: simulationOutcome,
        stability: Number((outcomePacket?.stability ?? 0).toFixed(4)),
        coherence: Number((outcomePacket?.coherence ?? 0).toFixed(4)),
        load: Number((outcomePacket?.load ?? 0).toFixed(4)),
        drift: Number((outcomePacket?.drift ?? 0).toFixed(4)),
        q_entropy: Number((outcomePacket?.q_entropy ?? 0).toFixed(4)),
        mode: thinkingMode,
        attachments: currentFiles.length,
      }).catch((error) => {
        console.warn("Learning signal 'simulation_complete' failed:", error);
      });

      const simulationRecord = {
        scenario: currentInput,
        outcome: simulationOutcome,
        mode: thinkingMode,
        attachments: currentFiles.length,
        metrics: {
          stability: Number((outcomePacket?.stability ?? 0).toFixed(4)),
          coherence: Number((outcomePacket?.coherence ?? 0).toFixed(4)),
          load: Number((outcomePacket?.load ?? 0).toFixed(4)),
          drift: Number((outcomePacket?.drift ?? 0).toFixed(4)),
          q_entropy: Number((outcomePacket?.q_entropy ?? 0).toFixed(4)),
        },
        timestamp: Date.now(),
      };

      void storeSimulation(simulationRecord, Math.max(0.1, Math.min(1, outcomePacket?.coherence ?? 0.5)))
        .then(() => setSimulationWrites(prev => prev + 1))
        .catch((error) => {
          console.warn('Failed to persist simulation to cold memory:', error);
        });

        setIsLoading(false);
      setMessages(prev => prev.map(m => m.id === botId ? { ...m, isStreaming: false } : m));
    }
  };

  if (!isReady) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-black gap-6 transform-gpu">
        <Icon name="brain" className="w-16 h-16 text-[var(--color-primary)] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full bg-black/40 overflow-hidden transform-gpu" style={{ contain: 'strict' }}>
      <ToastCenter items={toasts} onDismiss={dismissToast} />

      <VoiceModeOverlay
        isActive={isLiveActive}
        isModelSpeaking={isModelSpeaking}
        volume={volume}
        onClose={handleLiveDisconnect}
      />

      {selectedSnapshot && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setSelectedSnapshot(null)}
          />
          <div className="relative flex h-full w-full max-w-[520px] flex-col bg-[#070b10] shadow-2xl" style={{ borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
            {/* header */}
            <div className="flex-shrink-0 flex items-start justify-between gap-4 p-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="min-w-0">
                <p className="text-[8px] font-mono text-[var(--color-primary)] uppercase tracking-[0.3em]">Neural Snapshot</p>
                <h2 className="mt-1 text-sm font-black text-white uppercase tracking-wider leading-tight truncate">
                  {selectedSnapshot.label || 'Phase Lock Snapshot'}
                </h2>
                <p className="mt-1 text-[9px] font-mono text-gray-600 break-all">{selectedSnapshot.id}</p>
              </div>
              <button
                onClick={() => setSelectedSnapshot(null)}
                className="flex-shrink-0 p-2 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-white/5"
              >
                <Icon name="x-circle" className="w-5 h-5" />
              </button>
            </div>

            {/* scrollable body */}
            <div className="flex-1 overflow-y-auto scrollbar-hide p-5 space-y-4">
              {/* metadata grid */}
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['Session', (selectedSnapshot.session_id?.split('-')[0] ?? '—') + '…'],
                  ['Version', String(selectedSnapshot.version ?? '—')],
                  ['Source', selectedSnapshot.source ?? '—'],
                  ['Captured', formatSnapshotFullDate(selectedSnapshot.created_at)],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-white/5 border border-white/5 p-3">
                    <p className="text-[8px] font-mono text-gray-500 uppercase tracking-wider">{label}</p>
                    <p className="mt-1 text-[10px] font-mono text-gray-200 break-all">{value}</p>
                  </div>
                ))}
              </div>

              {/* phase lock */}
              {selectedSnapshot.phase_lock && (
                <div className="rounded-xl bg-white/5 border border-white/5 p-4">
                  <p className="mb-3 text-[8px] font-mono text-[var(--color-primary)] uppercase tracking-[0.2em]">Phase Lock</p>
                  {([
                    ['Φ (Integrated)', selectedSnapshot.phase_lock.Phi],
                    ['φ₁ Mean', selectedSnapshot.phase_lock.phi1_mean],
                    ['φ₅ Mean', selectedSnapshot.phase_lock.phi5_mean],
                  ] as [string, number | undefined][]).map(([label, value]) => {
                    const pct = typeof value === 'number' ? Math.min(100, Math.max(0, Math.abs(value) * 100)) : 0;
                    return (
                      <div key={label} className="mb-3 last:mb-0">
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="text-[9px] font-mono text-gray-400">{label}</span>
                          <span className="text-[9px] font-mono text-white tabular-nums">
                            {typeof value === 'number' ? value.toFixed(4) : '—'}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                            style={{ width: `${pct}%`, opacity: 0.75 }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* HRM state */}
              {selectedSnapshot.hrm && Object.keys(selectedSnapshot.hrm).length > 0 && (
                <div className="rounded-xl bg-white/5 border border-white/5 p-4">
                  <p className="mb-3 text-[8px] font-mono text-cyan-400 uppercase tracking-[0.2em]">HRM State</p>
                  <div className="space-y-2">
                    {Object.entries(selectedSnapshot.hrm).map(([k, v]) => (
                      <div key={k} className="flex justify-between items-start gap-3">
                        <span className="shrink-0 text-[9px] font-mono text-gray-500 uppercase">{k}</span>
                        <span className="text-[9px] font-mono text-gray-300 text-right break-all">
                          {typeof v === 'number'
                            ? v.toFixed(4)
                            : typeof v === 'object'
                            ? JSON.stringify(v)
                            : String(v ?? '—')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* full IDs */}
              <div className="rounded-xl bg-white/5 border border-white/5 p-4 space-y-3">
                <div>
                  <p className="text-[8px] font-mono text-gray-500 uppercase tracking-wider mb-1">Snapshot ID</p>
                  <p className="text-[9px] font-mono text-gray-400 break-all">{selectedSnapshot.id}</p>
                </div>
                <div>
                  <p className="text-[8px] font-mono text-gray-500 uppercase tracking-wider mb-1">Session ID</p>
                  <p className="text-[9px] font-mono text-gray-400 break-all">{selectedSnapshot.session_id ?? '—'}</p>
                </div>
              </div>
            </div>

            {/* footer */}
            <div className="flex-shrink-0 flex flex-col gap-2 p-5 bg-black/40" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <button
                onClick={() => handleRestoreFromPreview(selectedSnapshot.id)}
                disabled={isRestoringPreview}
                className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--color-primary)] text-black font-bold text-[10px] uppercase tracking-[0.2em] rounded-xl hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon name="refresh" className={`w-4 h-4 ${isRestoringPreview ? 'animate-spin' : ''}`} />
                {isRestoringPreview ? 'Restoring…' : 'Restore Snapshot'}
              </button>
              <button
                onClick={() => setSelectedSnapshot(null)}
                className="w-full py-2.5 bg-white/5 text-gray-400 font-bold text-[10px] uppercase tracking-[0.2em] rounded-xl border border-white/10 hover:bg-white/10 transition-all active:scale-95"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {showOnboarding && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-black/70 p-6 shadow-2xl">
            <h2 className="text-lg font-black uppercase tracking-[0.2em] text-white">Welcome To Phase 7</h2>
            <p className="mt-3 text-sm text-gray-300 leading-relaxed">
              Diagnostics now include live field heatmaps, sync metadata, and exportable intelligence state. Use the sidebar tabs to navigate telemetry, status, and archives.
            </p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] font-mono uppercase tracking-wider text-gray-300">
              <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2">Status: Sync + field trends</div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">Archives: Snapshot + field view</div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">Profile: device sync tools</div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={dismissOnboarding}
                className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-black font-bold text-xs uppercase tracking-widest"
              >
                Enter Console
              </button>
            </div>
          </div>
        </div>
      )}

      <aside className="w-[380px] h-full flex-shrink-0 border-r hidden xl:flex flex-col bg-black/40 backdrop-blur-xl z-10" style={{ borderColor: 'var(--color-border)', contain: 'layout' }}>
        <div className="flex border-b border-white/5 bg-black/20 p-1">
          <button 
            onClick={() => setSidebarTab('status')}
            aria-label="Status"
            className={`flex-1 py-3 text-[9px] font-bold uppercase tracking-[0.2em] rounded-lg transition-all ${sidebarTab === 'status' ? 'bg-white/10 text-[var(--color-primary)]' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Status
          </button>
          <button 
            onClick={() => setSidebarTab('operations')}
            className={`flex-1 py-3 text-[9px] font-bold uppercase tracking-[0.2em] rounded-lg transition-all ${sidebarTab === 'operations' ? 'bg-white/10 text-[var(--color-primary)]' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Operations
          </button>
          <button 
            onClick={() => setSidebarTab('archives')}
            className={`flex-1 py-3 text-[9px] font-bold uppercase tracking-[0.2em] rounded-lg transition-all ${sidebarTab === 'archives' ? 'bg-white/10 text-[var(--color-primary)]' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Archives
          </button>
          <button 
            onClick={() => setSidebarTab('hardware')}
            className={`flex-1 py-3 text-[9px] font-bold uppercase tracking-[0.2em] rounded-lg transition-all ${sidebarTab === 'hardware' ? 'bg-white/10 text-[var(--color-primary)]' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Hardware
          </button>
          <button 
            onClick={() => setSidebarTab('workspace')}
            className={`flex-1 py-3 text-[9px] font-bold uppercase tracking-[0.2em] rounded-lg transition-all ${sidebarTab === 'workspace' ? 'bg-white/10 text-[var(--color-primary)]' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Workspace
          </button>
        </div>
        
        {sidebarTab === 'telemetry' ? (
          <SimulationVisualizer
            history={simulationHistory}
            messages={messages}
            recallSimulations={recallSimulations}
            simulationWrites={simulationWrites}
          />
        ) : sidebarTab === 'status' ? (
          <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
            <AtlanteanStatusPanel
              status={status}
              fields={fields}
              isLoading={atlanteanLoading}
              isRefreshingFields={isRefreshingFields}
              refreshTelemetry={refreshTelemetry}
            />
          </div>
        ) : sidebarTab === 'operations' ? (
          <div className="flex-1 overflow-y-auto p-3 scrollbar-hide">
            <OperationsPanel
              status={status}
              fields={fields}
              isLoading={atlanteanLoading}
              isRefreshingFields={isRefreshingFields}
              refreshTelemetry={refreshTelemetry}
              currentSessionId={convoId}
              onSnapshotRestored={handleSnapshotRestored}
              onSelectSnapshot={setSelectedSnapshot}
              onToast={msg => notify('info', msg, 3500)}
              onOpenProfile={() => setProfileModalOpen(true)}
              onExportSyncPackage={handleExportSyncPackage}
            />
          </div>
        ) : sidebarTab === 'hardware' ? (
          <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
            <HardwarePanel />
          </div>
        ) : sidebarTab === 'workspace' ? (
          <div className="flex-1 overflow-hidden">
            <SovereignWorkspace
              currentSessionId={convoId}
              onInsertToChatContext={text => setInput(prev => prev ? prev + '\n\n' + text : text)}
              onToast={msg => notify('info', msg, 3500)}
            />
          </div>
        ) : (
          <NeuralArchives
            currentSessionId={convoId}
            onNewSession={startNewSession}
            onRestoredSnapshot={handleSnapshotRestored}
            onSelectSnapshot={setSelectedSnapshot}
          />
        )}
      </aside>

      <div className="flex-1 h-full flex flex-col relative z-0 min-w-0">
        <header className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b bg-black/60 backdrop-blur-md z-20" style={{ borderColor: 'var(--color-border)'}}>
           <div className="flex items-center gap-5">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                        <Icon name="brain" className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                        <h1 className="text-sm font-black tracking-[0.2em] text-white uppercase leading-none">Quadra Seer</h1>
                        <div className="flex items-center gap-2 mt-1 cursor-pointer group" onClick={syncAudio}>
                            <span className={`w-1.5 h-1.5 rounded-full ${audioState === 'running' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 animate-pulse'}`}></span>
                            <span className="text-[9px] font-mono uppercase tracking-widest text-gray-500 group-hover:text-gray-300 transition-colors">
                                {audioState === 'running' ? 'Intelligence Synced' : 'Sync Link'}
                            </span>
                            {learningCapacityPct !== null && (
                              <span className="ml-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[8px] font-mono uppercase tracking-wider text-amber-300">
                                Learn {learningCapacityPct.toFixed(1)}%
                              </span>
                            )}
                            <span className="ml-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[8px] font-mono uppercase tracking-wider text-cyan-200">
                              {isSyncing ? 'Sync: Running' : 'Sync: Ready'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="hidden md:flex items-center gap-1 p-0.5 bg-white/5 rounded-lg border border-white/10">
                   {[ThinkingMode.STANDARD, ThinkingMode.FOCUS, ThinkingMode.CREATIVITY, ThinkingMode.LOGIC].map(m => (
                       <button 
                         key={m} 
                         onClick={() => setThinkingMode(m)} 
                         className={`px-3 py-1 text-[9px] font-bold uppercase tracking-widest rounded transition-all ${thinkingMode === m ? 'bg-[var(--color-primary)] text-black' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                       >
                         {m}
                       </button>
                   ))}
               </div>
           </div>

           <div className="flex items-center gap-4">
               <button onClick={() => setProfileModalOpen(true)} className="p-1 transition-transform active:scale-90 hover:opacity-80">
                    <span className="text-2xl drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">{userProfile.avatar}</span>
               </button>
           </div>
        </header>

        <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ contain: 'size layout' }}>
          <div className="max-w-5xl mx-auto w-full px-6 py-8 flex flex-col space-y-8 will-change-scroll">
            {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 opacity-30 text-center px-8">
                <Icon name="sparkles" className="w-20 h-20 mb-8 text-[var(--color-primary)]" />
                <h2 className="text-2xl font-black uppercase tracking-[0.4em] text-white">Intelligence Ready</h2>
                <p className="mt-4 text-[10px] uppercase max-w-sm tracking-widest leading-loose text-gray-400 font-mono">
                    System stabilized in {thinkingMode} mode. Awaiting predictive parameters or visualization requests.
                </p>
                </div>
            )}

            {messages.map((msg) => (
              <React.Fragment key={msg.id}>
                <ChatMessage
                  message={msg}
                  userAvatar={userProfile.avatar}
                  onSpeak={(text) => speak(text, ttsVoice)}
                  isCurrentSpeaking={isSpeaking}
                />
                {msg.role === Role.BOT && !msg.isStreaming && (
                  <div className="max-w-4xl w-full mx-auto -mt-4 mb-2 pl-14 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleMessageFeedback(msg.id, 'positive')}
                      disabled={!!feedbackSent[msg.id]}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border ${
                        feedbackSent[msg.id] === 'positive'
                          ? 'bg-[var(--color-primary)] text-black border-[var(--color-primary)]'
                          : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white'
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                      title="This response was helpful"
                    >
                      Helpful
                    </button>
                    <button
                      onClick={() => handleMessageFeedback(msg.id, 'negative')}
                      disabled={!!feedbackSent[msg.id]}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border ${
                        feedbackSent[msg.id] === 'negative'
                          ? 'bg-red-500/80 text-white border-red-400'
                          : 'bg-white/5 text-gray-300 border-white/10 hover:bg-red-500/20 hover:text-red-300 hover:border-red-400/50'
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                      title="This response was not helpful"
                    >
                      Not Quite
                    </button>
                    <button
                      onClick={() => handleMessageFeedback(msg.id, 'correction')}
                      disabled={!!feedbackSent[msg.id]}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border ${
                        feedbackSent[msg.id] === 'correction'
                          ? 'bg-amber-500/80 text-black border-amber-400'
                          : 'bg-white/5 text-gray-300 border-white/10 hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-400/50'
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                      title="I want to correct this response"
                    >
                      Correct
                    </button>
                  </div>
                )}
              </React.Fragment>
            ))}
            {isLoading && <div className="flex justify-center py-4"><TypingIndicator /></div>}
            <div ref={chatEndRef} className="h-4 w-full flex-shrink-0" />
          </div>
        </div>

        <footer className="flex-shrink-0 p-6 border-t bg-black/80 backdrop-blur-2xl border-white/5 z-20 min-h-[120px]">
            <div className="max-w-5xl mx-auto w-full">
                {pendingFiles.length > 0 && (
                  <div className="mb-4 space-y-3">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500 font-mono">
                      Attached Documents ({pendingFiles.length})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {pendingFiles.map((file, idx) => (
                        <div
                          key={`${file.name}-${idx}`}
                          className={`flex items-center gap-2 rounded-xl px-3 py-2 border text-xs ${
                            previewFileIndex === idx
                              ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-white'
                              : 'border-white/10 bg-white/5 text-gray-300'
                          }`}
                        >
                          <button
                            onClick={() => setPreviewFileIndex(previewFileIndex === idx ? null : idx)}
                            className="text-left leading-tight"
                            title="Preview attachment"
                          >
                            <div className="font-semibold truncate max-w-[200px]">{file.name}</div>
                            <div className="text-[10px] text-gray-500">{formatFileSize(file.size)}</div>
                          </button>
                          <button
                            onClick={() => removeFile(idx)}
                            className="text-gray-400 hover:text-red-400"
                            title="Remove attachment"
                          >
                            <Icon name="x-circle" className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {selectedPreviewFile && (
                      <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                        <div className="text-[11px] uppercase tracking-widest text-gray-400 mb-2 font-mono">
                          Preview: {selectedPreviewFile.name}
                        </div>
                        {selectedPreviewFile.extractedText ? (
                          <pre className="max-h-44 overflow-auto whitespace-pre-wrap text-xs text-gray-300 leading-relaxed">
                            {selectedPreviewFile.extractedText.slice(0, 2500)}
                          </pre>
                        ) : selectedPreviewFile.type.startsWith('image/') && selectedPreviewUrl ? (
                          <img src={selectedPreviewUrl} alt={selectedPreviewFile.name} className="max-h-48 rounded-lg border border-white/10" />
                        ) : selectedPreviewFile.type === 'application/pdf' && selectedPreviewUrl ? (
                          <iframe
                            src={selectedPreviewUrl}
                            title={selectedPreviewFile.name}
                            className="w-full h-56 rounded-lg border border-white/10 bg-white"
                          />
                        ) : (
                          <div className="text-xs text-gray-400">
                            Preview unavailable for this file type. The file will still be attached.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-end gap-4">
                <div className="flex gap-2 mb-1">
                    <button 
                        onClick={startLive} 
                        className="p-4 rounded-2xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 hover:border-[var(--color-primary)]/50 transition-all active:scale-90"
                    >
                        <Icon name="brain" className="w-6 h-6" />
                    </button>
                    <button 
                        onClick={handleFileClick}
                        disabled={isLoading || isFileParsing}
                        className="p-4 rounded-2xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 hover:border-[var(--color-primary)]/50 transition-all active:scale-90 disabled:opacity-20"
                    >
                        <Icon name="paperclip" className="w-6 h-6" />
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple />
                    </button>
                </div>
                
                <div className="flex-1 relative group">
                    <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                    placeholder="Enter intelligence parameters..."
                    className="w-full p-4 pr-32 bg-white/5 border border-white/10 rounded-2xl resize-none focus:outline-none focus:border-[var(--color-primary)]/50 text-sm h-14 scrollbar-hide text-white font-mono placeholder-gray-700 transition-all"
                    />
                    <div className="absolute right-2 bottom-2 flex items-center gap-1.5 p-1">
                        <button 
                            onClick={isListening ? stopListening : startListening}
                            disabled={sovereignModeBlocked && !isListening}
                            title={sovereignModeBlocked ? 'Local STT unavailable — browser speech disabled in sovereign mode' : isListening ? 'Stop recording' : 'Start voice input'}
                            className={`p-2 rounded-xl transition-all ${
                              isListening ? 'bg-red-500 text-white animate-pulse'
                              : sovereignModeBlocked ? 'text-amber-600 opacity-50 cursor-not-allowed'
                              : 'text-gray-500 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <Icon name="microphone" className="w-5 h-5" />
                        </button>
                        <button 
                            onClick={handleSendMessage} 
                            disabled={isLoading || isFileParsing || (input.trim() === '' && pendingFiles.length === 0)} 
                            className={`p-2.5 px-4 rounded-xl bg-[var(--color-primary)] text-black font-bold text-xs uppercase tracking-widest active:scale-95 transition-all disabled:opacity-20 flex items-center gap-2`}
                        >
                            Transmit
                        </button>
                    </div>
                </div>
                {sovereignModeBlocked && (
                  <p className="mt-1 px-2 text-[8px] text-amber-500 font-mono">
                    ⚠ Sovereign mode: local STT unavailable. Browser speech is disabled. Use the Workspace → Voice tab or install Whisper.
                  </p>
                )}
                </div>
            </div>
        </footer>
      </div>
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        onSave={(p) => {
          setUserProfile(p);
          localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(p));
          setProfileModalOpen(false);
        }}
        currentProfile={userProfile}
        currentVoice={ttsVoice}
        onVoiceChange={handleVoiceChange}
        onPreviewVoice={handlePreviewVoice}
        isPreviewingVoice={isSpeaking}
        onExportSyncPackage={handleExportSyncPackage}
        onImportSyncPackage={handleImportSyncPackage}
        isSyncing={isSyncing}
        syncStatusText={syncStatusText}
      />
    </div>
  );
};

export default ChatInterface;
