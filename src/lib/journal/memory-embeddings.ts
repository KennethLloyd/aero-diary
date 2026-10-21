import { createHash } from 'node:crypto';
import { z } from 'zod';
import sharp from 'sharp';
import type { NormalizedMemoryPhoto } from '@/lib/journal/photo-memory-images';
import { getPhotoMemoryConfig } from '@/lib/journal/photo-memory-config';
import {
  JOURNAL_PASSAGE_VERSION,
  journalDocumentPrompt,
  journalQueryPrompt,
} from '@/lib/journal/memory-passages';

const DEFAULT_EMBEDDING_MODEL = 'embeddinggemma-2:440m';
const DEFAULT_BATCH_SIZE = 8;
const DEFAULT_KEEP_ALIVE = '5m';
export const JOURNAL_EMBEDDING_MODEL = z
  .string()
  .trim()
  .min(1)
  .parse(
    process.env.MEMORY_EMBEDDING_MODEL ??
      process.env.OLLAMA_EMBEDDING_MODEL ??
      DEFAULT_EMBEDDING_MODEL,
  );
export const JOURNAL_EMBEDDING_DIMENSIONS = 768;
const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
const DEFAULT_TIMEOUT_MS = 30_000;
const positiveIntegerSchema = z.coerce.number().int().positive();

const embeddingsResponseSchema = z.object({
  embeddings: z.array(z.array(z.number().finite())),
});

export const JOURNAL_EMBEDDING_GENERATION = {
  model: JOURNAL_EMBEDDING_MODEL,
  passageVersion: JOURNAL_PASSAGE_VERSION,
};

export function journalVectorLiteral(vector: readonly number[]): string {
  if (
    vector.length !== JOURNAL_EMBEDDING_DIMENSIONS ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('The embedding vector has an invalid shape.');
  }

  return `[${vector.join(',')}]`;
}

function ollamaBaseUrl(): string {
  const configured = process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_URL;

  return configured.replace(/\/+$/, '');
}

function timeoutMs(): number {
  const value = Number(process.env.OLLAMA_EMBEDDING_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  return Number.isInteger(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function embeddingBatchSize(): number {
  return positiveIntegerSchema.parse(process.env.OLLAMA_EMBEDDING_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);
}

function keepAlive(): string {
  return z
    .string()
    .trim()
    .min(1)
    .parse(process.env.OLLAMA_EMBEDDING_KEEP_ALIVE ?? DEFAULT_KEEP_ALIVE);
}

export class MemoryEmbeddingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MemoryEmbeddingError';
  }
}

async function requestEmbeddings(
  inputs: string[] | { image: string },
  fetcher: typeof fetch,
  externalSignal?: AbortSignal,
): Promise<number[][]> {
  const isImage = !Array.isArray(inputs);
  let response: Response;

  try {
    response = await fetcher(`${ollamaBaseUrl()}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: JOURNAL_EMBEDDING_MODEL,
        input: inputs,
        truncate: false,
        keep_alive: keepAlive(),
        ...(isImage ? { options: { num_thread: getPhotoMemoryConfig().inferenceThreads } } : {}),
      }),
      signal: externalSignal
        ? AbortSignal.any([
            externalSignal,
            AbortSignal.timeout(isImage ? getPhotoMemoryConfig().inferenceTimeoutMs : timeoutMs()),
          ])
        : AbortSignal.timeout(isImage ? getPhotoMemoryConfig().inferenceTimeoutMs : timeoutMs()),
    });
  } catch {
    throw new MemoryEmbeddingError(
      'TRANSPORT',
      'The local Ollama embedding service could not be reached or timed out.',
    );
  }

  if (!response.ok) {
    throw new MemoryEmbeddingError(
      'HTTP',
      `The local Ollama embedding service returned HTTP ${response.status}.`,
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new MemoryEmbeddingError(
      'INVALID_RESPONSE',
      'The local Ollama embedding service returned invalid JSON.',
    );
  }

  const parsed = embeddingsResponseSchema.safeParse(payload);

  if (
    !parsed.success ||
    parsed.data.embeddings.length !== (Array.isArray(inputs) ? inputs.length : 1)
  ) {
    throw new MemoryEmbeddingError(
      'INVALID_RESPONSE',
      'The local Ollama embedding service returned an invalid vector batch.',
    );
  }
  if (
    parsed.data.embeddings.some((embedding) => embedding.length !== JOURNAL_EMBEDDING_DIMENSIONS)
  ) {
    throw new MemoryEmbeddingError(
      'INVALID_DIMENSIONS',
      'The local Ollama embedding service returned an unexpected vector size.',
    );
  }

  return parsed.data.embeddings;
}

async function embedBatch(
  inputs: string[],
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<number[][]> {
  const embeddings: number[][] = [];
  const batchSize = embeddingBatchSize();

  for (let start = 0; start < inputs.length; start += batchSize) {
    const batch = inputs.slice(start, start + batchSize);
    signal?.throwIfAborted();
    embeddings.push(...(await requestEmbeddings(batch, fetcher, signal)));
  }

  return embeddings;
}

export function embedJournalDocuments(
  passages: readonly string[],
  fetcher: typeof fetch = fetch,
): Promise<number[][]> {
  return embedBatch(passages.map(journalDocumentPrompt), fetcher);
}

export async function embedJournalQuery(
  query: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<number[]> {
  const [embedding] = await embedBatch([journalQueryPrompt(query)], fetcher, signal);
  if (!embedding) throw new Error('The local Ollama embedding service returned no query vector.');

  return embedding;
}

export function journalEmbeddingSourceHash(note: string): string {
  return createHash('sha256')
    .update(`${JOURNAL_EMBEDDING_MODEL}\0${JOURNAL_PASSAGE_VERSION}\0${note}`)
    .digest('hex');
}

export async function embedJournalPhoto(
  photo: NormalizedMemoryPhoto,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<number[]> {
  const config = getPhotoMemoryConfig();

  if (photo.mimeType !== 'image/jpeg' || Math.max(photo.width, photo.height) > config.longestEdge) {
    throw new MemoryEmbeddingError(
      'UNNORMALIZED_IMAGE',
      'Only normalized images within the configured pixel limit can be embedded.',
    );
  }

  try {
    if (photo.bytes.length > config.maxInputBytes) throw new Error('Image byte limit.');

    const metadata = await sharp(photo.bytes, {
      limitInputPixels: config.longestEdge * config.longestEdge,
      failOn: 'warning',
    }).metadata();
    if (
      metadata.format !== 'jpeg' ||
      !metadata.width ||
      !metadata.height ||
      Math.max(metadata.width, metadata.height) > config.longestEdge ||
      metadata.width !== photo.width ||
      metadata.height !== photo.height
    )
      throw new Error('Image shape.');
  } catch {
    throw new MemoryEmbeddingError(
      'UNNORMALIZED_IMAGE',
      'Only normalized JPEG image bytes within the configured pixel limit can be embedded.',
    );
  }

  // Ollama v0.40.4 EmbedRequest accepts a multimodal map with a singular base64 image.
  const [embedding] = await requestEmbeddings(
    { image: photo.bytes.toString('base64') },
    fetcher,
    signal,
  );
  if (!embedding)
    throw new MemoryEmbeddingError('INVALID_RESPONSE', 'No image vector was returned.');

  return embedding;
}
