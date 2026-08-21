import 'server-only';

import { z } from 'zod';

export type ChatMessage = {
  role: 'system' | 'user'
  content: string
};

export type ChatCompletionRequest = {
  model: string
  messages: ChatMessage[]
  reasoningEffort: string
  maxTokens: number
};

export interface LlmClient {
  complete(request: ChatCompletionRequest): Promise<string>
}

type OpenAiCompatibleLlmClientOptions = {
  baseUrl: string
  timeoutMs: number
};

const chatCompletionSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string() }),
  })).min(1),
});

function timeoutController(timeoutMs: number): {
  controller: AbortController
  timeout: ReturnType<typeof setTimeout>
} {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeout };
}

export class OpenAiCompatibleLlmClient implements LlmClient {
  private readonly endpoint: string;

  constructor({ baseUrl, timeoutMs }: OpenAiCompatibleLlmClientOptions) {
    this.endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    this.timeoutMs = timeoutMs;
  }

  private readonly timeoutMs: number;

  async complete({ model, messages, reasoningEffort, maxTokens }: ChatCompletionRequest): Promise<string> {
    const { controller, timeout } = timeoutController(this.timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          reasoning_effort: reasoningEffort,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`LLM request failed with status ${response.status}.`);

      const parsed = chatCompletionSchema.safeParse(await response.json());
      const revisedText = parsed.success ? parsed.data.choices[0].message.content.trim() : '';
      if (!revisedText) throw new Error('LLM returned no revised text.');
      return revisedText;
    } finally {
      clearTimeout(timeout);
    }
  }
}
