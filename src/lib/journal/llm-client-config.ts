import 'server-only';

import { OpenAiCompatibleLlmClient } from './llm-client';

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

export function configuredLlmClient(): OpenAiCompatibleLlmClient {
  return new OpenAiCompatibleLlmClient({
    baseUrl: requiredEnvironment('LLM_BASE_URL'),
    timeoutMs: environmentNumber('LLM_TIMEOUT_MS'),
  });
}

export function configuredLlmRequest(): {
  model: string
  reasoningEffort: string
  maxTokens: number
} {
  return {
    model: requiredEnvironment('LLM_MODEL'),
    reasoningEffort: requiredEnvironment('LLM_REASONING_EFFORT'),
    maxTokens: environmentNumber('LLM_MAX_TOKENS'),
  };
}
