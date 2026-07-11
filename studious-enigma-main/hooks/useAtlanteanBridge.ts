/**
 * useAtlanteanBridge Hook
 * 
 * React hook for managing Atlantean Intelligence Core state.
 * Replaces traditional conversation history with persistent intelligence fields.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as AtlanteanService from '../services/atlanteanService';

const LEARNING_EVENT_MIN_INTERVAL_MS = 1200;
const OFFLINE_CACHED_FIELDS_MESSAGE = 'Intelligence offline – using cached fields';

export interface AtlanteanBridgeState {
  status: AtlanteanService.AtlanteanStatus | null;
  fields: AtlanteanService.FieldData | null;
  isLoading: boolean;
  error: string | null;
}

export function useAtlanteanBridge() {
  const [state, setState] = useState<AtlanteanBridgeState>({
    status: null,
    fields: null,
    isLoading: false,
    error: null
  });
  
  const saveIntervalRef = useRef<NodeJS.Timeout>();
  const learningEventLastSentRef = useRef<Record<string, number>>({});

  const getFieldsCacheKey = useCallback(() => {
    return `atlantean.cached.fields:${AtlanteanService.getStableSessionId()}`;
  }, []);

  const saveFieldsToCache = useCallback((fields: AtlanteanService.FieldData) => {
    try {
      localStorage.setItem(getFieldsCacheKey(), JSON.stringify(fields));
    } catch {
      // Ignore local cache write failures.
    }
  }, [getFieldsCacheKey]);

  const loadCachedFields = useCallback((): AtlanteanService.FieldData | null => {
    try {
      const raw = localStorage.getItem(getFieldsCacheKey());
      if (!raw) return null;
      return JSON.parse(raw) as AtlanteanService.FieldData;
    } catch {
      return null;
    }
  }, [getFieldsCacheKey]);

  // Initialize on mount
  useEffect(() => {
    loadStatus();
    loadFields();
    
    // Auto-refresh status every 30 seconds
    const interval = setInterval(() => {
      loadStatus();
    }, 30000);
    
    return () => {
      clearInterval(interval);
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, []);

  const loadStatus = async () => {
    try {
      const status = await AtlanteanService.getStatus();
      setState(prev => ({ ...prev, status, error: null }));
    } catch (err) {
      const cachedFields = loadCachedFields();
      setState(prev => ({ 
        ...prev, 
        error: cachedFields
          ? OFFLINE_CACHED_FIELDS_MESSAGE
          : (err instanceof Error ? err.message : 'Failed to load status') 
      }));
    }
  };

  const loadFields = async () => {
    try {
      const fields = await AtlanteanService.getFields();
      saveFieldsToCache(fields);
      setState(prev => ({ ...prev, fields, error: null }));
    } catch (err) {
      const cachedFields = loadCachedFields();
      if (cachedFields) {
        setState(prev => ({
          ...prev,
          fields: cachedFields,
          error: OFFLINE_CACHED_FIELDS_MESSAGE,
        }));
      } else {
        console.warn('Failed to load fields:', err);
      }
    }
  };

  /**
   * Query the Atlantean-powered LLM
   * This is stateless - context comes from hot memory, not conversation history
   */
  const query = useCallback(async (
    input: string, 
    apiKey?: string
  ): Promise<string> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = await AtlanteanService.query(input, 'gemini', apiKey);
      
      // Update status after query
      setState(prev => ({ 
        ...prev, 
        status: result.status, 
        isLoading: false 
      }));
      
      // Refresh fields
      loadFields();
      
      return result.response;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Query failed';
      setState(prev => ({ ...prev, isLoading: false, error }));
      throw err;
    }
  }, []);

  /**
   * Trigger a learning event
   * This trains the intelligence based on user interaction
   */
  const triggerLearning = useCallback(async (
    event: AtlanteanService.LearningEventType,
    data?: any
  ) => {
    const now = Date.now();
    const lastSent = learningEventLastSentRef.current[event] || 0;
    if (now - lastSent < LEARNING_EVENT_MIN_INTERVAL_MS) {
      return;
    }

    try {
      learningEventLastSentRef.current[event] = now;
      const result = await AtlanteanService.triggerLearningEvent(event, data);
      setState(prev => ({ ...prev, status: result.status }));
      loadFields();
    } catch (err) {
      console.error('Learning event failed:', err);
    }
  }, [loadFields]);

  /**
   * Store a simulation in cold memory
   */
  const storeSimulation = useCallback(async (
    simulation: any,
    confidence: number = 0.5
  ) => {
    try {
      await AtlanteanService.storeSimulation(simulation, confidence);
    } catch (err) {
      console.error('Failed to store simulation:', err);
    }
  }, []);

  /**
   * Recall simulations from cold memory
   */
  const recallSimulations = useCallback(async (
    query: string
  ): Promise<any[]> => {
    try {
      return await AtlanteanService.recallSimulations(query);
    } catch (err) {
      console.error('Failed to recall simulations:', err);
      return [];
    }
  }, []);

  /**
   * Get a snapshot for Neural Archives
   */
  const createSnapshot = useCallback(async (label?: string) => {
    try {
      return await AtlanteanService.createSnapshot(label);
    } catch (err) {
      console.error('Failed to create snapshot:', err);
      return null;
    }
  }, []);

  /**
   * Verify deterministic replay integrity proof.
   */
  const replayIntegrityProof = useCallback(async () => {
    try {
      return await AtlanteanService.replayIntegrityProof();
    } catch (err) {
      console.error('Failed to compute replay integrity proof:', err);
      throw err;
    }
  }, []);

  /**
   * Reset intelligence state (for testing/demo)
   */
  const reset = useCallback(async () => {
    try {
      await AtlanteanService.reset();
      await loadStatus();
      await loadFields();
    } catch (err) {
      console.error('Failed to reset:', err);
    }
  }, []);

  return {
    // State
    status: state.status,
    fields: state.fields,
    isLoading: state.isLoading,
    error: state.error,
    
    // Actions
    query,
    triggerLearning,
    storeSimulation,
    recallSimulations,
    createSnapshot,
    replayIntegrityProof,
    reset,
    
    // Refresh
    refresh: loadStatus,
    refreshFields: loadFields,
  };
}
