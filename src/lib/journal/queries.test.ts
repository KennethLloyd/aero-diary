import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTestDb, testDb } from '@/test/test-db';

const mocks = vi.hoisted(() => ({
  verifySession: vi.fn(),
}));

vi.mock('@/lib/dal', () => ({ verifySession: mocks.verifySession }));
vi.mock('@/lib/db', async () => {
  const { testDb } = await import('@/test/test-db');
  return { db: testDb };
});

import { listActivities, listEntriesForMonth } from '@/lib/journal/queries';

describe('journal queries', () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
  });

  it('lists only the current user’s entries in the selected local month', async () => {
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
        date: new Date('2026-07-31T23:30:00.000Z'),
        localOffset: 120,
        mood: 'RAD',
        note: 'Local August entry.',
        activities: { create: [{ activityId: activity.id }] },
      },
    });
    await testDb.entry.create({
      data: {
        userId: user.id,
        date: new Date('2026-08-31T23:30:00.000Z'),
        localOffset: 0,
        mood: 'GOOD',
        note: 'Local August entry two.',
      },
    });
    await testDb.entry.create({
      data: {
        userId: user.id,
        date: new Date('2026-09-01T00:00:00.000Z'),
        localOffset: 0,
        mood: 'MEH',
        note: 'September entry.',
      },
    });
    await testDb.entry.create({
      data: {
        userId: otherUser.id,
        date: new Date('2026-08-10T00:00:00.000Z'),
        localOffset: 0,
        mood: 'AWFUL',
        note: 'Private entry.',
      },
    });
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id });

    const entries = await listEntriesForMonth(selectedMonth);
    expect(entries).toHaveLength(2);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: selectedEntry.id,
          date: selectedEntry.date,
          activities: [
            {
              activityId: activity.id,
              activity: { name: 'trail', emoji: '🌲' },
            },
          ],
        }),
        expect.objectContaining({
          mood: 'GOOD',
          localOffset: 0,
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
  });
});
