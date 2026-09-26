/**
 * Atlantean Demo Component
 * 
 * Demonstrates integration between Quadra-Seer and Atlantean Core.
 * Shows field visualization, learning triggers, and status.
 * 
 * This is a Phase 1 proof-of-concept component.
 */

import React, { useEffect, useState } from 'react';
import { useAtlantean } from '../hooks/useAtlantean';

export const AtlanteanDemo: React.FC = () => {
  const {
    status,
    fields,
    isHealthy,
    isLoading,
    error,
    query,
    triggerEvent,
    refreshFields,
  } = useAtlantean();
  
  const [userInput, setUserInput] = useState('');
  const [response, setResponse] = useState('');
  const [processing, setProcessing] = useState(false);
  
  // Auto-refresh fields for visualization
  useEffect(() => {
    if (isHealthy) {
      const interval = setInterval(() => {
        refreshFields();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isHealthy, refreshFields]);
  
  const handleQuery = async () => {
    if (!userInput.trim()) return;
    
    setProcessing(true);
    try {
      const result = await query(userInput);
      setResponse(result);
    } catch (err) {
      console.error('Query failed:', err);
    }
    setProcessing(false);
  };
  
  const handleLearningEvent = async (event: string) => {
    try {
      await triggerEvent(event as any);
      alert(`Learning event "${event}" triggered!`);
    } catch (err) {
      console.error('Event failed:', err);
    }
  };
  
  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading Atlantean Core...</div>
      </div>
    );
  }
  
  if (!isHealthy) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          <h3>⚠️ Atlantean Backend Not Running</h3>
          <p>Start the backend server:</p>
          <code style={styles.code}>python atlantean_backend.py</code>
          <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
            Ensure the frontend can reach your configured backend API endpoint.
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2>🧠 Atlantean Intelligence Core</h2>
        <div style={styles.statusBadge}>
          {isHealthy ? '✅ Connected' : '❌ Disconnected'}
        </div>
      </div>
      
      {error && (
        <div style={styles.errorBanner}>{error}</div>
      )}
      
      {/* Status Display */}
      {status && (
        <div style={styles.statusCard}>
          <h3>Intelligence Status</h3>
          <div style={styles.statusGrid}>
            <div>
              <strong>Device:</strong> {status.device_id}
            </div>
            <div>
              <strong>Version:</strong> {status.version}
            </div>
            <div>
              <strong>Learning Capacity:</strong>{' '}
              {(status.learning_capacity * 100).toFixed(1)}%
            </div>
            <div>
              <strong>Memory Items:</strong> {status.cold_memory_items}
            </div>
            <div>
              <strong>φ₁ (Decision):</strong>{' '}
              {status.field_stats.phi1_mean.toFixed(3)}
            </div>
            <div>
              <strong>φ₅ (Plasticity):</strong>{' '}
              {status.field_stats.phi5_mean.toFixed(3)}
            </div>
            <div>
              <strong>Φ (Coherence):</strong>{' '}
              {status.field_stats.Phi.toFixed(3)}
            </div>
            <div>
              <strong>Last Update:</strong>{' '}
              {new Date(status.last_update).toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}
      
      {/* Query Interface */}
      <div style={styles.queryCard}>
        <h3>Test Query (Phase 1)</h3>
        <div style={styles.queryForm}>
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleQuery()}
            placeholder="Ask something..."
            style={styles.input}
            disabled={processing}
          />
          <button
            onClick={handleQuery}
            style={styles.button}
            disabled={processing || !userInput.trim()}
          >
            {processing ? 'Processing...' : 'Send'}
          </button>
        </div>
        
        {response && (
          <div style={styles.response}>
            <strong>Response:</strong>
            <p>{response}</p>
          </div>
        )}
      </div>
      
      {/* Learning Events */}
      <div style={styles.learningCard}>
        <h3>Learning Events</h3>
        <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
          These buttons trigger learning signals that modify the intelligence fields:
        </p>
        <div style={styles.buttonGrid}>
          <button
            style={styles.learningButton}
            onClick={() => handleLearningEvent('user_confirmation')}
          >
            👍 Confirm
          </button>
          <button
            style={styles.learningButton}
            onClick={() => handleLearningEvent('user_correction')}
          >
            ✏️ Correct
          </button>
          <button
            style={styles.learningButton}
            onClick={() => handleLearningEvent('high_engagement')}
          >
            ⚡ High Engagement
          </button>
          <button
            style={styles.learningButton}
            onClick={() => handleLearningEvent('low_engagement')}
          >
            💤 Low Engagement
          </button>
        </div>
      </div>
      
      {/* Field Visualization */}
      {fields && (
        <div style={styles.fieldsCard}>
          <h3>Field State</h3>
          <div style={styles.fieldStats}>
            <div>
              <strong>φ₁ Mean:</strong> {fields.stats.phi1_mean.toFixed(3)} ±{' '}
              {fields.stats.phi1_std.toFixed(3)}
            </div>
            <div>
              <strong>φ₅ Mean:</strong> {fields.stats.phi5_mean.toFixed(3)} ±{' '}
              {fields.stats.phi5_std.toFixed(3)}
            </div>
            <div>
              <strong>Learning:</strong> {(fields.learning_capacity * 100).toFixed(1)}%
            </div>
          </div>
          <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.7 }}>
            Full visualization coming in Phase 6 (Neural Archives integration)
          </p>
        </div>
      )}
      
      <div style={styles.footer}>
        <p>
          ✅ Phase 1 Complete: Atlantean Core connected to Quadra-Seer
        </p>
        <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>
          Next: Phase 2 - Replace state management with hot memory
        </p>
      </div>
    </div>
  );
};

