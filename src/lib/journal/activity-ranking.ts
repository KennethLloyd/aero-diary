import type { ActivityOption } from './types';

export const EDIT_ACTIVITY_PREVIEW_SIZE = 6;

export function rankEditableActivities(
  activities: readonly ActivityOption[],
  selectedActivityIds: ReadonlySet<string>,
): ActivityOption[] {
  return activities
    .map((activity, index) => ({ activity, index }))
    .sort((left, right) => {
      const selectedOrder = Number(selectedActivityIds.has(right.activity.id))
        - Number(selectedActivityIds.has(left.activity.id));
      return selectedOrder || left.index - right.index;
    })
    .map(({ activity }) => activity);
}
