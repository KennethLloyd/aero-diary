import { inspect } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityInferenceStatus, Mood } from '@/generated/prisma/enums';
import { resetTestDb, testDb } from '@/test/test-db';
import {
  inferEntryActivities,
  runEntryActivityInference,
  type EntryInferenceSnapshot,
} from './activity-inference';

const mocks = vi.hoisted(() => ({
  configuredLlmClient: vi.fn(),
}));

vi.mock('@/lib/journal/llm-client-config', () => ({
  configuredLlmClient: mocks.configuredLlmClient,
}));
vi.mock('@/lib/db', async () => {
  const { testDb } = await import('@/test/test-db');

  return { db: testDb };
});

async function createUser(email = `${crypto.randomUUID()}@example.com`) {
  return testDb.user.create({ data: { email, passwordHash: 'x' } });
}

async function createEntry(
  userId: string,
  note = 'I played games and had dinner.',
  activityInferenceStatus: ActivityInferenceStatus = ActivityInferenceStatus.COMPLETE,
) {
  return testDb.entry.create({
    data: {
      userId,
      journalDate: '2026-08-28',
      mood: Mood.GOOD,
      note,
      activityInferenceStatus,
    },
  });
}

function snapshot(entry: { note: string; updatedAt: Date }): EntryInferenceSnapshot {
  return { note: entry.note, updatedAt: entry.updatedAt };
}

function spyOnConsole() {
  const methods = ['debug', 'error', 'info', 'log', 'warn'] as const;

  return methods.map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
}

// inspect includes Error messages and stacks, which JSON.stringify would drop.
function loggedText(spies: ReturnType<typeof spyOnConsole>) {
  return inspect(
    spies.flatMap((spy) => spy.mock.calls),
    { depth: null },
  );
}

function clientReturning(activityIds: unknown[]) {
  return { complete: vi.fn().mockResolvedValue(JSON.stringify({ activityIds })) };
}

