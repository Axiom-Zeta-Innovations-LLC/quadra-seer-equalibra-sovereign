
import { useState, useCallback, useRef, useEffect } from 'react';
import { textToSpeechStream, prepareSpeechText, TtsVoice } from '../services/ttsService';
import { decodeAudio, decodeAudioData, wakeAudioContext, getSharedAudioContext } from '../utils/audioUtils';

const FALLBACK_VOICE_MAP: Record<TtsVoice, number> = {
  Zephyr: 0,
  Puck: 1,
  Charon: 2,
  Kore: 3,
  Fenrir: 4,
};

// Update to use the shared AudioContext state from utils
export const getAudioState = () => getSharedAudioContext()?.state || 'uninitialized';

export const useTextToSpeech = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  const cancel = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch(e) {}
      sourceNodeRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string, voiceName?: TtsVoice) => {
    if (!text || text.trim().length === 0) return;
    const speechText = prepareSpeechText(text);
    if (!speechText) return;
    cancel();

    try {
        // Shared context ensures a single audio instance is managed across components
        const ctx = await wakeAudioContext();
        setIsSpeaking(true);
        
        const base64Data = await textToSpeechStream(speechText, voiceName);
        
        if (!base64Data) {
            // Fallback to browser TTS if Gemini generation fails
          const utterance = new SpeechSynthesisUtterance(speechText);
            if (voiceName && typeof window !== 'undefined' && window.speechSynthesis) {
              const availableVoices = window.speechSynthesis.getVoices();
              const matchedVoice = availableVoices.find(v => v.name === voiceName);
              if (matchedVoice) {
                utterance.voice = matchedVoice;
              } else if (availableVoices.length > 0) {
                // Pick a stable alternative so each selected app voice sounds different in fallback mode.
                const mappedIndex = FALLBACK_VOICE_MAP[voiceName] ?? 0;
                utterance.voice = availableVoices[mappedIndex % availableVoices.length];
              }
            }
            utterance.onstart = () => setIsSpeaking(true);
            utterance.onend = () => setIsSpeaking(false);
            window.speechSynthesis.speak(utterance);
            return;
        }

        const audioBytes = decodeAudio(base64Data);
        // raw PCM data requires manual decoding as per SDK instructions
        const buffer = await decodeAudioData(audioBytes, ctx, 24000, 1);
        
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        
        source.onended = () => {
          setIsSpeaking(false);
          sourceNodeRef.current = null;
        };
        
        source.start(0);
        sourceNodeRef.current = source;

    } catch (error) {
        console.error("[TTS Error]", error);
        setIsSpeaking(false);
    }
  }, [cancel]);
  
  useEffect(() => {
    return () => cancel();
  }, [cancel]);

  return { isSpeaking, speak, cancel };
};

// Re-export utility helper for use in higher-level components like ChatInterface
export { wakeAudioContext };
