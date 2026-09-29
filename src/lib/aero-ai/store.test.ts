import { beforeEach, describe, expect, it } from 'vitest';
import { testDb, resetTestDb } from '@/test/test-db';
import {
  createThreadForUser,
  deleteThreadForUser,
  failTurn,
  finishTurn,
  getThreadForUser,
  listThreadsForUser,
  reserveTurn,
} from './store';
import { AeroAiStoreError } from './store';

describe('Aero AI thread store', () => {
  let ownerId: string;
  let otherUserId: string;

  beforeEach(async () => {
    await resetTestDb();
    const owner = await testDb.user.create({ data: { email: 'aero-owner@example.com', passwordHash: 'hash' } });
    const other = await testDb.user.create({ data: { email: 'other@example.com', passwordHash: 'hash' } });
    ownerId = owner.id;
    otherUserId = other.id;
  });

  it('keeps thread lists and reads within the owning account and cascades deletes', async () => {
    const owned = await createThreadForUser(ownerId);
    const foreign = await createThreadForUser(otherUserId);

    expect((await listThreadsForUser(ownerId)).map(({ id }) => id)).toEqual([owned.id]);
    expect(await getThreadForUser(ownerId, foreign.id)).toBeNull();
    expect(await deleteThreadForUser(ownerId, foreign.id)).toBe(false);

    const turn = await reserveTurn(ownerId, owned.id, crypto.randomUUID(), 'Hello.');
    if (turn.kind !== 'started') throw new Error('Expected a new turn.');
    await finishTurn(owned.id, turn.reservation.turnId, 'Hello there.', []);
    expect(await deleteThreadForUser(ownerId, owned.id)).toBe(true);
    expect(await testDb.aeroAiTurn.count({ where: { threadId: owned.id } })).toBe(0);
  });

  it('replays a completed client request without creating another turn', async () => {
    const thread = await createThreadForUser(ownerId);
    const requestId = crypto.randomUUID();
    const started = await reserveTurn(ownerId, thread.id, requestId, 'A first thought.');
    if (started.kind !== 'started') throw new Error('Expected a new turn.');
    await finishTurn(thread.id, started.reservation.turnId, 'A reply.', []);

    const replay = await reserveTurn(ownerId, thread.id, requestId, 'A first thought.');
    expect(replay.kind).toBe('completed');
    expect(await testDb.aeroAiTurn.count({ where: { threadId: thread.id } })).toBe(1);
    await expect(reserveTurn(ownerId, thread.id, requestId, 'Different content.'))
      .rejects.toBeInstanceOf(AeroAiStoreError);
  });

  it('rejects overlapping turns and retries a failed request in place', async () => {
    const thread = await createThreadForUser(ownerId);
    const requestId = crypto.randomUUID();
    const started = await reserveTurn(ownerId, thread.id, requestId, 'Try this.');
    if (started.kind !== 'started') throw new Error('Expected a new turn.');

    await expect(reserveTurn(ownerId, thread.id, crypto.randomUUID(), 'Another message.'))
      .rejects.toMatchObject({ status: 409 });
    await expect(reserveTurn(ownerId, thread.id, requestId, 'Try this.'))
      .rejects.toMatchObject({ status: 409 });

    await failTurn(thread.id, started.reservation.turnId);
    const retry = await reserveTurn(ownerId, thread.id, requestId, 'Try this.');
    if (retry.kind !== 'started') throw new Error('Expected the failed turn to retry.');

    expect(retry.reservation.turnId).toBe(started.reservation.turnId);
    expect(retry.reservation.sequence).toBe(started.reservation.sequence);
    expect(await testDb.aeroAiTurn.count({ where: { threadId: thread.id } })).toBe(1);
    await failTurn(thread.id, retry.reservation.turnId);
    expect((await getThreadForUser(ownerId, thread.id))?.turns?.[0]).toMatchObject({
      userContent: 'Try this.',
      assistantContent: null,
      status: 'FAILED',
    });
  });
});
