# cold_memory.py
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
import uuid
import numpy as np


@dataclass
class ColdMemoryMatch:
    """A scored retrieval result with separated retrieval and learning effects."""
    item: 'ColdMemoryItem'
    retrieval_score: float
    learning_effect_score: float

class ColdMemoryItem:
    """
    Represents a single piece of cold memory (content, not intelligence).
    Each item has a unique ID and metadata for indexing.
    """
    def __init__(self, content: Any, metadata: Dict):
        self.id = str(uuid.uuid4())
        self.content = content
        self.metadata = metadata or {}

        # Standardized contract fields
        self.metadata.setdefault('manifest_id', 'default')
        self.metadata.setdefault('tombstone', False)
        self.metadata.setdefault('retrieval_weight', self.metadata.get('relevance', 0.5))
        self.metadata.setdefault('learning_weight', self.metadata.get('relevance', 0.5))

class ColdMemoryBackend(ABC):
    """
    Abstract interface for cold memory storage.
    Implementations can be: file systems, vector DBs, knowledge graphs, etc.
    
    Key property: All backends are REPLACEABLE and RE-LINKABLE.
    """

    @abstractmethod
    def attach(self, item: ColdMemoryItem):
        """Attach a new memory item to the backend."""
        pass

    @abstractmethod
    def detach(self, item_id: str):
        """Detach a memory item (prefer tombstone over hard delete)."""
        pass

    @abstractmethod
    def tombstone(self, item_id: str, reason: Optional[str] = None):
        """Mark an item as detached without destroying historical lineage."""
        pass

    @abstractmethod
    def query(self, query_vector: np.ndarray, k: int = 5) -> List[ColdMemoryMatch]:
        """
        Query the memory backend with a semantic vector.
        Returns k scored matches with retrieval and learning-effect scores separated.
        """
        pass

    @abstractmethod
    def export_manifest(self, manifest_id: str) -> Dict[str, Any]:
        """Export a detachable manifest that can be moved/re-attached elsewhere."""
        pass

    @abstractmethod
    def import_manifest(self, manifest: Dict[str, Any]) -> Dict[str, Any]:
        """Attach a detached manifest and restore its active items."""
        pass

    @abstractmethod
    def list_manifests(self, include_detached: bool = False) -> List[Dict[str, Any]]:
        """Enumerate manifest metadata for management and portability."""
        pass
