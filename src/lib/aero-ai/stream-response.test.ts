import { afterEach, expect, it, vi } from 'vitest';
import { generateAeroAiTurn } from './conversation';
import { streamAeroAiTurn } from './stream-response';

vi.mock('./conversation', () => ({ generateAeroAiTurn: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

it('aborts generation on cancellation without closing the already-cancelled stream', async () => {
  let generationSignal: AbortSignal | undefined;
  vi.mocked(generateAeroAiTurn).mockImplementation((_userId, _reservation, options) => {
    generationSignal = options!.signal;
    return new Promise((_resolve, reject) => {
      generationSignal!.addEventListener('abort', () => reject(new Error('Generation aborted')), { once: true });
    });
  });
  const close = vi.spyOn(ReadableStreamDefaultController.prototype, 'close');
  const response = streamAeroAiTurn('owner', 'thread', {
    threadId: 'thread',
    turnId: 'turn',
    sequence: 1,
    userContent: 'Hello',
    summary: null,
    summaryThroughTurn: 0,
    title: 'New chat',
  }, null, new AbortController().signal);
  const reader = response.body!.getReader();
  await reader.read();

  await expect(reader.cancel()).resolves.toBeUndefined();
  expect(generationSignal?.aborted).toBe(true);
  // Let generation rejection and all stream completion handlers run.
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(close).not.toHaveBeenCalled();
  await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
});
