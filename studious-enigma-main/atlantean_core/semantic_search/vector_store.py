"""LanceDB vector store wrapper with graceful degradation."""
import os
import threading
from typing import Optional
from .config import VECTOR_DB_PATH, INDEX_TABLE_NAME
from .embeddings import embedding_dim

_lock = threading.Lock()
_db = None
_table = None
_available: Optional[bool] = None
_load_error: str = ''


def _schema():
    try:
        import pyarrow as pa
        dim = embedding_dim()
        return pa.schema([
            pa.field('id', pa.utf8()),
            pa.field('source_path', pa.utf8()),
            pa.field('chunk_index', pa.int32()),
            pa.field('content', pa.utf8()),
            pa.field('vector', pa.list_(pa.float32(), dim)),
            pa.field('file_hash', pa.utf8()),
            pa.field('modified_at', pa.float64()),
            pa.field('file_type', pa.utf8()),
            pa.field('chunk_start', pa.int32()),
            pa.field('chunk_end', pa.int32()),
            pa.field('collection', pa.utf8()),
        ])
    except ImportError:
        return None


def _ensure_db():
    global _db, _table, _available, _load_error
    with _lock:
        if _available is not None:
            return
        try:
            import lancedb
            import pyarrow as pa
            os.makedirs(VECTOR_DB_PATH, exist_ok=True)
            _db = lancedb.connect(VECTOR_DB_PATH)
            schema = _schema()
            existing = _db.table_names()
            if INDEX_TABLE_NAME in existing:
                _table = _db.open_table(INDEX_TABLE_NAME)
            else:
                _table = _db.create_table(INDEX_TABLE_NAME, schema=schema)
            _available = True
        except ImportError as e:
            _load_error = f'lancedb/pyarrow not installed: {e}'
            _available = False
        except Exception as e:
            _load_error = str(e)
            _available = False


def is_available() -> bool:
    if _available is None:
        _ensure_db()
    return bool(_available)


def get_error() -> str:
    return _load_error


def add_chunks(records: list[dict]) -> None:
    """Add a list of chunk dicts to the table."""
    if not is_available():
        raise RuntimeError(f'Vector store unavailable: {_load_error}')
    _table.add(records)


def delete_by_source(source_path: str) -> None:
    """Remove all chunks for a given source path."""
    if not is_available():
        return
    try:
        _table.delete(f"source_path = '{source_path.replace(chr(39), chr(39)*2)}'")
    except Exception:
        pass


def search_vector(query_vector: list[float], limit: int = 10,
                  filter_expr: Optional[str] = None) -> list[dict]:
    if not is_available():
        return []
    try:
        q = _table.search(query_vector)
        if filter_expr:
            q = q.where(filter_expr)
        return q.limit(limit).to_list()
    except Exception:
        return []


def keyword_search(keyword: str, limit: int = 10,
                   filter_expr: Optional[str] = None) -> list[dict]:
    if not is_available():
        return []
    try:
        escaped = keyword.replace("'", "''").replace('%', '\\%')
        where = f"content LIKE '%{escaped}%'"
        if filter_expr:
            where = f"({where}) AND ({filter_expr})"
        return _table.search().where(where).limit(limit).to_list()
    except Exception:
        return []


def count_chunks(source_path: Optional[str] = None) -> int:
    if not is_available():
        return 0
    try:
        if source_path:
            sp = source_path.replace("'", "''")
            return len(_table.search().where(f"source_path = '{sp}'").limit(10000).to_list())
        return _table.count_rows()
    except Exception:
        return 0


def all_source_paths() -> list[str]:
    if not is_available():
        return []
    try:
        rows = _table.search().select(['source_path']).limit(100000).to_list()
        return list({r['source_path'] for r in rows})
    except Exception:
        return []


def clear_all() -> None:
    if not is_available():
        return
    global _table
    try:
        _db.drop_table(INDEX_TABLE_NAME)
        schema = _schema()
        _table = _db.create_table(INDEX_TABLE_NAME, schema=schema)
    except Exception:
        pass
