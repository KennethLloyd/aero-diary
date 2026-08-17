export type LegacyActivity = {
  name: string
  emoji: string
  sortOrder: number
}

// ADR-0004: the legacy Daylio vocabulary is seeded with an editable emoji map.
// Keep the exact legacy spelling (including "Piano") for import compatibility.
export const LEGACY_ACTIVITIES: readonly LegacyActivity[] = [
  { name: 'watching', emoji: '👀', sortOrder: 0 },
  { name: 'work', emoji: '💻', sortOrder: 1 },
  { name: 'gaming', emoji: '🎮', sortOrder: 2 },
  { name: 'exercise', emoji: '🏋️', sortOrder: 3 },
  { name: 'relax', emoji: '😌', sortOrder: 4 },
  { name: 'family', emoji: '👨‍👩‍👧‍👦', sortOrder: 5 },
  { name: 'chat', emoji: '💬', sortOrder: 6 },
  { name: 'heart', emoji: '❤️', sortOrder: 7 },
  { name: 'research', emoji: '🔎', sortOrder: 8 },
  { name: 'good meal', emoji: '🍽️', sortOrder: 9 },
  { name: 'travel', emoji: '✈️', sortOrder: 10 },
  { name: 'reading', emoji: '📚', sortOrder: 11 },
  { name: 'character development', emoji: '🌱', sortOrder: 12 },
  { name: 'social', emoji: '🫂', sortOrder: 13 },
  { name: 'sideline', emoji: '🏟️', sortOrder: 14 },
  { name: 'cooking', emoji: '🍳', sortOrder: 15 },
  { name: 'date', emoji: '💞', sortOrder: 16 },
  { name: 'drawing', emoji: '🎨', sortOrder: 17 },
  { name: 'driving', emoji: '🚗', sortOrder: 18 },
  { name: 'focus', emoji: '🎯', sortOrder: 19 },
  { name: 'karaoke', emoji: '🎤', sortOrder: 20 },
  { name: 'korean', emoji: '🇰🇷', sortOrder: 21 },
  { name: 'party', emoji: '🎉', sortOrder: 22 },
  { name: 'Piano', emoji: '🎹', sortOrder: 23 },
  { name: 'shopping', emoji: '🛍️', sortOrder: 24 },
]
