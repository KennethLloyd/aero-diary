import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAiCompatibleLlmAdapter } from './openai-compatible-llm-adapter';

describe('OpenAiCompatibleLlmAdapter', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('translates the provider-neutral request into an OpenAI-compatible payload', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Revised entry.' } }],
    }), { status: 200 }));

    const adapter = new OpenAiCompatibleLlmAdapter({
      baseUrl: 'http://llm.test/v1/',
      model: 'gpt-5.6-luna',
      reasoningEffort: 'medium',
      maxTokens: 16384,
      timeoutMs: 30000,
    });

    await expect(adapter.complete({
      systemPrompt: 'Revise this entry.',
      userPrompt: 'I walked beside the water.',
    })).resolves.toBe('Revised entry.');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://llm.test/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      model: 'gpt-5.6-luna',
      messages: [
        { role: 'system', content: 'Revise this entry.' },
        { role: 'user', content: 'I walked beside the water.' },
      ],
      reasoning_effort: 'medium',
      max_tokens: 16384,
    });
  });

  it('rejects an unsuccessful response', async () => {
    fetchMock.mockResolvedValue(new Response('gateway error', { status: 503 }));

    const adapter = new OpenAiCompatibleLlmAdapter({
      baseUrl: 'http://llm.test/v1',
      model: 'gpt-5.6-luna',
      reasoningEffort: 'medium',
      maxTokens: 16384,
      timeoutMs: 30000,
    });

    await expect(adapter.complete({
      systemPrompt: 'Revise this entry.',
      userPrompt: 'Draft.',
    })).rejects.toThrow('LLM request failed with status 503.');
  });
});
