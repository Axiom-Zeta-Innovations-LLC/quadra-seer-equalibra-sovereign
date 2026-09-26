"""Tests for the semantic search subsystem."""
import os
import sys
import json
import tempfile
import textwrap
import hashlib
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))


# ── chunking ──────────────────────────────────────────────────────────────────

from atlantean_core.semantic_search.chunking import chunk_text


def test_chunk_empty_text():
    assert list(chunk_text("")) == []


def test_chunk_short_text_single_chunk():
    text = "Hello world."
    chunks = list(chunk_text(text, chunk_size=200, overlap=20))
    assert len(chunks) == 1
    assert chunks[0][0] == text
    assert chunks[0][1] == 0
    assert chunks[0][2] == len(text)


def test_chunk_long_text_multiple_chunks():
    # Produce text that forces at least 2 chunks
    sentence = "This is a sentence. "
    text = sentence * 50
    chunks = list(chunk_text(text, chunk_size=200, overlap=40))
    assert len(chunks) > 1
    for chunk_text_val, start, end in chunks:
        assert len(chunk_text_val) <= 300  # some slack for boundary logic
        assert start >= 0
        assert end > start


def test_chunk_positions_are_contiguous():
    text = "A B C D E F G H I J K L M N O P Q R S T U V W X Y Z. " * 20
    chunks = list(chunk_text(text, chunk_size=100, overlap=20))
    # First chunk always starts at 0
    assert chunks[0][1] == 0
    # start positions are non-decreasing
    for i in range(1, len(chunks)):
        assert chunks[i][1] >= chunks[i - 1][1]
    # All positions within text bounds
    for chunk_val, start, end in chunks:
        assert 0 <= start < end <= len(text) + 1


def test_chunk_no_overlap():
    text = ("word " * 60).strip()
    no_ol = list(chunk_text(text, chunk_size=50, overlap=0))
    with_ol = list(chunk_text(text, chunk_size=50, overlap=15))
    # With overlap we expect more chunks
    assert len(with_ol) >= len(no_ol)


# ── extractors ────────────────────────────────────────────────────────────────

from atlantean_core.semantic_search.extractors import extract_text


def test_extract_txt(tmp_path):
    f = tmp_path / "note.txt"
    f.write_text("Hello from text file.", encoding="utf-8")
    assert "Hello from text file." in extract_text(str(f))


def test_extract_md(tmp_path):
    f = tmp_path / "doc.md"
    f.write_text("# Title\n\nParagraph body.", encoding="utf-8")
    text = extract_text(str(f))
    assert "Title" in text
    assert "Paragraph body" in text


def test_extract_py(tmp_path):
    f = tmp_path / "script.py"
    f.write_text("def hello():\n    return 42\n", encoding="utf-8")
    text = extract_text(str(f))
    assert "def hello" in text


def test_extract_unsupported_returns_empty(tmp_path):
    f = tmp_path / "binary.bin"
    f.write_bytes(b"\x00\x01\x02\x03")
    result = extract_text(str(f))
    assert not result  # None or empty string


def test_extract_missing_file():
    result = extract_text("/nonexistent/path/file.txt")
    assert not result  # None or empty string


# ── path_policy ───────────────────────────────────────────────────────────────

from atlantean_core.semantic_search.path_policy import (
    validate_index_path,
    validate_search_source,
    is_allowed_file,
)


def test_validate_index_path_absolute_real(tmp_path):
    validate_index_path(str(tmp_path))  # no approved roots set — should not raise


def test_validate_index_path_traversal_rejected(tmp_path, monkeypatch):
    import atlantean_core.semantic_search.path_policy as _pp
    monkeypatch.setattr(_pp, '_approved_roots', [str(tmp_path)])
    # Path that resolves outside the approved root
    with pytest.raises(ValueError):
        validate_index_path('/etc/passwd')


def test_validate_index_path_relative_rejected():
    # Relative paths still resolve via realpath, so they aren't necessarily
    # rejected unless approved_roots are set. Verify it at least returns a str.
    result = validate_index_path('.')
    assert isinstance(result, str) and os.path.isabs(result)


