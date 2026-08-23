import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Mood } from '@/generated/prisma/enums';
import { resetTestDb, testDb } from '@/test/test-db';

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  verifySession: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath, updateTag: mocks.updateTag }));
vi.mock('@/lib/dal', () => ({ verifySession: mocks.verifySession }));
vi.mock('@/lib/db', async () => {
  const { testDb } = await import('@/test/test-db');
  return { db: testDb };
});

import {
  createActivity,
  deleteActivity,
  restoreActivity,
  updateActivity,
} from '@/actions/activities';

function form(name = 'work', emoji = '💻'): FormData {
  const data = new FormData();
  data.set('name', name);
  data.set('emoji', emoji);
  return data;
}

describe('activity actions', () => {
  let currentUserId: string;

  beforeEach(async () => {
    await resetTestDb();
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    });
    currentUserId = user.id;
    vi.clearAllMocks();
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: currentUserId });
  });

  it('rejects an anonymous create request before validating or writing', async () => {
    mocks.verifySession.mockRejectedValue(new Error('NEXT_REDIRECT'));

    await expect(createActivity(undefined, form())).rejects.toThrow('NEXT_REDIRECT');
    expect(await testDb.activity.count()).toBe(0);
  });

  it('validates activity input', async () => {
    const state = await createActivity(undefined, form('   ', ''));

    expect(state).toEqual({ error: 'Enter an activity name.' });
    expect(mocks.updateTag).not.toHaveBeenCalled();
    expect(await testDb.activity.count()).toBe(0);
  });

  it('creates, renames, and archives activities without removing historical links', async () => {
    const created = await createActivity(undefined, form());
    expect(created).toEqual({ success: 'Activity added.' });
    expect(mocks.updateTag).toHaveBeenCalledWith(`journal:${currentUserId}:activities`);

    const activity = await testDb.activity.findFirstOrThrow();
    const updated = await updateActivity(activity.id, undefined, form('focus', '🎯'));
    expect(updated).toEqual({ success: 'Activity updated.' });
    expect(mocks.updateTag).toHaveBeenCalledWith(`journal:${currentUserId}:activities`);

    expect(await testDb.activity.findUniqueOrThrow({ where: { id: activity.id } })).toMatchObject({
      name: 'focus',
      emoji: '🎯',
    });

    const entry = await testDb.entry.create({
      data: {
        userId: currentUserId,
        date: new Date(),
        localOffset: 480,
        mood: Mood.GOOD,
        note: 'Historical activity link.',
        activities: { create: [{ activityId: activity.id }] },
      },
    });

    await deleteActivity(activity.id);
    expect(mocks.updateTag).toHaveBeenCalledWith(`journal:${currentUserId}:activities`);
    expect(await testDb.activity.findUniqueOrThrow({ where: { id: activity.id } })).toMatchObject({
      isArchived: true,
    });
    expect(await testDb.entryActivity.findUnique({
      where: { entryId_activityId: { entryId: entry.id, activityId: activity.id } },
    })).not.toBeNull();

    expect(await restoreActivity(activity.id)).toEqual({ success: 'Activity restored.' });
    expect(await testDb.activity.findUniqueOrThrow({ where: { id: activity.id } })).toMatchObject({
      isArchived: false,
    });
  });

  it('keeps activity vocabularies isolated between users', async () => {
    const otherUser = await testDb.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    const otherActivity = await testDb.activity.create({
      data: { userId: otherUser.id, name: 'work', emoji: '💻' },
    });

    expect(await createActivity(undefined, form())).toEqual({ success: 'Activity added.' });
    expect(await testDb.activity.count({ where: { userId: currentUserId } })).toBe(1);

    const update = await updateActivity(otherActivity.id, undefined, form('private', '🔒'));
    expect(update).toEqual({ error: 'Activity not found.' });

    await deleteActivity(otherActivity.id);
    expect(await testDb.activity.findUniqueOrThrow({ where: { id: otherActivity.id } })).toMatchObject({
      isArchived: false,
    });
  });
});
