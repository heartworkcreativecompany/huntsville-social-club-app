import {
  curatedMatchDisplayState,
  isArchivedMatchDisplayState,
} from '@/lib/curated-match-lifecycle'
import type { CuratedMatchListItem } from '@/lib/load-curated-matches'

export function countRecommendationsByArchive(items: CuratedMatchListItem[]): {
  active: number
  archived: number
} {
  let active = 0
  let archived = 0

  for (const item of items) {
    const displayState = curatedMatchDisplayState({
      introStatus: item.introStatus,
      recommendationStatus: item.status,
    })

    if (isArchivedMatchDisplayState(displayState)) {
      archived++
    } else {
      active++
    }
  }

  return { active, archived }
}
