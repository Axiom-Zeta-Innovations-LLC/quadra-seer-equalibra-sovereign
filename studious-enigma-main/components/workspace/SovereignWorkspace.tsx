import React, { useState } from 'react';
import KnowledgeSearchPanel from './KnowledgeSearchPanel';
import VoiceCapturePanel from './VoiceCapturePanel';
import DailyJournalPanel from './DailyJournalPanel';
import AutomationConsole from './AutomationConsole';
import PrivacyStatusBar from './PrivacyStatusBar';

type WorkspaceTool = 'search' | 'voice' | 'journal' | 'automation';

interface NavItem {
  id: WorkspaceTool;
  label: string;
  icon: string;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'search',     label: 'Knowledge Search',   icon: '⌕', description: 'Semantic local file search' },
  { id: 'voice',      label: 'Voice Capture',       icon: '◉', description: 'Local STT transcription' },
  { id: 'journal',    label: 'Daily Journal',        icon: '☷', description: 'Private local journal' },
  { id: 'automation', label: 'Automation Console',   icon: '⚙', description: 'Sandboxed local actions' },
];

interface Props {
  currentSessionId: string;
  onInsertToChatContext?: (text: string) => void;
  onToast?: (msg: string) => void;
}

export default function SovereignWorkspace({ currentSessionId, onInsertToChatContext, onToast }: Props) {
  const [activeTool, setActiveTool] = useState<WorkspaceTool>('search');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/6 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Sovereign Workspace</span>
        </div>
        <PrivacyStatusBar compact />
      </div>

      {/* Nav tabs */}
      <div className="flex gap-0.5 px-2 py-2 border-b border-white/6 shrink-0">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTool(item.id)}
            title={item.description}
            className={`flex items-center gap-1.5 flex-1 justify-center py-1.5 px-2 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all
              ${activeTool === item.id
                ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/25'
                : 'text-gray-600 hover:text-gray-400 hover:bg-white/4'}`}>
            <span className="text-[10px]">{item.icon}</span>
            <span className="hidden sm:block">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Active tool */}
      <div className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {activeTool === 'search' && (
          <KnowledgeSearchPanel
            onInsertToChatContext={onInsertToChatContext}
            onToast={onToast}
          />
        )}
        {activeTool === 'voice' && (
          <VoiceCapturePanel
            onInsertToChatContext={onInsertToChatContext}
            onToast={onToast}
          />
        )}
        {activeTool === 'journal' && (
          <DailyJournalPanel
            onInsertToChatContext={onInsertToChatContext}
            onToast={onToast}
          />
        )}
        {activeTool === 'automation' && (
          <AutomationConsole
            sessionId={currentSessionId}
            onInsertToChatContext={onInsertToChatContext}
            onToast={onToast}
          />
        )}
      </div>
    </div>
  );
}
