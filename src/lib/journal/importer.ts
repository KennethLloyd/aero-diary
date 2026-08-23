import { createHash } from 'node:crypto';
import { search as searchEmoji } from 'node-emoji';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { Mood } from '@/generated/prisma/enums';
import {
  journalImportTemplateSchema,
  type JournalImportActivityDefinition,
  type JournalImportEntry,
  type JournalImportMoodDefinition,
  type JournalImportTemplate,
} from '@/lib/journal/import-template';

export type NormalizedJournalEntry = {
  sourceId: number
  date: Date
  localOffset: number
  mood: Mood
  note: string
  isFavorite: boolean
  activities: Array<{ name: string; emoji: string }>
  photos: Array<{ drivePath: string; mimeType: string }>
};

export type ParsedJournalImport = {
  template: JournalImportTemplate
  entries: NormalizedJournalEntry[]
  sourceHash: string
};

export type ImportValidationReport = {
  sourceHash: string
  sourceCount: number
  existingSourceCount: number
  newSourceCount: number
  databaseRowsAbsentFromSource: number
  conflictingSourceIds: number[]
};

export type ImportBatchProgress = {
  completed: number
  total: number
};

export class JournalImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JournalImportValidationError';
  }
}

export class JournalImportTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JournalImportTargetError';
  }
}

export function normalizeActivityName(value: string): string {
  return value.trim().toLowerCase();
}

export const DEFAULT_ACTIVITY_EMOJI = '✨';

export function resolveActivityEmoji(name: string, providedEmoji?: string): string {
  if (providedEmoji?.trim()) return providedEmoji.trim();

  const normalized = normalizeActivityName(name);
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  const exactNames = new Set([normalized.replaceAll(' ', '_'), ...tokens]);
  const candidates = tokens.flatMap((token) => searchEmoji(token));
  const exact = candidates.find((candidate) => exactNames.has(candidate.name));
  return exact?.emoji ?? candidates[0]?.emoji ?? DEFAULT_ACTIVITY_EMOJI;
}

function findActivityDefinition(
  value: string,
  definitions: JournalImportActivityDefinition[],
): JournalImportActivityDefinition {
  const normalized = normalizeActivityName(value);
  const matches = definitions.filter((definition) => normalizeActivityName(definition.name) === normalized);
  if (matches.length === 0) {
    throw new JournalImportValidationError(`Unsupported activity in import template: ${value}`);
  }
  if (matches.length > 1) {
    throw new JournalImportValidationError(`Ambiguous activity definition: ${value}`);
  }
  return matches[0];
}

function parseDateWithOffset(value: string): { date: Date; localOffset: number } {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new JournalImportValidationError(`Invalid journal date: ${value}`);
  }

  if (value.endsWith('Z')) return { date, localOffset: 0 };
  const offset = value.match(/([+-])(\d{2}):?(\d{2})$/);
  if (!offset) {
    throw new JournalImportValidationError(`Journal date must include a UTC offset: ${value}`);
  }

  const minutes = Number(offset[2]) * 60 + Number(offset[3]);
  if (minutes > 14 * 60) {
    throw new JournalImportValidationError(`Journal date offset is out of range: ${value}`);
  }
  return {
    date,
    localOffset: offset[1] === '-' ? -minutes : minutes,
  };
}

function mimeTypeForPhotoPath(path: string): string {
  const extension = path.split('.').at(-1)?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'heic' || extension === 'heif') return 'image/heic';
  return 'image/jpeg';
}

function findMoodDefinition(
  value: string,
  definitions: JournalImportMoodDefinition[],
): JournalImportMoodDefinition {
  const normalized = value.trim().toLowerCase();
  const matches = definitions.filter((definition) => definition.name.trim().toLowerCase() === normalized);
  if (matches.length === 0) {
    throw new JournalImportValidationError(`Unsupported source mood: ${value}`);
  }
  if (matches.length > 1) {
    throw new JournalImportValidationError(`Ambiguous mood definition: ${value}`);
  }
  return matches[0];
}

