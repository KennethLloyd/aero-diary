import type { LlmClient } from './llm-client';
import type { ActivityOption } from './types';
import { z } from 'zod';

export const MAX_INFERRED_ACTIVITY_COUNT = 5;

type ClassificationActivity = Pick<ActivityOption, 'id' | 'name'>;

const classificationResponseSchema = z.object({
  activityIds: z
    .array(z.string().trim().min(1).max(100))
    .max(MAX_INFERRED_ACTIVITY_COUNT),
}).strict();

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
    return JSON.parse(content);
  } catch {
    throw new Error('LLM returned invalid activity classification JSON.');
  }
}

export function parseInferredActivityIds(
  content: string,
  activities: readonly ClassificationActivity[],
): string[] {
  const parsed = classificationResponseSchema.safeParse(parseClassificationResponse(content));
  if (!parsed.success) throw new Error('LLM returned invalid activity classification.');

  const availableIds = new Set(activities.map((activity) => activity.id));
  return [...new Set(parsed.data.activityIds)].filter((activityId) => availableIds.has(activityId));
}

export async function classifyJournalActivities(
  note: string,
  activities: readonly ClassificationActivity[],
  client: LlmClient,
): Promise<string[]> {
  if (!note.trim() || activities.length === 0) return [];

  const content = await client.complete({
    systemPrompt: classificationSystemPrompt(activities),
    userPrompt: note,
  });
  return parseInferredActivityIds(content, activities);
}
