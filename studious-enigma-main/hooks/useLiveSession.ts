
import { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { decodeAudio, decodeAudioData, createBlob } from '../utils/audioUtils';
import { DEFAULT_TTS_VOICE, TtsVoice } from '../services/ttsService';
import { getCloudEscalationConsent, getProviderApiKey } from '../services/settingsService';

export type LiveSessionEndReason =
  | 'user_disconnect'
  | 'protocol_close'
  | 'protocol_error'
  | 'initialization_failed'
  | 'unknown';

export const useLiveSession = (voiceName: TtsVoice = DEFAULT_TTS_VOICE) => {
  const [isActive, setIsActive] = useState(false);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [lastEndReason, setLastEndReason] = useState<LiveSessionEndReason>('unknown');
  
  const sessionRef = useRef<any>(null);
  const outCtxRef = useRef<AudioContext | null>(null);
  const inCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback((reason: LiveSessionEndReason = 'user_disconnect') => {
    console.debug("[Live] Stopping session...");
    setLastEndReason(reason);
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch(e) {}
      sessionRef.current = null;
    }
    
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (inCtxRef.current) {
      try { inCtxRef.current.close(); } catch(e) {}
      inCtxRef.current = null;
    }
    
    if (outCtxRef.current) {
      try { outCtxRef.current.close(); } catch(e) {}
      outCtxRef.current = null;
    }

    setIsActive(false);
    setIsModelSpeaking(false);
    setVolume(0);
    nextStartTimeRef.current = 0;
  }, []);

  const start = useCallback(async () => {
    if (isActive) return;
    try {
      console.debug("[Live] Initializing session...");
      setLastEndReason('unknown');

      // Require explicit cloud-escalation consent and a configured Gemini key.
      // Never read keys from VITE_ env vars — they are bundled into the client.
      const consent = getCloudEscalationConsent();
      const apiKey = getProviderApiKey('gemini');
      if (!consent) throw new Error("Cloud escalation consent is required to start a live session. Enable it in Settings.");
      if (!apiKey) throw new Error("Gemini API key is not configured. Add it via the Profile settings modal.");
      
      
      const ai = new GoogleGenAI({ apiKey });
      
      const outCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const inCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      
      await outCtx.resume();
      await inCtx.resume();
      
      outCtxRef.current = outCtx;
      inCtxRef.current = inCtx;
      
      const analyser = outCtx.createAnalyser();
      analyserRef.current = analyser;
      analyser.connect(outCtx.destination);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            console.debug("[Live] Native connection established.");
            const source = inCtx.createMediaStreamSource(stream);
            const scriptProcessor = inCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => {
                if (session) {
                  session.sendRealtimeInput({ media: pcmBlob });
                }
              }).catch(() => {});
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inCtx.destination);
            setIsActive(true);
          },
          onmessage: async (msg) => {
            const data = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (data) {
              setIsModelSpeaking(true);
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
              
              const buffer = await decodeAudioData(decodeAudio(data), outCtx, 24000, 1);
              const source = outCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(analyser);
              
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setIsModelSpeaking(false);
              };
              
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            if (msg.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => { 
            console.error("[Live] Protocol error:", e);
            stop('protocol_error'); 
          },
          onclose: (e) => {
            console.debug("[Live] Protocol closed.");
            stop('protocol_close');
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { 
            voiceConfig: { 
              prebuiltVoiceConfig: { voiceName } 
            } 
          },
          systemInstruction: 'You are Quadra Seer Intelligence. A helpful predictive AI. Be concise and professional.',
        },
      });
      
      sessionRef.current = await sessionPromise;
    } catch (err) { 
      console.error("[Live] Initialization failed:", err);
      stop('initialization_failed'); 
    }
  }, [isActive, stop, voiceName]);

  useEffect(() => {
    let frame: number;
    const update = () => {
      if (analyserRef.current && isActive) {
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / (data.length || 1);
        setVolume(avg);
      }
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [isActive]);

  return { start, stop, isActive, isModelSpeaking, volume, lastEndReason };
};