# client_sync.py
"""
Client-Side Sync Loop

Minimal, safe synchronization with optional relay server.

This module provides the device-side sync logic that:
1. Uploads local state snapshot to relay
2. Downloads remote snapshots from other devices
3. Merges remote states conservatively
4. Handles errors gracefully (sync failures don't break intelligence)
"""

import time
import logging
from typing import Optional
from sync import merge_hot_memories

logger = logging.getLogger(__name__)


def sync_with_network(hot_memory, relay, alpha=0.5):
    """
    Synchronize hot memory with network via relay server.
    
    This is the main sync loop function. It:
    1. Takes a snapshot of local state
    2. Uploads to relay
    3. Gets snapshots from other devices
    4. Merges each remote snapshot conservatively
    
    Args:
        hot_memory: AtlanteanHotMemory instance to sync
        relay: SyncRelay instance (or REST client wrapping it)
        alpha: Merge weight for remote contributions (default: 0.5)
        
    Returns:
        int: Number of remote snapshots merged
        
    Side effects:
        Modifies hot_memory in-place via merge operations
    """
    try:
        # 1. Snapshot local state
        local_snapshot = hot_memory.snapshot()
        
        # 2. Upload to relay
        relay.receive_snapshot(local_snapshot)
        logger.info(f"Uploaded snapshot version {local_snapshot['version']} to relay")
        
        # 3. Get snapshots from other devices
        remote_snapshots = relay.broadcast(hot_memory.device_id)
        
        if not remote_snapshots:
            logger.info("No remote snapshots available")
            return 0
        
        # 4. Merge each remote snapshot
        merge_count = 0
        for snap in remote_snapshots:
            remote_device = snap.get("device_id", "unknown")
            remote_version = snap.get("version", 0)
            
            try:
                merge_hot_memories(hot_memory, snap, alpha=alpha)
                logger.info(f"Merged snapshot from {remote_device} (version {remote_version})")
                merge_count += 1
            except Exception as e:
                logger.error(f"Failed to merge snapshot from {remote_device}: {e}")
                # Continue with other snapshots
        
        return merge_count
        
    except Exception as e:
        logger.error(f"Sync failed: {e}")
        # Sync failure does NOT break local intelligence
        # Hot memory remains valid
        return 0


def sync_loop(hot_memory, relay, interval_seconds=60, alpha=0.5):
    """
    Continuous background sync loop.
    
    Runs forever, syncing at regular intervals.
    Suitable for running in a background thread.
    
    Args:
        hot_memory: AtlanteanHotMemory instance
        relay: SyncRelay instance or client
        interval_seconds: How often to sync (default: 60s)
        alpha: Merge weight for remote contributions
        
    Note:
        This blocks forever. Run in a thread or async task.
    """
    logger.info(f"Starting sync loop (interval: {interval_seconds}s)")
    
    while True:
        try:
            merge_count = sync_with_network(hot_memory, relay, alpha=alpha)
            logger.info(f"Sync complete: merged {merge_count} remote snapshots")
        except Exception as e:
            logger.error(f"Sync loop error: {e}")
        
        time.sleep(interval_seconds)


def sync_once_safe(hot_memory, relay, alpha=0.5, timeout=10):
    """
    One-shot sync with timeout protection.
    
    Useful for manual sync triggers or apps that don't need continuous sync.
    
    Args:
        hot_memory: AtlanteanHotMemory instance
        relay: SyncRelay instance or client
        alpha: Merge weight
        timeout: Max seconds to wait (not yet implemented)
        
    Returns:
        dict: Sync result summary
    """
    start_time = time.time()
    
    try:
        merge_count = sync_with_network(hot_memory, relay, alpha=alpha)
        elapsed = time.time() - start_time
        
        return {
            "success": True,
            "merged_count": merge_count,
            "elapsed_seconds": elapsed,
            "new_version": hot_memory.version
        }
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"Sync failed after {elapsed:.2f}s: {e}")
        
        return {
            "success": False,
            "error": str(e),
            "elapsed_seconds": elapsed,
            "version": hot_memory.version  # Still valid
        }


# ========== Offline-First Helpers ==========

def can_sync(relay) -> bool:
    """
    Check if relay is reachable.
    
    Returns:
        bool: True if sync is possible
    """
    try:
        # Simple connectivity check
        relay.stats()
        return True
    except Exception:
        return False


def queue_for_sync(hot_memory, queue_path="sync_queue.json"):
    """
    Save snapshot to local queue for later sync.
    
    Use when relay is unreachable. Sync when back online.
    
    Args:
        hot_memory: AtlanteanHotMemory instance
        queue_path: Where to save queued snapshot
    """
    import json
    
    snapshot = hot_memory.snapshot()
    
    # Convert tensors to lists for JSON serialization
    serializable = {
        "phi1": snapshot["phi1"].tolist(),
        "phi5": snapshot["phi5"].tolist(),
        "Phi": snapshot["Phi"].tolist(),
        "Theta": snapshot["Theta"],
        "device_id": snapshot["device_id"],
        "version": snapshot["version"],
        "timestamp": snapshot["timestamp"]
    }
    
    with open(queue_path, 'w') as f:
        json.dump(serializable, f)
    
    logger.info(f"Queued snapshot version {snapshot['version']} for later sync")


# ========== Usage Examples ==========

"""
# Example 1: Manual sync
from client_sync import sync_once_safe
from server import SyncRelay

relay = SyncRelay()
result = sync_once_safe(hot_memory, relay)

if result["success"]:
    print(f"Synced {result['merged_count']} devices")
else:
    print(f"Sync failed: {result['error']}")


# Example 2: Background sync thread
import threading
from client_sync import sync_loop

relay_client = RelayClient("https://sync.example.com")
sync_thread = threading.Thread(
    target=sync_loop,
    args=(hot_memory, relay_client, 60),  # Sync every 60s
    daemon=True
)
sync_thread.start()


# Example 3: Offline-first sync
from client_sync import can_sync, queue_for_sync, sync_once_safe

if can_sync(relay):
    sync_once_safe(hot_memory, relay)
else:
    queue_for_sync(hot_memory)  # Sync later
"""
