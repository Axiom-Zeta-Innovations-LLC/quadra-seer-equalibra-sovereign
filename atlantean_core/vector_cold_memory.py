# vector_cold_memory.py
import numpy as np
from typing import Any, Dict, List, Optional

from cold_memory import ColdMemoryBackend, ColdMemoryItem, ColdMemoryMatch
import redis
import json
import os
import time
from at_rest_encryption import AtRestEncryptor


class VectorColdMemory(ColdMemoryBackend):
    """
    Vector-based cold memory using semantic embeddings and cosine similarity.
    
    This is the default implementation for semantic search over content.
    Content is embedded once on attach, then queried efficiently.
    Now with Redis backing for persistence.
    """
    
    def __init__(self, embedder):
        """
        Args:
            embedder: Callable that takes content and returns a numpy vector.
                     Can be any embedding model (OpenAI, sentence-transformers, etc.)
        """
        self.embedder = embedder
        self.redis = redis.Redis(host=os.getenv('REDIS_HOST', 'localhost'), port=6379, decode_responses=True)
        self.encryptor = AtRestEncryptor.from_env()
        # Load existing data from Redis
        self.vectors = {}
        self.items = {}
        self._load_from_redis()

    def _read_json(self, key: str) -> Optional[Dict[str, Any] | List[Any]]:
        raw = self.redis.get(key)
        if not raw:
            return None

        plaintext = raw
        was_encrypted = False
        if isinstance(raw, str):
            try:
                plaintext, was_encrypted = self.encryptor.decrypt_text_with_metadata(raw)
            except Exception:
                # Backward compatibility: treat as plaintext JSON.
                plaintext = raw
                was_encrypted = False

        parsed = json.loads(plaintext)

        # Lazy migration: plaintext rows are rewritten encrypted if encryption is enabled.
        if self.encryptor.enabled and isinstance(raw, str) and not was_encrypted:
            self.redis.set(key, self.encryptor.encrypt_text(plaintext))

        return parsed

    def _write_json(self, key: str, payload: Dict[str, Any] | List[Any]):
        raw = json.dumps(payload)
        if self.encryptor.enabled:
            self.redis.set(key, self.encryptor.encrypt_text(raw))
            return
        self.redis.set(key, raw)

    def _load_from_redis(self):
        """Load vectors and items from Redis (excluding tombstoned items from active index)."""
        try:
            item_keys = self.redis.keys('item:*')
            for key in item_keys:
                item_id = key.split(':', 1)[1]
                item_dict = self._read_json(key)
                if item_dict:
                    item = ColdMemoryItem(
                        content=item_dict['content'],
                        metadata=item_dict['metadata']
                    )
                    item.id = item_dict.get('id', item_id)
                    self.items[item_id] = item

                    if item.metadata.get('tombstone'):
                        continue

                    vector_data = self._read_json(f'vector:{item_id}')
                    if vector_data:
                        self.vectors[item_id] = np.array(vector_data)
        except Exception as e:
            print(f"Failed to load from Redis: {e}")

    def _ensure_manifest(self, manifest_id: str):
        """Ensure a manifest record exists for grouping detachable memory items."""
        key = f'manifest:{manifest_id}'
        existing = self.redis.get(key)
        if existing:
            return
        manifest = {
            'manifest_id': manifest_id,
            'attached_at': self._now_ms(),
            'detached_at': None,
            'detached': False,
            'item_ids': [],
            'metadata': {},
        }
        self._write_json(key, manifest)

    def _add_item_to_manifest(self, manifest_id: str, item_id: str):
        key = f'manifest:{manifest_id}'
        raw = self._read_json(key)
        if not raw:
            self._ensure_manifest(manifest_id)
            raw = self._read_json(key)
        if not raw:
            return
        manifest = raw
        if item_id not in manifest.get('item_ids', []):
            manifest.setdefault('item_ids', []).append(item_id)
        manifest['detached'] = False
        manifest['detached_at'] = None
        self._write_json(key, manifest)

    def _now_ms(self) -> int:
        return int(time.time() * 1000)

    def attach(self, item: ColdMemoryItem):
        """Embed and store the content."""
        manifest_id = str(item.metadata.get('manifest_id', 'default'))
        item.metadata.setdefault('manifest_id', manifest_id)
        item.metadata.setdefault('tombstone', False)
        item.metadata.setdefault('retrieval_weight', item.metadata.get('relevance', 0.5))
        item.metadata.setdefault('learning_weight', item.metadata.get('relevance', 0.5))
        item.metadata.setdefault('created_at_ms', self._now_ms())

        vector = self.embedder(item.content)
        self.vectors[item.id] = vector
        self.items[item.id] = item

        try:
            self._ensure_manifest(manifest_id)
            self._add_item_to_manifest(manifest_id, item.id)
        except Exception as e:
            print(f"Redis unavailable, keeping item in memory only: {e}")
        
        # Save to Redis
        try:
            self._write_json(f'vector:{item.id}', vector.tolist())
            self._write_json(f'item:{item.id}', {
                'id': item.id,
                'content': item.content,
                'metadata': item.metadata,
            })
        except Exception as e:
            print(f"Failed to save to Redis: {e}")

    def detach(self, item_id: str):
        """Detach item by tombstoning to preserve lineage."""
        self.tombstone(item_id, reason='detached')

    def tombstone(self, item_id: str, reason: Optional[str] = None):
        """Mark an item as detached while preserving historical metadata."""
        item = self.items.get(item_id)
        if not item:
            item_dict = self._read_json(f'item:{item_id}')
            if not item_dict:
                return
            item = ColdMemoryItem(content=item_dict['content'], metadata=item_dict['metadata'])
            item.id = item_dict.get('id', item_id)
            self.items[item_id] = item

        item.metadata['tombstone'] = True
        item.metadata['tombstone_reason'] = reason or 'manual'
        item.metadata['tombstoned_at_ms'] = self._now_ms()
        self.vectors.pop(item_id, None)

        try:
            self._write_json(f'item:{item_id}', {
                'id': item.id,
                'content': item.content,
                'metadata': item.metadata,
            })
            manifest_id = item.metadata.get('manifest_id', 'default')
            manifest_raw = self._read_json(f'manifest:{manifest_id}')
            if manifest_raw:
                manifest = manifest_raw
                active_ids = []
                for iid in manifest.get('item_ids', []):
                    candidate = self.items.get(iid)
                    if not candidate:
                        candidate_raw = self._read_json(f'item:{iid}')
                        if not candidate_raw:
                            continue
                        candidate_dict = candidate_raw
                        candidate = ColdMemoryItem(
                            content=candidate_dict['content'],
                            metadata=candidate_dict['metadata'],
                        )
                        candidate.id = candidate_dict.get('id', iid)
                        self.items[iid] = candidate
                    if not candidate.metadata.get('tombstone'):
                        active_ids.append(iid)
                if not active_ids:
                    manifest['detached'] = True
                    manifest['detached_at'] = self._now_ms()
                self._write_json(f'manifest:{manifest_id}', manifest)
        except Exception as e:
            print(f"Failed to tombstone item: {e}")

    def query(self, query_vector: np.ndarray, k: int = 5) -> List[ColdMemoryMatch]:
        """
        Find k most semantically similar items using cosine similarity.
        
        Args:
            query_vector: Semantic embedding of the query
            k: Number of results to return
            
        Returns:
            List of ColdMemoryMatch ranked by retrieval_score.
            learning_effect_score is maintained separately from retrieval_score.
        """
        if not self.vectors:
            return []

        from sklearn.metrics.pairwise import cosine_similarity

        ids = list(self.vectors.keys())
        matrix = np.array([self.vectors[i] for i in ids])
        scores = cosine_similarity([query_vector], matrix)[0]

        matches: List[ColdMemoryMatch] = []
        for item_id, base_score in zip(ids, scores):
            item = self.items.get(item_id)
            if not item or item.metadata.get('tombstone'):
                continue

            retrieval_weight = float(item.metadata.get('retrieval_weight', item.metadata.get('relevance', 0.5)))
            learning_weight = float(item.metadata.get('learning_weight', item.metadata.get('relevance', 0.5)))

            retrieval_score = float(base_score) * retrieval_weight
            # Keep learning effect score semantically separate from retrieval ranking.
            learning_effect_score = learning_weight * ((float(base_score) + 1.0) / 2.0)
            matches.append(
                ColdMemoryMatch(
                    item=item,
                    retrieval_score=retrieval_score,
                    learning_effect_score=learning_effect_score,
                )
            )

        matches.sort(key=lambda m: m.retrieval_score, reverse=True)
        return matches[:k]

    def export_manifest(self, manifest_id: str) -> Dict[str, Any]:
        """Export all items and vectors bound to a manifest for portability."""
        raw = self._read_json(f'manifest:{manifest_id}')
        if not raw:
            return {'manifest_id': manifest_id, 'exists': False, 'items': []}

        manifest = raw
        exported_items = []
        for item_id in manifest.get('item_ids', []):
            item_raw = self._read_json(f'item:{item_id}')
            if not item_raw:
                continue
            item_dict = item_raw
            vector_raw = self._read_json(f'vector:{item_id}')
            exported_items.append({
                'item': item_dict,
                'vector': vector_raw if vector_raw else None,
            })

        return {
            'exists': True,
            'manifest': manifest,
            'items': exported_items,
        }

    def import_manifest(self, manifest: Dict[str, Any]) -> Dict[str, Any]:
        """Import a detachable manifest into this backend."""
        manifest_data = manifest.get('manifest') or manifest
        manifest_id = manifest_data.get('manifest_id', 'default')
        manifest_data['detached'] = False
        manifest_data['detached_at'] = None
        self._write_json(f'manifest:{manifest_id}', manifest_data)

        restored = 0
        for row in manifest.get('items', []):
            item_dict = row.get('item')
            vector_data = row.get('vector')
            if not item_dict:
                continue

            item_id = item_dict.get('id')
            self._write_json(f'item:{item_id}', item_dict)
            item = ColdMemoryItem(content=item_dict['content'], metadata=item_dict['metadata'])
            item.id = item_id
            self.items[item_id] = item

            if vector_data is not None:
                self._write_json(f'vector:{item_id}', vector_data)
                if not item.metadata.get('tombstone'):
                    self.vectors[item_id] = np.array(vector_data)
            restored += 1

        return {'manifest_id': manifest_id, 'restored_items': restored}

    def list_manifests(self, include_detached: bool = False) -> List[Dict[str, Any]]:
        """List known manifests with optional detached entries."""
        rows = []
        try:
            manifest_keys = self.redis.keys('manifest:*')
        except Exception:
            return rows
        for key in manifest_keys:
            raw = self._read_json(key)
            if not raw:
                continue
            try:
                manifest = raw
                if not include_detached and manifest.get('detached'):
                    continue
                rows.append(manifest)
            except Exception:
                continue

        rows.sort(key=lambda m: m.get('manifest_id', ''))
        return rows
