import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { provisionUser } from '@/lib/auth/provision-user';
import type { DemoCredentials } from '@/lib/auth/demo-config';
import { journalDateFromDate, type JournalDate } from '@/lib/journal/dates';
const DAY_MS = 24 * 60 * 60 * 1000;

const DEMO_ACTIVITIES = [
  { name: 'Morning walk', emoji: '🚶', sortOrder: 0 },
  { name: 'Deep work', emoji: '💻', sortOrder: 1 },
  { name: 'Coffee break', emoji: '☕', sortOrder: 2 },
  { name: 'Reading', emoji: '📚', sortOrder: 3 },
  { name: 'Cooking', emoji: '🍳', sortOrder: 4 },
  { name: 'Outside time', emoji: '🌿', sortOrder: 5 },
  { name: 'Music', emoji: '🎧', sortOrder: 6 },
  { name: 'Rest', emoji: '🛋️', sortOrder: 7 },
] as const;

const MOOD_CYCLE = ['GOOD', 'RAD', 'GOOD', 'MEH', 'RAD', 'GOOD', 'BAD', 'GOOD', 'RAD', 'AWFUL'] as const;

const ENTRY_TEMPLATES = [
  { note: 'A calm start made the rest of the day feel easy.', activityNames: ['Morning walk', 'Coffee break'] },
  { note: 'The work block clicked today. Small progress still counts.', activityNames: ['Deep work', 'Music'] },
  { note: 'Made something warm, then let the evening slow down.', activityNames: ['Cooking', 'Rest'] },
  { note: 'A little outside time helped clear the mental tabs.', activityNames: ['Outside time', 'Morning walk'] },
  { note: 'Read a few chapters and kept the phone out of reach.', activityNames: ['Reading', 'Rest'] },
  { note: 'Shared a laugh, found a good song, and felt lighter afterward.', activityNames: ['Music', 'Coffee break'] },
  { note: 'The plan got messy, but I handled the important pieces.', activityNames: ['Deep work', 'Outside time'] },
  { note: 'Low battery day. Keeping things gentle was the right call.', activityNames: ['Rest', 'Reading'] },
  { note: 'A bright ordinary day with enough room to notice it.', activityNames: ['Morning walk', 'Cooking'] },
  { note: 'Not every day is a highlight. Tomorrow gets a fresh page.', activityNames: ['Rest'] },
] as const;

type DemoMood = (typeof MOOD_CYCLE)[number]

type DemoPhoto = {
  drivePath: string
  mimeType: string
}

export type DemoSeedEntry = {
  journalDate: JournalDate
  mood: DemoMood
  note: string
  activityNames: readonly string[]
  photos: readonly DemoPhoto[]
}

export type DemoSeedDataset = {
  activities: typeof DEMO_ACTIVITIES
  entries: DemoSeedEntry[]
}

const DEMO_PHOTOS: ReadonlyMap<number, DemoPhoto[]> = new Map([
  [14, [{ drivePath: 'photos/demo-forest.jpg', mimeType: 'image/jpeg' }]],
  [45, [{ drivePath: 'photos/demo-coffee.jpg', mimeType: 'image/jpeg' }]],
  [75, [{ drivePath: 'photos/demo-sky.jpg', mimeType: 'image/jpeg' }]],
]);

function seedEndDateKey(now: Date): JournalDate {
  return journalDateFromDate(now);
}

export function buildDemoDataset(now = new Date()): DemoSeedDataset {
  const endDate = new Date(`${seedEndDateKey(now)}T00:00:00.000Z`);
  const entries = Array.from({ length: 90 }, (_, index) => {
    const template = ENTRY_TEMPLATES[index % ENTRY_TEMPLATES.length];
    return {
      journalDate: journalDateFromDate(new Date(endDate.getTime() - (89 - index) * DAY_MS)),
      mood: MOOD_CYCLE[index % MOOD_CYCLE.length],
      note: template.note,
      activityNames: template.activityNames,
      photos: DEMO_PHOTOS.get(index) ?? [],
    };
  });

  return { activities: DEMO_ACTIVITIES, entries };
}

