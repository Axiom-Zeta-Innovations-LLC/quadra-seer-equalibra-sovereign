# memory_bridge.py
import torch
import numpy as np
from typing import Any, Dict, List

from cold_memory import ColdMemoryItem, ColdMemoryMatch

class AtlanteanMemoryBridge:
    """
    The Critical Bridge: Hot ↔ Cold (This Is the Magic)
    
    Hot memory never stores content.
    It stores relevance pressure.
    
    This bridge ensures that:
    - Content lives in cold memory (replaceable)
    - Intelligence lives in hot memory (irreplaceable)
    - The two stay synchronized through relevance signals
    
    IMPORTANT CONSEQUENCE:
    If you delete all cold memory and reattach different cold memory,
    the system:
    - Still knows what kinds of things mattered
    - Still biases attention
    - Still shapes decisions
    
    That is true intelligence persistence.
    """
    
    def __init__(self, hot_memory, cold_memory, embedder):
        """
        Args:
            hot_memory: AtlanteanHotMemory instance
            cold_memory: ColdMemoryBackend instance (e.g., VectorColdMemory)
            embedder: Callable that embeds text to vectors
        """
        self.hot = hot_memory
        self.cold = cold_memory
        self.embedder = embedder

    def ingest(self, content, metadata):
        """
        Ingest new content into cold memory and update hot memory fields.
        
        The content is stored externally (cold).
        The relevance is reinforced internally (hot).
        
        Args:
            content: The actual data/text/information to store
            metadata: Dict with keys like "relevance", "importance", etc.
        """
        normalized = dict(metadata or {})
        normalized.setdefault('retrieval_weight', normalized.get('relevance', 0.5))
        normalized.setdefault('learning_weight', normalized.get('relevance', 0.5))
        normalized.setdefault('manifest_id', normalized.get('manifest_id', 'default'))

        item = ColdMemoryItem(content, normalized)
        self.cold.attach(item)

        # Learning signal is decoupled from retrieval score.
        learning_weight = float(item.metadata.get('learning_weight', 0.5))
        self.hot.phi5 += learning_weight * torch.ones_like(self.hot.phi5) * 0.0005
        self.hot.apply_local_update()

    def recall(self, query_text) -> List[ColdMemoryMatch]:
        """
        Query cold memory and update hot memory global coherence.
        
        The retrieval happens in cold memory.
        The meaning accumulation happens in hot memory.
        
        Args:
            query_text: Natural language query
            
        Returns:
            List of ColdMemoryMatch ranked by retrieval_score.
        """
        query_vec = self.embedder(query_text)
        results = self.cold.query(query_vec)

        # Update global meaning potential using learning-effect pressure,
        # not retrieval rank confidence.
        learning_pressure = float(sum(m.learning_effect_score for m in results))
        self.hot.update_Phi(torch.tensor([learning_pressure * 0.01]))

        return results

    def detach_item(self, item_id: str, reason: str = 'manual_detach'):
        """Detach an item via tombstone semantics."""
        self.cold.tombstone(item_id, reason=reason)

    def export_manifest(self, manifest_id: str) -> Dict[str, Any]:
        """Export a detachable cold-memory manifest."""
        return self.cold.export_manifest(manifest_id)

    def import_manifest(self, manifest: Dict[str, Any]) -> Dict[str, Any]:
        """Import a detached cold-memory manifest."""
        return self.cold.import_manifest(manifest)
