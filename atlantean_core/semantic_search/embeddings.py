"""Local embedding model wrapper with graceful degradation."""
import threading
from typing import Optional
from .config import EMBEDDING_MODEL, EMBEDDING_DEVICE

_lock = threading.Lock()
_model = None
_available: Optional[bool] = None
_load_error: str = ''


def _load_model():
    global _model, _available, _load_error
    with _lock:
        if _available is not None:
            return
        try:
            from sentence_transformers import SentenceTransformer
            _model = SentenceTransformer(EMBEDDING_MODEL, device=EMBEDDING_DEVICE)
            _available = True
        except ImportError:
            _load_error = 'sentence-transformers not installed'
            _available = False
        except Exception as e:
            _load_error = str(e)
            _available = False


def is_available() -> bool:
    if _available is None:
        _load_model()
    return bool(_available)


def get_load_error() -> str:
    return _load_error


def embedding_dim() -> int:
    if not is_available():
        return 384  # MiniLM default; also works as placeholder
    return int(_model.get_sentence_embedding_dimension())


def embed(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts. Returns float lists or raises RuntimeError."""
    if not is_available():
        raise RuntimeError(f'Embedding model unavailable: {_load_error}')
    vecs = _model.encode(texts, batch_size=32, show_progress_bar=False,
                          convert_to_numpy=True)
    return vecs.tolist()


def embed_one(text: str) -> list[float]:
    return embed([text])[0]
