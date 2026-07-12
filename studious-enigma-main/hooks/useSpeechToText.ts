
import { useState, useEffect, useRef, useCallback } from 'react';
import { resolveAtlanteanApiBaseOrThrow } from '../services/atlanteanService';

const SpeechRecognitionApi =
    (typeof window !== 'undefined') &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

// Module-level cache: undefined = not yet probed, boolean = result.
let _backendSttAvailable: boolean | undefined;

async function _probeBackendStt(): Promise<boolean> {
    if (_backendSttAvailable !== undefined) return _backendSttAvailable;
    try {
        const base = resolveAtlanteanApiBaseOrThrow();
        const resp = await fetch(`${base}/voice/capabilities`, { method: 'GET' });
        if (!resp.ok) { _backendSttAvailable = false; return false; }
        const data = await resp.json();
        _backendSttAvailable = Boolean(data?.stt?.available);
    } catch {
        _backendSttAvailable = false;
    }
    return _backendSttAvailable;
}

async function _transcribeViaBackend(audioBlob: Blob): Promise<string> {
    const base = resolveAtlanteanApiBaseOrThrow();
    const arrayBuf = await audioBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    let binary = '';
    bytes.forEach(b => (binary += String.fromCharCode(b)));
    const b64 = btoa(binary);
    const resp = await fetch(`${base}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_base64: b64, mime_type: audioBlob.type }),
    });
    if (!resp.ok) throw new Error(`Transcribe backend ${resp.status}`);
    const data = await resp.json();
    return String(data.transcript || '').trim();
}

export const useSpeechToText = (
    onFinalTranscript: (text: string) => void,
    onInterimTranscript: (text: string) => void,
) => {
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const usingBackendRef = useRef(false);

    // Probe the backend once at mount time to decide which path to prefer.
    useEffect(() => {
        _probeBackendStt();
    }, []);

    // ----- Browser Web Speech API (streaming, interim results) -----
    useEffect(() => {
        if (!SpeechRecognitionApi) return;

        const recognition = new (SpeechRecognitionApi as any)();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => {
            setIsListening(false);
            onInterimTranscript('');
        };
        recognition.onerror = () => setIsListening(false);

        recognition.onresult = (event: any) => {
            let interim = '';
            let final = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) final += t;
                else interim += t;
            }
            onInterimTranscript(interim);
            if (final) onFinalTranscript(final.trim());
        };

        recognitionRef.current = recognition;
        return () => {
            try { recognition.abort(); } catch {}
        };
    }, [onFinalTranscript, onInterimTranscript]);

    // ----- Start listening -----
    const startListening = useCallback(async () => {
        if (isListening) return;

        const backendAvailable = await _probeBackendStt();

        if (backendAvailable && typeof navigator !== 'undefined' && navigator.mediaDevices) {
            // Backend STT: record via MediaRecorder, transcribe on stop.
            usingBackendRef.current = true;
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus'
                    : 'audio/webm';
                const recorder = new MediaRecorder(stream, { mimeType });
                audioChunksRef.current = [];

                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) audioChunksRef.current.push(e.data);
                };

                recorder.onstop = async () => {
                    stream.getTracks().forEach(t => t.stop());
                    const blob = new Blob(audioChunksRef.current, { type: mimeType });
                    onInterimTranscript('');
                    if (blob.size < 500) { setIsListening(false); return; }
                    try {
                        const transcript = await _transcribeViaBackend(blob);
                        if (transcript) onFinalTranscript(transcript);
                    } catch (err) {
                        console.warn('[STT] Backend transcription failed:', err);
                    } finally {
                        setIsListening(false);
                    }
                };

                mediaRecorderRef.current = recorder;
                recorder.start(250); // collect in 250ms chunks
                setIsListening(true);
                onInterimTranscript('⣻ Recording…');
                return;
            } catch (err) {
                console.warn('[STT] MediaRecorder setup failed, falling back to browser:', err);
                usingBackendRef.current = false;
            }
        }

        // Fall back to browser Web Speech API.
        usingBackendRef.current = false;
        if (!recognitionRef.current) return;
        try { recognitionRef.current.start(); } catch {}
    }, [isListening, onFinalTranscript, onInterimTranscript]);

    // ----- Stop listening -----
    const stopListening = useCallback(() => {
        if (usingBackendRef.current) {
            const recorder = mediaRecorderRef.current;
            if (recorder && recorder.state !== 'inactive') {
                recorder.stop();
            } else {
                setIsListening(false);
            }
            mediaRecorderRef.current = null;
        } else {
            if (!recognitionRef.current) return;
            try { recognitionRef.current.stop(); } catch {}
        }
    }, []);

    return { isListening, startListening, stopListening };
};
