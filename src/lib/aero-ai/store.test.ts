import { beforeEach, describe, expect, it } from 'vitest';
import { testDb, resetTestDb } from '@/test/test-db';
import {
  createThreadForUser,
  deleteThreadForUser,
  failTurn,
  finishTurn,
  getThreadForUser,
  getCompletedTurnsBefore,
  listThreadsForUser,
  reserveTurn,
} from './store';
import { AeroAiStoreError } from './store';

describe('Aero AI thread store', () => {
  let ownerId: string;
  let otherUserId: string;

  beforeEach(async () => {
    await resetTestDb();
    const owner = await testDb.user.create({
      data: { email: 'aero-owner@example.com', passwordHash: 'hash' },
    });
    const other = await testDb.user.create({
      data: { email: 'other@example.com', passwordHash: 'hash' },
    });
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

  it('stores safe visual references for follow-ups and strips image payloads', async () => {
    const thread = await createThreadForUser(ownerId);
    const turn = await reserveTurn(ownerId, thread.id, crypto.randomUUID(), 'Find that picture.');
    if (turn.kind !== 'started') throw new Error('Expected a new turn.');

    const evidence = {
      entryId: 'entry-1',
      journalDate: '2026-10-01',
      mood: 'GOOD',
      content: 'Museum day.',
      score: 0.9,
      sources: [
        {
          sourceType: 'photo' as const,
          photoId: 'photo-1',
          similarity: 0.9,
          bytes: 'PRIVATE_BYTES',
          url: 'https://drive.example/private',
        },
      ],
      image: 'data:image/jpeg;base64,PRIVATE_BYTES',
    };

    await finishTurn(thread.id, turn.reservation.turnId, 'Museum day.', [evidence]);
    const stored = await testDb.aeroAiTurn.findUniqueOrThrow({
      where: { id: turn.reservation.turnId },
    });
    const history = await getCompletedTurnsBefore(thread.id, 2);

    expect(JSON.stringify(stored.evidence)).not.toContain('PRIVATE_BYTES');
    expect(JSON.stringify(stored.evidence)).not.toContain('https://drive');
    expect(history[0].evidence[0].sources).toEqual([
      { sourceType: 'photo', photoId: 'photo-1', similarity: 0.9 },
    ]);
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
    await expect(
      reserveTurn(ownerId, thread.id, requestId, 'Different content.'),
    ).rejects.toBeInstanceOf(AeroAiStoreError);
  });

  it('rejects overlapping turns and retries a failed request in place', async () => {
    const thread = await createThreadForUser(ownerId);
    const requestId = crypto.randomUUID();
    const started = await reserveTurn(ownerId, thread.id, requestId, 'Try this.');
    if (started.kind !== 'started') throw new Error('Expected a new turn.');

    await expect(
      reserveTurn(ownerId, thread.id, crypto.randomUUID(), 'Another message.'),
    ).rejects.toMatchObject({ status: 409 });
    await expect(reserveTurn(ownerId, thread.id, requestId, 'Try this.')).rejects.toMatchObject({
      status: 409,
    });

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
