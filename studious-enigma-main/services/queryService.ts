import { Message, Role, FileData, ThinkingMode } from '../types';
import { getStableSessionId, resolveAtlanteanApiBaseOrThrow, getAtlanteanAuthHeaders } from './atlanteanService';
import { getCloudEscalationConsent, getLlmProvider } from './settingsService';

/**
 * streamQueryTokens — token-by-token streaming via SSE.
 *
 * Connects to POST /api/atlantean/query/stream and calls `onToken` for each
 * arriving token, `onDone` with final metadata, and `onError` on failure.
 * Returns a cancel function.
 */
export function streamQueryTokens(
    input: string,
    options: {
        files?: FileData[];
        sessionId?: string;
        onToken: (token: string) => void;
        onDone: (meta: { response: string; session_id: string }) => void;
        onError: (err: string) => void;
    },
): () => void {
    const ctrl = new AbortController();
    const base = resolveAtlanteanApiBaseOrThrow();
    const authH = getAtlanteanAuthHeaders();
    const provider = getLlmProvider();
    const consent = getCloudEscalationConsent();
    const sessionId = options.sessionId || getStableSessionId();

    const fileData = (options.files || []).map(f => ({
        name: f.name, type: f.type, content: f.content, extractedText: f.extractedText,
    }));

    fetch(`${base}/query/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({
            input,
            session_id: sessionId,
            files: fileData,
            llm_provider: provider,
            cloud_escalation_consent: consent,
        }),
        signal: ctrl.signal,
    })
        .then(async (res) => {
            if (!res.ok) {
                options.onError(`Streaming endpoint ${res.status}: ${res.statusText}`);
                return;
            }
            const reader = res.body?.getReader();
            if (!reader) { options.onError('No response body'); return; }
            const dec = new TextDecoder();
            let buf = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                const lines = buf.split('\n');
                buf = lines.pop() ?? '';
                for (const line of lines) {
                    const trimmed = line.replace(/^data:\s*/, '').trim();
                    if (!trimmed) continue;
                    try {
                        const evt = JSON.parse(trimmed) as Record<string, any>;
                        if (evt.done) {
                            options.onDone({ response: evt.response || '', session_id: evt.session_id || '' });
                            return;
                        }
                        if (evt.token) options.onToken(evt.token);
                    } catch {}
                }
            }
        })
        .catch((e) => {
            if (e.name !== 'AbortError') options.onError(String(e));
        });

    return () => ctrl.abort();
}

/**
 * streamChatResponse — full-response (non-streaming) path.
 * Routes through the Python backend's /api/atlantean/query endpoint.
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
