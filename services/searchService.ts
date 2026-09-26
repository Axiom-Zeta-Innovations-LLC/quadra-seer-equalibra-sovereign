/**
 * searchService.ts — TypeScript client for the semantic file search API.
 */
import { resolveAtlanteanApiBaseOrThrow, getAtlanteanAuthHeaders } from './atlanteanService';

const _b = () => resolveAtlanteanApiBaseOrThrow();
const _h = () => ({ 'Content-Type': 'application/json', ...getAtlanteanAuthHeaders() });

// ── Types ──────────────────────────────────────────────────────────────────

export interface IndexSource {
  path: string;
  is_dir: boolean;
  collection: string;
  added_at: number;
  last_indexed: number | null;
  chunk_count: number;
  file_count: number;
  excluded_dirs: string[];
  watch_enabled: boolean;
}

export interface IndexJob {
  job_id: string;
  source_path: string;
  status: 'queued' | 'running' | 'paused' | 'done' | 'cancelled' | 'failed';
  total_files: number;
  processed_files: number;
  indexed_chunks: number;
  skipped_files: number;
  failed_files: number;
  started_at: number;
  finished_at: number | null;
  current_file: string | null;
  errors: string[];
}

export interface SearchQuery {
  query: string;
  mode?: 'semantic' | 'keyword' | 'hybrid';
  limit?: number;
  file_types?: string[];
  collection?: string;
  source_prefix?: string;
}

export interface SearchResult {
  id: string;
  source_path: string;
  filename: string;
  excerpt: string;
  score: number;
  chunk_index: number;
  chunk_start: number;
  chunk_end: number;
  file_type: string;
  modified_at: string;
  collection: string;
}

export interface SearchStats {
  total_chunks: number;
  total_files: number;
  total_sources: number;
  vector_db_path: string;
  embedding_model: string;
  backend: string;
  embedding_available: boolean;
  vector_store_available: boolean;
  search_enabled: boolean;
  embedding_error?: string;
}

// ── API calls ──────────────────────────────────────────────────────────────

export async function getSearchStatus(): Promise<{ available: boolean; stats?: SearchStats; reason?: string }> {
  const r = await fetch(`${_b()}/search/status`, { headers: _h() });
  return r.json();
}

export async function listSources(): Promise<IndexSource[]> {
  const r = await fetch(`${_b()}/search/sources`, { headers: _h() });
  if (!r.ok) return [];
  const d = await r.json();
  return d.sources ?? [];
}

export async function addSource(path: string, collection = 'default', excludedDirs?: string[]): Promise<IndexSource> {
  const r = await fetch(`${_b()}/search/source/add`, {
    method: 'POST', headers: _h(),
    body: JSON.stringify({ path, collection, excluded_dirs: excludedDirs }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(err.error || r.statusText);
  }
  const d = await r.json();
  return d.source;
}

export async function removeSource(path: string): Promise<void> {
  await fetch(`${_b()}/search/source/remove`, {
    method: 'POST', headers: _h(), body: JSON.stringify({ path }),
  });
}

export async function startIndex(path: string, force = false): Promise<IndexJob> {
  const r = await fetch(`${_b()}/search/index`, {
    method: 'POST', headers: _h(), body: JSON.stringify({ path, force }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(err.error || r.statusText);
  }
  const d = await r.json();
  return d.job;
}

export async function cancelIndex(): Promise<void> {
  await fetch(`${_b()}/search/index/cancel`, { method: 'POST', headers: _h() });
}

export async function getIndexJobStatus(): Promise<IndexJob | null> {
  const r = await fetch(`${_b()}/search/index/status`, { headers: _h() });
  if (!r.ok) return null;
  const d = await r.json();
  return d.job ?? null;
}

export async function search(q: SearchQuery): Promise<SearchResult[]> {
  const r = await fetch(`${_b()}/search/query`, {
    method: 'POST', headers: _h(), body: JSON.stringify(q),
  });
  if (!r.ok) return [];
  const d = await r.json();
  return d.results ?? [];
}

export async function openFile(path: string): Promise<void> {
  const r = await fetch(`${_b()}/search/open`, {
    method: 'POST', headers: _h(), body: JSON.stringify({ path }),
  });
  if (!r.ok) throw new Error(`Open failed: ${r.status}`);
}

export async function revealFile(path: string): Promise<void> {
  const r = await fetch(`${_b()}/search/reveal`, {
    method: 'POST', headers: _h(), body: JSON.stringify({ path }),
  });
  if (!r.ok) throw new Error(`Reveal failed: ${r.status}`);
}

export async function clearIndex(): Promise<void> {
  await fetch(`${_b()}/search/index`, { method: 'DELETE', headers: _h() });
}
