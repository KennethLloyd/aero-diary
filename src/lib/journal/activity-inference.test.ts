import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Mood } from '@/generated/prisma/enums';
import { resetTestDb, testDb } from '@/test/test-db';
import {
  inferEntryActivities,
  runEntryActivityInference,
  type EntryInferenceSnapshot,
} from './activity-inference';

const mocks = vi.hoisted(() => ({
  configuredLlmClient: vi.fn(),
  invalidateJournalReads: vi.fn(),
}));

vi.mock('@/lib/journal/llm-client-config', () => ({
  configuredLlmClient: mocks.configuredLlmClient,
}));
vi.mock('@/lib/journal/cache', () => ({
  invalidateJournalReads: mocks.invalidateJournalReads,
}));
vi.mock('@/lib/db', async () => {
  const { testDb } = await import('@/test/test-db');
  return { db: testDb };
});

async function createUser(email = `${crypto.randomUUID()}@example.com`) {
  return testDb.user.create({ data: { email, passwordHash: 'x' } });
}

async function createEntry(userId: string, note = 'I played games and had dinner.') {
  return testDb.entry.create({
    data: {
      userId,
      journalDate: '2026-08-28',
      mood: Mood.GOOD,
      note,
    },
  });
}

function snapshot(entry: { note: string; updatedAt: Date }): EntryInferenceSnapshot {
  return { note: entry.note, updatedAt: entry.updatedAt };
}

describe('inferEntryActivities', () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
  });

  it('attaches only active activities owned by the entry user', async () => {
    const user = await createUser('owner@example.com');
    const otherUser = await createUser('other@example.com');
    const gaming = await testDb.activity.create({ data: { userId: user.id, name: 'Gaming', emoji: '🎮' } });
    const archived = await testDb.activity.create({
      data: { userId: user.id, name: 'Archived', emoji: '🗃️', isArchived: true },
    });
    const foreign = await testDb.activity.create({ data: { userId: otherUser.id, name: 'Private', emoji: '🔒' } });
    const entry = await createEntry(user.id);
    mocks.configuredLlmClient.mockReturnValue({
      complete: vi.fn().mockResolvedValue(JSON.stringify({
        activityIds: [gaming.id, archived.id, foreign.id, gaming.id, 'missing-id'],
      })),
    });

    await expect(inferEntryActivities(user.id, entry.id, snapshot(entry))).resolves.toEqual({
      status: 'attached',
      activityIds: [gaming.id],
    });
    await expect(testDb.entryActivity.findMany()).resolves.toEqual([
      { entryId: entry.id, activityId: gaming.id },
    ]);
    expect(mocks.invalidateJournalReads).toHaveBeenCalledWith(user.id, entry.id);
  });

  it('supports empty classification without changing the entry', async () => {
    const user = await createUser();
    const activity = await testDb.activity.create({ data: { userId: user.id, name: 'Gaming', emoji: '🎮' } });
    const entry = await createEntry(user.id, 'A quiet day.');
    mocks.configuredLlmClient.mockReturnValue({
      complete: vi.fn().mockResolvedValue('{"activityIds":[]}'),
    });

    await expect(inferEntryActivities(user.id, entry.id, snapshot(entry))).resolves.toEqual({
      status: 'empty',
      activityIds: [],
    });
    expect(await testDb.entryActivity.count({ where: { activityId: activity.id } })).toBe(0);
    expect(mocks.invalidateJournalReads).not.toHaveBeenCalled();
  });

  it('is safe to retry the same inference', async () => {
    const user = await createUser();
    const activity = await testDb.activity.create({ data: { userId: user.id, name: 'Gaming', emoji: '🎮' } });
    const entry = await createEntry(user.id, 'I played games.');
    const client = { complete: vi.fn().mockResolvedValue(JSON.stringify({ activityIds: [activity.id] })) };

    await inferEntryActivities(user.id, entry.id, snapshot(entry), client);
    await expect(inferEntryActivities(user.id, entry.id, snapshot(entry), client)).resolves.toEqual({
      status: 'empty',
      activityIds: [],
    });
    expect(await testDb.entryActivity.count()).toBe(1);
    expect(client.complete).toHaveBeenCalledTimes(2);
  });

  it('skips a stale inference after a user edit', async () => {
    const user = await createUser();
    const gaming = await testDb.activity.create({ data: { userId: user.id, name: 'Gaming', emoji: '🎮' } });
    const dining = await testDb.activity.create({ data: { userId: user.id, name: 'Dining', emoji: '🍽️' } });
    const entry = await createEntry(user.id, 'The old note.');
    await testDb.entry.update({
      where: { id: entry.id },
      data: {
        note: 'The note after a manual edit.',
        activities: { create: [{ activityId: dining.id }] },
      },
    });
    const client = { complete: vi.fn().mockResolvedValue(JSON.stringify({ activityIds: [gaming.id] })) };

    await expect(inferEntryActivities(user.id, entry.id, snapshot(entry), client)).resolves.toEqual({
      status: 'stale',
      activityIds: [],
    });
    await expect(testDb.entryActivity.findMany()).resolves.toEqual([
      { entryId: entry.id, activityId: dining.id },
    ]);
    expect(client.complete).not.toHaveBeenCalled();
  });

  it('revalidates activity state before attaching inferred links', async () => {
    const user = await createUser();
    const activity = await testDb.activity.create({ data: { userId: user.id, name: 'Gaming', emoji: '🎮' } });
    const entry = await createEntry(user.id, 'I played games.');
    const client = {
      complete: vi.fn().mockImplementation(async () => {
        await testDb.activity.update({ where: { id: activity.id }, data: { isArchived: true } });
        return JSON.stringify({ activityIds: [activity.id] });
      }),
    };

    await expect(inferEntryActivities(user.id, entry.id, snapshot(entry), client)).resolves.toEqual({
      status: 'empty',
      activityIds: [],
    });
    expect(await testDb.entryActivity.count()).toBe(0);
  });

  it('reports a missing entry without calling the classifier', async () => {
    const user = await createUser();

    await expect(inferEntryActivities(user.id, 'missing-entry', {
      note: 'Missing.',
      updatedAt: new Date(),
    })).resolves.toEqual({ status: 'missing', activityIds: [] });
    expect(mocks.configuredLlmClient).not.toHaveBeenCalled();
  });
});

describe('runEntryActivityInference', () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
  });

  it('logs enrichment failures without throwing', async () => {
    const user = await createUser();
    await testDb.activity.create({ data: { userId: user.id, name: 'Gaming', emoji: '🎮' } });
    const entry = await createEntry(user.id);
    mocks.configuredLlmClient.mockReturnValue({
      complete: vi.fn().mockResolvedValue('not JSON'),
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runEntryActivityInference(user.id, entry.id, snapshot(entry))).resolves.toBeUndefined();
    expect(await testDb.entryActivity.count()).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith('Automatic activity inference failed.', expect.any(Error));
    errorSpy.mockRestore();
  });
});
