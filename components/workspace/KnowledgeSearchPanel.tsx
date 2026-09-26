import React, { useState, useCallback, useEffect, useRef } from 'react';
import * as searchSvc from '../../services/searchService';
import type { SearchResult, IndexSource } from '../../services/searchService';

function ResultCard({ result, onInsert, onCopyPath }: {
  result: SearchResult;
  onInsert: (r: SearchResult) => void;
  onCopyPath: (path: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const handleOpen = async () => {
    setBusy(true);
    try { await searchSvc.openFile(result.source_path); } catch { /* ignore */ } finally { setBusy(false); }
  };
  return (
    <div className="rounded-xl border border-white/8 bg-white/3 p-3 hover:border-white/15 transition-all">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className="text-[9px] font-bold text-[var(--color-primary)]">{result.filename}</span>
            <span className="text-[7px] text-gray-600 font-mono uppercase">.{result.file_type}</span>
            <span className="text-[7px] text-gray-700">chunk {result.chunk_index}</span>
          </div>
          <p className="text-[7.5px] text-gray-500 font-mono truncate">{result.source_path}</p>
        </div>
        <span className={`text-[8px] font-bold shrink-0 ${result.score > 0.7 ? 'text-emerald-400' : result.score > 0.4 ? 'text-amber-400' : 'text-gray-500'}`}>
          {(result.score * 100).toFixed(0)}%
        </span>
      </div>
      <p className="text-[9px] text-gray-300 leading-relaxed bg-black/20 rounded-lg px-2 py-1.5 border border-white/5 font-mono whitespace-pre-wrap break-words">
        {result.excerpt}
      </p>
      <p className="text-[7px] text-gray-700 mt-1">{result.modified_at} · {result.collection}</p>
      <div className="flex gap-1.5 mt-2">
        <button onClick={handleOpen} disabled={busy}
          className="flex-1 py-1 rounded-lg bg-white/5 border border-white/8 text-gray-400 text-[8px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95 disabled:opacity-50">
          Open
        </button>
        <button onClick={() => searchSvc.revealFile(result.source_path).catch(() => {})}
          className="py-1 px-2 rounded-lg bg-white/5 border border-white/8 text-gray-400 text-[8px] hover:bg-white/10 transition-all active:scale-95">
          ⬡
        </button>
        <button onClick={() => onCopyPath(result.source_path)}
          className="py-1 px-2 rounded-lg bg-white/5 border border-white/8 text-gray-400 text-[8px] hover:bg-white/10 transition-all active:scale-95">
          ⎘
        </button>
        <button onClick={() => onInsert(result)}
          className="flex-1 py-1 rounded-lg bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-[var(--color-primary)] text-[8px] font-bold uppercase tracking-widest hover:bg-[var(--color-primary)]/20 transition-all active:scale-95">
          Insert
        </button>
      </div>
    </div>
  );
}

interface Props {
  onInsertToChatContext?: (text: string) => void;
  onToast?: (msg: string) => void;
}

export default function KnowledgeSearchPanel({ onInsertToChatContext, onToast }: Props) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'hybrid' | 'semantic' | 'keyword'>('hybrid');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [sources, setSources] = useState<IndexSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [jobStatus, setJobStatus] = useState<searchSvc.IndexJob | null>(null);
  const [stats, setStats] = useState<searchSvc.SearchStats | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [newPath, setNewPath] = useState('');
  const jobPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const s = await searchSvc.getSearchStatus();
    setAvailable(s.available);
    if (s.available && s.stats) setStats(s.stats);
    const src = await searchSvc.listSources();
    setSources(src);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const pollJob = useCallback(() => {
    if (jobPollRef.current) clearInterval(jobPollRef.current);
    jobPollRef.current = setInterval(async () => {
      const j = await searchSvc.getIndexJobStatus();
      setJobStatus(j);
      if (!j || j.status === 'done' || j.status === 'cancelled' || j.status === 'failed') {
        clearInterval(jobPollRef.current!);
        jobPollRef.current = null;
        setIndexing(false);
        void refresh();
      }
    }, 1000);
  }, [refresh]);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const r = await searchSvc.search({ query, mode, limit: 12 });
      setResults(r);
    } finally { setLoading(false); }
  };

  const handleAddSource = async () => {
    if (!newPath.trim()) return;
    try {
      await searchSvc.addSource(newPath.trim());
      setNewPath('');
      await refresh();
      onToast?.('Source added');
    } catch (e) {
      onToast?.(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleIndex = async (path: string) => {
    setIndexing(true);
    try {
      await searchSvc.startIndex(path);
      pollJob();
    } catch (e) {
      setIndexing(false);
      onToast?.(`Index failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleInsert = (result: SearchResult) => {
    const text = `**Source:** \`${result.source_path}\` (chunk ${result.chunk_index}, score ${(result.score * 100).toFixed(0)}%)\n\n${result.excerpt}`;
    onInsertToChatContext?.(text);
    onToast?.('Inserted into chat context');
  };

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path).catch(() => {});
    onToast?.('Path copied');
  };

  if (available === false) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <p className="text-[10px] font-bold text-amber-300 mb-1">Semantic Search Unavailable</p>
        <p className="text-[9px] text-gray-400">Install required Python packages to enable local file indexing:</p>
        <code className="mt-2 block text-[8px] text-cyan-300 bg-black/40 rounded-lg px-3 py-2 font-mono">
          pip install lancedb sentence-transformers pyarrow
        </code>
        <p className="mt-2 text-[8px] text-gray-600">Keyword search remains available without GPU or model downloads.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      {stats && (
        <div className="flex items-center gap-3 flex-wrap text-[8px] text-gray-600 font-mono px-1">
          <span>{stats.total_chunks.toLocaleString()} chunks</span>
          <span>{stats.total_files} files</span>
          <span>{stats.total_sources} sources</span>
          <span className={stats.embedding_available ? 'text-emerald-600' : 'text-amber-600'}>
            {stats.embedding_available ? `✓ ${stats.embedding_model}` : '✕ No embedding model'}
          </span>
        </div>
      )}

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-1.5">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search your local knowledge base…"
          className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-[var(--color-primary)]/50"
        />
        <button type="submit" disabled={loading || !query.trim()}
          className="px-3 py-2 rounded-xl bg-[var(--color-primary)] text-black text-[9px] font-bold uppercase tracking-widest hover:opacity-90 transition-all active:scale-95 disabled:opacity-50">
          {loading ? '…' : '⌕'}
        </button>
      </form>

      {/* Mode selector */}
      <div className="flex gap-1">
        {(['hybrid', 'semantic', 'keyword'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`flex-1 py-1 rounded-lg text-[8px] font-bold uppercase tracking-widest transition-all
              ${mode === m ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30' : 'text-gray-600 hover:text-gray-400'}`}>
            {m}
          </button>
        ))}
      </div>

      {/* Index job progress */}
      {jobStatus && jobStatus.status === 'running' && (
        <div className="rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-bold text-[var(--color-primary)]">Indexing…</span>
            <button onClick={() => { searchSvc.cancelIndex(); setIndexing(false); }}
              className="text-[8px] text-gray-600 hover:text-gray-300">Cancel</button>
          </div>
          <div className="h-1 bg-white/10 rounded-full">
            <div className="h-1 rounded-full bg-[var(--color-primary)] transition-all"
              style={{ width: `${jobStatus.total_files > 0 ? (jobStatus.processed_files / jobStatus.total_files * 100) : 0}%` }} />
          </div>
          <p className="text-[8px] text-gray-600 mt-1">
            {jobStatus.processed_files}/{jobStatus.total_files} files · {jobStatus.indexed_chunks} chunks
            {jobStatus.current_file && ` · ${jobStatus.current_file.split('/').pop()}`}
          </p>
        </div>
      )}

      {/* Sources panel */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <button onClick={() => setShowSources(v => !v)}
            className="text-[9px] font-bold uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors">
            {showSources ? '▾' : '▸'} Index Sources ({sources.length})
          </button>
        </div>
        {showSources && (
          <div className="space-y-1.5 mb-2">
            {sources.map(src => (
              <div key={src.path} className="rounded-xl border border-white/6 bg-white/3 p-2.5">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-bold text-gray-200 truncate">{src.path}</p>
                    <p className="text-[8px] text-gray-600">
                      {src.file_count} files · {src.chunk_count} chunks
                      {src.last_indexed && ` · ${new Date(src.last_indexed * 1000).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1.5 mt-2">
                  <button onClick={() => void handleIndex(src.path)} disabled={indexing}
                    className="flex-1 py-1 rounded-lg bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-[var(--color-primary)] text-[8px] font-bold uppercase tracking-widest hover:bg-[var(--color-primary)]/20 transition-all disabled:opacity-50">
                    {indexing ? '…' : 'Index'}
                  </button>
                  <button onClick={async () => { await searchSvc.removeSource(src.path); void refresh(); }}
                    className="py-1 px-2 rounded-lg bg-red-500/5 border border-red-500/15 text-red-600 text-[8px] hover:bg-red-500/10 hover:text-red-400 transition-all">
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {/* Add source */}
            <div className="flex gap-1.5">
              <input
                type="text"
                value={newPath}
                onChange={e => setNewPath(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleAddSource(); }}
                placeholder="Add folder or file path…"
                className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-[9px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-[var(--color-primary)]/40"
              />
              <button onClick={() => void handleAddSource()} disabled={!newPath.trim()}
                className="px-3 py-1.5 rounded-xl bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/25 text-[var(--color-primary)] text-[8px] font-bold hover:bg-[var(--color-primary)]/25 transition-all disabled:opacity-50">
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {results.length === 0 && !loading ? (
        <p className="text-[9px] text-gray-600 italic text-center py-3">
          {query ? 'No results found.' : 'Enter a query to search your local knowledge base.'}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-[8px] text-gray-600">{results.length} result{results.length !== 1 ? 's' : ''} · <span className="italic">only the matched excerpt was retrieved</span></p>
          {results.map(r => (
            <ResultCard key={r.id} result={r} onInsert={handleInsert} onCopyPath={handleCopyPath} />
          ))}
        </div>
      )}
    </div>
  );
}
