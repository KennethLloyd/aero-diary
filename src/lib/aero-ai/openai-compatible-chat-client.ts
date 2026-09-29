import 'server-only';

import { z } from 'zod';
import type {
  AeroAiChatClient,
  AeroAiChatMessage,
  AeroAiChatRequest,
  AeroAiChatResponse,
  AeroAiToolCall,
} from './chat-client';

type OpenAiCompatibleChatClientOptions = {
  baseUrl: string
  model: string
  reasoningEffort: string
  maxTokens: number
  timeoutMs: number
};

const toolCallSchema = z.object({
  index: z.number().int().nonnegative().optional(),
  id: z.string().optional(),
  function: z.object({
    name: z.string().optional(),
    arguments: z.string().optional(),
  }).optional(),
});

const streamedChunkSchema = z.object({
  choices: z.array(z.object({
    delta: z.object({
      content: z.string().nullable().optional(),
      tool_calls: z.array(toolCallSchema).optional(),
    }).optional(),
  })).optional(),
});

const completedResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().nullable().optional(),
      tool_calls: z.array(z.object({
        id: z.string(),
        function: z.object({ name: z.string(), arguments: z.string() }),
      })).optional(),
    }),
  })).min(1),
});

type PendingToolCall = { id: string; name: string; arguments: string }

export class OpenAiCompatibleChatClient implements AeroAiChatClient {
  private readonly endpoint: string;

  constructor(private readonly options: OpenAiCompatibleChatClientOptions) {
    this.endpoint = `${options.baseUrl.replace(/\/$/, '')}/chat/completions`;
  }

  async generate(
    request: AeroAiChatRequest,
    { signal: externalSignal, onText }: { signal?: AbortSignal; onText?: (text: string) => void } = {},
  ): Promise<AeroAiChatResponse> {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), this.options.timeoutMs);
    const signal = externalSignal
      ? AbortSignal.any([externalSignal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const stream = Boolean(onText);
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.options.model,
          messages: request.messages.map(toProviderMessage),
          reasoning_effort: this.options.reasoningEffort,
          max_tokens: this.options.maxTokens,
          ...(request.responseFormat ? { response_format: { type: request.responseFormat } } : {}),
          ...(request.tools?.length ? {
            tools: request.tools.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            })),
            tool_choice: 'auto',
          } : {}),
          stream,
        }),
        signal,
      });
      if (!response.ok) throw new Error(`LLM request failed with status ${response.status}.`);

      if (!stream) {
        const parsed = completedResponseSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('LLM returned an invalid chat response.');
        const message = parsed.data.choices[0].message;
        return {
          content: message.content?.trim() ?? '',
          toolCalls: (message.tool_calls ?? []).map((call) => ({
            id: call.id,
            name: call.function.name,
            arguments: call.function.arguments,
          })),
        };
      }

      if (!response.body) throw new Error('LLM returned no response stream.');
      return await readEventStream(response.body, onText);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function toProviderMessage(message: AeroAiChatMessage): Record<string, unknown> {
  if (message.role === 'tool') {
    return { role: message.role, tool_call_id: message.tool_call_id, content: message.content };
  }
  if (message.role === 'assistant' && message.tool_calls?.length) {
    return {
      role: 'assistant',
      content: message.content,
      tool_calls: message.tool_calls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }
  return { role: message.role, content: message.content };
}

async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onText?: (text: string) => void,
): Promise<AeroAiChatResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const toolCalls = new Map<number, PendingToolCall>();
  let content = '';
  let buffer = '';
  let finished = false;

  const consume = (event: string) => {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data || data === '[DONE]') {
      if (data === '[DONE]') finished = true;
      return;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      throw new Error('LLM returned an invalid stream event.');
    }
    const parsed = streamedChunkSchema.safeParse(raw);
    if (!parsed.success) throw new Error('LLM returned an invalid stream event.');
    const delta = parsed.data.choices?.[0]?.delta;
    if (!delta) return;

    if (delta.content) {
      content += delta.content;
      onText?.(delta.content);
    }
    for (const [position, call] of (delta.tool_calls ?? []).entries()) {
      const index = call.index ?? position;
      const pending = toolCalls.get(index) ?? { id: '', name: '', arguments: '' };
      if (call.id) pending.id = call.id;
      if (call.function?.name) pending.name += call.function.name;
      if (call.function?.arguments) pending.arguments += call.function.arguments;
      toolCalls.set(index, pending);
    }
  };

  try {
    while (!finished) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? '';
      for (const event of events) consume(event);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
  } finally {
    reader.releaseLock();
  }

  const parsedToolCalls = [...toolCalls.values()].map((call) => call as AeroAiToolCall);
  if (parsedToolCalls.some((call) => !call.id || !call.name || !call.arguments)) {
    throw new Error('LLM returned an incomplete tool call.');
  }
  return { content, toolCalls: parsedToolCalls };
}

export function configuredAeroAiChatClient(): OpenAiCompatibleChatClient {
  const requiredEnvironment = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is not configured.`);
    return value;
  };
  const maxTokens = Number(requiredEnvironment('LLM_MAX_TOKENS'));
  const timeoutMs = Number(requiredEnvironment('LLM_TIMEOUT_MS'));
  if (!Number.isInteger(maxTokens) || maxTokens <= 0) throw new Error('LLM_MAX_TOKENS must be a positive integer.');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('LLM_TIMEOUT_MS must be a positive integer.');

  return new OpenAiCompatibleChatClient({
    baseUrl: requiredEnvironment('LLM_BASE_URL'),
    model: requiredEnvironment('LLM_MODEL'),
    reasoningEffort: requiredEnvironment('LLM_REASONING_EFFORT'),
    maxTokens,
    timeoutMs,
  });
}
