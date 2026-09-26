
import { Conversation, Message } from '../types';
import { getSummary as fetchSummaryFromLLM } from './edenAiService';
const LEGACY_API_ERROR =
  'Legacy local conversation persistence is deprecated. Use Atlantean session + snapshot APIs from services/atlanteanService.ts.';

/** @deprecated Use Atlantean session/snapshot APIs instead. */
export const loadConversation = async (_id?: string): Promise<Conversation> => {
  throw new Error(LEGACY_API_ERROR);
};

/** @deprecated Use Atlantean session/snapshot APIs instead. */
export const saveConversation = async (_conversation: Conversation): Promise<void> => {
  throw new Error(LEGACY_API_ERROR);
};

/** @deprecated Use Atlantean snapshot delete APIs instead. */
export const deleteConversation = async (_id: string): Promise<void> => {
  throw new Error(LEGACY_API_ERROR);
};

/** @deprecated Use Atlantean listSnapshots instead. */
export const listConversations = async (): Promise<Conversation[]> => {
  throw new Error(LEGACY_API_ERROR);
};

/** @deprecated Use Atlantean export/import flows instead. */
export const shareConversation = async (_conversation: Conversation): Promise<{ shareUrl: string }> => {
  throw new Error(LEGACY_API_ERROR);
};

export const getSummary = async (messages: Message[]): Promise<string> => {
    return await fetchSummaryFromLLM(messages);
};
