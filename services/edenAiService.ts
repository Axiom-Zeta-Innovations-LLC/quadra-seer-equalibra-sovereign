
import { Message } from '../types';
import { resolveAtlanteanApiBaseOrThrow, getStableSessionId, getAtlanteanAuthHeaders } from './atlanteanService';

export const getSummary = async (messages: Message[]): Promise<string> => {
    if (messages.length < 2) {
        return "The conversation has just begun.";
    }

    try {
        const atlanteanApiBase = resolveAtlanteanApiBaseOrThrow();
        const historyText = messages.map(m => `${m.role}: ${m.content}`).join('\n');
        const response = await fetch(`${atlanteanApiBase}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAtlanteanAuthHeaders() },
            body: JSON.stringify({
                input: `Summarize this conversation in one concise sentence:\n\n${historyText}`,
                session_id: getStableSessionId(),
                llm_provider: 'local',
                cloud_escalation_consent: false,
            }),
        });
        if (!response.ok) throw new Error(`Backend responded ${response.status}`);
        const data = await response.json();
        return data?.response || data?.output || "A complex exchange of quantum data.";
    } catch (error) {
        console.error("Error fetching summary:", error);
        return "Could not generate a summary at this time.";
    }
};
