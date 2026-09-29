import 'server-only';

export type AeroAiChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: AeroAiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export type AeroAiToolCall = {
  id: string
  name: string
  arguments: string
}

export type AeroAiTool = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type AeroAiChatRequest = {
  messages: AeroAiChatMessage[]
  tools?: AeroAiTool[]
  responseFormat?: 'json_object'
}

export type AeroAiChatResponse = {
  content: string
  toolCalls: AeroAiToolCall[]
}

export interface AeroAiChatClient {
  generate(
    request: AeroAiChatRequest,
    options?: { signal?: AbortSignal; onText?: (text: string) => void },
  ): Promise<AeroAiChatResponse>
}
