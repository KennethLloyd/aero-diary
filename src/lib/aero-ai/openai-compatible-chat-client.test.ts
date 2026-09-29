import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAiCompatibleChatClient } from './openai-compatible-chat-client';

describe('OpenAiCompatibleChatClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  const client = new OpenAiCompatibleChatClient({
    baseUrl: 'http://chatmock.test/v1',
    model: 'local-chat-model',
    reasoningEffort: 'low',
    maxTokens: 2048,
    timeoutMs: 10_000,
  });
  const request = { messages: [{ role: 'user' as const, content: 'Reply briefly.' }] };

  function mockStream(chunks: string[]) {
    const events = chunks.map((content) =>
      `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
    ).join('') + 'data: [DONE]\n\n';
    fetchMock.mockResolvedValue(new Response(events, { status: 200 }));
  }

  const outputCases = [
    ['<think>reasoning</think>Answer', 'Answer'],
    ['First<think>hidden</think>Second<think>also hidden</think>Third', 'FirstSecondThird'],
    ['I think this is thoughtful. The <thinker> sculpture is nice.', 'I think this is thoughtful. The <thinker> sculpture is nice.'],
    ['<THINK>hidden</THINK>Answer', 'Answer'],
    ['Answer<think>unfinished reasoning', 'Answer'],
    ['<think>reasoning only</think>', ''],
    ['A literal < and 2 < 3; trailing <', 'A literal < and 2 < 3; trailing <'],
    ['<think>outer<think>inner</think>still hidden</think>Answer', 'Answer'],
    ['</think>Answer<thi', 'Answer'],
  ];

  it.each(outputCases)('filters completed provider content: %s', async (content, expected) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content } }],
    }), { status: 200 }));

    expect(await client.generate(request)).toEqual({ content: expected, toolCalls: [] });
  });

  it('holds split reasoning tags before emitting any user-facing text', async () => {
    mockStream(['<thi', 'nk>reason', 'ing</th', 'ink>Hello']);
    const onText = vi.fn();

    expect(await client.generate(request, { onText })).toEqual({ content: 'Hello', toolCalls: [] });
    expect(onText.mock.calls).toEqual([['Hello']]);
  });

  it.each(outputCases)('filters streamed provider content at every character boundary: %s', async (content, expected) => {
    mockStream([...content]);
    const onText = vi.fn();

    expect(await client.generate(request, { onText })).toEqual({ content: expected, toolCalls: [] });
    expect(onText.mock.calls.map(([text]) => text).join('')).toBe(expected);
  });

  it('filters multiple reasoning blocks at every possible two-chunk split', async () => {
    const content = '<think>hidden</think>First<think>also hidden</think>Second';
    for (let split = 1; split < content.length; split++) {
      mockStream([content.slice(0, split), content.slice(split)]);
      const onText = vi.fn();

      expect((await client.generate(request, { onText })).content).toBe('FirstSecond');
      expect(onText.mock.calls.map(([text]) => text).join('')).toBe('FirstSecond');
    }
  });

  it('assembles streamed text and tool arguments across partial SSE chunks', async () => {
    const events = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: '<think>Choosing a tool</think>' } }] })}\n\n`,
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

  it('rejects streamed text when the provider closes before its completion marker', async () => {
    const event = `data: ${JSON.stringify({ choices: [{ delta: { content: 'A partial answer.' } }] })}\n\n`;
    fetchMock.mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(event));
        controller.close();
      },
    }), { status: 200 }));
    const client = new OpenAiCompatibleChatClient({
      baseUrl: 'http://chatmock.test/v1',
      model: 'local-chat-model',
      reasoningEffort: 'low',
      maxTokens: 2048,
      timeoutMs: 10_000,
    });
    const onText = vi.fn();

    await expect(client.generate({
      messages: [{ role: 'user', content: 'Reply briefly.' }],
    }, { onText })).rejects.toThrow('LLM stream ended before completion.');

    expect(onText).toHaveBeenCalledWith('A partial answer.');
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
