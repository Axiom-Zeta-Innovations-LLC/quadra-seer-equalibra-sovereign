
/**
 * useLiveSession — local-first voice conversation loop (Step 31, item 2/4)
 *
 * Pipeline per turn:
 *   MediaRecorder (mic) ──► /api/atlantean/transcribe (Whisper)
 *                       ──► /api/atlantean/query      (local LLM)
 *                       ──► /api/atlantean/tts        (Piper)
 *                       ──► Web Audio playback
 *                       ──► [repeat]
 *
 * No Gemini dependency.  The Gemini Live API (cloud) is no longer the default;
 * it remains available as a consent-gated option via useLiveSession.cloud.ts
 * if the operator chooses to re-enable it.
 *
 * VAD: simple energy-based silence detection — after the user has been silent
 * for VAD_SILENCE_MS the current recording chunk is finalized and sent.
 */

import { useState, useCallback, useRef } from 'react';
import { resolveAtlanteanApiBaseOrThrow, getAtlanteanAuthHeaders } from '../services/atlanteanService';
import { getLlmProvider, getCloudEscalationConsent } from '../services/settingsService';
import { DEFAULT_TTS_VOICE, TtsVoice } from '../services/ttsService';

export type LiveSessionEndReason =
  | 'user_disconnect'
  | 'protocol_close'
  | 'protocol_error'
  | 'initialization_failed'
  | 'unknown';

// ── VAD tunables ────────────────────────────────────────────────────────────
/** RMS energy below this value is treated as silence. */
const VAD_SILENCE_THRESHOLD = 0.012;
/** Consecutive milliseconds of silence before a recording chunk is finalized. */
const VAD_SILENCE_MS = 1400;
/** Hard cap on a single recording chunk (avoids unlimited buffering). */
const VAD_MAX_CHUNK_MS = 9000;
/** Discard clips shorter than this to skip accidental noise triggers. */
const VAD_MIN_SPEECH_MS = 400;
/** Volume poll interval (ms). */
const VOL_POLL_MS = 80;

// ── helpers ──────────────────────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1] ?? '');
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ── hook ─────────────────────────────────────────────────────────────────────

