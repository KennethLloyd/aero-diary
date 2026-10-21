import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AeroAiChatClient, AeroAiChatRequest, AeroAiChatResponse } from './chat-client';
import type { CompletedTurn } from './store';

const mocks = vi.hoisted(() => ({
  getCompletedTurnsBefore: vi.fn(),
  saveThreadSummary: vi.fn(),
  finishTurn: vi.fn(),
  failTurn: vi.fn(),
  configuredClient: vi.fn(),
  retrieveJournalMemoryForUser: vi.fn(),
  visualEvidenceMessage: vi.fn(),
}));

vi.mock('./visual-evidence', () => ({ visualEvidenceMessage: mocks.visualEvidenceMessage }));

vi.mock('./store', () => ({
  getCompletedTurnsBefore: mocks.getCompletedTurnsBefore,
  saveThreadSummary: mocks.saveThreadSummary,
  finishTurn: mocks.finishTurn,
  failTurn: mocks.failTurn,
}));
vi.mock('@/lib/journal/memory-retrieval', () => ({
  retrieveJournalMemoryForUser: mocks.retrieveJournalMemoryForUser,
}));
vi.mock('./openai-compatible-chat-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./openai-compatible-chat-client')>()),
  configuredAeroAiChatClient: mocks.configuredClient,
}));

import { OpenAiCompatibleChatClient } from './openai-compatible-chat-client';
import { generateAeroAiTurn } from './conversation';

