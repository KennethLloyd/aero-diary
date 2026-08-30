import 'server-only';

import { z } from 'zod';
import type { LlmClient, LlmRequest } from './llm-client';

type OpenAiCompatibleLlmAdapterOptions = {
  baseUrl: string
  model: string
  reasoningEffort: string
  maxTokens: number
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

export class OpenAiCompatibleLlmAdapter implements LlmClient {
  private readonly endpoint: string;
  private readonly model: string;
  private readonly reasoningEffort: string;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;

  constructor({
    baseUrl,
    model,
    reasoningEffort,
    maxTokens,
    timeoutMs,
  }: OpenAiCompatibleLlmAdapterOptions) {
    this.endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    this.model = model;
    this.reasoningEffort = reasoningEffort;
    this.maxTokens = maxTokens;
    this.timeoutMs = timeoutMs;
  }

  async complete({
    systemPrompt,
    userPrompt,
    responseFormat,
  }: LlmRequest): Promise<string> {
    const { controller, timeout } = timeoutController(this.timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          reasoning_effort: this.reasoningEffort,
          max_tokens: this.maxTokens,
          ...(responseFormat ? { response_format: { type: responseFormat } } : {}),
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