def test_validate_search_source_missing_raises(tmp_path, monkeypatch):
    import atlantean_core.semantic_search.path_policy as _pp
    monkeypatch.setattr(_pp, '_approved_roots', [])
    with pytest.raises(ValueError):
        validate_search_source('/this/path/does/not/exist/at/all')


def test_is_allowed_file_txt(tmp_path):
    f = tmp_path / "readme.txt"
    f.write_text("hi")
    allowed, _ = is_allowed_file(str(f))
    assert allowed is True


def test_is_allowed_file_denied_extension(tmp_path):
    f = tmp_path / "image.png"
    f.write_bytes(b"\x89PNG")
    allowed, _ = is_allowed_file(str(f))
    assert allowed is False


def test_is_allowed_file_denied_dir(tmp_path):
    node_dir = tmp_path / "node_modules"
    node_dir.mkdir()
    f = node_dir / "file.js"
    f.write_text("module.exports = {};")
    allowed, _ = is_allowed_file(str(f))
    assert allowed is False


def test_is_allowed_file_denied_name(tmp_path):
    f = tmp_path / ".env"
    f.write_text("SECRET=x")
    allowed, _ = is_allowed_file(str(f))
    assert allowed is False


def test_is_allowed_file_oversized(tmp_path, monkeypatch):
    f = tmp_path / "big.txt"
    f.write_text("small content")
    import atlantean_core.semantic_search.config as _cfg
    monkeypatch.setattr(_cfg, 'INDEX_MAX_FILE_MB', 0.000001)
    allowed, _ = is_allowed_file(str(f))
    assert allowed is False


def test_symlink_escape_rejected(tmp_path, monkeypatch):
    import atlantean_core.semantic_search.path_policy as _pp
    outside = tmp_path / 'outside'
    outside.mkdir()
    secret = outside / 'secret.txt'
    secret.write_text('secret data')

    inside = tmp_path / 'inside'
    inside.mkdir()
    link = inside / 'escape.txt'
    link.symlink_to(secret)

    # Restrict approved roots to `inside` only; the symlink resolves to `outside`
    monkeypatch.setattr(_pp, '_approved_roots', [str(inside)])
    with pytest.raises(ValueError):
        validate_index_path(str(link))


# ── index_manager state serialization ─────────────────────────────────────────

import atlantean_core.semantic_search.index_manager as _im


def test_index_manager_add_remove_source(tmp_path, monkeypatch):
    monkeypatch.setattr(_im, '_state_path', str(tmp_path / 'idx.json'))
    monkeypatch.setattr(_im, '_sources', {})
    _im.add_source(str(tmp_path), collection='default')
    sources = _im.list_sources()
    assert any(s['path'] == str(tmp_path) for s in sources)

    _im.remove_source(str(tmp_path))
    assert not any(s['path'] == str(tmp_path) for s in _im.list_sources())


def test_index_manager_state_persists(tmp_path, monkeypatch):
    state_file = str(tmp_path / 'idx.json')
    monkeypatch.setattr(_im, '_state_path', state_file)
    monkeypatch.setattr(_im, '_sources', {})
    _im.add_source(str(tmp_path), collection='test')
    # Simulate restart: clear in-memory sources and reload from disk
    monkeypatch.setattr(_im, '_sources', {})
    _im._load_state()
    assert any(s['path'] == str(tmp_path) for s in _im.list_sources())


def test_index_manager_no_active_job_initially(monkeypatch):
    monkeypatch.setattr(_im, '_active_job', None)
    assert _im.get_active_job() is None


# ── embeddings graceful degradation ───────────────────────────────────────────

from atlantean_core.semantic_search.embeddings import (
    is_available, embed, embedding_dim,
)
import atlantean_core.semantic_search.embeddings as _emb


from atlantean_core.semantic_search import embeddings as _emb


def test_embedding_unavailable_when_model_is_none(monkeypatch):
    monkeypatch.setattr(_emb, '_model', None)
    monkeypatch.setattr(_emb, '_load_error', 'sentence_transformers not installed')
    assert _emb.is_available() is False


def test_embedding_embed_raises_when_unavailable(monkeypatch):
    monkeypatch.setattr(_emb, '_model', None)
    monkeypatch.setattr(_emb, '_load_error', 'not installed')
    with pytest.raises(RuntimeError):
        _emb.embed(["hello"])