function normalizeEntry(
  entry: JournalImportEntry,
  moodDefinitions: JournalImportMoodDefinition[],
  activityDefinitions: JournalImportActivityDefinition[],
): NormalizedJournalEntry {
  const { date, localOffset } = parseDateWithOffset(entry.date);
  const mood = findMoodDefinition(entry.mood, moodDefinitions).target as Mood;

  const activities = [...new Set(entry.tags.map(normalizeActivityName))].map((name) => {
    const definition = findActivityDefinition(name, activityDefinitions);
    return { name: definition.name, emoji: resolveActivityEmoji(definition.name, definition.emoji) };
  });
  const photos = [...new Set(entry.photoPaths)].map((drivePath) => ({
    drivePath,
    mimeType: mimeTypeForPhotoPath(drivePath),
  }));

  return {
    sourceId: entry.id,
    date,
    localOffset,
    mood,
    note: entry.note,
    isFavorite: entry.isFavorite,
    activities,
    photos,
  };
}

export function parseJournalImportTemplate(raw: string | Buffer): ParsedJournalImport {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw.toString());
  } catch {
    throw new JournalImportValidationError('The import file is not valid JSON.');
  }

  const parsed = journalImportTemplateSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new JournalImportValidationError(
      `The import template is invalid at ${issue?.path.join('.') || 'root'}: ${issue?.message ?? 'invalid value'}`,
    );
  }

  const sourceIds = new Set<number>();
  for (const entry of parsed.data.entries) {
    if (sourceIds.has(entry.id)) {
      throw new JournalImportValidationError(`Duplicate source id: ${entry.id}`);
    }
    sourceIds.add(entry.id);
  }

  return {
    template: parsed.data,
    entries: parsed.data.entries.map((entry) => normalizeEntry(
      entry,
      parsed.data.schema.moods,
      parsed.data.schema.tags,
    )),
    sourceHash: createHash('sha256').update(raw).digest('hex'),
  };
}

async function findUser(database: PrismaClient, email: string) {
  const user = await database.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true },
  });
  if (!user) throw new JournalImportTargetError(`Import target does not exist: ${email}`);
  return user;
}

export async function validateImportTarget(
  database: PrismaClient,
  email: string,
  demoEmail?: string,
) {
  const target = await findUser(database, email);
  if (demoEmail?.trim().toLowerCase() === target.email) {
    throw new JournalImportTargetError('The journal import cannot target the configured demo account.');
  }
  return target;
}

export async function buildImportValidationReport(
  database: PrismaClient,
  userId: string,
  entries: NormalizedJournalEntry[],
  sourceHash: string,
): Promise<ImportValidationReport> {
  const sourceIds = entries.map((entry) => entry.sourceId);
  const sourceIdSet = new Set(sourceIds);
  const existingBySourceId = await database.entry.findMany({
    where: { sourceId: { in: sourceIds } },
    select: { sourceId: true, userId: true },
  });
  const conflictingSourceIds = existingBySourceId
    .filter((entry) => entry.userId !== userId)
    .map((entry) => entry.sourceId)
    .filter((sourceId): sourceId is number => sourceId !== null)
    .sort((left, right) => left - right);
  if (conflictingSourceIds.length > 0) {
    throw new JournalImportTargetError(
      `Source IDs already belong to another user: ${conflictingSourceIds.join(', ')}`,
    );
  }

  const existingTargetEntries = await database.entry.findMany({
    where: { userId, sourceId: { not: null } },
    select: { sourceId: true },
  });
  const existingTargetIds = new Set(
    existingTargetEntries
      .map((entry) => entry.sourceId)
      .filter((sourceId): sourceId is number => sourceId !== null),
  );

  return {
    sourceHash,
    sourceCount: entries.length,
    existingSourceCount: entries.filter((entry) => existingTargetIds.has(entry.sourceId)).length,
    newSourceCount: entries.filter((entry) => !existingTargetIds.has(entry.sourceId)).length,
    databaseRowsAbsentFromSource: [...existingTargetIds].filter((sourceId) => !sourceIdSet.has(sourceId)).length,
    conflictingSourceIds,
  };
}

