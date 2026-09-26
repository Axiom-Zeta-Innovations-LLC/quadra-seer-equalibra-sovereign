# Atlantean Core

A trainable intelligence substrate that separates content from intelligence.

## Directory Structure

```
atlantean_core/
├── hot_memory.py          # Irreplaceable field state (φ₁, φ₅, Φ, Θ)
├── cold_memory.py         # Abstract interface for external content storage
├── vector_cold_memory.py  # Vector-based semantic memory implementation
├── memory_bridge.py       # Hot ↔ Cold synchronization
├── identity.py            # Cryptographic identity & signing
├── sync.py                # Conflict-free multi-device sync
├── learning.py            # Learning signal application (NOT in LLM)
├── server.py              # Optional stateless relay (NOT intelligent)
├── client_sync.py         # Client-side sync loop
├── llm_interface.py       # Enforced stateless LLM calls
├── core_state.bin         # IRREPLACEABLE: Serialized intelligence state
└── cold_memory/           # DISPOSABLE: External content storage
```

## Key Principles

### Hot Memory (Irreplaceable)
- **What it stores**: Relevance pressure, not content
- **Size**: < 5MB (fixed grid)
- **Location**: Always local with user
- **Loss impact**: Catastrophic — intelligence is lost

### Cold Memory (Disposable)
- **What it stores**: Raw content, facts, documents
- **Size**: Unbounded
- **Location**: External (files, DBs, cloud)
- **Loss impact**: Recoverable — can be re-indexed

### The Bridge
The memory bridge ensures intelligence survives content loss:
- Content → Cold memory (replaceable)
- Relevance → Hot memory (irreplaceable)
- The system knows what mattered, even when content changes

## Usage Example

```python
from hot_memory import AtlanteanHotMemory
from vector_cold_memory import VectorColdMemory
from memory_bridge import AtlanteanMemoryBridge
from identity import AtlanteanIdentity
from sync import AtlanteanSyncEngine, MergeStrategy
from learning import apply_learning_signal, apply_outcome_signal

# Initialize with cryptographic identity
identity = AtlanteanIdentity(device_id="laptop-01")
hot = AtlanteanHotMemory.initialize(identity=identity)
cold = VectorColdMemory(embedder=my_embedding_function)
bridge = AtlanteanMemoryBridge(hot, cold, embedder=my_embedding_function)

# Ingest content
bridge.ingest("Important document text", {"relevance": 0.9})

# Recall
results = bridge.recall("what was important?")

# Apply learning signal based on interaction outcome
# This is where intelligence actually learns (NOT in the LLM)
apply_learning_signal(hot, signal_strength=0.5)

# Or apply outcome-based learning
apply_outcome_signal(hot, predicted=True, actual=True)

# Persist intelligence with signature (CRITICAL)
hot.save("core_state.bin", identity=identity)

# Sync across devices
sync = AtlanteanSyncEngine(identity)
package = sync.prepare_sync_package(hot)

# On another device
other_identity = AtlanteanIdentity(device_id="phone-01")
other_sync = AtlanteanSyncEngine(other_identity)
merged = other_sync.merge(other_hot, package, strategy=MergeStrategy.FIELD_AVERAGE)
```

## Persistence Guarantee

If you:
1. Delete all cold memory
2. Reattach different cold memory

The system still:
- ✅ Knows what kinds of things mattered
- ✅ Biases attention appropriately
- ✅ Shapes decisions based on learned patterns

This is **true intelligence persistence**.

## Cryptographic Identity

Each intelligence instance has a unique cryptographic identity:
- **Ed25519 keypair**: For signing all state updates
- **Device fingerprint**: Unique identifier for this instance
- **Signature verification**: Prevents corrupted or impostor states

### Why This Matters

Without identity:
- ❌ No way to verify state authenticity
- ❌ Malicious updates could corrupt intelligence
- ❌ Cannot distinguish between devices

With identity:
- ✅ Every update is cryptographically signed
- ✅ Corrupted states are detected and rejected
- ✅ Multi-device ownership is verifiable

## Multi-Device Sync

