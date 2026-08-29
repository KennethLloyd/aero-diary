import { describe, expect, it } from 'vitest';
import { rankEditableActivities } from './activity-ranking';

const activities = [
  { id: 'coding', name: 'Coding', emoji: '💻' },
  { id: 'dining', name: 'Dining', emoji: '🍽️' },
  { id: 'gaming', name: 'Gaming', emoji: '🎮' },
];

describe('rankEditableActivities', () => {
  it('puts selected activities first and preserves the deterministic activity order', () => {
    expect(rankEditableActivities(activities, new Set(['gaming', 'coding'])).map((activity) => activity.id))
      .toEqual(['coding', 'gaming', 'dining']);
  });
});
