import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSpeechToText } from '../../hooks/useSpeechToText';
import { appendJournal } from '../../services/journalService';

interface Props {
  onInsertToChatContext?: (text: string) => void;
  onToast?: (msg: string) => void;
}

export default function VoiceCapturePanel({ onInsertToChatContext, onToast }: Props) {
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [history, setHistory] = useState<{ text: string; ts: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const onFinal = useCallback((text: string) => {
    setTranscript(prev => (prev ? prev + '\n' + text : text));
    setInterimText('');
  }, []);

  const onInterim = useCallback((text: string) => {
    setInterimText(text);
  }, []);

  const { isListening, startListening, stopListening, sovereignModeBlocked } = useSpeechToText(onFinal, onInterim);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [transcript]);

  const handleCopy = () => {
    if (!transcript.trim()) return;
    navigator.clipboard.writeText(transcript).catch(() => {});
    onToast?.('Transcript copied');
  };

  const handleInsert = () => {
    if (!transcript.trim()) return;
    onInsertToChatContext?.(`[Voice capture]\n${transcript}`);
    onToast?.('Inserted into chat context');
  };

  const handleSaveToJournal = async () => {
    if (!transcript.trim()) return;
    setSaving(true);
    try {
      await appendJournal({
        date: new Date().toISOString().split('T')[0],
        content: transcript,
        source_type: 'voice',
        title: `Voice — ${new Date().toLocaleTimeString()}`,
      });
      setHistory(prev => [{ text: transcript, ts: Date.now() }, ...prev.slice(0, 9)]);
      setTranscript('');
      onToast?.('Saved to journal');
    } catch (e) {
      onToast?.(`Journal save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    if (!transcript && !interimText) return;
    setTranscript('');
    setInterimText('');
  };

  return (
    <div className="space-y-3">
      {/* Sovereignty warning */}
      {sovereignModeBlocked && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5">
          <p className="text-[9px] font-bold text-amber-300 mb-0.5">Local STT Unavailable — Sovereign Mode Active</p>
          <p className="text-[8px] text-gray-400">
            Browser-based speech recognition is disabled to prevent cloud data transmission.
            Install Whisper or another local STT engine on the backend to enable voice capture.
          </p>
          <code className="mt-1.5 block text-[8px] text-cyan-300 bg-black/30 rounded px-2 py-1 font-mono">
            pip install openai-whisper
          </code>
        </div>
      )}

      {/* Record controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => isListening ? stopListening() : startListening()}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-[9px] uppercase tracking-widest transition-all active:scale-95
            ${isListening
              ? 'bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30'
              : 'bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/25 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/25'
            }`}
        >
          <span className={`w-2 h-2 rounded-full ${isListening ? 'bg-red-400 animate-pulse' : 'bg-[var(--color-primary)]'}`} />
          {isListening ? 'Stop Recording' : 'Start Recording'}
        </button>

        <button onClick={handleClear} disabled={!transcript && !interimText}
          className="px-3 py-2 rounded-xl border border-white/8 text-gray-600 text-[8px] hover:text-gray-400 hover:border-white/15 transition-all disabled:opacity-30">
          Clear
        </button>
      </div>

      {/* Transcript */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={transcript + (interimText ? (transcript ? '\n' : '') + interimText : '')}
          onChange={e => setTranscript(e.target.value)}
          placeholder={isListening ? 'Listening…' : 'Transcript will appear here. You can also type or paste text.'}
          rows={5}
          className={`w-full bg-black/30 border rounded-xl px-3 py-2.5 text-[10px] text-gray-200 placeholder:text-gray-600 focus:outline-none resize-none leading-relaxed transition-all
            ${isListening ? 'border-red-500/30 bg-red-500/3' : 'border-white/10 focus:border-[var(--color-primary)]/40'}`}
        />
        {isListening && (
          <div className="absolute top-2 right-2 flex gap-0.5">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="w-0.5 bg-red-400 rounded-full animate-bounce"
                style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 100}ms` }} />
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 flex-wrap">
        <button onClick={handleCopy} disabled={!transcript.trim()}
          className="flex-1 py-1.5 rounded-xl border border-white/8 text-gray-400 text-[8px] font-bold uppercase tracking-widest hover:bg-white/5 transition-all active:scale-95 disabled:opacity-40">
          Copy
        </button>
        <button onClick={handleInsert} disabled={!transcript.trim()}
          className="flex-1 py-1.5 rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/8 text-[var(--color-primary)] text-[8px] font-bold uppercase tracking-widest hover:bg-[var(--color-primary)]/15 transition-all active:scale-95 disabled:opacity-40">
          Insert to Chat
        </button>
        <button onClick={() => void handleSaveToJournal()} disabled={!transcript.trim() || saving}
          className="flex-1 py-1.5 rounded-xl border border-cyan-500/20 bg-cyan-500/8 text-cyan-400 text-[8px] font-bold uppercase tracking-widest hover:bg-cyan-500/15 transition-all active:scale-95 disabled:opacity-40">
          {saving ? 'Saving…' : 'Journal'}
        </button>
      </div>

      {/* Session history */}
      {history.length > 0 && (
        <div>
          <p className="text-[8px] text-gray-600 uppercase tracking-widest font-bold mb-1.5">This Session</p>
          <div className="space-y-1.5">
            {history.map(h => (
              <div key={h.ts} className="rounded-lg border border-white/5 bg-white/2 px-2.5 py-2">
                <p className="text-[8px] text-gray-600 font-mono mb-0.5">{new Date(h.ts).toLocaleTimeString()}</p>
                <p className="text-[9px] text-gray-400 leading-relaxed line-clamp-2">{h.text}</p>
                <button onClick={() => { setTranscript(h.text); onToast?.('Restored'); }}
                  className="text-[7px] text-gray-700 hover:text-gray-400 mt-1">Restore ↑</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
