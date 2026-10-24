import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

type EmbedRequest = {
  model: string;
  input: string[];
  keep_alive: string;
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
    expect(
      requests.map(({ model, input, keep_alive }) => ({ model, count: input.length, keep_alive })),
    ).toEqual([
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

describe('EmbeddingGemma 2 vectors', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses one canonical model for passage, query and structured image requests', async () => {
    const client = await import('./memory-embeddings');
    const requests: Record<string, unknown>[] = [];
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));

      return Response.json({ embeddings: [Array(768).fill(0.1)] });
    });
    await client.embedJournalDocuments(['passage'], fetcher);
    await client.embedJournalQuery('query', fetcher);
    const normalizedBytes = await sharp({
      create: { width: 512, height: 384, channels: 3, background: 'white' },
    })
      .jpeg()
      .toBuffer();
    await client.embedJournalPhoto(
      {
        bytes: normalizedBytes,
        width: 512,
        height: 384,
        mimeType: 'image/jpeg',
        contentHash: 'hash',
        preprocessingVersion: 'v1',
      },
      fetcher,
    );
    expect(requests.map((request) => request.model)).toEqual(
      Array(3).fill('embeddinggemma-2:440m'),
    );
    expect(requests[2]).toMatchObject({
      input: { image: normalizedBytes.toString('base64') },
      options: { num_thread: 1 },
      truncate: false,
    });
  });

  it.each([Array(767).fill(0), Array(768).fill(null), Array(768).fill('Infinity')])(
    'rejects invalid vector responses',
    async (vector) => {
      const client = await import('./memory-embeddings');
      await expect(
        client.embedJournalQuery('query', async () => Response.json({ embeddings: [vector] })),
      ).rejects.toBeInstanceOf(client.MemoryEmbeddingError);
    },
  );

  it('reports transport and HTTP errors and rejects original-resolution inputs', async () => {
    const client = await import('./memory-embeddings');
    await expect(
      client.embedJournalQuery('q', async () => {
        throw new Error('timeout');
      }),
    ).rejects.toMatchObject({ code: 'TRANSPORT' });
    await expect(
      client.embedJournalQuery('q', async () => new Response('', { status: 503 })),
    ).rejects.toMatchObject({ code: 'HTTP' });
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      client.embedJournalPhoto(
        {
          bytes: Buffer.alloc(0),
          width: 8064,
          height: 6048,
          mimeType: 'image/jpeg',
          contentHash: 'hash',
          preprocessingVersion: 'v1',
        },
        fetcher,
      ),
    ).rejects.toMatchObject({ code: 'UNNORMALIZED_IMAGE' });
    const original = await sharp({
      create: { width: 1024, height: 768, channels: 3, background: 'white' },
    })
      .jpeg()
      .toBuffer();
    await expect(
      client.embedJournalPhoto(
        {
          bytes: original,
          width: 512,
          height: 384,
          mimeType: 'image/jpeg',
          contentHash: 'hash',
          preprocessingVersion: 'v1',
        },
        fetcher,
      ),
    ).rejects.toMatchObject({ code: 'UNNORMALIZED_IMAGE' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
