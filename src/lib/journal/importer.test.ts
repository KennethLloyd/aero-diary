import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDb, testDb } from '@/test/test-db';
import {
  buildImportValidationReport,
  importJournalEntries,
  parseJournalImportTemplate,
  validateImportTarget,
} from '@/lib/journal/importer';

function template(entries: Record<string, unknown>[]) {
  return JSON.stringify({
    schema: {
      moods: [{ name: 'uplifted', target: 'RAD' }],
      tags: [
        { name: 'maker', emoji: '🧪' },
        { name: 'coloring', emoji: '🖍️' },
      ],
    },
    entries,
  });
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    date: '2026-08-01T12:00:00+08:00',
    mood: 'UPLIFTED',
    note: 'Synthetic fixture note.',
    tags: ['maker', 'coloring', 'COLORING'],
    ...overrides,
  };
}

describe('JournalImportTemplate parsing and import', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it('parses the template shape, applies defaults, and normalizes import values', () => {
    const parsed = parseJournalImportTemplate(template([entry({ photoPaths: ['photos/example.jpg'] })]));

    expect(parsed.entries[0]).toMatchObject({
      sourceId: 1,
      mood: 'RAD',
      localOffset: 480,
      isFavorite: false,
      activities: [
        { name: 'maker', emoji: '🧪' },
        { name: 'coloring', emoji: '🖍️' },
      ],
      photos: [{ drivePath: 'photos/example.jpg', mimeType: 'image/jpeg' }],
    });
    expect(parsed.sourceHash).toHaveLength(64);
  });

  it('rejects duplicate ids and unsupported activity names before database access', () => {
    expect(() => parseJournalImportTemplate(template([entry(), entry({ id: 1 })]))).toThrow('Duplicate source id');
    expect(() => parseJournalImportTemplate(template([entry({ tags: ['unknown activity'] })]))).toThrow(
      'Unsupported activity in import template',
    );
  });

  it('rejects duplicate template definitions before any database access', () => {
    expect(() => parseJournalImportTemplate(JSON.stringify({
      schema: {
        moods: [{ name: 'Uplifted', target: 'RAD' }],
        tags: [
          { name: 'Maker', emoji: '🧪' },
          { name: 'maker', emoji: '🛠️' },
        ],
      },
      entries: [],
    }))).toThrow('tags names must be unique case-insensitively');
  });

  it('honors explicit emojis, derives omitted emojis, and uses a fallback when unresolved', () => {
    const parsed = parseJournalImportTemplate(JSON.stringify({
      schema: {
        moods: [{ name: 'neutral', target: 'MEH' }],
        tags: [
          { name: 'coffee', emoji: '🧪' },
          { name: 'coffee-derived' },
          { name: 'qzxv' },
        ],
      },
      entries: [{
        id: 7,
        date: '2026-08-01T12:00:00+08:00',
        mood: 'neutral',
        note: 'Synthetic fixture note.',
        tags: ['coffee', 'coffee-derived', 'qzxv'],
      }],
    }));

    expect(parsed.entries[0]?.activities).toEqual([
      { name: 'coffee', emoji: '🧪' },
      { name: 'coffee-derived', emoji: '☕' },
      { name: 'qzxv', emoji: '✨' },
    ]);
  });

  it('rejects malformed records before a database write', async () => {
    const user = await testDb.user.create({ data: { email: 'private@example.com', passwordHash: 'x' } });
    expect(() => parseJournalImportTemplate(template([entry({ date: '2026-08-01' })]))).toThrow('import template is invalid');
    expect(await testDb.entry.count({ where: { userId: user.id } })).toBe(0);
  });

  it('imports idempotently without replacing a preflighted Drive id', async () => {
    const user = await testDb.user.create({ data: { email: 'private@example.com', passwordHash: 'x' } });
    const parsed = parseJournalImportTemplate(template([entry({ photoPaths: ['photos/example.jpg'] })]));

    await importJournalEntries(testDb, user.id, parsed.entries, parsed.template.schema.tags);
    const first = await testDb.entry.findFirstOrThrow({ include: { photos: true, activities: { include: { activity: true } } } });
    await testDb.photo.update({ where: { id: first.photos[0]?.id }, data: { driveFileId: 'drive-file' } });

    await importJournalEntries(testDb, user.id, parsed.entries, parsed.template.schema.tags);
    const second = await testDb.entry.findUniqueOrThrow({ where: { sourceId: 1 }, include: { photos: true } });

    expect(await testDb.entry.count({ where: { userId: user.id } })).toBe(1);
    expect(await testDb.activity.count({ where: { userId: user.id } })).toBe(2);
    expect(second.photos).toMatchObject([{ drivePath: 'photos/example.jpg', driveFileId: 'drive-file' }]);
  });

  it('reports database rows absent from the source without deleting them', async () => {
    const user = await testDb.user.create({ data: { email: 'private@example.com', passwordHash: 'x' } });
    await testDb.entry.create({
      data: {
        userId: user.id,
        sourceId: 99,
        date: new Date('2026-07-01T00:00:00Z'),
        localOffset: 480,
        mood: 'GOOD',
        note: 'Existing synthetic row.',
      },
    });
    const parsed = parseJournalImportTemplate(template([entry()]));

    const report = await buildImportValidationReport(testDb, user.id, parsed.entries, parsed.sourceHash);

    expect(report.databaseRowsAbsentFromSource).toBe(1);
    expect(await testDb.entry.count({ where: { sourceId: 99 } })).toBe(1);
  });

  it('blocks source ids from crossing user boundaries', async () => {
    const firstUser = await testDb.user.create({ data: { email: 'first@example.com', passwordHash: 'x' } });
    const secondUser = await testDb.user.create({ data: { email: 'second@example.com', passwordHash: 'x' } });
    const parsed = parseJournalImportTemplate(template([entry()]));

    await importJournalEntries(testDb, firstUser.id, parsed.entries, parsed.template.schema.tags);
    await expect(
      buildImportValidationReport(testDb, secondUser.id, parsed.entries, parsed.sourceHash),
    ).rejects.toThrow('already belong to another user');
    expect(await testDb.entry.count()).toBe(1);
    expect(await testDb.entry.count({ where: { userId: secondUser.id } })).toBe(0);
  });

  it('requires an existing non-demo import target', async () => {
    await expect(validateImportTarget(testDb, 'missing@example.com')).rejects.toThrow('does not exist');
    const demo = await testDb.user.create({ data: { email: 'demo@example.com', passwordHash: 'x' } });
    expect(demo.email).toBe('demo@example.com');
    await expect(validateImportTarget(testDb, demo.email, 'demo@example.com')).rejects.toThrow('demo account');
  });
});
