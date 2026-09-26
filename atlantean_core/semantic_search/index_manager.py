"""Incremental index manager with file-hash change detection."""
import os
import json
import hashlib
import threading
import time
import uuid
from typing import Optional

from .config import VECTOR_DB_PATH, STATE_FILE_NAME
from .models import IndexSource, IndexJob
from .path_policy import validate_index_path, is_allowed_file
from .extractors import extract_text
from .chunking import chunk_text
from . import embeddings as _emb
from . import vector_store as _vs

_state_path: str = os.path.join(VECTOR_DB_PATH, STATE_FILE_NAME)
_lock = threading.Lock()
_sources: dict[str, dict] = {}       # path → IndexSource-like dict
_active_job: Optional[IndexJob] = None
_job_cancelled: bool = False


# ── State persistence ─────────────────────────────────────────────────────

def _load_state():
    global _sources
    os.makedirs(VECTOR_DB_PATH, exist_ok=True)
    if os.path.exists(_state_path):
        try:
            with open(_state_path, 'r') as f:
                data = json.load(f)
            _sources = data.get('sources', {})
        except Exception:
            _sources = {}


def _save_state():
    os.makedirs(VECTOR_DB_PATH, exist_ok=True)
    try:
        with open(_state_path, 'w') as f:
            json.dump({'sources': _sources}, f, indent=2)
    except Exception:
        pass


_load_state()


# ── File hashing ──────────────────────────────────────────────────────────

def _file_hash(path: str) -> str:
    h = hashlib.sha256()
    try:
        with open(path, 'rb') as f:
            for block in iter(lambda: f.read(65536), b''):
                h.update(block)
    except OSError:
        return ''
    return h.hexdigest()


# ── Source management ─────────────────────────────────────────────────────

def add_source(path: str, collection: str = 'default',
               excluded_dirs: Optional[list[str]] = None) -> dict:
    real = validate_index_path(path)
    with _lock:
        _sources[real] = {
            'path': real,
            'is_dir': os.path.isdir(real),
            'collection': collection,
            'added_at': time.time(),
            'last_indexed': None,
            'chunk_count': 0,
            'file_count': 0,
            'excluded_dirs': excluded_dirs or [],
            'watch_enabled': False,
        }
        _save_state()
    return _sources[real]


def remove_source(path: str) -> bool:
    real = os.path.realpath(path)
    with _lock:
        if real not in _sources:
            return False
        del _sources[real]
        _save_state()
    _vs.delete_by_source(real)
    return True


def list_sources() -> list[dict]:
    with _lock:
        return list(_sources.values())


# ── Indexing ──────────────────────────────────────────────────────────────

def _collect_files(source_path: str, excluded_dirs: list[str]) -> list[str]:
    if not os.path.isdir(source_path):
        ok, _ = is_allowed_file(source_path, excluded_dirs)
        return [source_path] if ok else []
    files = []
    for root, dirs, fnames in os.walk(source_path):
        # Prune excluded directories in-place
        dirs[:] = [d for d in dirs if d.lower() not in {e.lower() for e in excluded_dirs}]
        from .config import DENIED_DIR_SEGMENTS
        dirs[:] = [d for d in dirs if d.lower() not in DENIED_DIR_SEGMENTS]
        for fname in fnames:
            fp = os.path.join(root, fname)
            ok, _ = is_allowed_file(fp, excluded_dirs)
            if ok:
                files.append(fp)
    return files


def start_index_job(source_path: str, force: bool = False) -> IndexJob:
    global _active_job, _job_cancelled
    real = os.path.realpath(source_path)
    if real not in _sources:
        raise ValueError(f'Source not added: {real}')
    src = _sources[real]
    job = IndexJob(
        job_id=str(uuid.uuid4()),
        source_path=real,
        status='running',
        total_files=0,
        processed_files=0,
        indexed_chunks=0,
        skipped_files=0,
        failed_files=0,
        started_at=time.time(),
        finished_at=None,
        current_file=None,
    )
    _active_job = job
    _job_cancelled = False
    thread = threading.Thread(target=_run_job, args=(job, src, force), daemon=True)
    thread.start()
    return job


def get_active_job() -> Optional[dict]:
    j = _active_job
    if j is None:
        return None
    return {
        'job_id': j.job_id, 'source_path': j.source_path,
        'status': j.status, 'total_files': j.total_files,
        'processed_files': j.processed_files, 'indexed_chunks': j.indexed_chunks,
        'skipped_files': j.skipped_files, 'failed_files': j.failed_files,
        'started_at': j.started_at, 'finished_at': j.finished_at,
        'current_file': j.current_file, 'errors': j.errors[:10],
    }


def cancel_active_job():
    global _job_cancelled
    _job_cancelled = True