describe('inferEntryActivities', () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
  });

  it('attaches only active activities owned by the entry user', async () => {
    const user = await createUser('owner@example.com');
    const otherUser = await createUser('other@example.com');
    const gaming = await testDb.activity.create({
      data: { userId: user.id, name: 'Gaming', emoji: '🎮' },
    });
    const archived = await testDb.activity.create({
      data: { userId: user.id, name: 'Archived', emoji: '🗃️', isArchived: true },
    });
    const foreign = await testDb.activity.create({
      data: { userId: otherUser.id, name: 'Private', emoji: '🔒' },
    });
    const entry = await createEntry(user.id);
    mocks.configuredLlmClient.mockReturnValue({
      complete: vi.fn().mockResolvedValue(
        JSON.stringify({
          activityIds: [gaming.id, archived.id, foreign.id, gaming.id, 'missing-id'],
        }),
      ),
    });

    await expect(inferEntryActivities(user.id, entry.id, snapshot(entry))).resolves.toMatchObject({
      status: 'attached',
      activityIds: [gaming.id],
      availableCount: 1,
      returnedCount: 5,
      invalidCount: 0,
      unknownCount: 3,
    });
    await expect(testDb.entryActivity.findMany()).resolves.toEqual([
      { entryId: entry.id, activityId: gaming.id },
    ]);
  });

  it('supports empty classification without changing the entry', async () => {
    const user = await createUser();
    const activity = await testDb.activity.create({
      data: { userId: user.id, name: 'Gaming', emoji: '🎮' },
    });
    const entry = await createEntry(user.id, 'A quiet day.');
    mocks.configuredLlmClient.mockReturnValue({
      complete: vi.fn().mockResolvedValue('{"activityIds":[]}'),
    });

    await expect(inferEntryActivities(user.id, entry.id, snapshot(entry))).resolves.toMatchObject({
      status: 'empty',
      reason: 'model-returned-none',
      activityIds: [],
    });
    expect(await testDb.entryActivity.count({ where: { activityId: activity.id } })).toBe(0);
  });

  it('is safe to retry the same inference', async () => {
    const user = await createUser();
    const activity = await testDb.activity.create({
      data: { userId: user.id, name: 'Gaming', emoji: '🎮' },
    });
    const entry = await createEntry(user.id, 'I played games.');
    const client = {
      complete: vi.fn().mockResolvedValue(JSON.stringify({ activityIds: [activity.id] })),
    };

    await inferEntryActivities(user.id, entry.id, snapshot(entry), client);
    await expect(
      inferEntryActivities(user.id, entry.id, snapshot(entry), client),
    ).resolves.toMatchObject({
      status: 'empty',
      reason: 'nothing-to-attach',
      activityIds: [],
    });
    expect(await testDb.entryActivity.count()).toBe(1);
    expect(client.complete).toHaveBeenCalledTimes(2);
  });

  it('skips a stale inference after a user edit', async () => {
    const user = await createUser();
    const gaming = await testDb.activity.create({
      data: { userId: user.id, name: 'Gaming', emoji: '🎮' },
    });
    const dining = await testDb.activity.create({
      data: { userId: user.id, name: 'Dining', emoji: '🍽️' },
    });
    const entry = await createEntry(user.id, 'The old note.');
    await testDb.entry.update({
      where: { id: entry.id },
      data: {
        note: 'The note after a manual edit.',
        activities: { create: [{ activityId: dining.id }] },
      },
    });
    const client = {
      complete: vi.fn().mockResolvedValue(JSON.stringify({ activityIds: [gaming.id] })),
    };

    await expect(
      inferEntryActivities(user.id, entry.id, snapshot(entry), client),
    ).resolves.toMatchObject({
      status: 'stale',
      reason: 'changed-before-classification',
      activityIds: [],
    });
    await expect(testDb.entryActivity.findMany()).resolves.toEqual([
      { entryId: entry.id, activityId: dining.id },
    ]);
    expect(client.complete).not.toHaveBeenCalled();
  });

  it('revalidates activity state before attaching inferred links', async () => {
    const user = await createUser();
    const activity = await testDb.activity.create({
      data: { userId: user.id, name: 'Gaming', emoji: '🎮' },
    });
    const entry = await createEntry(user.id, 'I played games.');
    const client = {
      complete: vi.fn().mockImplementation(async () => {
        await testDb.activity.update({ where: { id: activity.id }, data: { isArchived: true } });

        return JSON.stringify({ activityIds: [activity.id] });
      }),
    };

    await expect(
      inferEntryActivities(user.id, entry.id, snapshot(entry), client),
    ).resolves.toMatchObject({
      status: 'empty',
      reason: 'nothing-to-attach',
      activityIds: [],
    });
    expect(await testDb.entryActivity.count()).toBe(0);
  });

  it('reports a missing entry without calling the classifier', async () => {
    const user = await createUser();

    await expect(
      inferEntryActivities(user.id, 'missing-entry', {
        note: 'Missing.',
        updatedAt: new Date(),
      }),
    ).resolves.toMatchObject({
      status: 'missing',
      reason: 'deleted-before-classification',
      activityIds: [],
    });
    expect(mocks.configuredLlmClient).not.toHaveBeenCalled();
  });
});

