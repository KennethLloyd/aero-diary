import { describe, expect, it } from 'vitest'
import { LEGACY_ACTIVITIES } from '@/lib/activities'

describe('legacy activities', () => {
  it('contains the complete 25-item Daylio vocabulary with unique names', () => {
    expect(LEGACY_ACTIVITIES).toHaveLength(25)
    expect(new Set(LEGACY_ACTIVITIES.map((activity) => activity.name.toLowerCase())).size).toBe(25)
    expect(LEGACY_ACTIVITIES.find((activity) => activity.name === 'Piano')).toMatchObject({
      emoji: '🎹',
    })
  })
})