describe('Aero AI conversation engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configuredClient.mockReset();
    mocks.visualEvidenceMessage.mockResolvedValue(null);
    mocks.getCompletedTurnsBefore.mockResolvedValue([]);
    mocks.finishTurn.mockResolvedValue(undefined);
    mocks.failTurn.mockResolvedValue(undefined);
    mocks.saveThreadSummary.mockResolvedValue(undefined);
    mocks.retrieveJournalMemoryForUser.mockResolvedValue([]);
  });

  it('streams and persists only the answer from a provider reasoning response', async () => {
    const events =
      ['<thi', 'nk>private reasoning</th', 'ink>Hello']
        .map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`)
        .join('') + 'data: [DONE]\n\n';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(events));
    const client = new OpenAiCompatibleChatClient({
      baseUrl: 'http://chatmock.test/v1',
      model: 'local-chat-model',
      reasoningEffort: 'low',
      maxTokens: 2048,
      timeoutMs: 10_000,
    });
    const onText = vi.fn();

    try {
      const result = await generateAeroAiTurn('owner-id', reservation(), { client, onText });

      expect(result.assistantContent).toBe('Hello');
      expect(onText.mock.calls).toEqual([['Hello']]);
      expect(mocks.finishTurn).toHaveBeenCalledWith('thread-id', 'turn-id', 'Hello', []);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('uses one validated journal tool call internally and saves its evidence with the completed reply', async () => {
    const evidence = {
      entryId: 'cm123456789012345678901234',
      journalDate: '2026-08-21',
      mood: 'GOOD',
      content: 'I hiked with Sam and watched the sunset.',
      score: 0.78,
    };
    mocks.retrieveJournalMemoryForUser.mockResolvedValue([evidence]);
    const requests: AeroAiChatRequest[] = [];
    const client = recordingClient(requests, [
      {
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'retrieve_journal',
            arguments: '{"query":"who was with me on the hike","limit":4}',
          },
        ],
      },
      { content: 'Sam was with you on the hike.', toolCalls: [] },
    ]);
    const onText = vi.fn();

    const result = await generateAeroAiTurn('owner-id', reservation(), { client, onText });

    expect(mocks.retrieveJournalMemoryForUser).toHaveBeenCalledWith(
      'owner-id',
      { query: 'who was with me on the hike', limit: 4, mode: 'relevance' },
      expect.any(AbortSignal),
    );
    expect(requests[0]?.tools?.map(({ name }) => name)).toEqual(['retrieve_journal']);
    expect(requests[1]?.messages.at(-1)).toMatchObject({
      role: 'tool',
      tool_call_id: 'call_1',
      content: JSON.stringify({
        matches: [
          {
            entryId: evidence.entryId,
            journalDate: evidence.journalDate,
            mood: evidence.mood,
            content: evidence.content,
          },
        ],
      }),
    });
    expect(result.assistantContent).toBe('Sam was with you on the hike.');
    expect(mocks.finishTurn).toHaveBeenCalledWith('thread-id', 'turn-id', result.assistantContent, [
      evidence,
    ]);
    expect(mocks.failTurn).not.toHaveBeenCalled();
  });

  it.each(['relevance', 'recent', 'longitudinal'])(
    'forwards %s intent and advertises all modes',
    async (mode) => {
      const requests: AeroAiChatRequest[] = [];
      const client = recordingClient(requests, [
        {
          content: '',
          toolCalls: [
            {
              id: 'call_1',
              name: 'retrieve_journal',
              arguments: JSON.stringify({ query: 'Alex', mode }),
            },
          ],
        },
        { content: 'A grounded reply.', toolCalls: [] },
      ]);
      await generateAeroAiTurn('owner-id', reservation(), { client });
      expect(mocks.retrieveJournalMemoryForUser).toHaveBeenCalledWith(
        'owner-id',
        { query: 'Alex', limit: 6, mode },
        expect.any(AbortSignal),
      );
      expect(requests[0]?.tools?.[0]?.parameters.properties).toMatchObject({
        mode: { enum: ['relevance', 'recent', 'longitudinal'], default: 'relevance' },
      });
    },
  );

  it('rejects unsupported retrieval intent', async () => {
    const client = recordingClient(
      [],
      [
        {
          content: '',
          toolCalls: [
            {
              id: 'call_1',
              name: 'retrieve_journal',
              arguments: '{"query":"Alex","mode":"unknown"}',
            },
          ],
        },
        { content: 'No evidence available.', toolCalls: [] },
      ],
    );
    await generateAeroAiTurn('owner-id', reservation(), { client });
    expect(mocks.retrieveJournalMemoryForUser).not.toHaveBeenCalled();
  });

  it('carries older journal evidence into follow-up context without exposing a tool transcript', async () => {
    const oldEvidence = {
      entryId: 'cm123456789012345678901234',
      journalDate: '2026-08-21',
      mood: 'GOOD',
      content: 'I hiked with Sam.',
      score: 0.8,
    };
    const priorTurn: CompletedTurn = {
      id: 'old-turn',
      sequence: 1,
      userContent: 'Who was with me hiking?',
      assistantContent: 'Sam was with you.',
      evidence: [oldEvidence],
    };
    mocks.getCompletedTurnsBefore.mockResolvedValue([priorTurn]);
    const requests: AeroAiChatRequest[] = [];
    const client = recordingClient(requests, [{ content: 'It was on August 21.', toolCalls: [] }]);

    await generateAeroAiTurn('owner-id', { ...reservation(), sequence: 2 }, { client });

    const systemMessages =
      requests[0]?.messages.filter((message) => message.role === 'system') ?? [];
    expect(systemMessages.some((message) => message.content?.includes(oldEvidence.entryId))).toBe(
      true,
    );
    expect(requests[0]?.messages.some((message) => message.role === 'tool')).toBe(false);
  });

  it('re-fetches prior photo references for a visual follow-up and persists no image payload', async () => {
    const evidence = {
      entryId: 'entry-1',
      journalDate: '2026-10-01',
      mood: 'GOOD',
      content: 'Museum day.',
      score: 0.9,
      sources: [{ sourceType: 'photo' as const, photoId: 'photo-1', similarity: 0.9 }],
    };
    mocks.getCompletedTurnsBefore.mockResolvedValue([
      {
        id: 'old-turn',
        sequence: 1,
        userContent: 'When was the dinosaur photo?',
        assistantContent: 'October 1.',
        evidence: [evidence],
      },
    ]);
    const images = {
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,PRIVATE_IMAGE' } }],
    };
    mocks.visualEvidenceMessage.mockResolvedValue(images);
    const requests: AeroAiChatRequest[] = [];
    const client = recordingClient(requests, [
      { content: 'She wore a blue shirt.', toolCalls: [] },
    ]);

    await generateAeroAiTurn(
      'owner-id',
      { ...reservation(), sequence: 2, userContent: 'What was she wearing there?' },
      { client },
    );

    expect(mocks.visualEvidenceMessage).toHaveBeenCalledWith(
      'owner-id',
      [evidence],
      expect.any(AbortSignal),
    );
    expect(requests[0].messages).toContain(images);
    expect(JSON.stringify(mocks.finishTurn.mock.calls)).not.toContain('PRIVATE_IMAGE');
  });

  it('keeps the newest retrieval’s best-ranked photo first on visual follow-up', async () => {
    const memory = (entryId: string) => ({
      entryId,
      journalDate: '2026-10-01',
      mood: 'GOOD',
      content: entryId,
      score: 0.9,
      sources: [{ sourceType: 'photo' as const, photoId: `photo-${entryId}`, similarity: 0.9 }],
    });
    const best = memory('best');
    const next = memory('next');
    const lower = memory('lower');
    mocks.getCompletedTurnsBefore.mockResolvedValue([
      {
        id: 'old',
        sequence: 1,
        userContent: 'Old question',
        assistantContent: 'Old answer',
        evidence: [memory('older')],
      },
      {
        id: 'latest',
        sequence: 2,
        userContent: 'Find the dinosaur picture',
        assistantContent: 'Here it is',
        evidence: [best, next, lower],
      },
    ]);
    const client = recordingClient([], [{ content: 'She wore a blue shirt.', toolCalls: [] }]);

    await generateAeroAiTurn('owner-id', { ...reservation(), sequence: 3 }, { client });

    expect(
      mocks.visualEvidenceMessage.mock.calls[0][1].map((item: { entryId: string }) => item.entryId),
    ).toEqual(['best', 'next', 'lower', 'older']);
  });

  it('replaces earlier visual context with newly retrieved photos before the final answer', async () => {
    const evidence = {
      entryId: 'entry-1',
      journalDate: '2026-10-01',
      mood: 'GOOD',
      content: 'A day.',
      score: 0.9,
      sources: [{ sourceType: 'photo' as const, photoId: 'photo-1', similarity: 0.9 }],
    };
    mocks.retrieveJournalMemoryForUser.mockResolvedValue([evidence]);
    const oldImages = { role: 'user', content: [{ type: 'text', text: 'old-image' }] };
    const newImages = { role: 'user', content: [{ type: 'text', text: 'new-image' }] };
    mocks.visualEvidenceMessage.mockResolvedValueOnce(oldImages).mockResolvedValueOnce(newImages);
    const requests: AeroAiChatRequest[] = [];
    const client = recordingClient(requests, [
      {
        content: '',
        toolCalls: [
          { id: 'call-1', name: 'retrieve_journal', arguments: '{"query":"dinosaur photo"}' },
        ],
      },
      { content: 'You visited on October 1.', toolCalls: [] },
    ]);

    await generateAeroAiTurn('owner-id', reservation(), { client });

    expect(requests[1].messages).toContain(newImages);
    expect(requests[1].messages).not.toContain(oldImages);
    expect(mocks.finishTurn.mock.calls[0][3]).toEqual([evidence]);
  });

  it('summarizes older completed turns but retains their full stored transcript', async () => {
    const turns: CompletedTurn[] = Array.from({ length: 15 }, (_, index) => ({
      id: `turn-${index + 1}`,
      sequence: index + 1,
      userContent: `Earlier question ${index + 1}`,
      assistantContent: `Earlier answer ${index + 1}`,
      evidence: [],
    }));
    mocks.getCompletedTurnsBefore.mockResolvedValue(turns);
    const requests: AeroAiChatRequest[] = [];
    const client = recordingClient(requests, [
      { content: '{"summary":"The user discussed several earlier topics."}', toolCalls: [] },
      { content: 'A continued answer.', toolCalls: [] },
    ]);

    await generateAeroAiTurn(
      'owner-id',
      {
        ...reservation(),
        sequence: 16,
        summary: null,
        summaryThroughTurn: 0,
      },
      { client },
    );

    expect(mocks.saveThreadSummary).toHaveBeenCalledWith(
      'thread-id',
      'The user discussed several earlier topics.',
      3,
    );
    expect(requests[0]?.responseFormat).toBe('json_object');
    expect(
      requests[1]?.messages.some(
        (message) => message.role === 'user' && message.content === 'Earlier question 4',
      ),
    ).toBe(true);
    expect(
      requests[1]?.messages.some(
        (message) => message.role === 'user' && message.content === 'Earlier question 3',
      ),
    ).toBe(false);
  });

  it('marks provider failures failed and stores no assistant answer', async () => {
    const client: AeroAiChatClient = {
      generate: vi.fn().mockRejectedValue(new Error('provider failure')),
    };

    await expect(generateAeroAiTurn('owner-id', reservation(), { client })).rejects.toThrow(
      'provider failure',
    );
    expect(mocks.failTurn).toHaveBeenCalledWith('thread-id', 'turn-id');
    expect(mocks.finishTurn).not.toHaveBeenCalled();
  });

  it('fails a truncated text stream without saving its partial assistant answer', async () => {
    const partialEvent = `data: ${JSON.stringify({ choices: [{ delta: { content: 'A partial answer.' } }] })}\n\n`;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(partialEvent));
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    try {
      const client = new OpenAiCompatibleChatClient({
        baseUrl: 'http://chatmock.test/v1',
        model: 'local-chat-model',
        reasoningEffort: 'low',
        maxTokens: 2048,
        timeoutMs: 10_000,
      });
      const onText = vi.fn();

      await expect(
        generateAeroAiTurn('owner-id', reservation(), { client, onText }),
      ).rejects.toThrow('LLM stream ended before completion.');

      expect(onText).toHaveBeenCalledWith('A partial answer.');
      expect(mocks.failTurn).toHaveBeenCalledWith('thread-id', 'turn-id');
      expect(mocks.finishTurn).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('releases a turn when LLM configuration fails and allows the request to retry', async () => {
    mocks.configuredClient.mockImplementation(() => {
      throw new Error('LLM_BASE_URL is not configured.');
    });

    await expect(generateAeroAiTurn('owner-id', reservation())).rejects.toThrow(
      'LLM_BASE_URL is not configured.',
    );

    expect(mocks.failTurn).toHaveBeenCalledWith('thread-id', 'turn-id');
    expect(mocks.finishTurn).not.toHaveBeenCalled();

    const retryClient = recordingClient(
      [],
      [{ content: 'A reply after configuration was fixed.', toolCalls: [] }],
    );
    await expect(
      generateAeroAiTurn('owner-id', reservation(), { client: retryClient }),
    ).resolves.toMatchObject({ assistantContent: 'A reply after configuration was fixed.' });
    expect(mocks.finishTurn).toHaveBeenCalledWith(
      'thread-id',
      'turn-id',
      'A reply after configuration was fixed.',
      [],
    );
  });
});

function recordingClient(
  requests: AeroAiChatRequest[],
  responses: AeroAiChatResponse[],
): AeroAiChatClient {
  return {
    generate: vi.fn(async (request: AeroAiChatRequest) => {
      requests.push(request);
      const response = responses.shift();
      if (!response) throw new Error('Unexpected chat completion.');

      return response;
    }),
  };
}

function reservation() {
  return {
    threadId: 'thread-id',
    turnId: 'turn-id',
    sequence: 1,
    userContent: 'Who was with me hiking?',
    summary: null,
    summaryThroughTurn: 0,
    title: 'Who was with me hiking?',
  };
}
