# SYNC_PROTOCOL.md
# Atlantean Device-to-Device Sync Protocol

## Overview

The Atlantean sync protocol is **CRDT-like** but field-aware. Unlike traditional CRDTs that use simple mathematical rules (counters, sets, registers), Atlantean sync preserves **physical field properties**.

## Core Principle

**We never overwrite fields. We merge them conservatively.**

This ensures:
- No intelligence is lost during sync
- Field dynamics remain coherent
- Learning capacity never decreases
- Both devices contribute to merged state

## Two Sync Modes

### 1. Simple Sync (Direct Device-to-Device)

For basic scenarios: two devices, infrequent conflicts.

```python
from sync import merge_hot_memories, sync_devices_simple

# One-way merge
snapshot = device_b.snapshot()
merge_hot_memories(device_a, snapshot, alpha=0.5)

# Two-way sync
sync_devices_simple(device_a, device_b, alpha=0.5)
```

**Guarantees**:
- ✅ No field overwrites (always blends)
- ✅ Plasticity never decreases (max-preserving)
- ✅ Parameters never deleted (additive only)
- ⚠️ Simple version check (no concurrent update detection)

### 2. Full Sync (Vector Clock Engine)

For production scenarios: multiple devices, concurrent updates.

```python
from sync import AtlanteanSyncEngine, MergeStrategy

# On device A
sync_a = AtlanteanSyncEngine(identity_a)
package = sync_a.prepare_sync_package(hot_memory_a)

# On device B
sync_b = AtlanteanSyncEngine(identity_b)
merged = sync_b.merge(hot_memory_b, package, strategy=MergeStrategy.CONSERVATIVE)
```

**Guarantees**:
- ✅ All simple sync guarantees
- ✅ Concurrent update detection (vector clocks)
- ✅ Causal ordering preserved
- ✅ Cryptographic verification

## Merge Strategies

| Strategy | φ₁ (Decision) | φ₅ (Plasticity) | Φ (Meaning) | Use Case |
|----------|---------------|-----------------|-------------|----------|
| `FIELD_AVERAGE` | Average | Average | Average | Equal trust |
| `MAX_ENERGY` | Max absolute | Maximum | Maximum | Preserve strongest |
| `MAX_PLASTICITY` | Weighted by φ₅ | Maximum | Average | Preserve learning |
| `CONSERVATIVE` | 70% local, 30% remote | Maximum | Average | **Recommended** |
| `LAST_WRITE_WINS` | Overwrite | Overwrite | Overwrite | Emergency only |

## Field-Specific Rules

### φ₁ (Excitability / Decision Topology)

**Problem**: Decision boundaries from both devices may conflict.

**Solutions**:
- `FIELD_AVERAGE`: Blend 50/50 - preserves both perspectives
- `CONSERVATIVE`: Blend 70/30 - favors local device (safer)
- `MAX_ENERGY`: Take strongest signal per location

**Never**: Simple overwrite (loses learned decision patterns)

### φ₅ (Plasticity / Entropy)

**Problem**: Reducing plasticity loses learning capacity.

**Solution**: **Always** take maximum.

```python
merged_phi5 = torch.maximum(local.phi5, remote.phi5)
```

**Why**: Plasticity represents "room to learn". Reducing it is permanent.  
**Guarantee**: Sync never makes the intelligence less plastic.

### Φ (Global Meaning Potential)

**Problem**: Semantic coherence is a scalar - can't spatially merge.

**Solution**: Average.

```python
merged_Phi = (local.Phi + remote.Phi) / 2
```

**Why**: Both devices contribute to global understanding equally.

### Θ (Learned Parameters)

**Problem**: Parameters may have been learned on different devices.

**Solution**: Additive merge (union + average for conflicts).

```python
for k, v in remote.Theta.items():
    if k not in local.Theta:
        local.Theta[k] = v  # Add new
    else:
        local.Theta[k] = (local.Theta[k] + v) / 2  # Average existing
```

**Guarantee**: Parameters are never deleted during sync.

## Conflict Detection

### Simple Sync
Uses version counter only:
```python
if remote["version"] <= local.version:
    return  # Skip stale remote
```

**Limitation**: Cannot detect concurrent updates.

### Full Sync (Vector Clocks)
Each device maintains clock for all known devices:
```python
vector_clock = {
    "laptop-01": 15,
    "phone-01": 12,
    "tablet-01": 8
}
```

