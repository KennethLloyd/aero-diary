import 'server-only';

import { z } from 'zod';

type PolishRequest = {
  note: string
  styleStandard: string
};

const chatCompletionSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string() }),
  })).min(1),
});

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function environmentNumber(name: string): number {
  const value = Number(requiredEnvironment(name));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function llmEndpoint(): string {
  return `${requiredEnvironment('LLM_BASE_URL').replace(/\/$/, '')}/v1/chat/completions`;
}

function systemPrompt(styleStandard: string): string {
  return [
    'You are revising a journal draft. The user message already contains the complete draft.',
    'Return only the complete draft, revised against the style rules below. Never ask for the draft.',
    'If no changes are needed, return the draft unchanged. Do not add a preface, explanation, title, or quotation marks.',
    'Preserve meaning, facts, emotional truth, and first-person perspective. Never truncate the draft.',
    '',
    'Style rules:',
    styleStandard,
  ].join('\n');
}

export async function requestPolishedEntry({ note, styleStandard }: PolishRequest): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), environmentNumber('LLM_TIMEOUT_MS'));

  try {
    const response = await fetch(llmEndpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: requiredEnvironment('LLM_MODEL'),
        messages: [
          { role: 'system', content: systemPrompt(styleStandard) },
          { role: 'user', content: note },
        ],
        reasoning_effort: requiredEnvironment('LLM_REASONING_EFFORT'),
        max_tokens: environmentNumber('LLM_MAX_TOKENS'),
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
