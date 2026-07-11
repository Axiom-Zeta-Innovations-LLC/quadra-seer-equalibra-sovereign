# server.py
"""
Stateless Sync Relay Server

CRITICAL PRINCIPLE: The server is NOT intelligent.
It is a dumb relay. A mailbox. A coordination point.

The server:
❌ Does NOT store intelligence
❌ Does NOT learn
❌ Does NOT modify fields
❌ Does NOT make decisions
❌ Does NOT persist snapshots long-term

The server:
✅ Relays snapshots between devices
✅ Provides temporary coordination
✅ Enables discovery
✅ That's it.

Intelligence lives on devices. Server is optional infrastructure.
"""

import time
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta


@dataclass
class SnapshotMetadata:
    """Minimal metadata about a relayed snapshot."""
    device_id: str
    version: int
    timestamp: float
    received_at: float
    signature: Optional[str] = None


class SyncRelay:
    """
    Minimal stateless relay for device-to-device sync.
    
    This server does NOT:
    - Store intelligence
    - Modify fields
    - Make decisions
    - Persist data long-term
    
    This server DOES:
    - Hold latest snapshot per device (temporarily)
    - Broadcast snapshots to requesting devices
    - Expire old snapshots
    - That's it.
    """
    
    def __init__(self, snapshot_ttl_seconds: int = 3600):
        """
        Args:
            snapshot_ttl_seconds: How long to keep snapshots before expiring them
                                  Default: 1 hour
        """
        self.latest_snapshots: Dict[str, dict] = {}
        self.metadata: Dict[str, SnapshotMetadata] = {}
        self.ttl = snapshot_ttl_seconds
    
    def receive_snapshot(self, snapshot: dict):
        """
        Receive a snapshot from a device.
        
        Replaces any previous snapshot from the same device.
        This is not permanent storage - just a temporary relay point.
        
        Args:
            snapshot: Dict from AtlanteanHotMemory.snapshot()
        """
        device_id = snapshot["device_id"]
        
        # Store the snapshot (replaces previous)
        self.latest_snapshots[device_id] = snapshot
        
        # Track metadata
        self.metadata[device_id] = SnapshotMetadata(
            device_id=device_id,
            version=snapshot["version"],
            timestamp=snapshot["timestamp"],
            received_at=time.time(),
            signature=snapshot.get("signature")
        )
    
    def broadcast(self, requesting_device_id: str) -> List[dict]:
        """
        Get all snapshots except the requester's own.
        
        This allows a device to sync with all other devices via the relay.
        
        Args:
            requesting_device_id: Device ID of the requester
            
        Returns:
            List of snapshots from other devices
        """
        self._expire_old_snapshots()
        
        return [
            snap for did, snap in self.latest_snapshots.items()
            if did != requesting_device_id
        ]
    
    def get_snapshot(self, device_id: str) -> Optional[dict]:
        """
        Get the latest snapshot from a specific device.
        
        Args:
            device_id: Device to get snapshot from
            
        Returns:
            Snapshot dict or None if not available
        """
        self._expire_old_snapshots()
        return self.latest_snapshots.get(device_id)
    
    def list_devices(self) -> List[SnapshotMetadata]:
        """
        List all devices with available snapshots.
        
        Returns:
            List of metadata for each known device
        """
        self._expire_old_snapshots()
        return list(self.metadata.values())
    
    def _expire_old_snapshots(self):
        """Remove snapshots older than TTL."""
        now = time.time()
        expired = [
            did for did, meta in self.metadata.items()
            if now - meta.received_at > self.ttl
        ]
        
        for device_id in expired:
            self.latest_snapshots.pop(device_id, None)
            self.metadata.pop(device_id, None)
    
    def clear(self):
        """Clear all snapshots (for testing or manual reset)."""
        self.latest_snapshots.clear()
        self.metadata.clear()
    
    def stats(self) -> dict:
        """
        Get relay statistics.
        
        Returns:
            Dict with current relay state info
        """
        self._expire_old_snapshots()
        
        if not self.metadata:
            return {
                "device_count": 0,
                "total_snapshots": 0,
                "oldest_snapshot": None,
                "newest_snapshot": None
            }
        
        timestamps = [meta.received_at for meta in self.metadata.values()]
        
        return {
            "device_count": len(self.latest_snapshots),
            "total_snapshots": len(self.latest_snapshots),
            "oldest_snapshot": datetime.fromtimestamp(min(timestamps)).isoformat(),
            "newest_snapshot": datetime.fromtimestamp(max(timestamps)).isoformat(),
            "devices": [meta.device_id for meta in self.metadata.values()]
        }


# ========== Optional: REST API Wrapper ==========

"""
Example Flask/FastAPI wrapper:

from flask import Flask, request, jsonify

app = Flask(__name__)
relay = SyncRelay()

@app.route('/snapshot', methods=['POST'])
def post_snapshot():
    snapshot = request.json
    relay.receive_snapshot(snapshot)
    return jsonify({"status": "received"})

@app.route('/snapshots/<device_id>', methods=['GET'])
def get_snapshots(device_id):
    snapshots = relay.broadcast(device_id)
    return jsonify({"snapshots": snapshots})

@app.route('/devices', methods=['GET'])
def list_devices():
    devices = relay.list_devices()
    return jsonify({"devices": [d.__dict__ for d in devices]})

@app.route('/stats', methods=['GET'])
def stats():
    return jsonify(relay.stats())
"""


# ========== Optional: WebSocket Relay ==========

"""
For real-time sync, use WebSocket:

import asyncio
from aiohttp import web

relay = SyncRelay()
connections = {}

async def websocket_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    device_id = request.match_info['device_id']
    connections[device_id] = ws
    
    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                snapshot = json.loads(msg.data)
                relay.receive_snapshot(snapshot)
                
                # Broadcast to all other devices
                for other_id, other_ws in connections.items():
                    if other_id != device_id:
                        await other_ws.send_json(snapshot)
    finally:
        connections.pop(device_id, None)
    
    return ws
"""


# ========== The Point ==========

"""
This server has ZERO intelligence.

It is not:
- A database (snapshots expire)
- A brain (no learning)
- An authority (devices are authoritative)
- Required (devices can sync peer-to-peer)

It is:
- A relay (temporary coordination)
- Optional (devices work offline)
- Replaceable (any relay works)
- Stateless (no persistence guarantees)

If this server disappears:
✅ All device intelligence survives
✅ Devices continue working offline
✅ Devices can sync peer-to-peer
✅ New relay can be spun up anywhere

This is the inversion:
Traditional AI: Intelligence lives on servers
Atlantean AI: Intelligence lives on devices, servers are optional relays
"""
