"""Semantic, keyword, and hybrid search over the indexed vector store."""
from typing import Optional
from . import embeddings as _emb
from . import vector_store as _vs


def _build_filter(file_types: Optional[list[str]] = None,
                  collection: Optional[str] = None,
                  source_prefix: Optional[str] = None) -> Optional[str]:
    parts = []
    if file_types:
        quoted = ', '.join(f"'{t.lstrip('.')}'" for t in file_types)
        parts.append(f'file_type IN ({quoted})')
    if collection:
        parts.append(f"collection = '{collection.replace(chr(39), chr(39)*2)}'")
    if source_prefix:
        pfx = source_prefix.replace("'", "''")
        parts.append(f"source_path LIKE '{pfx}%'")
    return ' AND '.join(parts) if parts else None


def semantic_search(
    query: str,
    limit: int = 10,
    file_types: Optional[list[str]] = None,
    collection: Optional[str] = None,
    source_prefix: Optional[str] = None,
) -> list[dict]:
    if not _emb.is_available():
        return keyword_search(query, limit, file_types, collection, source_prefix)
    try:
        vec = _emb.embed_one(query)
    except RuntimeError:
        return keyword_search(query, limit, file_types, collection, source_prefix)
    filt = _build_filter(file_types, collection, source_prefix)
    results = _vs.search_vector(vec, limit=limit, filter_expr=filt)
    return [_format(r, r.get('_distance', 1.0)) for r in results]


def keyword_search(
    query: str,
    limit: int = 10,
    file_types: Optional[list[str]] = None,
    collection: Optional[str] = None,
    source_prefix: Optional[str] = None,
) -> list[dict]:
    filt = _build_filter(file_types, collection, source_prefix)
    results = _vs.keyword_search(query, limit=limit, filter_expr=filt)
    return [_format(r, 0.5) for r in results]


def hybrid_search(
    query: str,
    limit: int = 10,
    file_types: Optional[list[str]] = None,
    collection: Optional[str] = None,
    source_prefix: Optional[str] = None,
) -> list[dict]:
    """Combine semantic and keyword results, deduplicate, re-rank by score."""
    sem = semantic_search(query, limit=limit * 2, file_types=file_types,
                          collection=collection, source_prefix=source_prefix)
    kw = keyword_search(query, limit=limit, file_types=file_types,
                        collection=collection, source_prefix=source_prefix)
    seen: set[str] = set()
    merged: list[dict] = []
    for r in sem + kw:
        if r['id'] not in seen:
            seen.add(r['id'])
            merged.append(r)
    # Sort by score descending
    merged.sort(key=lambda x: x.get('score', 0), reverse=True)
    return merged[:limit]


def _format(row: dict, distance_or_score) -> dict:
    import os, time
    # LanceDB returns _distance (cosine: lower is better), convert to 0-1 score
    if '_distance' in row:
        score = round(max(0.0, 1.0 - row['_distance']), 4)
    else:
        score = float(distance_or_score)
    mtime = row.get('modified_at') or 0
    try:
        modified = time.strftime('%Y-%m-%dT%H:%M:%S', time.localtime(mtime))
    except Exception:
        modified = ''
    return {
        'id': row.get('id', ''),
        'source_path': row.get('source_path', ''),
        'excerpt': (row.get('content') or '')[:400],
        'score': score,
        'chunk_index': row.get('chunk_index', 0),
        'chunk_start': row.get('chunk_start', 0),
        'chunk_end': row.get('chunk_end', 0),
        'file_type': row.get('file_type', ''),
        'modified_at': modified,
        'collection': row.get('collection', 'default'),
        'filename': os.path.basename(row.get('source_path', '')),
    }
