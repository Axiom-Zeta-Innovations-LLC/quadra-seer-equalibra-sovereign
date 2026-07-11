#!/usr/bin/env python3
"""
Phase 1 Integration Test

Validates that Atlantean Backend is properly integrated with Quadra-Seer.
Tests all API endpoints and verifies field dynamics.
"""

import requests
import json
import time
import sys
import os

BASE_URL = os.getenv("ATLANTEAN_BASE_URL", "http://127.0.0.1:5001")
ATLANTEAN_API = f"{BASE_URL}/api/atlantean"

def print_header(text):
    print("\n" + "="*60)
    print(f"  {text}")
    print("="*60)

def test_health():
    """Test health endpoint"""
    print_header("Test 1: Health Check")
    response = requests.get(f"{BASE_URL}/health")
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'healthy'
    print(f"✅ Health check passed")
    print(f"   Service: {data['service']}")
    print(f"   Version: {data['version']}")

def test_status():
    """Test status endpoint"""
    print_header("Test 2: Get Status")
    response = requests.get(f"{ATLANTEAN_API}/status")
    assert response.status_code == 200
    data = response.json()
    print(f"✅ Status retrieved")
    print(f"   Device ID: {data['device_id']}")
    print(f"   Version: {data['version']}")
    print(f"   Learning Capacity: {data['learning_capacity']:.2%}")
    print(f"   φ₁ (Decision): {data['field_stats']['phi1_mean']:.4f}")
    print(f"   φ₅ (Plasticity): {data['field_stats']['phi5_mean']:.4f}")
    print(f"   Φ (Coherence): {data['field_stats']['Phi']:.4f}")
    return data

def test_query():
    """Test query endpoint"""
    print_header("Test 3: Process Query")
    payload = {
        "input": "What is the Atlantean Algorithm?",
        "llm_provider": "mock"
    }
    response = requests.post(
        f"{ATLANTEAN_API}/query",
        json=payload
    )
    assert response.status_code == 200
    data = response.json()
    print(f"✅ Query processed")
    print(f"   Input: {payload['input']}")
    print(f"   Response: {data['response']}")
    print(f"   Version after query: {data['status']['version']}")

def test_learning_events():
    """Test learning event triggers"""
    print_header("Test 4: Learning Events")
    
    events = [
        ('user_confirmation', {}),
        ('user_correction', {}),
        ('high_engagement', {}),
    ]
    
    for event_name, event_data in events:
        payload = {
            "event": event_name,
            "data": event_data
        }
        response = requests.post(
            f"{ATLANTEAN_API}/learning-event",
            json=payload
        )
        assert response.status_code == 200
        data = response.json()
        print(f"✅ Event '{event_name}' triggered")
        print(f"   Learning Capacity: {data['status']['learning_capacity']:.2%}")
        time.sleep(0.5)

def test_fields():
    """Test field visualization endpoint"""
    print_header("Test 5: Get Fields")
    response = requests.get(f"{ATLANTEAN_API}/fields")
    assert response.status_code == 200
    data = response.json()
    print(f"✅ Fields retrieved")
    print(f"   φ₁ shape: {len(data['phi1'])}x{len(data['phi1'][0])}")
    print(f"   φ₅ shape: {len(data['phi5'])}x{len(data['phi5'][0])}")
    print(f"   Stats:")
    print(f"     φ₁: {data['stats']['phi1_mean']:.4f} ± {data['stats']['phi1_std']:.4f}")
    print(f"     φ₅: {data['stats']['phi5_mean']:.4f} ± {data['stats']['phi5_std']:.4f}")

def test_simulation_storage():
    """Test simulation storage"""
    print_header("Test 6: Store Simulation")
    
    simulation = {
        "scenario": "Market crash test",
        "outcomes": ["30% drop", "recovery in 6 months"],
        "probability": 0.65,
        "timestamp": time.time()
    }
    
    payload = {
        "simulation": simulation,
        "confidence": 0.7
    }
    
    response = requests.post(
        f"{ATLANTEAN_API}/simulation/store",
        json=payload
    )
    assert response.status_code == 200
    print(f"✅ Simulation stored")
    
    # Try to recall it
    print("\n   Testing recall...")
    recall_payload = {
        "query": "market crash",
        "limit": 5
    }
    response = requests.post(
        f"{ATLANTEAN_API}/simulation/recall",
        json=recall_payload
    )
    assert response.status_code == 200
    data = response.json()
    print(f"✅ Simulations recalled: {len(data['simulations'])} found")
    if data['simulations']:
        print(f"   First result: {data['simulations'][0]['scenario']}")

def test_snapshot():
    """Test snapshot creation"""
    print_header("Test 7: Create Snapshot")
    
    payload = {"label": "Phase 1 Test Snapshot"}
    response = requests.post(
        f"{ATLANTEAN_API}/snapshot",
        json=payload
    )
    assert response.status_code == 200
    data = response.json()
    print(f"✅ Snapshot created")
    print(f"   Label: {data['snapshot']['label']}")
    print(f"   Version: {data['snapshot']['version']}")

def test_persistence():
    """Test state persistence"""
    print_header("Test 8: State Persistence")
    
    # Get initial status
    response1 = requests.get(f"{ATLANTEAN_API}/status")
    v1 = response1.json()['version']
    
    # Make a query to increment version
    requests.post(
        f"{ATLANTEAN_API}/query",
        json={"input": "test", "llm_provider": "mock"}
    )
    
    # Get updated status
    response2 = requests.get(f"{ATLANTEAN_API}/status")
    v2 = response2.json()['version']
    
    assert v2 > v1
    print(f"✅ State persisted across operations")
    print(f"   Version changed: {v1} → {v2}")

def run_all_tests():
    """Run all integration tests"""
    print("\n" + "█"*60)
    print("  ATLANTEAN + QUADRA-SEER INTEGRATION TEST")
    print("  Phase 1: Foundation Validation")
    print("█"*60)
    
    try:
        test_health()
        test_status()
        test_query()
        test_learning_events()
        test_fields()
        test_simulation_storage()
        test_snapshot()
        test_persistence()
        
        print_header("ALL TESTS PASSED ✅")
        print("\n🎉 Phase 1 Integration Complete!")
        print("\nThe Atlantean Intelligence Core is successfully")
        print("integrated with Quadra-Seer Intelligence.")
        print("\nNext: Proceed to Phase 2 (State Management)")
        print("="*60 + "\n")
        
        return 0
        
    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Cannot connect to Atlantean Backend")
        print("\nPlease start the backend server:")
        print("  python3 atlantean_backend.py")
        print("\nOr use the startup script:")
        print("  ./start_integration.sh")
        return 1
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        return 1
        
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(run_all_tests())
