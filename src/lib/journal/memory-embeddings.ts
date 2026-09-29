import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  JOURNAL_PASSAGE_VERSION,
  journalDocumentPrompt,
  journalQueryPrompt,
} from '@/lib/journal/memory-passages';

const DEFAULT_EMBEDDING_MODEL = 'embeddinggemma:300m-qat-q4_0';
const DEFAULT_BATCH_SIZE = 8;
const DEFAULT_KEEP_ALIVE = '5m';
export const JOURNAL_EMBEDDING_MODEL = z.string().trim().min(1).parse(
  process.env.OLLAMA_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
);
export const JOURNAL_EMBEDDING_DIMENSIONS = 768;
const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
const DEFAULT_TIMEOUT_MS = 120_000;
const positiveIntegerSchema = z.coerce.number().int().positive();

const embeddingsResponseSchema = z.object({
  embeddings: z.array(z.array(z.number().finite())),
});

export const JOURNAL_EMBEDDING_GENERATION = {
  model: JOURNAL_EMBEDDING_MODEL,
  passageVersion: JOURNAL_PASSAGE_VERSION,
};

export function journalVectorLiteral(vector: readonly number[]): string {
  if (vector.length !== JOURNAL_EMBEDDING_DIMENSIONS || vector.some((value) => !Number.isFinite(value))) {
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
  return z.string().trim().min(1).parse(process.env.OLLAMA_EMBEDDING_KEEP_ALIVE ?? DEFAULT_KEEP_ALIVE);
}

async function requestEmbeddings(inputs: string[], fetcher: typeof fetch): Promise<number[][]> {
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
      }),
      signal: AbortSignal.timeout(timeoutMs()),
    });
  } catch {
    throw new Error('The local Ollama embedding service could not be reached or timed out.');
  }

  if (!response.ok) {
    throw new Error(`The local Ollama embedding service returned HTTP ${response.status}.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('The local Ollama embedding service returned invalid JSON.');
  }
  const parsed = embeddingsResponseSchema.safeParse(payload);
  if (!parsed.success || parsed.data.embeddings.length !== inputs.length) {
    throw new Error('The local Ollama embedding service returned an invalid vector batch.');
  }
  if (parsed.data.embeddings.some((embedding) => embedding.length !== JOURNAL_EMBEDDING_DIMENSIONS)) {
    throw new Error('The local Ollama embedding service returned an unexpected vector size.');
  }
  return parsed.data.embeddings;
}

async function embedBatch(inputs: string[], fetcher: typeof fetch): Promise<number[][]> {
  const embeddings: number[][] = [];
  const batchSize = embeddingBatchSize();
  for (let start = 0; start < inputs.length; start += batchSize) {
    const batch = inputs.slice(start, start + batchSize);
    embeddings.push(...await requestEmbeddings(batch, fetcher));
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
): Promise<number[]> {
  const [embedding] = await embedBatch([journalQueryPrompt(query)], fetcher);
  if (!embedding) throw new Error('The local Ollama embedding service returned no query vector.');
  return embedding;
}

export function journalEmbeddingSourceHash(note: string): string {
  return createHash('sha256')
    .update(`${JOURNAL_EMBEDDING_MODEL}\0${JOURNAL_PASSAGE_VERSION}\0${note}`)
    .digest('hex');
}
