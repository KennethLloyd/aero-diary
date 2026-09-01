import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityInferenceStatus, Mood } from '@/generated/prisma/enums';
import { resetTestDb, testDb } from '@/test/test-db';

const mocks = vi.hoisted(() => ({
  verifySession: vi.fn(),
}));

vi.mock('@/lib/dal', () => ({ verifySession: mocks.verifySession }));
vi.mock('@/lib/db', async () => {
  const { testDb } = await import('@/test/test-db');
  return { db: testDb };
});

import { getEntryActivityInferenceStatus, refreshTimelinePage } from '@/actions/timeline';
import type { TimelineFilter } from '@/lib/journal/timeline';

describe('getEntryActivityInferenceStatus action', () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
  });

  it('returns the owned entry status without exposing another user entry', async () => {
    const user = await testDb.user.create({ data: { email: 'owner@example.com', passwordHash: 'x' } });
    const otherUser = await testDb.user.create({ data: { email: 'other@example.com', passwordHash: 'x' } });
    const ownedEntry = await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-31',
        mood: Mood.GOOD,
        note: 'Owned entry.',
        activityInferenceStatus: ActivityInferenceStatus.PENDING,
      },
    });
    const foreignEntry = await testDb.entry.create({
      data: {
        userId: otherUser.id,
        journalDate: '2026-08-31',
        mood: Mood.GOOD,
        note: 'Private entry.',
        activityInferenceStatus: ActivityInferenceStatus.FAILED,
      },
    });
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id });

    await expect(getEntryActivityInferenceStatus(ownedEntry.id)).resolves.toBe('pending');
    await expect(getEntryActivityInferenceStatus(foreignEntry.id)).resolves.toBe('complete');
  });

  it('requires a session before reading a status', async () => {
    mocks.verifySession.mockRejectedValue(new Error('NEXT_REDIRECT'));

    await expect(getEntryActivityInferenceStatus('entry-id')).rejects.toThrow('NEXT_REDIRECT');
  });

  it('ignores malformed client filters before loading a fresh page', async () => {
    const user = await testDb.user.create({ data: { email: 'filter-owner@example.com', passwordHash: 'x' } });
    await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-31',
        mood: Mood.GOOD,
        note: 'Visible entry.',
      },
    });
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id });

    await expect(refreshTimelinePage({ mood: 'INVALID' } as unknown as TimelineFilter)).resolves.toMatchObject({
      entries: [expect.objectContaining({ note: 'Visible entry.' })],
    });
  });
});
