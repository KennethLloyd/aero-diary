import 'server-only';

import type { PrismaClient } from '@/generated/prisma/client';
import type { Mood } from '@/generated/prisma/enums';
import type { JournalDate } from '@/lib/journal/dates';

type EntryPhotoInput = {
  drivePath: string
  fileId: string | null
  mimeType: string
  sizeBytes: number | null
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
  return photos.map(({ drivePath, fileId, mimeType, sizeBytes }) => ({
    driveFileId: fileId,
    drivePath,
    mimeType,
    sizeBytes,
  }));
}

function entryContentWrites(input: EntryMutationInput) {
  return {
    mood: input.mood,
    note: input.note,
    photos: { create: photoWrites(input.photos) },
  };
}

type JournalDatabase = Pick<PrismaClient, 'entry'>;

export function createJournalEntry(
  database: JournalDatabase,
  input: EntryMutationInput & { userId: string; journalDate: JournalDate },
) {
  return database.entry.create({
    data: {
      userId: input.userId,
      journalDate: input.journalDate,
      activityInferencePending: true,
      ...entryContentWrites(input),
      activities: { create: activityWrites(input.activityIds) },
    },
  });
}

export function updateJournalEntry(
  database: JournalDatabase,
  entryId: string,
  input: EntryMutationInput,
) {
  return database.entry.update({
    where: { id: entryId },
    data: {
      ...entryContentWrites(input),
      activityInferencePending: false,
      activities: {
        deleteMany: {},
        create: activityWrites(input.activityIds),
      },
    },
  });
}
