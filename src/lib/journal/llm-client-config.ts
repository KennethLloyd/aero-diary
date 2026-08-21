import 'server-only';

import type { LlmClient } from './llm-client';
import { OpenAiCompatibleLlmAdapter } from './openai-compatible-llm-adapter';

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

export function configuredLlmClient(): LlmClient {
  return new OpenAiCompatibleLlmAdapter({
    baseUrl: requiredEnvironment('LLM_BASE_URL'),
    model: requiredEnvironment('LLM_MODEL'),
    reasoningEffort: requiredEnvironment('LLM_REASONING_EFFORT'),
    maxTokens: environmentNumber('LLM_MAX_TOKENS'),
    timeoutMs: environmentNumber('LLM_TIMEOUT_MS'),
  });
}
