import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAiCompatibleChatClient } from './openai-compatible-chat-client';

describe('OpenAiCompatibleChatClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('assembles streamed text and tool arguments across partial SSE chunks', async () => {
    const events = [
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'retrieve_journal', arguments: '{"query":"where did I go' } }] } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ' hiking?","limit":4}' } }] } }] })}\n\n`,
      'data: [DONE]\n\n',
    ];
    const bytes = new TextEncoder().encode(events.join(''));
    fetchMock.mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 23));
        controller.enqueue(bytes.slice(23, 117));
        controller.enqueue(bytes.slice(117));
        controller.close();
      },
    }), { status: 200 }));

    const client = new OpenAiCompatibleChatClient({
      baseUrl: 'http://chatmock.test/v1/',
      model: 'local-chat-model',
      reasoningEffort: 'medium',
      maxTokens: 4096,
      timeoutMs: 30_000,
    });
    const onText = vi.fn();
    const result = await client.generate({
      messages: [{ role: 'user', content: 'Where was I hiking?' }],
      tools: [{ name: 'retrieve_journal', description: 'Find memories.', parameters: { type: 'object' } }],
    }, { onText });

    expect(result.toolCalls).toEqual([{
      id: 'call_1',
      name: 'retrieve_journal',
      arguments: '{"query":"where did I go hiking?","limit":4}',
    }]);
    expect(onText).not.toHaveBeenCalled();
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({
      stream: true,
      model: 'local-chat-model',
      tool_choice: 'auto',
    });
  });

  it('returns a completed JSON response through the same chat endpoint', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'A concise summary.' } }],
    }), { status: 200 }));
    const client = new OpenAiCompatibleChatClient({
      baseUrl: 'http://chatmock.test/v1',
      model: 'local-chat-model',
      reasoningEffort: 'low',
      maxTokens: 2048,
      timeoutMs: 10_000,
    });

    await expect(client.generate({
      messages: [{ role: 'system', content: 'Summarize.' }, { role: 'user', content: 'Conversation.' }],
      responseFormat: 'json_object',
    })).resolves.toEqual({ content: 'A concise summary.', toolCalls: [] });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({
      stream: false,
      response_format: { type: 'json_object' },
    });
  });
});
