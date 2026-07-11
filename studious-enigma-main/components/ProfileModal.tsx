
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile } from '../types';
import Icon from './Icon';
import { useTheme } from '../context/ThemeContext';
import { GEMINI_TTS_VOICES, TtsVoice } from '../services/ttsService';
import {
  LlmProvider,
  LocalBackendHint,
  ModelTierPreference,
  getCloudEscalationConsent,
  getLlmProvider,
  getRoutingControls,
  setCloudEscalationConsent,
  setLlmProvider,
  setRoutingControls,
} from '../services/settingsService';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (profile: UserProfile) => void;
  currentProfile: UserProfile;
  currentVoice: TtsVoice;
  onVoiceChange: (voice: TtsVoice) => void;
  onPreviewVoice: (voice: TtsVoice) => void;
  isPreviewingVoice?: boolean;
  onExportSyncPackage: () => Promise<void> | void;
  onImportSyncPackage: (file: File) => Promise<void> | void;
  isSyncing?: boolean;
  syncStatusText?: string;
}

const AVATARS = ['👤', '👩‍🚀', '🧑‍💻', '🕵️', '👽', '🤖', '🧠', '✨'];

const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currentProfile,
  currentVoice,
  onVoiceChange,
  onPreviewVoice,
  isPreviewingVoice = false,
  onExportSyncPackage,
  onImportSyncPackage,
  isSyncing = false,
  syncStatusText,
}) => {
  const [profile, setProfile] = useState(currentProfile);
  const { theme, saveCustomTheme } = useTheme();
  const syncFileInputRef = useRef<HTMLInputElement>(null);

  const [customPrimary, setCustomPrimary] = useState(theme.colors['--color-primary']);
  const [customAccent, setCustomAccent] = useState(theme.colors['--color-accent']);
  const [llmProvider, setLlmProviderState] = useState<LlmProvider>(getLlmProvider());
  const [cloudEscalationConsent, setCloudEscalationConsentState] = useState<boolean>(getCloudEscalationConsent());
  const [modelTierPreference, setModelTierPreference] = useState<ModelTierPreference>(getRoutingControls().modelTierPreference);
  const [localBackendHint, setLocalBackendHint] = useState<LocalBackendHint>(getRoutingControls().localBackendHint);

  useEffect(() => {
    setProfile(currentProfile);
    setLlmProviderState(getLlmProvider());
    setCloudEscalationConsentState(getCloudEscalationConsent());
    setModelTierPreference(getRoutingControls().modelTierPreference);
    setLocalBackendHint(getRoutingControls().localBackendHint);
    // When the modal is opened, sync the color pickers with the current theme's colors
    if (isOpen) {
        const customThemeColors = JSON.parse(localStorage.getItem('qmai-custom-theme-colors') || '{}');
        const defaultPrimary = theme.colors['--color-primary'];
        const defaultAccent = theme.colors['--color-accent'];
        
        setCustomPrimary(customThemeColors.primary || defaultPrimary);
        setCustomAccent(customThemeColors.accent || defaultAccent);
    }
  }, [currentProfile, isOpen, theme]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(profile);
    setLlmProvider(llmProvider);
    setCloudEscalationConsent(cloudEscalationConsent);
    setRoutingControls({ modelTierPreference, localBackendHint });
    // Check if the colors have been changed from the currently active theme's colors
    const originalPrimary = theme.colors['--color-primary'];
    const originalAccent = theme.colors['--color-accent'];
    if (customPrimary !== originalPrimary || customAccent !== originalAccent) {
      saveCustomTheme(customPrimary, customAccent);
    }
  };

  const handleImportSyncClick = () => {
    syncFileInputRef.current?.click();
  };

  const handleImportSyncChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      await onImportSyncPackage(file);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-gray-900/80 border rounded-lg shadow-2xl w-full max-w-md p-6 overflow-y-auto max-h-[90vh]" 
        style={{ 
          borderColor: 'var(--color-border-accent)',
          boxShadow: `0 10px 30px -15px var(--color-shadow)`,
          color: 'var(--color-text-primary)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-accent)' }}>Operator Profile</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <Icon name="x-circle" className="w-6 h-6" />
          </button>
        </div>
        
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-primary)' }}>Identity</h3>
            <div className="space-y-4 pl-2 border-l-2" style={{ borderColor: 'var(--color-border)' }}>
                <div>
                    <label htmlFor="username" className="block text-sm font-medium mb-1" style={{ color: 'var(--color-primary)' }}>Username</label>
                    <input
                    id="username"
                    type="text"
                    value={profile.username}
                    onChange={e => setProfile({ ...profile, username: e.target.value })}
                    className="w-full p-2 bg-gray-800/50 border rounded-md focus:outline-none focus:ring-2"
                    style={{ borderColor: 'var(--color-border)', '--tw-ring-color': 'var(--color-accent)' } as any}
                    maxLength={25}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-primary)' }}>Avatar</label>
                    <div className="grid grid-cols-8 gap-2">
                    {AVATARS.map(avatar => (
                        <button
                        key={avatar}
                        onClick={() => setProfile({ ...profile, avatar })}
                        className={`text-2xl p-2 rounded-md transition-all ${profile.avatar === avatar ? 'ring-2' : 'bg-gray-800/50 hover:bg-opacity-40'}`}
                        style={{ 
                            backgroundColor: profile.avatar === avatar ? 'var(--color-primary-faded)' : undefined,
                            '--tw-ring-color': 'var(--color-accent)'
                        } as any}
                        >
                        {avatar}
                        </button>
                    ))}
                    </div>
                </div>
                 <div>
                    <label htmlFor="bio" className="block text-sm font-medium mb-1" style={{ color: 'var(--color-primary)' }}>Bio</label>
                    <textarea
                    id="bio"
                    value={profile.bio}
                    onChange={e => setProfile({ ...profile, bio: e.target.value })}
                    className="w-full p-2 bg-gray-800/50 border rounded-md focus:outline-none focus:ring-2"
                    style={{ borderColor: 'var(--color-border)', '--tw-ring-color': 'var(--color-accent)' } as any}
                    rows={3}
                    maxLength={100}
                    />
                </div>
            </div>
          </div>
        
         <div>
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-primary)' }}>Custom Theme</h3>
            <div className="space-y-4 pl-2 border-l-2" style={{ borderColor: 'var(--color-border)' }}>
                 <div className="flex items-center justify-between">
                    <label htmlFor="primary-color" className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>Primary Color</label>
                    <input
                        id="primary-color"
                        type="color"
                        value={customPrimary}
                        onChange={e => setCustomPrimary(e.target.value)}
                        className="w-10 h-10 p-1 bg-transparent border-none rounded-md cursor-pointer"
                    />
                 </div>
                 <div className="flex items-center justify-between">
                    <label htmlFor="accent-color" className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>Accent Color</label>
                    <input
                        id="accent-color"
                        type="color"
                        value={customAccent}
                        onChange={e => setCustomAccent(e.target.value)}
                        className="w-10 h-10 p-1 bg-transparent border-none rounded-md cursor-pointer"
                    />
                 </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-primary)' }}>Model Routing</h3>
            <div className="space-y-4 pl-2 border-l-2" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <label htmlFor="llm-provider" className="block text-sm font-medium mb-1" style={{ color: 'var(--color-primary)' }}>
                  Inference Provider
                </label>
                <select
                  id="llm-provider"
                  value={llmProvider}
                  onChange={e => setLlmProviderState(e.target.value as LlmProvider)}
                  className="w-full p-2 bg-gray-800/50 border rounded-md focus:outline-none focus:ring-2"
                  style={{ borderColor: 'var(--color-border)', '--tw-ring-color': 'var(--color-accent)' } as any}
                >
                  <option value="local">Local (default)</option>
                  <option value="gemini">Gemini (cloud)</option>
                  <option value="mock">Mock</option>
                </select>
              </div>
              <label className="flex items-start gap-2 text-xs" style={{ color: 'var(--color-text-primary)' }}>
                <input
                  type="checkbox"
                  checked={cloudEscalationConsent}
                  onChange={e => setCloudEscalationConsentState(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Allow cloud escalation for this device profile when backend policy allows it.</span>
              </label>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-primary)' }}>Routing Controls</h3>
            <div className="space-y-4 pl-2 border-l-2" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <label htmlFor="model-tier" className="block text-sm font-medium mb-1" style={{ color: 'var(--color-primary)' }}>
                  Model Tier Preference
                </label>
                <select
                  id="model-tier"
                  value={modelTierPreference}
                  onChange={e => setModelTierPreference(e.target.value as ModelTierPreference)}
                  className="w-full p-2 bg-gray-800/50 border rounded-md focus:outline-none focus:ring-2"
                  style={{ borderColor: 'var(--color-border)', '--tw-ring-color': 'var(--color-accent)' } as any}
                >
                  <option value="auto">Auto (by query class + resource pressure)</option>
                  <option value="light">Light (fast, lower resource)</option>
                  <option value="standard">Standard</option>
                  <option value="heavy">Heavy (higher capability)</option>
                </select>
              </div>
              <div>
                <label htmlFor="local-backend" className="block text-sm font-medium mb-1" style={{ color: 'var(--color-primary)' }}>
                  Local Backend
                </label>
                <select
                  id="local-backend"
                  value={localBackendHint}
                  onChange={e => setLocalBackendHint(e.target.value as LocalBackendHint)}
                  className="w-full p-2 bg-gray-800/50 border rounded-md focus:outline-none focus:ring-2"
                  style={{ borderColor: 'var(--color-border)', '--tw-ring-color': 'var(--color-accent)' } as any}
                >
                  <option value="auto">Auto (server default)</option>
                  <option value="ollama">Ollama</option>
                  <option value="llama.cpp">llama.cpp</option>
                  <option value="vllm">vLLM</option>
                </select>
              </div>
              <p className="text-[10px] text-gray-400">
                These preferences are sent with each query. The server enforces sovereignty policy regardless of client selection.
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-primary)' }}>Voice</h3>
            <div className="space-y-4 pl-2 border-l-2" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <label htmlFor="tts-voice" className="block text-sm font-medium mb-1" style={{ color: 'var(--color-primary)' }}>
                  Assistant Voice
                </label>
                <select
                  id="tts-voice"
                  value={currentVoice}
                  onChange={e => onVoiceChange(e.target.value as TtsVoice)}
                  className="w-full p-2 bg-gray-800/50 border rounded-md focus:outline-none focus:ring-2"
                  style={{ borderColor: 'var(--color-border)', '--tw-ring-color': 'var(--color-accent)' } as any}
                >
                  {GEMINI_TTS_VOICES.map(voice => (
                    <option key={voice} value={voice}>
                      {voice}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => onPreviewVoice(currentVoice)}
                disabled={isPreviewingVoice}
                className="px-3 py-2 text-xs font-semibold rounded-md border transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  borderColor: 'var(--color-border-accent)',
                  color: 'var(--color-text-primary)',
                  backgroundColor: 'rgba(255,255,255,0.04)',
                }}
              >
                {isPreviewingVoice ? 'Previewing...' : 'Preview Voice'}
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-primary)' }}>Device Sync</h3>
            <div className="space-y-3 pl-2 border-l-2" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={onExportSyncPackage}
                  disabled={isSyncing}
                  className="px-3 py-2 text-xs font-semibold rounded-md border transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{
                    borderColor: 'var(--color-border-accent)',
                    color: 'var(--color-text-primary)',
                    backgroundColor: 'rgba(255,255,255,0.04)',
                  }}
                >
                  Export Sync Package
                </button>
                <button
                  onClick={handleImportSyncClick}
                  disabled={isSyncing}
                  className="px-3 py-2 text-xs font-semibold rounded-md border transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{
                    borderColor: 'var(--color-border-accent)',
                    color: 'var(--color-text-primary)',
                    backgroundColor: 'rgba(255,255,255,0.04)',
                  }}
                >
                  Import And Merge
                </button>
                <input
                  ref={syncFileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportSyncChange}
                  className="hidden"
                />
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-gray-400">
                {syncStatusText || 'No sync activity yet.'}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-4">
          <button onClick={onClose} className="px-4 py-2 bg-gray-700/50 text-gray-300 rounded-md hover:bg-gray-600/50 transition-colors">
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            className="px-4 py-2 font-bold rounded-md transition-colors"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-button-text)' }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
