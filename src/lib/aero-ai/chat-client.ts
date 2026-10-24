import 'server-only';

export type AeroAiUserContentPart =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export type AeroAiChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | AeroAiUserContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: AeroAiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type AeroAiToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type AeroAiTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AeroAiChatRequest = {
  messages: AeroAiChatMessage[];
  tools?: AeroAiTool[];
  responseFormat?: 'json_object';
};

export type AeroAiChatResponse = {
  content: string;
  toolCalls: AeroAiToolCall[];
};

export interface AeroAiChatClient {
  generate(
    request: AeroAiChatRequest,
    options?: { signal?: AbortSignal; onText?: (text: string) => void },
  ): Promise<AeroAiChatResponse>;
}
