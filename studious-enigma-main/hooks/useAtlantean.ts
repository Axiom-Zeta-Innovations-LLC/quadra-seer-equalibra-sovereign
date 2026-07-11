/**
 * useAtlantean Hook
 * 
 * React hook for integrating Atlantean Intelligence into Quadra-Seer.
 * 
 * Usage:
 * ```tsx
 * const { query, status, triggerEvent, isHealthy } = useAtlantean();
 * 
 * // Process user input
 * const response = await query(userMessage);
 * 
 * // Trigger learning
 * await triggerEvent('user_confirmation');
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as atlantean from '../services/atlanteanService';
import { Role, type Message } from '../types';
import type { 
  AtlanteanStatus, 
  FieldData, 
  LearningEventType 
} from '../services/atlanteanService';

export interface RefreshTelemetryEntry {
  count: number;
  lastMs: number;
  averageMs: number;
  lastStartedAt: number | null;
  lastCompletedAt: number | null;
}

export interface RefreshTelemetry {
  status: RefreshTelemetryEntry;
  fields: RefreshTelemetryEntry;
}

const EMPTY_REFRESH_ENTRY: RefreshTelemetryEntry = {
  count: 0,
  lastMs: 0,
  averageMs: 0,
  lastStartedAt: null,
  lastCompletedAt: null,
};

export interface UseAtlanteanReturn {
  // Conversation state
  messages: Message[];

  // Current status
  status: AtlanteanStatus | null;
  fields: FieldData | null;
  isHealthy: boolean;
  isLoading: boolean;
  isRefreshingFields: boolean;
  error: string | null;
  refreshTelemetry: RefreshTelemetry;
  
  // Core functions
  query: (input: string, provider?: 'gemini' | 'edenai' | 'mock') => Promise<string>;
  triggerEvent: (event: LearningEventType, data?: Record<string, any>) => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  appendMessage: (message: Message) => void;
  clearMessages: () => void;
  
  // Simulation functions
  storeSimulation: (simulation: any, confidence?: number) => Promise<void>;
  recallSimulations: (searchQuery: string, limit?: number) => Promise<any[]>;
  
  // Snapshot functions
  createSnapshot: (label?: string) => Promise<any>;
  
  // Sync functions
  prepareSyncPackage: () => Promise<any>;
  mergeSyncPackage: (
    pkg: any,
    strategy?: 'conservative' | 'field_average' | 'last_write_wins' | 'max_energy' | 'max_plasticity'
  ) => Promise<void>;
  
  // Utilities
  refreshStatus: () => Promise<void>;
  refreshFields: () => Promise<void>;
  reset: () => Promise<void>;
}

export function useAtlantean(): UseAtlanteanReturn {
  const learningEventLastSentRef = useRef<Record<string, number>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<AtlanteanStatus | null>(null);
  const [fields, setFields] = useState<FieldData | null>(null);
  const [isHealthy, setIsHealthy] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshingFields, setIsRefreshingFields] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTelemetry, setRefreshTelemetry] = useState<RefreshTelemetry>({
    status: { ...EMPTY_REFRESH_ENTRY },
    fields: { ...EMPTY_REFRESH_ENTRY },
  });

  const recordRefreshTelemetry = useCallback((key: keyof RefreshTelemetry, startedAt: number, completedAt: number) => {
    const elapsedMs = Math.max(0, Math.round(completedAt - startedAt));
    setRefreshTelemetry((prev) => {
      const current = prev[key];
      const nextCount = current.count + 1;
      const nextAverageMs =
        nextCount === 1 ? elapsedMs : Math.round(((current.averageMs * current.count) + elapsedMs) / nextCount);

      return {
        ...prev,
        [key]: {
          count: nextCount,
          lastMs: elapsedMs,
          averageMs: nextAverageMs,
          lastStartedAt: Math.round(startedAt),
          lastCompletedAt: Math.round(completedAt),
        },
      };
    });
  }, []);

  const hydrateChatHistory = useCallback(async () => {
    try {
      const data = await atlantean.getChatHistory(80);
      const restored = (data.messages || []).map((msg, idx) => ({
        id: msg.id || `hist-${msg.timestamp}-${idx}`,
        role: msg.role === 'user' ? Role.USER : Role.BOT,
        content: msg.content,
      })) as Message[];
      setMessages(restored);
    } catch (err) {
      console.warn('Failed to hydrate chat history:', err);
    }
  }, []);
  
  // Check backend health on mount
  useEffect(() => {
    const checkBackend = async () => {
      const healthy = await atlantean.checkHealth();
      setIsHealthy(healthy);
      
      if (healthy) {
        await Promise.all([
          refreshStatus(),
          refreshFields(),
          hydrateChatHistory(),
        ]);
      } else {
        setError('Atlantean backend not running. Start with: python atlantean_backend.py');
      }
      
      setIsLoading(false);
    };
    
    checkBackend();
    
    // Refresh status every 30 seconds
    const interval = setInterval(async () => {
      if (isHealthy) {
        await refreshStatus();
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Refresh status
  const refreshStatus = useCallback(async () => {
    const startedAt = performance.now();
    try {
      const newStatus = await atlantean.getStatus();
      setStatus(newStatus);
      setError(null);
      recordRefreshTelemetry('status', startedAt, performance.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get status');
    }
  }, [recordRefreshTelemetry]);
  
  // Refresh fields
  const refreshFields = useCallback(async () => {
    setIsRefreshingFields(true);
    const startedAt = performance.now();
    try {
      const newFields = await atlantean.getFields();
      setFields(newFields);
      setError(null);
      recordRefreshTelemetry('fields', startedAt, performance.now());
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get fields';
      setError(errorMsg);
      console.error('Failed to get fields:', err);
    } finally {
      setIsRefreshingFields(false);
    }
  }, [recordRefreshTelemetry]);
  
  // Process query
  const query = useCallback(async (
    input: string,
    provider: 'gemini' | 'edenai' | 'mock' = 'mock'
  ): Promise<string> => {
    try {
      setError(null);
      const result = await atlantean.query(input, provider);
      setStatus(result.status);
      await refreshFields();
      return result.response;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Query failed';
      setError(errorMsg);
      throw err;
    }
  }, [refreshFields]);
  
  // Trigger learning event
  const triggerEvent = useCallback(async (
    event: LearningEventType,
    data: Record<string, any> = {}
  ): Promise<void> => {
    const now = Date.now();
    const lastSent = learningEventLastSentRef.current[event] || 0;
    if (now - lastSent < 1200) {
      return;
    }

    try {
      learningEventLastSentRef.current[event] = now;
      setError(null);
      const result = await atlantean.triggerLearningEvent(event, data);
      setStatus(result.status);
      await refreshFields();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Event trigger failed';
      setError(errorMsg);
      throw err;
    }
  }, [refreshFields]);

  const appendMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);
  
  // Store simulation
  const storeSimulation = useCallback(async (
    simulation: any,
    confidence: number = 0.5
  ): Promise<void> => {
    try {
      setError(null);
      await atlantean.storeSimulation(simulation, confidence);
      await refreshStatus();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to store simulation';
      setError(errorMsg);
      throw err;
    }
  }, [refreshStatus]);
  
  // Recall simulations
  const recallSimulations = useCallback(async (
    searchQuery: string,
    limit: number = 10
  ): Promise<any[]> => {
    try {
      setError(null);
      const result = await atlantean.recallSimulations(searchQuery, limit);
      // recallSimulations already returns the array directly
      return Array.isArray(result) ? result : (result as any).simulations ?? [];
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to recall simulations';
      setError(errorMsg);
      throw err;
    }
  }, []);
  
  // Create snapshot
  const createSnapshot = useCallback(async (label?: string): Promise<any> => {
    try {
      setError(null);
      const result = await atlantean.createSnapshot(label);
      return result.snapshot;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create snapshot';
      setError(errorMsg);
      throw err;
    }
  }, []);
  
  // Prepare sync package
  const prepareSyncPackage = useCallback(async (): Promise<any> => {
    try {
      setError(null);
      const result = await atlantean.prepareSyncPackage();
      return result.package;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to prepare sync';
      setError(errorMsg);
      throw err;
    }
  }, []);
  
  // Merge sync package
  const mergeSyncPackage = useCallback(async (
    pkg: any,
    strategy: 'conservative' | 'field_average' | 'last_write_wins' | 'max_energy' | 'max_plasticity' = 'conservative'
  ): Promise<void> => {
    try {
      setError(null);
      const result = await atlantean.mergeSyncPackage(pkg, strategy);
      setStatus(result.status);
      await refreshFields();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to merge sync';
      setError(errorMsg);
      throw err;
    }
  }, [refreshFields]);
  
  // Reset intelligence
  const reset = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      await atlantean.resetIntelligence();
      await refreshStatus();
      await refreshFields();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to reset';
      setError(errorMsg);
      throw err;
    }
  }, [refreshStatus, refreshFields]);
  
  return {
    messages,
    status,
    fields,
    isHealthy,
    isLoading,
    isRefreshingFields,
    error,
    refreshTelemetry,
    query,
    triggerEvent,
    setMessages,
    appendMessage,
    clearMessages,
    storeSimulation,
    recallSimulations,
    createSnapshot,
    prepareSyncPackage,
    mergeSyncPackage,
    refreshStatus,
    refreshFields,
    reset,
  };
}
