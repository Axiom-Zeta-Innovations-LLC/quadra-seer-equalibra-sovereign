/**
 * journalService.ts — Local daily journal client.
 */
import { resolveAtlanteanApiBaseOrThrow, getAtlanteanAuthHeaders } from './atlanteanService';

const _b = () => resolveAtlanteanApiBaseOrThrow();
const _h = () => ({ 'Content-Type': 'application/json', ...getAtlanteanAuthHeaders() });

export interface JournalEntry {
  date: string;
  title?: string;
  content: string;
  tags?: string[];
  source_type?: 'voice' | 'text' | 'note';
}

export interface JournalFile {
  filename: string;
  path: string;
  date: string;
  size: number;
  modified: number;
}

export async function appendJournal(entry: JournalEntry): Promise<{ path: string; date: string }> {
  const r = await fetch(`${_b()}/journal/append`, {
    method: 'POST', headers: _h(), body: JSON.stringify(entry),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(e.error || r.statusText);
  }
  return r.json();
}

export async function readJournal(date?: string): Promise<{ date: string; content: string; exists: boolean; path?: string }> {
  const params = date ? `?date=${encodeURIComponent(date)}` : '';
  const r = await fetch(`${_b()}/journal/read${params}`, { headers: _h() });
  if (!r.ok) return { date: date ?? '', content: '', exists: false };
  return r.json();
}

export async function listJournalEntries(): Promise<JournalFile[]> {
  const r = await fetch(`${_b()}/journal/list`, { headers: _h() });
  if (!r.ok) return [];
  const d = await r.json();
  return d.entries ?? [];
}

export function todayDateString(): string {
  return new Date().toISOString().split('T')[0];
}
