import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTestDb, testDb } from '@/test/test-db';

const mocks = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  verifySession: vi.fn(),
}));

vi.mock('next/cache', () => ({ cacheLife: mocks.cacheLife, cacheTag: mocks.cacheTag }));
vi.mock('@/lib/dal', () => ({ verifySession: mocks.verifySession }));
vi.mock('@/lib/db', async () => {
  const { testDb } = await import('@/test/test-db');
  return { db: testDb };
});

import {
  getEntryDetailForUser,
  listActivities,
  listEntriesForMonth,
} from '@/lib/journal/queries';

describe('journal queries', () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
  });

  it('lists only the current user’s entries in the selected canonical month', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    });
    const otherUser = await testDb.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    const activity = await testDb.activity.create({
      data: { userId: user.id, name: 'trail', emoji: '🌲' },
    });
    const selectedMonth = { key: '2026-08', year: 2026, month: 8 };
    const selectedEntry = await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-01',
        mood: 'RAD',
        note: 'August entry.',
        activities: { create: [{ activityId: activity.id }] },
      },
    });
    await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-31',
        mood: 'GOOD',
        note: 'August entry two.',
      },
    });
    await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-09-01',
        mood: 'MEH',
        note: 'September entry.',
      },
    });
    await testDb.entry.create({
      data: {
        userId: otherUser.id,
        journalDate: '2026-08-10',
        mood: 'AWFUL',
        note: 'Private entry.',
      },
    });
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id });

    const entries = await listEntriesForMonth(selectedMonth);
    expect(mocks.cacheLife).toHaveBeenCalledWith('journal');
    expect(mocks.cacheTag).toHaveBeenCalledWith(`journal:${user.id}:calendar`, `journal:${user.id}:insights`);
    expect(entries).toHaveLength(2);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: selectedEntry.id,
          journalDate: '2026-08-01',
          activities: [
            {
              activityId: activity.id,
              activity: { name: 'trail', emoji: '🌲' },
            },
          ],
        }),
        expect.objectContaining({
          mood: 'GOOD',
          journalDate: '2026-08-31',
        }),
      ]),
    );
  });

  it('lists only active activities owned by the current user', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    });
    const otherUser = await testDb.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    await testDb.activity.createMany({
      data: [
        { userId: user.id, name: 'work', emoji: '💻' },
        { userId: user.id, name: 'old', emoji: '🗃️', isArchived: true },
        { userId: otherUser.id, name: 'private', emoji: '🔒' },
      ],
    });
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id });

    await expect(listActivities()).resolves.toEqual([
      { id: expect.any(String), name: 'work', emoji: '💻' },
    ]);
    expect(mocks.cacheLife).toHaveBeenCalledWith('journal');
    expect(mocks.cacheTag).toHaveBeenCalledWith(`journal:${user.id}:activities`);
  });

  it('keeps cached entry details isolated by user id', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    });
    const otherUser = await testDb.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    const entry = await testDb.entry.create({
      data: {
        userId: otherUser.id,
        journalDate: '2026-08-18',
        mood: 'RAD',
        note: 'Private note.',
      },
    });

    await expect(getEntryDetailForUser(user.id, entry.id)).resolves.toBeNull();
    expect(mocks.cacheTag).toHaveBeenCalledWith(`journal:${user.id}:entry:${entry.id}`);
  });
});
