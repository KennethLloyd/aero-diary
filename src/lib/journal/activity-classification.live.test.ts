import { config } from 'dotenv';

config({ path: ['.env.local', '.env'] });

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Mood } from '@/generated/prisma/enums';
import { resetTestDb, testDb } from '@/test/test-db';
import { configuredLlmClient } from './llm-client-config';
import { OpenAiCompatibleLlmAdapter } from './openai-compatible-llm-adapter';
import {
  inferEntryActivities,
  type EntryInferenceResult,
} from './activity-inference';
import type { LlmClient } from './llm-client';

const runLiveTest = process.env.RUN_LIVE_LLM_TESTS === '1';

vi.mock('@/lib/journal/cache', () => ({
  invalidateJournalReads: vi.fn(),
}));
vi.mock('@/lib/db', async () => {
  const { testDb: isolatedTestDb } = await import('@/test/test-db');
  return { db: isolatedTestDb };
});

type LiveResponseShape = 'plain-json' | 'reasoning-prefix' | 'fenced-json' | 'other';

function responseShape(content: string): LiveResponseShape {
  const trimmedContent = content.trim();
  if (/^<think>[\s\S]*?<\/think>\s*/i.test(trimmedContent)) return 'reasoning-prefix';
  if (trimmedContent.startsWith(String.fromCharCode(96).repeat(3))) return 'fenced-json';
  if (trimmedContent.startsWith('{')) return 'plain-json';
  return 'other';
}

async function createLiveEntry(userId: string, note: string) {
  return testDb.entry.create({
    data: {
      userId,
      journalDate: '2026-08-30',
      mood: Mood.GOOD,
      note,
    },
  });
}

describe('live activity classification', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  (runLiveTest ? it : it.skip)('uses the configured provider and attaches only owned active IDs', async () => {
    const owner = await testDb.user.create({ data: { email: 'live-owner@example.com', passwordHash: 'x' } });
    const foreignUser = await testDb.user.create({ data: { email: 'live-foreign@example.com', passwordHash: 'x' } });
    const ownedActivities = await Promise.all([
      testDb.activity.create({ data: { userId: owner.id, name: 'Work', emoji: '💼' } }),
      testDb.activity.create({ data: { userId: owner.id, name: 'Rest', emoji: '😌' } }),
      testDb.activity.create({ data: { userId: owner.id, name: 'Reading', emoji: '📚' } }),
    ]);
    await testDb.activity.create({
      data: { userId: owner.id, name: 'Archived', emoji: '🗃️', isArchived: true },
    });
    await testDb.activity.create({
      data: { userId: foreignUser.id, name: 'Foreign', emoji: '🔒' },
    });

    const configuredClient = configuredLlmClient();
    expect(configuredClient).toBeInstanceOf(OpenAiCompatibleLlmAdapter);
    const liveResponses: string[] = [];
    const recordingClient: LlmClient = {
      complete: async (request) => {
        const content = await configuredClient.complete(request);
        liveResponses.push(content);
        return content;
      },
    };
    const scenarios = [
      'A quiet day with no notable activities.',
      'I completed a focused work session.',
      'I rested at home and read a book.',
      'No activities should be selected today.',
      'The entry contains an ordinary update.',
    ];
    const inferenceResults: EntryInferenceResult[] = [];

    for (const note of scenarios) {
      const entry = await createLiveEntry(owner.id, note);
      inferenceResults.push(await inferEntryActivities(
        owner.id,
        entry.id,
        { note: entry.note, updatedAt: entry.updatedAt },
        recordingClient,
      ));
    }

    expect(liveResponses).toHaveLength(scenarios.length);
    const responseShapes = liveResponses.map(responseShape);
    expect(responseShapes).not.toContain('other');
    expect(inferenceResults.every((result) => result.status === 'attached' || result.status === 'empty')).toBe(true);
    expect(inferenceResults.some((result) => result.status === 'attached')).toBe(true);
    expect(await testDb.entry.count({ where: { userId: owner.id } })).toBe(scenarios.length);

    const attached = await testDb.entryActivity.findMany({ select: { activityId: true } });
    const ownedIds = new Set(ownedActivities.map((activity) => activity.id));
    expect(attached.every(({ activityId }) => ownedIds.has(activityId))).toBe(true);
  }, 180_000);
});
