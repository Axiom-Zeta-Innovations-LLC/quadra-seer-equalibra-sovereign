import React, { useCallback, useEffect, useState } from 'react';
import * as journalSvc from '../../services/journalService';

interface Props {
  onInsertToChatContext?: (text: string) => void;
  onToast?: (msg: string) => void;
}

export default function DailyJournalPanel({ onInsertToChatContext, onToast }: Props) {
  const [selectedDate, setSelectedDate] = useState(journalSvc.todayDateString());
  const [content, setContent] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [exists, setExists] = useState(false);
  const [saving, setSaving] = useState(false);
  const [appendText, setAppendText] = useState('');
  const [entries, setEntries] = useState<journalSvc.JournalFile[]>([]);

  const loadEntry = useCallback(async (date: string) => {
    setLoaded(false);
    try {
      const r = await journalSvc.readJournal(date);
      setContent(r.content);
      setExists(r.exists);
    } finally {
      setLoaded(true);
    }
  }, []);

  const loadEntries = useCallback(async () => {
    const list = await journalSvc.listJournalEntries();
    setEntries(list);
  }, []);

  useEffect(() => { void loadEntry(selectedDate); }, [selectedDate, loadEntry]);
  useEffect(() => { void loadEntries(); }, [loadEntries]);

  const handleAppend = async () => {
    if (!appendText.trim()) return;
    setSaving(true);
    try {
      await journalSvc.appendJournal({
        date: selectedDate,
        content: appendText,
        source_type: 'text',
      });
      setAppendText('');
      await loadEntry(selectedDate);
      await loadEntries();
      onToast?.('Appended to journal');
    } catch (e) {
      onToast?.(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleInsert = () => {
    if (!content.trim()) return;
    onInsertToChatContext?.(`[Journal — ${selectedDate}]\n${content}`);
    onToast?.('Journal entry inserted into chat context');
  };

  return (
    <div className="space-y-3">
      {/* Date selector */}
      <div className="flex items-center gap-2">
        <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Date</label>
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          max={journalSvc.todayDateString()}
          className="bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-[10px] text-gray-200 focus:outline-none focus:border-[var(--color-primary)]/50 [color-scheme:dark]"
        />
        <button onClick={() => setSelectedDate(journalSvc.todayDateString())}
          className="text-[8px] text-gray-600 hover:text-gray-400">Today</button>
      </div>

      {/* Content view */}
      <div className={`rounded-xl border p-3 min-h-[120px] transition-all ${exists ? 'border-white/10 bg-black/20' : 'border-dashed border-white/6 bg-white/2'}`}>
        {!loaded ? (
          <p className="text-[9px] text-gray-600 italic">Loading…</p>
        ) : !exists ? (
          <p className="text-[9px] text-gray-600 italic">No journal entry for {selectedDate}. Write your first entry below.</p>
        ) : (
          <pre className="text-[9px] text-gray-300 leading-relaxed whitespace-pre-wrap break-words font-sans">{content}</pre>
        )}
      </div>

      {exists && (
        <button onClick={handleInsert}
          className="w-full py-1.5 rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/8 text-[var(--color-primary)] text-[8px] font-bold uppercase tracking-widest hover:bg-[var(--color-primary)]/15 transition-all active:scale-95">
          Insert into Chat Context
        </button>
      )}

      {/* Append form */}
      <div className="space-y-1.5">
        <p className="text-[8px] font-bold text-gray-600 uppercase tracking-widest">Append Entry</p>
        <textarea
          value={appendText}
          onChange={e => setAppendText(e.target.value)}
          rows={3}
          placeholder={`Write a note for ${selectedDate}…`}
          className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-[var(--color-primary)]/40 resize-none"
        />
        <button onClick={() => void handleAppend()} disabled={!appendText.trim() || saving}
          className="w-full py-1.5 rounded-xl bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/25 text-[var(--color-primary)] text-[9px] font-bold uppercase tracking-widest hover:bg-[var(--color-primary)]/25 transition-all active:scale-95 disabled:opacity-40">
          {saving ? 'Saving…' : 'Save Entry'}
        </button>
      </div>

      {/* Entries list */}
      {entries.length > 0 && (
        <div>
          <p className="text-[8px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">All Entries</p>
          <div className="space-y-1">
            {entries.slice(0, 20).map(e => (
              <button key={e.filename}
                onClick={() => setSelectedDate(e.date)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-all text-left
                  ${selectedDate === e.date ? 'border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/8' : 'border border-transparent hover:border-white/8 hover:bg-white/3'}`}>
                <span className={`text-[9px] font-mono ${selectedDate === e.date ? 'text-[var(--color-primary)]' : 'text-gray-400'}`}>{e.date}</span>
                <span className="text-[8px] text-gray-700">{(e.size / 1024).toFixed(1)}kB</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