describe('runEntryActivityInference', () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
  });

  afterEach(() => vi.restoreAllMocks());

  it('logs enrichment failures without throwing', async () => {
    const user = await createUser();
    await testDb.activity.create({ data: { userId: user.id, name: 'Gaming', emoji: '🎮' } });
    const entry = await createEntry(user.id, undefined, ActivityInferenceStatus.PENDING);
    mocks.configuredLlmClient.mockReturnValue({
      complete: vi.fn().mockResolvedValue('not JSON'),
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      runEntryActivityInference(user.id, entry.id, snapshot(entry)),
    ).resolves.toBeUndefined();
    expect(await testDb.entryActivity.count()).toBe(0);
    await expect(
      testDb.entry.findUniqueOrThrow({ where: { id: entry.id } }),
    ).resolves.toMatchObject({
      activityInferenceStatus: ActivityInferenceStatus.FAILED,
    });
    expect(errorSpy).toHaveBeenCalledWith('Automatic activity inference failed.', {
      entryId: entry.id,
      error: { name: 'Error' },
    });
  });

  it.each([
    ['string', 'P2002', { name: 'ProviderError', code: 'P2002' }],
    ['number', 503, { name: 'ProviderError', code: 503 }],
    ['object', { detail: 'private' }, { name: 'ProviderError' }],
  ])('logs only the error name and a %s code', async (_type, code, expectedError) => {
    const user = await createUser();
    await testDb.activity.create({ data: { userId: user.id, name: 'Gaming', emoji: '🎮' } });
    const entry = await createEntry(user.id, undefined, ActivityInferenceStatus.PENDING);
    const providerError = Object.assign(new Error('private message'), {
      name: 'ProviderError',
      code,
    });
    mocks.configuredLlmClient.mockReturnValue({
      complete: vi.fn().mockRejectedValue(providerError),
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await runEntryActivityInference(user.id, entry.id, snapshot(entry));

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('Automatic activity inference failed.', {
      entryId: entry.id,
      error: expectedError,
    });
  });

  it('logs a sanitized error when a thrown value is not an Error', async () => {
    const user = await createUser();
    await testDb.activity.create({ data: { userId: user.id, name: 'Gaming', emoji: '🎮' } });
    const entry = await createEntry(user.id, undefined, ActivityInferenceStatus.PENDING);
    mocks.configuredLlmClient.mockReturnValue({
      complete: vi.fn().mockRejectedValue('private message'),
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await runEntryActivityInference(user.id, entry.id, snapshot(entry));

    expect(errorSpy).toHaveBeenCalledWith('Automatic activity inference failed.', {
      entryId: entry.id,
      error: { name: 'UnknownError' },
    });
  });

  it('sanitizes a status update failure after the finished event', async () => {
    const user = await createUser();
    const entry = await createEntry(user.id, undefined, ActivityInferenceStatus.PENDING);
    const databaseError = Object.assign(new Error(`Query failed for ${entry.note}`), {
      name: 'DatabaseError',
      code: 'P1001',
    });
    vi.spyOn(testDb.entry, 'updateMany').mockRejectedValue(databaseError);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      runEntryActivityInference(user.id, entry.id, snapshot(entry)),
    ).resolves.toBeUndefined();

    const sanitizedLog = { entryId: entry.id, error: { name: 'DatabaseError', code: 'P1001' } };

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls).toEqual([
      ['Automatic activity inference status update failed.', sanitizedLog],
      ['Automatic activity inference failed.', sanitizedLog],
    ]);
  });

  it('marks successful enrichment complete so the timeline can reconcile it', async () => {
    const user = await createUser();
    const activity = await testDb.activity.create({
      data: { userId: user.id, name: 'Gaming', emoji: '🎮' },
    });
    const entry = await createEntry(user.id, undefined, ActivityInferenceStatus.PENDING);
    mocks.configuredLlmClient.mockReturnValue({
      complete: vi.fn().mockResolvedValue(JSON.stringify({ activityIds: [activity.id] })),
    });

    await runEntryActivityInference(user.id, entry.id, snapshot(entry));

    await expect(
      testDb.entry.findUniqueOrThrow({ where: { id: entry.id } }),
    ).resolves.toMatchObject({
      activityInferenceStatus: ActivityInferenceStatus.COMPLETE,
    });
  });

  it('marks empty enrichment complete so the client stops polling', async () => {
    const user = await createUser();
    const entry = await createEntry(user.id, undefined, ActivityInferenceStatus.PENDING);

    await runEntryActivityInference(user.id, entry.id, snapshot(entry));

    await expect(
      testDb.entry.findUniqueOrThrow({ where: { id: entry.id } }),
    ).resolves.toMatchObject({
      activityInferenceStatus: ActivityInferenceStatus.COMPLETE,
    });
  });
});

describe('ACTIVITY_INFERENCE_FINISHED event', () => {
  const message = 'Automatic activity inference finished.';
  const notReached = { availableCount: 0, returnedCount: 0, invalidCount: 0, unknownCount: 0 };

  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  async function createActivity(userId: string) {
    return testDb.activity.create({ data: { userId, name: 'Gaming', emoji: '🎮' } });
  }

  async function createPendingEntry(userId: string, note?: string) {
    return createEntry(userId, note, ActivityInferenceStatus.PENDING);
  }

  it('logs the attached IDs without a reason', async () => {
    const user = await createUser();
    const activity = await createActivity(user.id);
    const entry = await createPendingEntry(user.id);
    mocks.configuredLlmClient.mockReturnValue(clientReturning([activity.id, 'missing-id', 42]));

    await runEntryActivityInference(user.id, entry.id, snapshot(entry));

    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(message, {
      code: 'ACTIVITY_INFERENCE_FINISHED',
      entryId: entry.id,
      outcome: 'attached',
      availableCount: 1,
      returnedCount: 3,
      invalidCount: 1,
      unknownCount: 1,
      attachedActivityIds: [activity.id],
    });
    expect(vi.mocked(console.info).mock.calls[0][1]).not.toHaveProperty('reason');
  });

  it('reports a blank note without calling the model', async () => {
    const user = await createUser();
    await createActivity(user.id);
    const entry = await createPendingEntry(user.id, '   ');
    const client = clientReturning([]);
    mocks.configuredLlmClient.mockReturnValue(client);

    await runEntryActivityInference(user.id, entry.id, snapshot(entry));

    expect(client.complete).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(message, {
      code: 'ACTIVITY_INFERENCE_FINISHED',
      entryId: entry.id,
      outcome: 'empty',
      reason: 'blank-note',
      ...notReached,
      attachedActivityIds: [],
    });
  });

  it('reports a user without active activities', async () => {
    const user = await createUser();
    const entry = await createPendingEntry(user.id);

    await runEntryActivityInference(user.id, entry.id, snapshot(entry));

    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(message, {
      code: 'ACTIVITY_INFERENCE_FINISHED',
      entryId: entry.id,
      outcome: 'empty',
      reason: 'no-active-activities',
      ...notReached,
      attachedActivityIds: [],
    });
  });

  it('reports a model that returned no IDs', async () => {
    const user = await createUser();
    await createActivity(user.id);
    const entry = await createPendingEntry(user.id);
    mocks.configuredLlmClient.mockReturnValue(clientReturning([]));

    await runEntryActivityInference(user.id, entry.id, snapshot(entry));

    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(message, {
      code: 'ACTIVITY_INFERENCE_FINISHED',
      entryId: entry.id,
      outcome: 'empty',
      reason: 'model-returned-none',
      ...notReached,
      availableCount: 1,
      attachedActivityIds: [],
    });
  });

  it('reports a model that returned only invalid or unknown IDs', async () => {
    const user = await createUser();
    await createActivity(user.id);
    const entry = await createPendingEntry(user.id);
    mocks.configuredLlmClient.mockReturnValue(clientReturning(['missing-id', 42]));

    await runEntryActivityInference(user.id, entry.id, snapshot(entry));

    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(message, {
      code: 'ACTIVITY_INFERENCE_FINISHED',
      entryId: entry.id,
      outcome: 'empty',
      reason: 'no-usable-ids',
      availableCount: 1,
      returnedCount: 2,
      invalidCount: 1,
      unknownCount: 1,
      attachedActivityIds: [],
    });
  });

  it('reports usable IDs that were already attached', async () => {
    const user = await createUser();
    const activity = await createActivity(user.id);
    const entry = await createPendingEntry(user.id);
    await testDb.entryActivity.create({ data: { entryId: entry.id, activityId: activity.id } });
    mocks.configuredLlmClient.mockReturnValue(clientReturning([activity.id]));

    await runEntryActivityInference(user.id, entry.id, snapshot(entry));

    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(message, {
      code: 'ACTIVITY_INFERENCE_FINISHED',
      entryId: entry.id,
      outcome: 'empty',
      reason: 'nothing-to-attach',
      ...notReached,
      availableCount: 1,
      returnedCount: 1,
      attachedActivityIds: [],
    });
  });

  it('reports an entry that changed before classification', async () => {
    const user = await createUser();
    const entry = await createPendingEntry(user.id);
    await testDb.entry.update({ where: { id: entry.id }, data: { note: 'Edited first.' } });

    await runEntryActivityInference(user.id, entry.id, snapshot(entry));

    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(message, {
      code: 'ACTIVITY_INFERENCE_FINISHED',
      entryId: entry.id,
      outcome: 'stale',
      reason: 'changed-before-classification',
      ...notReached,
      attachedActivityIds: [],
    });
  });

  it('reports an entry that changed during the model call', async () => {
    const user = await createUser();
    const activity = await createActivity(user.id);
    const entry = await createPendingEntry(user.id);
    mocks.configuredLlmClient.mockReturnValue({
      complete: vi.fn().mockImplementation(async () => {
        await testDb.entry.update({ where: { id: entry.id }, data: { note: 'Edited midway.' } });

        return JSON.stringify({ activityIds: [activity.id] });
      }),
    });

    await runEntryActivityInference(user.id, entry.id, snapshot(entry));

    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(message, {
      code: 'ACTIVITY_INFERENCE_FINISHED',
      entryId: entry.id,
      outcome: 'stale',
      reason: 'changed-before-save',
      ...notReached,
      availableCount: 1,
      returnedCount: 1,
      attachedActivityIds: [],
    });
  });

  it('reports an entry that was gone before classification', async () => {
    const user = await createUser();

    await runEntryActivityInference(user.id, 'missing-entry', {
      note: 'Missing.',
      updatedAt: new Date(),
    });

    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(message, {
      code: 'ACTIVITY_INFERENCE_FINISHED',
      entryId: 'missing-entry',
      outcome: 'missing',
      reason: 'deleted-before-classification',
      ...notReached,
      attachedActivityIds: [],
    });
  });

  it('reports an entry that was deleted during the model call', async () => {
    const user = await createUser();
    const activity = await createActivity(user.id);
    const entry = await createPendingEntry(user.id);
    mocks.configuredLlmClient.mockReturnValue({
      complete: vi.fn().mockImplementation(async () => {
        await testDb.entry.delete({ where: { id: entry.id } });

        return JSON.stringify({ activityIds: [activity.id] });
      }),
    });

    await runEntryActivityInference(user.id, entry.id, snapshot(entry));

    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(message, {
      code: 'ACTIVITY_INFERENCE_FINISHED',
      entryId: entry.id,
      outcome: 'missing',
      reason: 'deleted-before-save',
      ...notReached,
      availableCount: 1,
      returnedCount: 1,
      attachedActivityIds: [],
    });
  });

  it('logs no finished event when the run throws', async () => {
    const user = await createUser();
    await createActivity(user.id);
    const entry = await createPendingEntry(user.id);
    mocks.configuredLlmClient.mockReturnValue({
      complete: vi.fn().mockResolvedValue('not JSON'),
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await runEntryActivityInference(user.id, entry.id, snapshot(entry));

    expect(console.info).not.toHaveBeenCalled();
  });
});

describe('inference log privacy', () => {
  const secret = 'PRIVATE-MARKER-7f3a';

  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
  });

  afterEach(() => vi.restoreAllMocks());

  async function createPrivateEntry() {
    const user = await createUser();
    const activity = await testDb.activity.create({
      data: { userId: user.id, name: `Activity ${secret}`, emoji: '🔒' },
    });
    const entry = await createEntry(
      user.id,
      `Journal text ${secret}`,
      ActivityInferenceStatus.PENDING,
    );

    return { user, activity, entry };
  }

  it('keeps private text out of the success path', async () => {
    const { user, activity, entry } = await createPrivateEntry();
    mocks.configuredLlmClient.mockReturnValue(clientReturning([activity.id, secret]));
    const spies = spyOnConsole();

    await runEntryActivityInference(user.id, entry.id, snapshot(entry));

    const logs = loggedText(spies);

    expect(logs).toContain(activity.id);
    expect(logs).not.toContain(secret);
  });

  it('keeps private text out of the empty path', async () => {
    const { user, entry } = await createPrivateEntry();
    mocks.configuredLlmClient.mockReturnValue(clientReturning([secret]));
    const spies = spyOnConsole();

    await runEntryActivityInference(user.id, entry.id, snapshot(entry));

    const logs = loggedText(spies);

    expect(logs).toContain('no-usable-ids');
    expect(logs).not.toContain(secret);
  });

  it('keeps private text out of the failure path', async () => {
    const { user, entry } = await createPrivateEntry();
    mocks.configuredLlmClient.mockReturnValue({
      complete: vi.fn().mockRejectedValue(new Error(`Provider echoed ${secret}`)),
    });
    const spies = spyOnConsole();

    await runEntryActivityInference(user.id, entry.id, snapshot(entry));

    const logs = loggedText(spies);

    expect(logs).toContain(entry.id);
    expect(logs).not.toContain(secret);
  });

  it('keeps private text out of a failed status update', async () => {
    const { user, entry } = await createPrivateEntry();
    mocks.configuredLlmClient.mockReturnValue(clientReturning([]));
    vi.spyOn(testDb.entry, 'updateMany').mockRejectedValue(new Error(`Query had ${secret}`));
    const spies = spyOnConsole();

    await runEntryActivityInference(user.id, entry.id, snapshot(entry));

    const logs = loggedText(spies);

    expect(logs).toContain('status update failed');
    expect(logs).not.toContain(secret);
  });
});
