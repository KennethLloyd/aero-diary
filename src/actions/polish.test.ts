import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  findUnique: vi.fn(),
  verifySession: vi.fn(),
}));

vi.mock('@/lib/dal', () => ({ verifySession: mocks.verifySession }));
vi.mock('@/lib/db', () => ({
  db: { user: { findUnique: mocks.findUnique } },
}));
vi.mock('@/lib/journal/llm-client-config', () => ({
  configuredLlmClient: () => ({ complete: mocks.complete }),
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
  });

  it('rejects an anonymous request before reading the draft or calling the LLM', async () => {
    mocks.verifySession.mockRejectedValue(new Error('NEXT_REDIRECT'));

    await expect(polishEntry(undefined, form())).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('sends the draft and user style standard through the LLM interface', async () => {
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: 'user-1' });
    mocks.findUnique.mockResolvedValue({
      isDemo: false,
      styleStandard: 'Keep the voice direct and reflective.\nUse concrete details.',
    });
    mocks.complete.mockResolvedValue('I walked beside the water, and the calm stayed with me.');

    await expect(polishEntry(undefined, form())).resolves.toEqual({
      revisedText: 'I walked beside the water, and the calm stayed with me.',
    });

    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { styleStandard: true },
    });
    expect(mocks.complete).toHaveBeenCalledWith({
      systemPrompt: expect.stringContaining('Keep the voice direct and reflective.'),
      userPrompt: 'I walked beside the water and felt calmer.',
    });
  });

  it('returns a clear recoverable error when the LLM is down', async () => {
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: 'user-1' });
    mocks.findUnique.mockResolvedValue({ styleStandard: 'Keep the voice direct.' });
    mocks.complete.mockRejectedValue(new Error('LLM unavailable'));

    await expect(polishEntry(undefined, form())).resolves.toEqual({
      error: 'Polish is unavailable right now. Your entry can still be saved as written.',
    });
  });

  it('uses the concise default when the user has no style standard', async () => {
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: 'user-1' });
    mocks.findUnique.mockResolvedValue({ styleStandard: null });
    mocks.complete.mockResolvedValue('I walked beside the water and felt calmer.');

    await expect(polishEntry(undefined, form())).resolves.toEqual({
      revisedText: 'I walked beside the water and felt calmer.',
    });
    expect(mocks.complete).toHaveBeenCalledWith({
      systemPrompt: expect.stringContaining('concise, clear, natural language'),
      userPrompt: 'I walked beside the water and felt calmer.',
    });
  });

  it('uses the concise default when the user standard is blank', async () => {
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: 'user-1' });
    mocks.findUnique.mockResolvedValue({ styleStandard: '   ' });
    mocks.complete.mockResolvedValue('I walked beside the water and felt calmer.');

    await expect(polishEntry(undefined, form())).resolves.toEqual({
      revisedText: 'I walked beside the water and felt calmer.',
    });
    expect(mocks.complete).toHaveBeenCalledWith({
      systemPrompt: expect.stringContaining('concise, clear, natural language'),
      userPrompt: 'I walked beside the water and felt calmer.',
    });
  });
});