async function ensureTemplateActivities(
  transaction: Prisma.TransactionClient,
  userId: string,
  definitions: JournalImportActivityDefinition[],
): Promise<Map<string, string>> {
  const existing = await transaction.activity.findMany({
    where: { userId },
    select: { id: true, name: true, emoji: true },
  });
  const byName = new Map<string, typeof existing[number]>();
  for (const activity of existing) {
    const key = normalizeActivityName(activity.name);
    if (byName.has(key)) {
      throw new JournalImportValidationError(`Ambiguous activity names for ${activity.name}.`);
    }
    byName.set(key, activity);
  }

  const ids = new Map<string, string>();
  for (const definition of definitions) {
    const { name } = definition;
    const emoji = resolveActivityEmoji(name, definition.emoji);
    const existingActivity = byName.get(normalizeActivityName(name));
    if (existingActivity) {
      if (existingActivity.emoji !== emoji) {
        await transaction.activity.update({
          where: { id: existingActivity.id },
          data: { emoji },
        });
      }
      ids.set(normalizeActivityName(name), existingActivity.id);
      continue;
    }

    const created = await transaction.activity.create({
      data: {
        userId,
        name,
        emoji,
        sortOrder: ids.size,
      },
      select: { id: true },
    });
    ids.set(normalizeActivityName(name), created.id);
  }
  return ids;
}

async function upsertEntry(
  transaction: Prisma.TransactionClient,
  userId: string,
  activityIds: Map<string, string>,
  entry: NormalizedJournalEntry,
): Promise<void> {
  const existing = await transaction.entry.findUnique({
    where: { sourceId: entry.sourceId },
    select: {
      id: true,
      userId: true,
      photos: { select: { id: true, drivePath: true } },
    },
  });
  if (existing && existing.userId !== userId) {
    throw new JournalImportTargetError(`Source ID already belongs to another user: ${entry.sourceId}`);
  }

  const activityCreates = entry.activities.map(({ name }) => ({
    activityId: activityIds.get(normalizeActivityName(name)),
  }));
  const entryData = {
    date: entry.date,
    localOffset: entry.localOffset,
    mood: entry.mood,
    note: entry.note,
    isFavorite: entry.isFavorite,
  } satisfies Prisma.EntryUpdateInput;

  const saved = existing
    ? await transaction.entry.update({ where: { id: existing.id }, data: entryData, select: { id: true } })
    : await transaction.entry.create({
      data: {
        sourceId: entry.sourceId,
        userId,
        ...entryData,
      },
      select: { id: true },
    });

  await transaction.entryActivity.deleteMany({ where: { entryId: saved.id } });
  for (const activity of activityCreates) {
    if (!activity.activityId) {
      throw new JournalImportValidationError(`Missing imported activity id for source ${entry.sourceId}.`);
    }
    await transaction.entryActivity.create({
      data: {
        entryId: saved.id,
        activityId: activity.activityId,
      },
    });
  }

  const existingPhotos = existing?.photos ?? [];
  const nextPaths = new Set(entry.photos.map((photo) => photo.drivePath));
  const stalePhotoIds = existingPhotos
    .filter((photo) => !nextPaths.has(photo.drivePath))
    .map((photo) => photo.id);
  if (stalePhotoIds.length > 0) {
    await transaction.photo.deleteMany({ where: { id: { in: stalePhotoIds } } });
  }

  const existingPhotoByPath = new Map(existingPhotos.map((photo) => [photo.drivePath, photo.id]));
  for (const photo of entry.photos) {
    const existingPhotoId = existingPhotoByPath.get(photo.drivePath);
    if (existingPhotoId) {
      await transaction.photo.update({
        where: { id: existingPhotoId },
        data: { mimeType: photo.mimeType },
      });
    } else {
      await transaction.photo.create({
        data: {
          entryId: saved.id,
          drivePath: photo.drivePath,
          mimeType: photo.mimeType,
        },
      });
    }
  }
}

export async function importJournalEntries(
  database: PrismaClient,
  userId: string,
  entries: NormalizedJournalEntry[],
  activityDefinitions: JournalImportActivityDefinition[],
  options: {
    batchSize?: number
    onBatch?: (progress: ImportBatchProgress) => void | Promise<void>
  } = {},
): Promise<void> {
  const batchSize = options.batchSize ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new JournalImportValidationError('Batch size must be a positive integer.');
  }

  const activityIds = await database.$transaction((transaction) => ensureTemplateActivities(
    transaction,
    userId,
    activityDefinitions,
  ));
  for (let start = 0; start < entries.length; start += batchSize) {
    const batch = entries.slice(start, start + batchSize);
    await database.$transaction(async (transaction) => {
      for (const entry of batch) {
        await upsertEntry(transaction, userId, activityIds, entry);
      }
    });
    await options.onBatch?.({
      completed: Math.min(start + batch.length, entries.length),
      total: entries.length,
    });
  }
}