export const useLiveSession = (voiceName: TtsVoice = DEFAULT_TTS_VOICE) => {
    const [isActive, setIsActive] = useState(false);
    const [isModelSpeaking, setIsModelSpeaking] = useState(false);
    const [volume, setVolume] = useState(0);
    const [lastEndReason, setLastEndReason] = useState<LiveSessionEndReason>('unknown');

    // refs that must survive re-renders without causing them
    const activeRef       = useRef(false);      // shadow of isActive for callbacks
    const recorderRef     = useRef<MediaRecorder | null>(null);
    const streamRef       = useRef<MediaStream | null>(null);
    const audioCtxRef     = useRef<AudioContext | null>(null);
    const analyserRef     = useRef<AnalyserNode | null>(null);
    const volTimerRef     = useRef<number | null>(null);
    const chunksRef       = useRef<Blob[]>([]);
    const silenceMsRef    = useRef<number>(0);
    const speechMsRef     = useRef<number>(0);
    const chunkStartRef   = useRef<number>(0);
    const silenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const sourceRef       = useRef<AudioBufferSourceNode | null>(null);

    // ── cleanup ──────────────────────────────────────────────────────────────
    const _cleanup = useCallback(() => {
        activeRef.current = false;

        if (volTimerRef.current !== null) {
            clearInterval(volTimerRef.current);
            volTimerRef.current = null;
        }
        if (silenceTimerRef.current !== null) {
            clearInterval(silenceTimerRef.current);
            silenceTimerRef.current = null;
        }
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            try { recorderRef.current.stop(); } catch {}
        }
        recorderRef.current = null;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (sourceRef.current) {
            try { sourceRef.current.stop(); } catch {}
            sourceRef.current = null;
        }
        if (audioCtxRef.current) {
            try { audioCtxRef.current.close(); } catch {}
            audioCtxRef.current = null;
        }
        analyserRef.current = null;
        chunksRef.current = [];
    }, []);

    const stop = useCallback((reason: LiveSessionEndReason = 'user_disconnect') => {
        if (!activeRef.current && reason !== 'user_disconnect') return;
        setLastEndReason(reason);
        _cleanup();
        setIsActive(false);
        setIsModelSpeaking(false);
        setVolume(0);
    }, [_cleanup]);

    // ── single turn: transcribe → query → speak ───────────────────────────
    const _processTurn = useCallback(async (blob: Blob): Promise<void> => {
        if (!activeRef.current) return;
        const base = resolveAtlanteanApiBaseOrThrow();

        let transcript = '';
        try {
            const b64 = await blobToBase64(blob);
            const resp = await fetch(`${base}/transcribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAtlanteanAuthHeaders() },
                body: JSON.stringify({ audio_base64: b64, mime_type: blob.type }),
            });
            if (resp.ok) {
                const d = await resp.json();
                transcript = String(d.transcript ?? '').trim();
            }
        } catch (e) {
            console.warn('[Live] Transcription error:', e);
        }

        if (!transcript || !activeRef.current) return;

        // query local LLM
        let responseText = '';
        try {
            const provider = getLlmProvider();
            const consent  = getCloudEscalationConsent();
            const qResp = await fetch(`${base}/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAtlanteanAuthHeaders() },
                body: JSON.stringify({
                    input: transcript,
                    llm_provider: provider,
                    cloud_escalation_consent: consent,
                }),
            });
            if (qResp.ok) {
                const d = await qResp.json();
                responseText = String(d.response ?? '').trim();
            }
        } catch (e) {
            console.warn('[Live] Query error:', e);
        }

        if (!responseText || !activeRef.current) return;

        // TTS via Piper
        try {
            setIsModelSpeaking(true);
            const ttsResp = await fetch(`${base}/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAtlanteanAuthHeaders() },
                body: JSON.stringify({ text: responseText, voice: voiceName }),
            });
            if (ttsResp.ok && activeRef.current) {
                const d = await ttsResp.json();
                if (d.audio_base64 && audioCtxRef.current) {
                    const bytes = Uint8Array.from(atob(d.audio_base64), c => c.charCodeAt(0));
                    const audioBuffer = await audioCtxRef.current.decodeAudioData(bytes.buffer.slice(0));
                    if (!activeRef.current) return;
                    const src = audioCtxRef.current.createBufferSource();
                    src.buffer = audioBuffer;
                    src.connect(audioCtxRef.current.destination);
                    sourceRef.current = src;
                    await new Promise<void>(resolve => {
                        src.onended = () => resolve();
                        src.start(0);
                    });
                    sourceRef.current = null;
                }
            }
        } catch (e) {
            console.warn('[Live] TTS error:', e);
        } finally {
            setIsModelSpeaking(false);
        }
    }, [voiceName]);

    // ── recording cycle ───────────────────────────────────────────────────
    const _startRecordingCycle = useCallback(() => {
        const stream = streamRef.current;
        if (!stream || !activeRef.current) return;

        chunksRef.current = [];
        silenceMsRef.current = 0;
        speechMsRef.current = 0;
        chunkStartRef.current = Date.now();

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus' : 'audio/webm';
        const recorder = new MediaRecorder(stream, { mimeType });
        recorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
            const elapsed = Date.now() - chunkStartRef.current;
            if (!activeRef.current) return;
            if (elapsed >= VAD_MIN_SPEECH_MS && chunksRef.current.length > 0) {
                const blob = new Blob(chunksRef.current, { type: mimeType });
                await _processTurn(blob);
            }
            // restart cycle
            if (activeRef.current) _startRecordingCycle();
        };

        recorder.start(100);

        // silence / max-duration watchdog
        if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
        silenceTimerRef.current = setInterval(() => {
            if (!activeRef.current) {
                clearInterval(silenceTimerRef.current!);
                return;
            }
            speechMsRef.current += VOL_POLL_MS;
            const elapsed = Date.now() - chunkStartRef.current;

            if (elapsed >= VAD_MAX_CHUNK_MS) {
                clearInterval(silenceTimerRef.current!);
                if (recorder.state !== 'inactive') recorder.stop();
                return;
            }

            // measure current energy
            if (analyserRef.current) {
                const buf = new Float32Array(analyserRef.current.fftSize);
                analyserRef.current.getFloatTimeDomainData(buf);
                const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
                if (rms < VAD_SILENCE_THRESHOLD) {
                    silenceMsRef.current += VOL_POLL_MS;
                } else {
                    silenceMsRef.current = 0;
                }
            }

            if (silenceMsRef.current >= VAD_SILENCE_MS && elapsed >= VAD_MIN_SPEECH_MS) {
                clearInterval(silenceTimerRef.current!);
                if (recorder.state !== 'inactive') recorder.stop();
            }
        }, VOL_POLL_MS);
    }, [_processTurn]);

    // ── public: start ─────────────────────────────────────────────────────
    const start = useCallback(async () => {
        if (activeRef.current) return;
        try {
            setLastEndReason('unknown');
            activeRef.current = true;

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            await ctx.resume();
            audioCtxRef.current = ctx;

            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            const src = ctx.createMediaStreamSource(stream);
            src.connect(analyser);
            analyserRef.current = analyser;

            // volume meter
            const buf = new Float32Array(analyser.fftSize);
            volTimerRef.current = window.setInterval(() => {
                analyser.getFloatTimeDomainData(buf);
                const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
                setVolume(Math.min(1, rms * 12));
            }, VOL_POLL_MS);

            setIsActive(true);
            _startRecordingCycle();
        } catch (e) {
            _cleanup();
            setLastEndReason('initialization_failed');
            setIsActive(false);
            throw e;
        }
    }, [_cleanup, _startRecordingCycle]);

    return { start, stop, isActive, isModelSpeaking, volume, lastEndReason };
};