// Inline styles for demo
const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '2rem',
    maxWidth: '1200px',
    margin: '0 auto',
    fontFamily: 'system-ui, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
  },
  statusBadge: {
    padding: '0.5rem 1rem',
    background: '#10b981',
    color: 'white',
    borderRadius: '0.5rem',
    fontWeight: 'bold',
  },
  loading: {
    textAlign: 'center',
    padding: '3rem',
    fontSize: '1.2rem',
  },
  error: {
    background: '#fef2f2',
    border: '2px solid #dc2626',
    borderRadius: '0.5rem',
    padding: '2rem',
    color: '#7f1d1d',
  },
  code: {
    display: 'block',
    background: '#1f2937',
    color: '#10b981',
    padding: '1rem',
    borderRadius: '0.5rem',
    marginTop: '1rem',
    fontFamily: 'monospace',
  },
  errorBanner: {
    background: '#fef2f2',
    border: '1px solid #dc2626',
    borderRadius: '0.5rem',
    padding: '1rem',
    marginBottom: '1rem',
    color: '#dc2626',
  },
  statusCard: {
    background: '#f3f4f6',
    borderRadius: '0.5rem',
    padding: '1.5rem',
    marginBottom: '1.5rem',
  },
  statusGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1rem',
    marginTop: '1rem',
  },
  queryCard: {
    background: '#ffffff',
    border: '2px solid #e5e7eb',
    borderRadius: '0.5rem',
    padding: '1.5rem',
    marginBottom: '1.5rem',
  },
  queryForm: {
    display: 'flex',
    gap: '1rem',
    marginTop: '1rem',
  },
  input: {
    flex: 1,
    padding: '0.75rem',
    border: '2px solid #d1d5db',
    borderRadius: '0.5rem',
    fontSize: '1rem',
  },
  button: {
    padding: '0.75rem 1.5rem',
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  response: {
    marginTop: '1rem',
    padding: '1rem',
    background: '#f0fdf4',
    borderRadius: '0.5rem',
    borderLeft: '4px solid #10b981',
  },
  learningCard: {
    background: '#fef3c7',
    borderRadius: '0.5rem',
    padding: '1.5rem',
    marginBottom: '1.5rem',
  },
  buttonGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '1rem',
  },
  learningButton: {
    padding: '0.75rem',
    background: '#f59e0b',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  fieldsCard: {
    background: '#dbeafe',
    borderRadius: '0.5rem',
    padding: '1.5rem',
    marginBottom: '1.5rem',
  },
  fieldStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginTop: '1rem',
  },
  footer: {
    textAlign: 'center',
    padding: '2rem',
    borderTop: '2px solid #e5e7eb',
    marginTop: '2rem',
  },
};
