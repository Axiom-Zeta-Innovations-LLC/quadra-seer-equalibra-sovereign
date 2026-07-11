#!/usr/bin/env python3
"""
Atlantean Core - Web GUI

Interactive visualization of the Atlantean Intelligence Core.
Shows field dynamics, learning, sync, and memory in real-time.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'atlantean_core'))

from flask import Flask, render_template, request, jsonify
import torch
import numpy as np
import json
from datetime import datetime

from hot_memory import AtlanteanHotMemory
from vector_cold_memory import VectorColdMemory
from memory_bridge import AtlanteanMemoryBridge
from identity import AtlanteanIdentity
from learning import apply_learning_signal, apply_contradiction_signal, compute_learning_capacity
from sync import merge_hot_memories
from server import SyncRelay

app = Flask(__name__)

# Global state
hot_memory = None
cold_memory = None
bridge = None
identity = None
relay = SyncRelay()
devices = {}  # Store multiple device instances

def simple_embedder(text):
    """Simple embedder for demo"""
    np.random.seed(hash(str(text)) % (2**32))
    return np.random.randn(128)

def initialize_system():
    global hot_memory, cold_memory, bridge, identity
    
    try:
        identity = AtlanteanIdentity(device_id="web-gui", metadata={"platform": "web"})
    except:
        identity = None
    
    hot_memory = AtlanteanHotMemory.initialize(
        grid_size=(16, 16),
        identity=identity,
        device_id="web-gui"
    )
    
    cold_memory = VectorColdMemory(embedder=simple_embedder)
    bridge = AtlanteanMemoryBridge(hot_memory, cold_memory, embedder=simple_embedder)
    
    # Add some initial content
    initial_docs = [
        ("The Atlantean algorithm uses field dynamics for intelligence.", {"relevance": 0.9}),
        ("Hot memory stores what matters, not raw facts.", {"relevance": 0.8}),
        ("LLMs are stateless translation functions.", {"relevance": 0.7}),
    ]
    
    for content, metadata in initial_docs:
        bridge.ingest(content, metadata)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/status')
def status():
    if hot_memory is None:
        initialize_system()
    
    return jsonify({
        'version': hot_memory.version,
        'device_id': hot_memory.device_id,
        'learning_capacity': float(compute_learning_capacity(hot_memory)),
        'cold_items': len(cold_memory.items),
        'phi1_stats': {
            'mean': float(hot_memory.phi1.mean()),
            'std': float(hot_memory.phi1.std()),
            'min': float(hot_memory.phi1.min()),
            'max': float(hot_memory.phi1.max())
        },
        'phi5_stats': {
            'mean': float(hot_memory.phi5.mean()),
            'std': float(hot_memory.phi5.std()),
            'min': float(hot_memory.phi5.min()),
            'max': float(hot_memory.phi5.max())
        },
        'Phi': float(hot_memory.Phi.item()),
        'fingerprint': identity.fingerprint() if identity else None
    })

@app.route('/api/fields')
def get_fields():
    if hot_memory is None:
        initialize_system()
    
    return jsonify({
        'phi1': hot_memory.phi1.tolist(),
        'phi5': hot_memory.phi5.tolist(),
        'shape': list(hot_memory.phi1.shape)
    })

@app.route('/api/learn', methods=['POST'])
def learn():
    data = request.json
    strength = data.get('strength', 0.5)
    
    apply_learning_signal(hot_memory, signal_strength=strength)
    
    return jsonify({
        'success': True,
        'new_version': hot_memory.version,
        'learning_capacity': float(compute_learning_capacity(hot_memory))
    })

@app.route('/api/contradict', methods=['POST'])
def contradict():
    apply_contradiction_signal(hot_memory)
    
    return jsonify({
        'success': True,
        'new_version': hot_memory.version,
        'learning_capacity': float(compute_learning_capacity(hot_memory))
    })

@app.route('/api/ingest', methods=['POST'])
def ingest():
    data = request.json
    content = data.get('content', '')
    relevance = data.get('relevance', 0.5)
    
    bridge.ingest(content, {'relevance': relevance})
    
    return jsonify({
        'success': True,
        'total_items': len(cold_memory.items)
    })

@app.route('/api/recall', methods=['POST'])
def recall():
    data = request.json
    query = data.get('query', '')
    
    results = bridge.recall(query)
    
    return jsonify({
        'success': True,
        'results': [
            {
                'content': item.content,
                'relevance': item.metadata.get('relevance', 0)
            }
            for item in results[:5]
        ]
    })

@app.route('/api/sync/create_device', methods=['POST'])
def create_device():
    data = request.json
    device_id = data.get('device_id', f'device-{len(devices)}')
    
    device = AtlanteanHotMemory.initialize(grid_size=(16, 16), device_id=device_id)
    devices[device_id] = device
    
    return jsonify({
        'success': True,
        'device_id': device_id,
        'total_devices': len(devices)
    })

@app.route('/api/sync/merge', methods=['POST'])
def sync_merge():
    data = request.json
    device_id = data.get('device_id')
    alpha = data.get('alpha', 0.5)
    
    if device_id not in devices:
        return jsonify({'success': False, 'error': 'Device not found'})
    
    snapshot = devices[device_id].snapshot()
    merge_hot_memories(hot_memory, snapshot, alpha=alpha)
    
    return jsonify({
        'success': True,
        'new_version': hot_memory.version,
        'merged_from': device_id
    })

@app.route('/api/reset')
def reset():
    initialize_system()
    devices.clear()
    
    return jsonify({
        'success': True,
        'message': 'System reset'
    })

if __name__ == '__main__':
    initialize_system()
    print("\n" + "=" * 60)
    print("ATLANTEAN CORE - WEB GUI")
    print("=" * 60)
    print("\nStarting web server...")
    print("Open your browser to: http://localhost:5000")
    print("\nPress Ctrl+C to stop")
    print("=" * 60 + "\n")
    
    app.run(debug=True, host='0.0.0.0', port=5000)
