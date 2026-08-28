import 'server-only';

import type { PrismaClient } from '@/generated/prisma/client';
import type { Mood } from '@/generated/prisma/enums';
import type { JournalDate } from '@/lib/journal/dates';

type EntryPhotoInput = {
  drivePath: string
  fileId: string | null
  mimeType: string
}

type EntryMutationInput = {
  mood: Mood
  note: string
  activityIds: string[]
  photos: EntryPhotoInput[]
}

function activityWrites(activityIds: string[]) {
  return activityIds.map((activityId) => ({
    activity: { connect: { id: activityId } },
  }));
}

function photoWrites(photos: EntryPhotoInput[]) {
  return photos.map(({ drivePath, fileId, mimeType }) => ({
    driveFileId: fileId,
    drivePath,
    mimeType,
  }));
}

function entryContentWrites(input: EntryMutationInput) {
  return {
    mood: input.mood,
    note: input.note,
    photos: { create: photoWrites(input.photos) },
  };
}

export function createJournalEntry(
  database: PrismaClient,
  input: EntryMutationInput & { userId: string; journalDate: JournalDate },
) {
  return database.entry.create({
    data: {
      userId: input.userId,
      journalDate: input.journalDate,
      ...entryContentWrites(input),
      activities: { create: activityWrites(input.activityIds) },
    },
  });
}

export function updateJournalEntry(
  database: PrismaClient,
  entryId: string,
  input: EntryMutationInput,
) {
  return database.entry.update({
    where: { id: entryId },
    data: {
      ...entryContentWrites(input),
      activities: {
        deleteMany: {},
        create: activityWrites(input.activityIds),
      },
    },
  });
}
