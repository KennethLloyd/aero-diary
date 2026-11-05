import 'server-only';

import type { LlmClient } from './llm-client';
import type { ActivityOption } from './types';
import { z } from 'zod';

export const MAX_INFERRED_ACTIVITY_COUNT = 10;

type ClassificationActivity = Pick<ActivityOption, 'id' | 'name'>;

export type ActivityClassification = {
  activityIds: string[];
  returnedCount: number;
  invalidCount: number;
  unknownCount: number;
};

const classificationResponseSchema = z
  .object({
    activityIds: z.array(z.unknown()).max(100),
  })
  .strict();

const fencedJsonPattern = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
const reasoningPrefixPattern = /^<think>[\s\S]*?<\/think>\s*/i;

function normalizeClassificationResponse(content: string): string {
  let normalizedContent = content.trim().replace(reasoningPrefixPattern, '').trim();
  const fencedJson = fencedJsonPattern.exec(normalizedContent);
  if (fencedJson?.[1]) normalizedContent = fencedJson[1].trim();

  return normalizedContent.replace(reasoningPrefixPattern, '').trim();
}

const inferredActivityIdSchema = z.string().trim().min(1).max(100);

function classificationSystemPrompt(activities: readonly ClassificationActivity[]): string {
  return [
    'You classify a journal note into existing user activities.',
    'Return exactly one JSON object with this shape: {"activityIds":["existing-id"]}.',
    'Select only activity IDs from the supplied list.',
    'Be conservative: choose an activity only when the note clearly supports it.',
    'Do not infer activities from mood alone. Returning an empty array is valid.',
    `Return no more than ${MAX_INFERRED_ACTIVITY_COUNT} activity IDs.`,
    'Never create, rename, or modify an activity.',
    '',
    `Available activities: ${JSON.stringify(activities)}`,
  ].join('\n');
}

function parseClassificationResponse(content: string): unknown {
  try {
    return JSON.parse(normalizeClassificationResponse(content));
  } catch {
    throw new Error('LLM returned invalid activity classification JSON.');
  }
}

export function parseInferredActivityIds(
  content: string,
  activities: readonly ClassificationActivity[],
): ActivityClassification {
  const parsed = classificationResponseSchema.safeParse(parseClassificationResponse(content));
  if (!parsed.success) throw new Error('LLM returned invalid activity classification.');

  const returnedIds = parsed.data.activityIds;
  const availableIds = new Set(activities.map((activity) => activity.id));
  const validIds = returnedIds.flatMap((candidate) => {
    const parsedId = inferredActivityIdSchema.safeParse(candidate);

    return parsedId.success ? [parsedId.data] : [];
  });
  const uniqueIds = [...new Set(validIds)];
  const knownIds = uniqueIds.filter((activityId) => availableIds.has(activityId));

  return {
    activityIds: knownIds.slice(0, MAX_INFERRED_ACTIVITY_COUNT),
    returnedCount: returnedIds.length,
    invalidCount: returnedIds.length - validIds.length,
    unknownCount: uniqueIds.length - knownIds.length,
  };
}

export async function classifyJournalActivities(
  note: string,
  activities: readonly ClassificationActivity[],
  client: LlmClient,
): Promise<ActivityClassification> {
  if (!note.trim() || activities.length === 0) {
    return { activityIds: [], returnedCount: 0, invalidCount: 0, unknownCount: 0 };
  }

  const content = await client.complete({
    systemPrompt: classificationSystemPrompt(activities),
    userPrompt: note,
    responseFormat: 'json_object',
  });

  return parseInferredActivityIds(content, activities);
}
