import type { CopilotReply } from '../services/llm';
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  reply?: CopilotReply;
  source?: 'cloud' | 'local';
  modelName?: string;
  time: string;
  animate: boolean;
}
export interface InvestigationChat {
  messages: ChatMessage[];
  draft: string;
  initialQuery: string | null;
  scrollTop: number;
}
