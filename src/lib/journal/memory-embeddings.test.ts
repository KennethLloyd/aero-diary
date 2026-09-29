import { afterEach, describe, expect, it, vi } from 'vitest';

type EmbedRequest = {
  model: string
  input: string[]
  keep_alive: string
};

describe('journal embeddings configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses the configured model and batch size for Ollama requests', async () => {
    vi.stubEnv('OLLAMA_EMBEDDING_MODEL', 'test-embedding-model');
    vi.stubEnv('OLLAMA_EMBEDDING_BATCH_SIZE', '2');
    vi.stubEnv('OLLAMA_EMBEDDING_KEEP_ALIVE', '15m');
    vi.resetModules();

    const embeddings = await import('./memory-embeddings');
    const requests: EmbedRequest[] = [];
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as EmbedRequest;
      requests.push(request);
      return Response.json({ embeddings: request.input.map(() => Array(768).fill(0.01)) });
    });

    await embeddings.embedJournalDocuments(['one', 'two', 'three'], fetcher);

    expect(embeddings.JOURNAL_EMBEDDING_GENERATION.model).toBe('test-embedding-model');
    expect(requests.map(({ model, input, keep_alive }) => ({ model, count: input.length, keep_alive })))
      .toEqual([
        { model: 'test-embedding-model', count: 2, keep_alive: '15m' },
        { model: 'test-embedding-model', count: 1, keep_alive: '15m' },
      ]);

    const originalHash = embeddings.journalEmbeddingSourceHash('same note');
    vi.stubEnv('OLLAMA_EMBEDDING_MODEL', 'another-embedding-model');
    vi.resetModules();
    const changedModel = await import('./memory-embeddings');
    expect(changedModel.journalEmbeddingSourceHash('same note')).not.toBe(originalHash);
  });

  it('rejects an invalid batch size before contacting Ollama', async () => {
    vi.stubEnv('OLLAMA_EMBEDDING_BATCH_SIZE', '0');
    vi.resetModules();
    const embeddings = await import('./memory-embeddings');
    const fetcher = vi.fn<typeof fetch>();

    await expect(embeddings.embedJournalDocuments(['one'], fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
