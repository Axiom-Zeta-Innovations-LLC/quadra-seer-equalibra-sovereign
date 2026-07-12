import { Message, Role, FileData, ThinkingMode } from '../types';
import { getStableSessionId, resolveAtlanteanApiBaseOrThrow, getAtlanteanAuthHeaders } from './atlanteanService';
import { getCloudEscalationConsent, getLlmProvider } from './settingsService';

/**
 * Stream chat response through backend to keep API key secure.
 * 
 * SECURITY ARCHITECTURE:
 * ========================
 * 
 * ❌ NEVER call remote model APIs directly from the browser
 * ✅ ALWAYS route through /api/atlantean/query backend endpoint
 * 
 * Why:
 * - API keys injected into frontend builds are visible in browser memory
 * - Any user can extract the key and abuse it
 * - Backend keeps keys completely hidden from clients
 * 
 * Flow:
 * Browser → Backend Endpoint → Local/Cloud provider adapter
 * 
 * The backend at atlantean_backend.py:641 handles:
 * - Receiving user messages and file data
 * - Managing provider access securely
 * - Streaming responses back to frontend
 */
const streamChatResponse = async (
    history: Message[],
    newMessage: string,
    files: FileData[],
    mode: ThinkingMode
): Promise<any> => {
    const atlanteanApiBase = resolveAtlanteanApiBaseOrThrow();
    const queryEndpoint = `${atlanteanApiBase}/query`;
    const envProvider = (import.meta.env.VITE_LLM_PROVIDER || 'local').toString().toLowerCase();
    const settingsProvider = getLlmProvider();
    const configuredProvider = (settingsProvider || envProvider).toString().toLowerCase();
    const envCloudEscalationConsent = (import.meta.env.VITE_CLOUD_ESCALATION_CONSENT || '0').toString() === '1';
    const cloudEscalationConsent = getCloudEscalationConsent() || envCloudEscalationConsent;
    
    // Prepare file data for backend
    const fileData = files.map(f => ({
        name: f.name,
        type: f.type,
        content: f.content,
        extractedText: f.extractedText
    }));

    try {
        // Call secure backend endpoint
        // Backend handles Gemini API interaction with server-side API key
        const response = await fetch(queryEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAtlanteanAuthHeaders(),
            },
            body: JSON.stringify({
                input: newMessage,
                session_id: getStableSessionId(),
                // history is NOT sent — the backend reconstructs context from
                // Atlantean cold memory (stateless-LLM principle).
                files: fileData,
                mode: mode,
                llm_provider: configuredProvider,
                cloud_escalation_consent: cloudEscalationConsent,
            })
        });

        if (!response.ok) {
            throw new Error(`Backend query failed: ${response.status} ${response.statusText} (${queryEndpoint})`);
        }

        // Return parsed JSON from the backend. The Atlantean endpoint responds with
        // a structured payload containing the generated assistant text.
        return response.json();
    } catch (error) {
        const baseMessage = error instanceof Error ? error.message : String(error);
        // Network failures often surface as "Failed to fetch" in browsers.
        // Include endpoint and likely causes to speed up production debugging.
        if (baseMessage.includes('Failed to fetch')) {
            throw new Error(
                `Failed to query backend at ${queryEndpoint}: Failed to fetch. Check backend reachability, HTTPS certificate, and CORS ALLOWED_ORIGINS.`
            );
        }

        throw new Error(`Failed to query backend at ${queryEndpoint}: ${baseMessage}`);
    }
};

export { streamChatResponse };
export default streamChatResponse;
