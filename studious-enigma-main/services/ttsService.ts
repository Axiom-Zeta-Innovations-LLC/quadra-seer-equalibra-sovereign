import { resolveAtlanteanApiBaseOrThrow } from './atlanteanService';

// @google/genai is loaded ONLY when the user has granted cloud-escalation consent
// and supplied a Gemini API key.  The dynamic import() keeps it out of the
// initial bundle so it never loads — and never contacts aistudiocdn.com —
// unless explicitly requested.

// Read consent + key from localStorage directly to avoid a circular import
// (settingsService imports from this file for voice constants).
function _getGeminiTtsCredentials(): { consent: boolean; apiKey: string | null } {
    try {
        const raw = localStorage.getItem('qmai.settings');
        const s = raw ? JSON.parse(raw) : {};
        return {
            consent: s?.cloudEscalationConsent === true,
            apiKey: (s?.apiKeys?.gemini as string | undefined) || null,
        };
    } catch {
        return { consent: false, apiKey: null };
    }
}

/**
 * Structured audio data returned by textToSpeechStream.
 * format='wav'  → standard WAV file; decode via AudioContext.decodeAudioData()
 * format='pcm'  → raw 16-bit PCM (Gemini); decode via manual Int16 path
 */
export type TtsAudioData = {
    audioBase64: string;
    format: 'wav' | 'pcm';
    sampleRate: number;
    channels: number;
};

export const GEMINI_TTS_VOICES = [
    'Zephyr',
    'Puck',
    'Charon',
    'Kore',
    'Fenrir',
] as const;

export type TtsVoice = typeof GEMINI_TTS_VOICES[number];

export const DEFAULT_TTS_VOICE: TtsVoice = 'Zephyr';

export const prepareSpeechText = (text: string): string => {
    if (!text) return '';

    const normalized = text
        .replace(/\r\n/g, '\n')
        .replace(/[•·◦▪︎]/g, '\n')
        .replace(/\u00a0/g, ' ');

    const expandUrls = normalized
        .replace(/https?:\/\/[^\s)]+/gi, (url) => {
            const spoken = url
                .replace(/^https?:\/\//i, '')
                .replace(/\/+/g, ' slash ')
                .replace(/\./g, ' dot ')
                .replace(/-/g, ' dash ')
                .replace(/_/g, ' underscore ')
                .replace(/\?/g, ' question mark ')
                .replace(/&/g, ' and ')
                .replace(/=/g, ' equals ')
                .replace(/#/g, ' number sign ')
                .replace(/%20/gi, ' space ')
                .replace(/\s+/g, ' ')
                .trim();
            return `link ${spoken}`;
        })
        .replace(/\bwww\.[^\s)]+/gi, (url) => {
            const spoken = url
                .replace(/^www\./i, 'double u double u double u dot ')
                .replace(/\/+/g, ' slash ')
                .replace(/\./g, ' dot ')
                .replace(/-/g, ' dash ')
                .replace(/_/g, ' underscore ')
                .replace(/\?/g, ' question mark ')
                .replace(/&/g, ' and ')
                .replace(/=/g, ' equals ')
                .replace(/#/g, ' number sign ')
                .replace(/\s+/g, ' ')
                .trim();
            return `link ${spoken}`;
        });

    const withoutCodeFences = expandUrls
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]+)`/g, '$1');

    const withoutMarkdown = withoutCodeFences
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/^\s{0,3}[-*+]\s+/gm, '')
        .replace(/^\s{0,3}>\s+/gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/_(.*?)_/g, '$1')
        .replace(/~~(.*?)~~/g, '$1');

    const spacedSymbols = withoutMarkdown
        .replace(/([A-Za-z0-9])\/([A-Za-z0-9])/g, '$1 $2')
        .replace(/([A-Za-z0-9])-([A-Za-z0-9])/g, '$1 $2')
        .replace(/([A-Za-z])#([A-Za-z0-9])/g, '$1 $2')
        .replace(/([A-Za-z0-9])\.([A-Za-z0-9])/g, '$1 $2');

    const strippedSymbols = spacedSymbols
        .replace(/[\/#*\-_]|\.{3,}|[\[\]{}()<>|~^=+]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const explicitAcronyms: Record<string, string> = {
        API: 'A P I',
        AI: 'A I',
        URL: 'you are el',
        URLs: 'you are el s',
        HTTP: 'H T T P',
        HTTPS: 'H T T P S',
        JSON: 'J S O N',
        XML: 'X M L',
        CSV: 'C S V',
        GPU: 'G P U',
        CPU: 'C P U',
        TTS: 'T T S',
        LLM: 'L L M',
        ML: 'M L',
        UX: 'U X',
        UI: 'U I',
        FAQ: 'F A Q',
        SDK: 'S D K',
        CLI: 'C L I',
        DB: 'D B',
        SQL: 'S Q L',
        ID: 'I D',
        PDF: 'P D F',
        TSX: 'T S X',
        JSX: 'J S X',
    };

    const expandedAcronyms = strippedSymbols
        .replace(/\b(API|AI|URL|URLs|HTTP|HTTPS|JSON|XML|CSV|GPU|CPU|TTS|LLM|ML|UX|UI|FAQ|SDK|CLI|DB|SQL|ID|PDF|TSX|JSX)\b/g, (match) => {
            return explicitAcronyms[match] || match.split('').join(' ');
        })
        .replace(/\b([A-Z]{2,})s\b/g, (_, letters: string) => `${letters.split('').join(' ')} s`)
        .replace(/\b([A-Z]{2,})\b/g, (match) => match.split('').join(' '));

    return expandedAcronyms;
};

/**
 * Fetches audio data for the given text using Gemini native TTS.
 * @param text The text to convert to speech.
 * @param voiceName Optional voice override for Gemini native TTS.
 * @returns Base64 string of PCM audio data.
 */
export const textToSpeechStream = async (
    text: string,
    voiceName: TtsVoice = DEFAULT_TTS_VOICE,
): Promise<TtsAudioData | null> => {
    try {
        const speechText = prepareSpeechText(text);
        if (!speechText) return null;

        // --- 1. Try local Piper TTS backend (no credentials needed) ---
        try {
            const apiBase = resolveAtlanteanApiBaseOrThrow();
            const resp = await fetch(`${apiBase}/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: speechText, voice: voiceName }),
            });
            if (resp.ok) {
                const data = await resp.json();
                if (data.audio_base64) {
                    return {
                        audioBase64: data.audio_base64,
                        format: 'wav',
                        sampleRate: data.sample_rate ?? 22050,
                        channels: 1,
                    };
                }
            }
        } catch {
            // Backend unreachable or Piper not installed — fall through.
        }

        // --- 2. Try Gemini TTS (requires cloud escalation consent + key) ---
        // Require explicit cloud-escalation consent AND a user-supplied key.
        // Keys must never come from VITE_ env vars (those are embedded in the
        // browser bundle and visible to anyone who inspects it).
        const { consent, apiKey } = _getGeminiTtsCredentials();
        if (!consent || !apiKey) {
            // Graceful degradation: caller falls back to browser SpeechSynthesis.
            return null;
        }

        // Lazy-load the Gemini SDK only now that consent + key are confirmed.
        const { GoogleGenAI, Modality } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey });
        
        const prompt = `Read this with a professional, scientific, and calm tone: "${speechText}"`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName },
                    },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) return null;
        return {
            audioBase64: base64Audio,
            format: 'pcm',
            sampleRate: 24000,
            channels: 1,
        };

    } catch (error) {
        console.error("[TTS Service] Error:", error);
        return null; 
    }
};