def _run_job(job: IndexJob, src: dict, force: bool):
    global _job_cancelled
    try:
        files = _collect_files(src['path'], src.get('excluded_dirs', []))
        job.total_files = len(files)

        # Load stored file state (hash → modified_at) for this source
        state_key = f'file_state_{src["path"]}'
        stored_state: dict[str, dict] = {}
        state_path = os.path.join(VECTOR_DB_PATH, f'fstate_{hashlib.md5(src["path"].encode()).hexdigest()[:12]}.json')
        if os.path.exists(state_path):
            try:
                with open(state_path) as f:
                    stored_state = json.load(f)
            except Exception:
                pass

        new_state: dict[str, dict] = {}
        total_chunks = 0

        for fpath in files:
            if _job_cancelled:
                job.status = 'cancelled'
                return
            job.current_file = fpath
            try:
                current_hash = _file_hash(fpath)
                current_mtime = os.path.getmtime(fpath)
                prev = stored_state.get(fpath, {})

                if not force and prev.get('hash') == current_hash:
                    # Unchanged — count existing chunks
                    existing = _vs.count_chunks(fpath)
                    total_chunks += existing
                    new_state[fpath] = prev
                    job.processed_files += 1
                    job.skipped_files += 1
                    continue

                # Changed or new — re-index
                _vs.delete_by_source(fpath)
                text = extract_text(fpath)
                if not text or not text.strip():
                    new_state[fpath] = {'hash': current_hash, 'mtime': current_mtime, 'chunks': 0}
                    job.processed_files += 1
                    continue

                ext = os.path.splitext(fpath)[1].lower().lstrip('.')
                chunks_data = []
                for i, (chunk, start, end) in enumerate(chunk_text(text)):
                    if not chunk:
                        continue
                    chunks_data.append({
                        'text': chunk, 'start': start, 'end': end, 'index': i
                    })

                if not chunks_data:
                    job.processed_files += 1
                    continue

                texts = [c['text'] for c in chunks_data]
                try:
                    vectors = _emb.embed(texts)
                except RuntimeError:
                    # Embedding unavailable — store without vectors (keyword search only)
                    vectors = [[0.0] * _emb.embedding_dim()] * len(texts)

                records = []
                for i, (c, vec) in enumerate(zip(chunks_data, vectors)):
                    records.append({
                        'id': f'{hashlib.md5(fpath.encode()).hexdigest()[:10]}-{i}',
                        'source_path': fpath,
                        'chunk_index': c['index'],
                        'content': c['text'],
                        'vector': [float(v) for v in vec],
                        'file_hash': current_hash,
                        'modified_at': current_mtime,
                        'file_type': ext,
                        'chunk_start': c['start'],
                        'chunk_end': c['end'],
                        'collection': src.get('collection', 'default'),
                    })

                if records:
                    _vs.add_chunks(records)
                    total_chunks += len(records)
                    job.indexed_chunks += len(records)

                new_state[fpath] = {'hash': current_hash, 'mtime': current_mtime, 'chunks': len(records)}
                job.processed_files += 1

            except Exception as e:
                job.failed_files += 1
                job.errors.append(f'{fpath}: {e}')
                job.processed_files += 1

        # Persist file state
        try:
            with open(state_path, 'w') as f:
                json.dump(new_state, f)
        except Exception:
            pass

        # Update source stats
        with _lock:
            _sources[src['path']].update({
                'last_indexed': time.time(),
                'chunk_count': _vs.count_chunks(src['path']) if not os.path.isdir(src['path'])
                               else sum(s.get('chunks', 0) for s in new_state.values()),
                'file_count': len(files),
            })
            _save_state()

        job.status = 'done'
        job.finished_at = time.time()

    except Exception as e:
        job.status = 'failed'
        job.finished_at = time.time()
        job.errors.append(str(e))


def get_index_stats() -> dict:
    from .embeddings import is_available as emb_ok, get_load_error
    from .vector_store import count_chunks, is_available as vs_ok
    from .config import EMBEDDING_MODEL, VECTOR_BACKEND, VECTOR_DB_PATH, SEMANTIC_SEARCH_ENABLED
    sources = list_sources()
    return {
        'total_chunks': count_chunks(),
        'total_files': sum(s.get('file_count', 0) for s in sources),
        'total_sources': len(sources),
        'vector_db_path': VECTOR_DB_PATH,
        'embedding_model': EMBEDDING_MODEL,
        'backend': VECTOR_BACKEND,
        'embedding_available': emb_ok(),
        'vector_store_available': vs_ok(),
        'search_enabled': SEMANTIC_SEARCH_ENABLED,
        'embedding_error': get_load_error(),
    }
