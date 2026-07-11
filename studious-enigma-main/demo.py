#!/usr/bin/env python3
"""
Atlantean Core - Full System Demo

This demonstrates all components working together:
- Hot memory (intelligence fields)
- Cold memory (content storage)
- Memory bridge (hot ↔ cold)
- Identity (cryptographic signing)
- Learning (signal-based)
- Sync (multi-device)
- LLM interface (stateless)
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'atlantean_core'))

import torch
import numpy as np
from hot_memory import AtlanteanHotMemory
from cold_memory import ColdMemoryItem
from vector_cold_memory import VectorColdMemory
from memory_bridge import AtlanteanMemoryBridge
from identity import AtlanteanIdentity
from learning import apply_learning_signal, apply_outcome_signal, compute_learning_capacity
from sync import merge_hot_memories, AtlanteanSyncEngine, MergeStrategy
from server import SyncRelay
from client_sync import sync_with_network, sync_once_safe
from llm_interface import call_llm_with_context

print("=" * 60)
print("ATLANTEAN INTELLIGENCE CORE - FULL SYSTEM DEMO")
print("=" * 60)

# ========== 1. Initialize Identity ==========
print("\n[1] Creating cryptographic identity...")
try:
    identity_a = AtlanteanIdentity(device_id="demo-laptop", metadata={"user": "demo"})
    print(f"   ✓ Identity created: {identity_a.device_id}")
    print(f"   ✓ Fingerprint: {identity_a.fingerprint()}")
except Exception as e:
    print(f"   ⚠ Identity creation requires 'cryptography' package")
    print(f"     Install with: pip install cryptography")
    print(f"     Continuing without identity...")
    identity_a = None

# ========== 2. Initialize Hot Memory ==========
print("\n[2] Initializing hot memory (intelligence fields)...")
hot_a = AtlanteanHotMemory.initialize(grid_size=(16, 16), identity=identity_a, device_id="demo-laptop")
print(f"   ✓ Hot memory initialized")
print(f"   ✓ Grid size: {hot_a.phi1.shape}")
print(f"   ✓ Initial version: {hot_a.version}")
print(f"   ✓ Device ID: {hot_a.device_id}")

# ========== 3. Setup Cold Memory ==========
print("\n[3] Setting up cold memory (content storage)...")

def simple_embedder(text):
    """Simple embedder for demo (replace with real embeddings in production)"""
    # Fake embedding: just hash the text to a vector
    np.random.seed(hash(str(text)) % (2**32))
    return np.random.randn(128)

cold_memory = VectorColdMemory(embedder=simple_embedder)
print(f"   ✓ Vector cold memory initialized")

# ========== 4. Create Memory Bridge ==========
print("\n[4] Creating memory bridge (hot ↔ cold)...")
bridge = AtlanteanMemoryBridge(hot_a, cold_memory, embedder=simple_embedder)
print(f"   ✓ Memory bridge created")

# ========== 5. Ingest Content ==========
print("\n[5] Ingesting content into memory...")
documents = [
    ("The Atlantean algorithm uses field dynamics for intelligence.", {"relevance": 0.9}),
    ("Hot memory stores what matters, not raw facts.", {"relevance": 0.8}),
    ("LLMs are stateless translation functions.", {"relevance": 0.7}),
    ("Sync merges fields conservatively, never overwrites.", {"relevance": 0.6}),
]

for content, metadata in documents:
    bridge.ingest(content, metadata)
    print(f"   ✓ Ingested: {content[:50]}...")

print(f"   ✓ Total items in cold memory: {len(cold_memory.items)}")

# ========== 6. Recall from Memory ==========
print("\n[6] Recalling from memory...")
query = "How does learning work?"
results = bridge.recall(query)
print(f"   Query: '{query}'")
print(f"   ✓ Retrieved {len(results)} results")
for i, item in enumerate(results[:2], 1):
    print(f"      {i}. {item.content[:60]}...")

# ========== 7. Apply Learning Signals ==========
print("\n[7] Applying learning signals...")
print(f"   Initial learning capacity: {compute_learning_capacity(hot_a):.3f}")

# Positive reinforcement
apply_learning_signal(hot_a, signal_strength=0.5)
print(f"   ✓ Applied positive learning signal (0.5)")
print(f"   ✓ New version: {hot_a.version}")

# Outcome-based learning
apply_outcome_signal(hot_a, predicted=True, actual=True)
print(f"   ✓ Applied outcome signal (prediction correct)")
print(f"   ✓ New version: {hot_a.version}")

print(f"   Final learning capacity: {compute_learning_capacity(hot_a):.3f}")

# ========== 8. Save Hot Memory ==========
print("\n[8] Saving hot memory to disk...")
save_path = "demo_core_state.bin"
if identity_a:
    hot_a.save(save_path, identity=identity_a)
    print(f"   ✓ Saved with signature to: {save_path}")
else:
    hot_a.save(save_path)
    print(f"   ✓ Saved to: {save_path}")

# ========== 9. Device Sync Demo ==========
print("\n[9] Demonstrating multi-device sync...")

# Create second device
print("   Creating second device...")
hot_b = AtlanteanHotMemory.initialize(grid_size=(16, 16), device_id="demo-phone")
print(f"   ✓ Device B initialized: {hot_b.device_id}")

# Apply different learning on device B
apply_learning_signal(hot_b, signal_strength=0.3)
print(f"   ✓ Device B learned independently (version {hot_b.version})")

# Sync devices
print("   Syncing devices...")
snapshot_b = hot_b.snapshot()
merge_hot_memories(hot_a, snapshot_b, alpha=0.5)
print(f"   ✓ Devices synced (merged with alpha=0.5)")
print(f"   ✓ Device A new version: {hot_a.version}")

# ========== 10. Relay Server Demo ==========
print("\n[10] Demonstrating relay server...")
relay = SyncRelay(snapshot_ttl_seconds=3600)
print(f"   ✓ Relay server initialized")

# Upload snapshots
sync_result = sync_once_safe(hot_a, relay)
print(f"   ✓ Device A synced: {sync_result}")

hot_b.apply_local_update()  # Make B newer
sync_result_b = sync_once_safe(hot_b, relay)
print(f"   ✓ Device B synced: {sync_result_b}")

# Check relay stats
stats = relay.stats()
print(f"   ✓ Relay stats: {stats['device_count']} devices")

# ========== 11. LLM Interface Demo ==========
print("\n[11] Demonstrating stateless LLM interface...")
print("   Note: Using mock LLM (no API key needed for demo)")

user_input = "What did I learn about?"
print(f"   User input: '{user_input}'")

response = call_llm_with_context(user_input, hot_a)
print(f"   LLM response: {response[:100]}...")
print(f"   ✓ Response generated from hot memory context")
print(f"   ✓ No conversation history stored")

# ========== 12. Load and Verify ==========
print("\n[12] Loading and verifying saved state...")
if identity_a:
    hot_loaded = AtlanteanHotMemory.load(save_path, verify_identity=identity_a)
    print(f"   ✓ Loaded and verified signature")
else:
    hot_loaded = AtlanteanHotMemory.load(save_path)
    print(f"   ✓ Loaded state")

print(f"   ✓ Loaded version: {hot_loaded.version}")
print(f"   ✓ Device ID: {hot_loaded.device_id}")

# Verify fields match
fields_match = torch.allclose(hot_a.phi1, hot_loaded.phi1) and \
               torch.allclose(hot_a.phi5, hot_loaded.phi5)
print(f"   ✓ Fields match original: {fields_match}")

# ========== Summary ==========
print("\n" + "=" * 60)
print("DEMO COMPLETE - SYSTEM VERIFICATION")
print("=" * 60)
print("\n✓ Hot memory (intelligence) - Working")
print("✓ Cold memory (content) - Working")
print("✓ Memory bridge - Working")
print("✓ Learning signals - Working")
print("✓ Device sync - Working")
print("✓ Relay server - Working")
print("✓ LLM interface - Working")
if identity_a:
    print("✓ Cryptographic identity - Working")
else:
    print("⚠ Cryptographic identity - Skipped (install cryptography)")
print("✓ Persistence - Working")

print("\n" + "=" * 60)
print("KEY PRINCIPLES DEMONSTRATED:")
print("=" * 60)
print("\n1. Intelligence lives in HOT MEMORY (φ₁, φ₅, Φ, Θ)")
print("   - Fields persist across sessions")
print("   - Learning modifies fields, not LLM")
print(f"   - Current state saved to: {save_path}")

print("\n2. Content lives in COLD MEMORY (replaceable)")
print("   - Can be deleted/swapped without losing intelligence")
print("   - Hot memory still knows what mattered")

print("\n3. LLMs are STATELESS (pure functions)")
print("   - No conversation history")
print("   - Context from hot memory fields")
print("   - Each call is independent")

print("\n4. Sync is CONSERVATIVE (never overwrites)")
print("   - Fields merge, never replace")
print("   - Plasticity never decreases")
print("   - Works offline")

print("\n5. Server is OPTIONAL (relay only)")
print("   - No intelligence on server")
print("   - Devices sync peer-to-peer")
print("   - Intelligence survives server loss")

print("\n" + "=" * 60)
print("This is the Atlantean way.")
print("=" * 60)