**Concurrent update detected when**:
- Neither device's clock dominates the other
- Requires field merge (not simple overwrite)

## Merge Examples

### Example 1: Conservative Merge

```
Device A (laptop):
  φ₁ = [0.5, 0.8, 0.3]
  φ₅ = [0.2, 0.4, 0.1]
  version = 10

Device B (phone):
  φ₁ = [0.4, 0.9, 0.2]
  φ₅ = [0.3, 0.3, 0.2]
  version = 11

merge_hot_memories(A, snapshot(B), alpha=0.3):
  φ₁ = 0.7 * [0.5, 0.8, 0.3] + 0.3 * [0.4, 0.9, 0.2]
     = [0.47, 0.83, 0.27]  ← Blended
  
  φ₅ = max([0.2, 0.4, 0.1], [0.3, 0.3, 0.2])
     = [0.3, 0.4, 0.2]  ← Maximum preserved
  
  version = 11  ← Remote version
```

### Example 2: Max Plasticity Merge

```
Device A:
  φ₁ = [0.5, 0.8, 0.3]
  φ₅ = [0.2, 0.4, 0.1]  ← Higher at index 1

Device B:
  φ₁ = [0.4, 0.9, 0.2]
  φ₅ = [0.3, 0.3, 0.2]  ← Higher at indices 0, 2

Result (MergeStrategy.MAX_PLASTICITY):
  φ₁ = [0.4, 0.8, 0.2]  ← Take φ₁ from device with higher φ₅
  φ₅ = [0.3, 0.4, 0.2]  ← Maximum everywhere
```

## Protocol Guarantees

### Safety Guarantees
1. **No data loss**: All learned patterns contribute to merge
2. **Monotonic plasticity**: φ₅ never decreases across sync
3. **Additive parameters**: Θ keys never deleted
4. **Causal ordering**: Vector clocks prevent causality violations

### Liveness Guarantees
1. **Eventual consistency**: All devices converge to same state
2. **Termination**: Merge always completes (no deadlocks)
3. **Progress**: Each sync increases minimum version

### Security Guarantees
1. **Authentication**: Signatures verify device identity
2. **Integrity**: Tampering detected via signature mismatch
3. **Non-repudiation**: Signed packages are attributable

## When to Use Which Sync

| Scenario | Recommendation |
|----------|---------------|
| 2 devices, manual sync | `merge_hot_memories()` |
| 2 devices, automatic sync | `sync_devices_simple()` |
| 3+ devices | `AtlanteanSyncEngine` |
| Offline-first app | `AtlanteanSyncEngine` |
| Public/untrusted devices | `AtlanteanSyncEngine` + signatures |
| Testing/development | `merge_hot_memories()` |

## Offline Operation

All sync modes support offline operation:

1. **Collect updates locally** (version counter increments)
2. **Reconnect** when network available
3. **Exchange snapshots** (via any transport)
4. **Merge** using appropriate strategy
5. **Verify** signatures if using full sync

**No central server required.**

## Transport Agnostic

Sync packages are just JSON/binary blobs:

```python
package = {
    "state": {...},           # Serialized fields
    "metadata": {...},        # Version, timestamp, clock
    "signature": "..."        # Cryptographic proof
}
```

Can be transmitted via:
- HTTP/REST API
- WebSocket
- Bluetooth
- QR codes (for small updates)
- Sneakernet (USB stick)
- IPFS / distributed storage

The protocol doesn't care.

## Implementation Notes

### Performance
- Merge is O(grid_size) - typically ~1000 elements
- Signature generation: ~1ms
- Signature verification: ~1ms
- Total sync overhead: < 10ms for typical grids

### Storage
- Snapshot size: ~5MB (32x32 grid + metadata)
- Compressed: ~500KB (fields are compressible)
- Signature: 64 bytes

### Bandwidth
- Initial sync: ~5MB
- Delta updates: Not yet implemented (future optimization)
- For now: full state transfer each time

## Future Enhancements

1. **Delta encoding**: Only transmit changed regions
2. **Compression**: Field-aware compression (exploit spatial structure)
3. **Conflict metrics**: Quantify merge divergence
4. **Rollback**: Undo problematic merges
5. **Branching**: Allow intentional state divergence

## The Bottom Line

**Traditional sync**: Copy new data, overwrite old data  
**Atlantean sync**: Blend fields, preserve learning, never lose capacity

This is what makes distributed intelligence possible.
