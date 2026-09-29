import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import type { JournalMemoryResult } from '@/lib/journal/memory-retrieval';

export class AeroAiStoreError extends Error {
  constructor(message: string, readonly status: 404 | 409) {
    super(message);
    this.name = 'AeroAiStoreError';
  }
}

export type AeroAiTurnView = {
  id: string
  clientRequestId: string
  sequence: number
  userContent: string
  assistantContent: string | null
  status: 'GENERATING' | 'COMPLETE' | 'FAILED'
}

export type AeroAiThreadView = {
  id: string
  title: string
  updatedAt: Date
  isGenerating: boolean
  turns?: AeroAiTurnView[]
}

export type TurnReservation = {
  threadId: string
  turnId: string
  sequence: number
  userContent: string
  summary: string | null
  summaryThroughTurn: number
  title: string
}

export type CompletedTurn = {
  id: string
  sequence: number
  userContent: string
  assistantContent: string
  evidence: JournalMemoryResult[]
}

export async function listThreadsForUser(userId: string): Promise<AeroAiThreadView[]> {
  return db.aeroAiThread.findMany({
    where: { userId },
    select: { id: true, title: true, updatedAt: true, isGenerating: true },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function createThreadForUser(userId: string): Promise<AeroAiThreadView> {
  return db.aeroAiThread.create({
    data: { userId },
    select: { id: true, title: true, updatedAt: true, isGenerating: true },
  });
}

export async function getThreadForUser(
  userId: string,
  threadId: string,
): Promise<AeroAiThreadView | null> {
  return db.aeroAiThread.findFirst({
    where: { id: threadId, userId },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      isGenerating: true,
      turns: {
        orderBy: { sequence: 'asc' },
        select: {
          id: true,
          clientRequestId: true,
          sequence: true,
          userContent: true,
          assistantContent: true,
          status: true,
        },
      },
    },
  });
}

export async function deleteThreadForUser(userId: string, threadId: string): Promise<boolean> {
  const deleted = await db.aeroAiThread.deleteMany({ where: { id: threadId, userId } });
  return deleted.count > 0;
}

export async function reserveTurn(
  userId: string,
  threadId: string,
  clientRequestId: string,
  userContent: string,
): Promise<{ kind: 'completed'; turn: AeroAiTurnView & { assistantContent: string; title: string } } | { kind: 'started'; reservation: TurnReservation }> {
  return db.$transaction(async (tx) => {
    const thread = await tx.aeroAiThread.findFirst({
      where: { id: threadId, userId },
      select: { id: true, title: true },
    });
    if (!thread) throw new AeroAiStoreError('Chat not found.', 404);

    const requestWhere = { threadId_clientRequestId: { threadId, clientRequestId } };
    let existing = await tx.aeroAiTurn.findUnique({ where: requestWhere });
    if (existing && existing.userContent !== userContent) {
      throw new AeroAiStoreError('This request ID was already used for another message.', 409);
    }
    if (existing?.status === 'COMPLETE' && existing.assistantContent !== null) {
      return {
        kind: 'completed',
        turn: {
          id: existing.id,
          clientRequestId: existing.clientRequestId,
          sequence: existing.sequence,
          userContent: existing.userContent,
          assistantContent: existing.assistantContent,
          status: existing.status,
          title: thread.title,
        },
      };
    }
    if (existing?.status === 'GENERATING') {
      throw new AeroAiStoreError('A reply is already being generated for this chat.', 409);
    }

    const claimed = await tx.aeroAiThread.updateMany({
      where: { id: threadId, userId, isGenerating: false },
      data: { isGenerating: true },
    });
    if (!claimed.count) {
      throw new AeroAiStoreError('A reply is already being generated for this chat.', 409);
    }

    // Recheck after the claim so a just-finished retry with the same ID is replayed.
    existing = await tx.aeroAiTurn.findUnique({ where: requestWhere });
    if (existing && existing.userContent !== userContent) {
      throw new AeroAiStoreError('This request ID was already used for another message.', 409);
    }
    if (existing?.status === 'COMPLETE' && existing.assistantContent !== null) {
      const title = await tx.aeroAiThread.findUniqueOrThrow({
        where: { id: threadId },
        select: { title: true },
      });
      await tx.aeroAiThread.update({
        where: { id: threadId },
        data: { isGenerating: false },
      });
      return {
        kind: 'completed',
        turn: {
          id: existing.id,
          clientRequestId: existing.clientRequestId,
          sequence: existing.sequence,
          userContent: existing.userContent,
          assistantContent: existing.assistantContent,
          status: existing.status,
          title: title.title,
        },
      };
    }
    if (existing?.status === 'GENERATING') {
      throw new AeroAiStoreError('A reply is already being generated for this chat.', 409);
    }

    const claimedThread = await tx.aeroAiThread.findUniqueOrThrow({
      where: { id: threadId },
      select: { nextTurnSequence: true, summary: true, summaryThroughTurn: true, title: true },
    });
    let turnId: string;
    let sequence: number;
    if (existing?.status === 'FAILED') {
      const retry = await tx.aeroAiTurn.update({
        where: { id: existing.id },
        data: { status: 'GENERATING', assistantContent: null, evidence: Prisma.DbNull },
        select: { id: true, sequence: true },
      });
      turnId = retry.id;
      sequence = retry.sequence;
    } else {
      sequence = claimedThread.nextTurnSequence;
      const created = await tx.aeroAiTurn.create({
        data: { threadId, clientRequestId, sequence, userContent },
        select: { id: true },
      });
      turnId = created.id;
      const title = sequence === 1 ? threadTitleFromMessage(userContent) : claimedThread.title;
      await tx.aeroAiThread.update({
        where: { id: threadId },
        data: { nextTurnSequence: { increment: 1 }, title },
      });
    }

    return {
      kind: 'started',
      reservation: {
        threadId,
        turnId,
        sequence,
        userContent,
        summary: claimedThread.summary,
        summaryThroughTurn: claimedThread.summaryThroughTurn,
        title: sequence === 1 ? threadTitleFromMessage(userContent) : claimedThread.title,
      },
    };
  });
}

export async function getCompletedTurnsBefore(
  threadId: string,
  sequence: number,
): Promise<CompletedTurn[]> {
  const turns = await db.aeroAiTurn.findMany({
    where: { threadId, status: 'COMPLETE', sequence: { lt: sequence } },
    orderBy: { sequence: 'asc' },
    select: {
      id: true,
      sequence: true,
      userContent: true,
      assistantContent: true,
      evidence: true,
    },
  });
  return turns.flatMap((turn) => {
    if (turn.assistantContent === null) return [];
    return [{
      ...turn,
      assistantContent: turn.assistantContent,
      evidence: parseEvidence(turn.evidence),
    }];
  });
}

export async function saveThreadSummary(
  threadId: string,
  summary: string,
  throughTurn: number,
): Promise<void> {
  const updated = await db.aeroAiThread.updateMany({
    where: { id: threadId },
    data: { summary, summaryThroughTurn: throughTurn },
  });
  if (!updated.count) throw new AeroAiStoreError('Chat not found.', 404);
}

export async function finishTurn(
  threadId: string,
  turnId: string,
  assistantContent: string,
  evidence: JournalMemoryResult[],
): Promise<void> {
  await db.$transaction(async (tx) => {
    const updated = await tx.aeroAiTurn.updateMany({
      where: { id: turnId, threadId, status: 'GENERATING' },
      data: {
        assistantContent,
        status: 'COMPLETE',
        evidence: evidence.length ? evidence as Prisma.InputJsonValue : Prisma.DbNull,
      },
    });
    const released = await tx.aeroAiThread.updateMany({
      where: { id: threadId, isGenerating: true },
      data: { isGenerating: false },
    });
    if (!updated.count || !released.count) throw new AeroAiStoreError('Chat not found.', 404);
  });
}

export async function failTurn(threadId: string, turnId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.aeroAiTurn.updateMany({
      where: { id: turnId, threadId, status: 'GENERATING' },
      data: { assistantContent: null, evidence: Prisma.DbNull, status: 'FAILED' },
    });
    await tx.aeroAiThread.updateMany({
      where: { id: threadId, isGenerating: true },
      data: { isGenerating: false },
    });
  });
}

function threadTitleFromMessage(content: string): string {
  const firstLine = content.split(/\r?\n/, 1)[0]?.trim().replace(/\s+/g, ' ') ?? '';
  return firstLine.length > 56 ? `${firstLine.slice(0, 55).trimEnd()}…` : firstLine;
}

function parseEvidence(value: Prisma.JsonValue | null): JournalMemoryResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const evidence = item as Record<string, Prisma.JsonValue>;
    if (
      typeof evidence.entryId !== 'string'
      || typeof evidence.journalDate !== 'string'
      || typeof evidence.mood !== 'string'
      || typeof evidence.content !== 'string'
      || typeof evidence.score !== 'number'
    ) return [];
    return [{
      entryId: evidence.entryId,
      journalDate: evidence.journalDate,
      mood: evidence.mood,
      content: evidence.content,
      score: evidence.score,
    }];
  });
}