function sameStringArray(left: string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function isExistingDemoDataset(
  database: PrismaClient,
  userId: string,
): Promise<boolean> {
  const expected = buildDemoDataset();
  const [activities, entries] = await Promise.all([
    database.activity.findMany({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
      select: { name: true, emoji: true, isArchived: true, sortOrder: true },
    }),
    database.entry.findMany({
      where: { userId },
      orderBy: { journalDate: 'asc' },
      select: {
        sourceId: true,
        journalDate: true,
        mood: true,
        note: true,
        activities: {
          select: { activity: { select: { name: true, emoji: true } } },
        },
        photos: {
          select: { drivePath: true, mimeType: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
  ]);

  if (activities.length !== expected.activities.length || entries.length !== expected.entries.length) {
    return false;
  }

  const activitiesMatch = activities.every((activity, index) => {
    const expectedActivity = expected.activities[index];
    return expectedActivity
      && activity.name === expectedActivity.name
      && activity.emoji === expectedActivity.emoji
      && !activity.isArchived
      && activity.sortOrder === expectedActivity.sortOrder;
  });
  if (!activitiesMatch) return false;

  return entries.every((entry, index) => {
    const expectedEntry = expected.entries[index];
    if (
      entry.sourceId !== null
      || entry.mood !== expectedEntry.mood
      || entry.note !== expectedEntry.note
    ) {
      return false;
    }

    const activityKeys = entry.activities
      .map(({ activity }) => `${activity.name}:${activity.emoji}`)
      .sort();
    const expectedActivityKeys = expectedEntry.activityNames
      .map((name) => {
        const activity = expected.activities.find((candidate) => candidate.name === name);
        return `${name}:${activity?.emoji ?? ''}`;
      })
      .sort();
    if (!sameStringArray(activityKeys, expectedActivityKeys)) return false;

    const photoKeys = entry.photos.map((photo) => `${photo.drivePath}:${photo.mimeType}`);
    const expectedPhotoKeys = expectedEntry.photos
      .map((photo) => `${photo.drivePath}:${photo.mimeType}`);
    return sameStringArray(photoKeys, expectedPhotoKeys);
  });
}

export class DemoAccountConflictError extends Error {
  constructor() {
    super('The configured demo email belongs to an account that is not the existing demo dataset. Seeding stopped without changing it.');
    this.name = 'DemoAccountConflictError';
  }
}

export type DemoSeedSummary = {
  userId: string
  entries: number
  activities: number
  photos: number
}

export async function seedDemoData(
  database: PrismaClient,
  credentials: DemoCredentials,
  now = new Date(),
): Promise<DemoSeedSummary> {
  const existingUser = await database.user.findUnique({
    where: { email: credentials.email },
    select: { id: true },
  });
  if (existingUser && !(await isExistingDemoDataset(database, existingUser.id))) {
    throw new DemoAccountConflictError();
  }

  const dataset = buildDemoDataset(now);
  let summary: DemoSeedSummary | undefined;

  await database.$transaction(async (transaction: Prisma.TransactionClient) => {
    const user = await provisionUser(transaction, {
      email: credentials.email,
      password: credentials.password,
      name: 'Aero Diary Demo',
    });
    await transaction.user.update({
      where: { id: user.id },
      data: { styleStandard: null },
    });

    await transaction.entry.deleteMany({ where: { userId: user.id } });
    await transaction.activity.deleteMany({ where: { userId: user.id } });

    const activityIds = new Map<string, string>();
    for (const activity of dataset.activities) {
      const created = await transaction.activity.create({
        data: { userId: user.id, ...activity },
        select: { id: true, name: true },
      });
      activityIds.set(created.name, created.id);
    }

    let photoCount = 0;
    for (const entryData of dataset.entries) {
      await transaction.entry.create({
        data: {
          userId: user.id,
          journalDate: entryData.journalDate,
          mood: entryData.mood,
          note: entryData.note,
          activities: {
            create: entryData.activityNames.map((name) => ({
              activity: { connect: { id: activityIds.get(name) } },
            })),
          },
          photos: {
            create: entryData.photos.map((photo) => ({
              drivePath: photo.drivePath,
              driveFileId: null,
              mimeType: photo.mimeType,
            })),
          },
        },
      });
      photoCount += entryData.photos.length;
    }

    summary = {
      userId: user.id,
      entries: dataset.entries.length,
      activities: dataset.activities.length,
      photos: photoCount,
    };
  });

  if (!summary) throw new Error('Demo seed completed without a summary.');
  return summary;
}
