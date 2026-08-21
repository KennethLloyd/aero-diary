import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  findUnique: vi.fn(),
  verifySession: vi.fn(),
}));

vi.mock('@/lib/dal', () => ({ verifySession: mocks.verifySession }));
vi.mock('@/lib/db', () => ({
  db: { user: { findUnique: mocks.findUnique } },
}));

import { polishEntry } from '@/actions/polish';

function form(note = 'I walked beside the water and felt calmer.') {
  const data = new FormData();
  data.set('note', note);
  return data;
}

describe('polishEntry action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
    process.env.LLM_BASE_URL = 'http://127.0.0.1:9090';
    process.env.LLM_MODEL = 'openai/gpt-5.6-luna';
    process.env.LLM_REASONING_EFFORT = 'medium';
    process.env.LLM_MAX_TOKENS = '16384';
    process.env.LLM_TIMEOUT_MS = '30000';
  });

  it('rejects an anonymous request before reading the draft or calling the LLM', async () => {
    mocks.verifySession.mockRejectedValue(new Error('NEXT_REDIRECT'));

    await expect(polishEntry(undefined, form())).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('sends the draft and user style standard in the OpenAI-compatible payload', async () => {
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: 'user-1' });
    mocks.findUnique.mockResolvedValue({
      isDemo: false,
      styleStandard: 'Keep the voice direct and reflective.\nUse concrete details.',
    });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'I walked beside the water, and the calm stayed with me.' } }],
    }), { status: 200 }));

    await expect(polishEntry(undefined, form())).resolves.toEqual({
      revisedText: 'I walked beside the water, and the calm stayed with me.',
    });

    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { styleStandard: true },
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9090/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, request] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      model: 'openai/gpt-5.6-luna',
      messages: [
        {
          role: 'system',
          content: expect.stringContaining('Keep the voice direct and reflective.'),
        },
        { role: 'user', content: 'I walked beside the water and felt calmer.' },
      ],
      reasoning_effort: 'medium',
      max_tokens: 16384,
    });
  });

  it('returns a clear recoverable error when the LLM is down', async () => {
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: 'user-1' });
    mocks.findUnique.mockResolvedValue({ styleStandard: 'Keep the voice direct.' });
    mocks.fetch.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(polishEntry(undefined, form())).resolves.toEqual({
      error: 'Polish is unavailable right now. Your entry can still be saved as written.',
    });
  });

  it('does not call the LLM when the user has not been seeded a style standard', async () => {
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: 'user-1' });
    mocks.findUnique.mockResolvedValue({ styleStandard: null });

    await expect(polishEntry(undefined, form())).resolves.toEqual({
      error: 'Polish is unavailable right now. Your entry can still be saved as written.',
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
