export type LlmProvider = 'local' | 'gemini' | 'openai' | 'edenai' | 'mock';
export type ModelTierPreference = 'auto' | 'light' | 'standard' | 'heavy';
export type LocalBackendHint = 'auto' | 'ollama' | 'llama.cpp' | 'vllm';

import { DEFAULT_TTS_VOICE, GEMINI_TTS_VOICES, TtsVoice } from './ttsService';

export interface RoutingControls {
  modelTierPreference: ModelTierPreference;
  localBackendHint: LocalBackendHint;
}

export interface AppSettings {
  llmProvider: LlmProvider;
  apiKeys: Partial<Record<LlmProvider, string>>;
  ttsVoice: TtsVoice;
  cloudEscalationConsent: boolean;
  routingControls: RoutingControls;
  ollamaHost: string;
}

const SETTINGS_STORAGE_KEY = 'qmai.settings';

const defaultSettings: AppSettings = {
  llmProvider: 'local',
  apiKeys: {},
  ttsVoice: DEFAULT_TTS_VOICE,
  cloudEscalationConsent: false,
  routingControls: {
    modelTierPreference: 'auto',
    localBackendHint: 'auto',
  },
  ollamaHost: '',
};

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      llmProvider: (parsed.llmProvider as LlmProvider) || defaultSettings.llmProvider,
      apiKeys: parsed.apiKeys || {},
      ttsVoice: GEMINI_TTS_VOICES.includes(parsed.ttsVoice as TtsVoice)
        ? (parsed.ttsVoice as TtsVoice)
        : defaultSettings.ttsVoice,
      cloudEscalationConsent: Boolean(parsed.cloudEscalationConsent),
      routingControls: {
        modelTierPreference: (['auto', 'light', 'standard', 'heavy'].includes(
          (parsed.routingControls as any)?.modelTierPreference
        )
          ? (parsed.routingControls as any).modelTierPreference
          : 'auto') as ModelTierPreference,
        localBackendHint: (['auto', 'ollama', 'llama.cpp', 'vllm'].includes(
          (parsed.routingControls as any)?.localBackendHint
        )
          ? (parsed.routingControls as any).localBackendHint
          : 'auto') as LocalBackendHint,
      },
      ollamaHost: typeof parsed.ollamaHost === 'string' ? parsed.ollamaHost : '',
    };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function getLlmProvider(): LlmProvider {
  return getSettings().llmProvider;
}

export function setLlmProvider(provider: LlmProvider): void {
  const settings = getSettings();
  settings.llmProvider = provider;
  saveSettings(settings);
}

export function getCloudEscalationConsent(): boolean {
  return getSettings().cloudEscalationConsent;
}

export function setCloudEscalationConsent(consent: boolean): void {
  const settings = getSettings();
  settings.cloudEscalationConsent = Boolean(consent);
  saveSettings(settings);
}

export function getProviderApiKey(provider: LlmProvider): string | undefined {
  const settings = getSettings();
  const fromSettings = settings.apiKeys?.[provider];
  if (fromSettings && fromSettings.trim()) return fromSettings.trim();

  // Fallback to env for deployment defaults.
  const envKey = import.meta.env[`VITE_${provider.toUpperCase()}_API_KEY` as keyof ImportMetaEnv] as string | undefined;
  if (envKey && envKey.trim()) return envKey.trim();

  if (provider === 'gemini') {
    // SECURITY: Do NOT read VITE_GEMINI_API_KEY from import.meta.env here.
    // VITE_* env vars are baked into the frontend bundle and visible in
    // browser devtools. Keys must be stored via setProviderApiKey() instead.
    // The generic VITE_{PROVIDER}_API_KEY check above already covers this.
  }

  return undefined;
}

export function setProviderApiKey(provider: LlmProvider, apiKey: string): void {
  const settings = getSettings();
  const nextKeys = { ...settings.apiKeys };

  if (apiKey && apiKey.trim()) {
    nextKeys[provider] = apiKey.trim();
  } else {
    delete nextKeys[provider];
  }

  saveSettings({
    ...settings,
    apiKeys: nextKeys,
  });
}

export function getTtsVoice(): TtsVoice {
  return getSettings().ttsVoice;
}

export function setTtsVoice(voice: TtsVoice): void {
  const settings = getSettings();
  settings.ttsVoice = GEMINI_TTS_VOICES.includes(voice) ? voice : DEFAULT_TTS_VOICE;
  saveSettings(settings);
}

export function getRoutingControls(): RoutingControls {
  return getSettings().routingControls;
}

export function setRoutingControls(controls: Partial<RoutingControls>): void {
  const settings = getSettings();
  saveSettings({
    ...settings,
    routingControls: { ...settings.routingControls, ...controls },
  });
}

export function getOllamaHost(): string {
  return getSettings().ollamaHost || '';
}

export function setOllamaHost(host: string): void {
  const settings = getSettings();
  saveSettings({ ...settings, ollamaHost: host.trim() });
}
