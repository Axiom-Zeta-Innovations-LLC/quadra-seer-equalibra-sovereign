"""Typed data models for the semantic search subsystem."""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class IndexedChunk:
    id: str
    source_path: str
    chunk_index: int
    content: str
    vector: list[float]
    file_hash: str
    modified_at: float
    file_type: str
    chunk_start: int
    chunk_end: int
    collection: str = 'default'


@dataclass
class IndexSource:
    path: str
    is_dir: bool
    collection: str
    added_at: float
    last_indexed: Optional[float]
    chunk_count: int
    file_count: int
    excluded_dirs: list[str] = field(default_factory=list)
    watch_enabled: bool = False


@dataclass
class IndexJob:
    job_id: str
    source_path: str
    status: str         # queued | running | paused | done | cancelled | failed
    total_files: int
    processed_files: int
    indexed_chunks: int
    skipped_files: int
    failed_files: int
    started_at: float
    finished_at: Optional[float]
    current_file: Optional[str]
    errors: list[str] = field(default_factory=list)


@dataclass
class SearchResult:
    id: str
    source_path: str
    excerpt: str
    score: float
    chunk_index: int
    chunk_start: int
    chunk_end: int
    file_type: str
    modified_at: float
    collection: str


@dataclass
class IndexStats:
    total_chunks: int
    total_files: int
    total_sources: int
    vector_db_path: str
    embedding_model: str
    backend: str
    embedding_available: bool
    search_enabled: bool