The sync engine provides **conflict-free merging** across devices using:

### Vector Clocks
- Detects concurrent updates (no false conflicts)
- Preserves causal ordering
- Enables offline-first operation

### Field-Physics Merging
Unlike traditional CRDTs that use simple rules (last-write-wins, counters),
Atlantean fields are merged using **physics-inspired strategies**:

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `FIELD_AVERAGE` | Average field values | Preserve total energy |
| `MAX_ENERGY` | Take maximum signals | Preserve strongest patterns |
| `LAST_WRITE_WINS` | Simple overwrite | Emergency fallback |

### Conflict Resolution Example

```
Device A (laptop): φ₁ = [0.5, 0.8, 0.3, ...]
Device B (phone):  φ₁ = [0.4, 0.9, 0.2, ...]

Concurrent update detected!

FIELD_AVERAGE merge:
φ₁ = [0.45, 0.85, 0.25, ...]  ← Preserves both perspectives

MAX_ENERGY merge:
φ₁ = [0.5, 0.9, 0.3, ...]     ← Takes strongest signal per location
```

### Sync Guarantees

✅ **Eventual consistency**: All devices converge to same state  
✅ **Causal ordering**: No lost updates from causality violations  
✅ **Offline-safe**: Changes accumulate and merge when reconnected  
✅ **Identity-verified**: Only authenticated devices can sync  

This is **true distributed intelligence**.

## Learning Architecture

### Critical Principle: Learning Happens ONLY in Hot Memory

```
❌ LLM does NOT learn
   - Stateless function
   - No weight updates
   - No memory accumulation
   
✅ Hot Memory DOES learn
   - Field dynamics evolve
   - Patterns reinforce/decay
   - Decision topology adapts
```

### Learning Signals

Learning is driven by **interaction outcomes**, not LLM internals:

| Signal Type | Source | Effect |
|------------|--------|--------|
| **Reinforcement** | User confirmation, successful prediction | Increase φ₅, stabilize φ₁ |
| **Contradiction** | Correction, failed prediction | Decrease φ₅, destabilize φ₁ |
| **Relevance** | Successful retrieval | Localized φ₅ boost |
| **Outcome** | Prediction vs reality | Conditional reinforce/destabilize |

### Learning Functions

```python
from learning import (
    apply_learning_signal,      # General reinforcement
    apply_contradiction_signal, # Handle corrections
    apply_relevance_signal,     # Boost successful patterns
    apply_outcome_signal,       # Learn from predictions
    compute_learning_capacity,  # Check headroom
    consolidate_memory         # Lock in patterns
)
```

### Why This Matters

Traditional AI:
- Learning = Fine-tuning model weights (expensive, centralized)
- Memory = Prompt engineering (brittle, token-limited)
- Adaptation = Retraining (slow, requires compute cluster)

Atlantean Core:
- Learning = Field dynamics update (cheap, local)
- Memory = Hot/cold separation (durable, unbounded)
- Adaptation = Signal application (instant, runs on device)

**The LLM never learns. Only the fields learn.**

This is why intelligence can be user-owned.

## Server Architecture: Relay, Not Brain

The Atlantean architecture inverts the traditional AI model:

```
Traditional AI:
  User → Server (intelligence lives here) → User
  ❌ Server owns intelligence
  ❌ Server required for operation
  ❌ Vendor lock-in
  
Atlantean AI:
  Device (intelligence) ↔ Server (optional relay) ↔ Device (intelligence)
  ✅ Devices own intelligence
  ✅ Server is optional coordination
  ✅ Completely portable
```

### Server Capabilities (Minimal by Design)

The sync relay server is **intentionally dumb**:

```python
from server import SyncRelay

relay = SyncRelay()

# Device A uploads snapshot
relay.receive_snapshot(device_a.snapshot())

# Device B gets all other snapshots
snapshots = relay.broadcast("device-b")
```

**What the server does:**
- Holds latest snapshot per device (temporarily)
- Broadcasts snapshots to requesting devices
- Expires old snapshots (default: 1 hour)
- Provides device discovery

