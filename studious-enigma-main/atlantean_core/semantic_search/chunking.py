"""Text chunking with configurable size and overlap."""
from typing import Iterator
from .config import INDEX_CHUNK_SIZE, INDEX_CHUNK_OVERLAP


def chunk_text(
    text: str,
    chunk_size: int = INDEX_CHUNK_SIZE,
    overlap: int = INDEX_CHUNK_OVERLAP,
) -> Iterator[tuple[str, int, int]]:
    """Yield (chunk_text, start_char, end_char) tuples."""
    if not text:
        return
    text = text.replace('\r\n', '\n')
    step = max(1, chunk_size - overlap)
    pos = 0
    while pos < len(text):
        end = pos + chunk_size
        chunk = text[pos:end]
        # Try to break at a sentence/paragraph boundary
        if end < len(text):
            for sep in ('\n\n', '\n', '. ', ' '):
                idx = chunk.rfind(sep)
                if idx > chunk_size // 2:
                    chunk = chunk[:idx + len(sep)]
                    end = pos + len(chunk)
                    break
        yield chunk.strip(), pos, pos + len(chunk)
        pos += step
        if pos >= len(text):
            break