**What the server does NOT do:**
- ❌ Store intelligence long-term
- ❌ Modify fields
- ❌ Make decisions
- ❌ Learn anything
- ❌ Persist data durably

### Server-Optional Design

If the server disappears:
- ✅ All device intelligence survives (hot memory is local)
- ✅ Devices continue working offline
- ✅ Devices can sync peer-to-peer directly
- ✅ New relay can be created anywhere

The server is **infrastructure**, not intelligence.

### Deployment Options

**1. No Server (Peer-to-Peer)**
```python
# Direct device-to-device
from sync import sync_devices_simple
sync_devices_simple(laptop, phone)
```

**2. Simple Relay (In-Memory)**
```python
from server import SyncRelay
relay = SyncRelay(snapshot_ttl_seconds=3600)
# No persistence, no database
```

**3. REST API**
```python
# Flask/FastAPI wrapper (see server.py for example)
# Still stateless - snapshots expire
```

**4. WebSocket (Real-Time)**
```python
# aiohttp WebSocket relay (see server.py for example)
# Live broadcasts to connected devices
```

### Why This Matters

| Aspect | Traditional | Atlantean |
|--------|-------------|-----------|
| **Intelligence location** | Server | Device |
| **Server role** | Brain | Relay |
| **Offline capability** | None | Full |
| **Data ownership** | Vendor | User |
| **Server loss impact** | Intelligence destroyed | Coordination lost (recoverable) |
| **Privacy** | All data to server | Only field snapshots (optional) |

**Bottom line**: The server enables coordination, not intelligence.

## LLM Interface: Enforced Statelessness

The LLM interface strictly enforces that LLMs are **pure functions** with zero memory:

```python
from llm_interface import call_llm, call_llm_with_context

# ❌ FORBIDDEN: Conversation history
# messages = [{"role": "user", "content": "..."}]  # NO!

# ✅ CORRECT: Stateless call
response = call_llm("What is 2+2?")

# ✅ CORRECT: Context from hot memory
response = call_llm_with_context(user_input, hot_memory)
```

### What is NOT Allowed

The LLM interface actively prevents:

- ❌ **System prompts with memory** - Context must be derived fresh each time
- ❌ **Conversation replay** - No message history accumulation
- ❌ **Agent scratchpads** - No persistent working memory in LLM
- ❌ **Tool memory** - Tools can't store state across calls
- ❌ **Hidden context** - Every prompt is self-contained

### How Context Works

Context comes from **hot memory fields**, not conversation history:

```python
def call_llm_with_context(prompt, hot_memory):
    # Extract context from fields
    context = encode_fields(hot_memory.phi1, hot_memory.phi5, hot_memory.Phi)
    
    # Build self-contained prompt
    full_prompt = f"{context}\n\nUser: {prompt}"
    
    # Call LLM (stateless)
    response = call_llm(full_prompt)
    
    # Discard prompt - don't store it!
    return response
```

### Learning Flow (Correct)

```
1. User input
   ↓
2. Extract context from hot_memory fields
   ↓
3. Build self-contained prompt
   ↓
4. Call LLM (stateless, no history)
   ↓
5. Get response
   ↓
6. Apply learning signal to hot_memory
   ↓
7. Discard prompt and response
   ↓
8. Hot memory updated, LLM unchanged
```

**Key principle**: All learning happens in hot memory via signals, never in the LLM.

## Client Sync

The client sync loop provides safe, automatic synchronization:

```python
from client_sync import sync_once_safe, sync_loop

# Manual sync
result = sync_once_safe(hot_memory, relay)
print(f"Merged {result['merged_count']} devices")

# Background sync (every 60 seconds)
import threading
sync_thread = threading.Thread(
    target=sync_loop,
    args=(hot_memory, relay, 60),
    daemon=True
)
sync_thread.start()
```

### Offline-First

Sync handles network failures gracefully:

```python
from client_sync import can_sync, queue_for_sync

if can_sync(relay):
    sync_once_safe(hot_memory, relay)
else:
    queue_for_sync(hot_memory)  # Sync later when online
```

**Guarantee**: Sync failures never break local intelligence.
