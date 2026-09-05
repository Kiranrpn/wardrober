import type { ClothingItem, Compatibility, WearEvent } from '../db/types'
import { pairKey } from '../db/types'
import { todayKey } from './dates'

export interface PairCandidate {
  top: ClothingItem
  bottom: ClothingItem
  categoryId: number
  score: number
  key: string
}

export type FailureReason =
  | 'NO_ITEMS'
  | 'NO_CATEGORIES'
  | 'NO_TOPS'
  | 'NO_BOTTOMS'
  | 'ALL_IN_LAUNDRY'
  | 'ALL_IN_REPAIR'
  | 'NO_COMPATIBILITY'
  | 'NONE'

export interface RecommendationResult {
  candidates: PairCandidate[]
  reason: FailureReason
}

export interface EngineInput {
  items: ClothingItem[]
  compatibility: Compatibility[]
  wearEvents: WearEvent[]
  categoryIds: number[]
  impliedCompatibility: boolean
  /** Mild penalty for categories already worn today, so a day flows between contexts. */
  penaliseCategoriesUsedToday?: boolean
}

const W_ITEM_RECENCY = 0.3
const W_ITEM_USAGE = 0.25
const W_PAIR_USAGE = 0.2
const W_PAIR_RECENCY = 0.2
const W_JITTER = 0.05
const RECENCY_HORIZON_DAYS = 30
const PAIR_RECENCY_HORIZON_DAYS = 21

const dayGap = (ts: number | undefined, now: number) =>
  ts === undefined ? Infinity : (now - ts) / 86400000

const cap = (gap: number, horizon: number) =>
  gap === Infinity ? 1 : Math.min(gap, horizon) / horizon

export function buildCompatibilityIndex(records: Compatibility[]) {
  const map = new Map<string, boolean>()
  for (const r of records) map.set(pairKey(r.topId, r.bottomId), !r.excluded)
  return map
}

export function isCompatible(
  index: Map<string, boolean>,
  top: ClothingItem,
  bottom: ClothingItem,
  impliedCompatibility: boolean,
): boolean {
  const explicit = index.get(pairKey(top.id!, bottom.id!))
  if (explicit !== undefined) return explicit
  if (!impliedCompatibility) return false
  return top.categoryIds.some((c) => bottom.categoryIds.includes(c))
}

/** Pure and read-only: scores every eligible pair and returns them best-first.
 *  Callers cycle the list for "recommend another"; nothing here mutates wardrobe state. */
export function recommendPairs(input: EngineInput): RecommendationResult {
  const {
    items,
    compatibility,
    wearEvents,
    categoryIds,
    impliedCompatibility,
    penaliseCategoriesUsedToday,
  } = input

  if (items.length === 0) return { candidates: [], reason: 'NO_ITEMS' }
  if (categoryIds.length === 0) return { candidates: [], reason: 'NO_CATEGORIES' }

  const inScope = (i: ClothingItem) =>
    i.state !== 'RETIRED' && i.categoryIds.some((c) => categoryIds.includes(c))

  const scopedTops = items.filter((i) => i.role === 'TOP' && inScope(i))
  const scopedBottoms = items.filter((i) => i.role === 'BOTTOM' && inScope(i))
  const tops = scopedTops.filter((i) => i.state === 'AVAILABLE')
  const bottoms = scopedBottoms.filter((i) => i.state === 'AVAILABLE')

  if (scopedTops.length === 0) return { candidates: [], reason: 'NO_TOPS' }
  if (scopedBottoms.length === 0) return { candidates: [], reason: 'NO_BOTTOMS' }

  if (tops.length === 0 || bottoms.length === 0) {
    const blocked = [...scopedTops, ...scopedBottoms].filter((i) => i.state !== 'AVAILABLE')
    const laundry = blocked.filter((i) => i.state === 'LAUNDRY').length
    const repair = blocked.filter((i) => i.state === 'REPAIR').length
    return { candidates: [], reason: repair > laundry ? 'ALL_IN_REPAIR' : 'ALL_IN_LAUNDRY' }
  }

  const index = buildCompatibilityIndex(compatibility)
  const now = Date.now()
  const today = todayKey()

  const pairCount = new Map<string, number>()
  const pairLast = new Map<string, number>()
  const categoriesUsedToday = new Set<number>()
  for (const e of wearEvents) {
    const k = e.pairKey
    pairCount.set(k, (pairCount.get(k) ?? 0) + 1)
    pairLast.set(k, Math.max(pairLast.get(k) ?? 0, e.timestamp))
    if (e.date === today && e.categoryId !== undefined) categoriesUsedToday.add(e.categoryId)
  }

  const maxWearTop = Math.max(1, ...tops.map((t) => t.lifetimeWears))
  const maxWearBottom = Math.max(1, ...bottoms.map((b) => b.lifetimeWears))
  const maxPairCount = Math.max(1, ...pairCount.values())

  const candidates: PairCandidate[] = []
  for (const top of tops) {
    for (const bottom of bottoms) {
      if (!isCompatible(index, top, bottom, impliedCompatibility)) continue
      const shared = categoryIds.filter(
        (c) => top.categoryIds.includes(c) && bottom.categoryIds.includes(c),
      )
      if (shared.length === 0) continue

      const k = pairKey(top.id!, bottom.id!)
      const itemRecency =
        (cap(dayGap(top.lastWornAt, now), RECENCY_HORIZON_DAYS) +
          cap(dayGap(bottom.lastWornAt, now), RECENCY_HORIZON_DAYS)) /
        2
      const itemUsage =
        (1 - top.lifetimeWears / maxWearTop + (1 - bottom.lifetimeWears / maxWearBottom)) / 2
      const pairUsage = 1 - (pairCount.get(k) ?? 0) / maxPairCount
      const pairRecency = cap(dayGap(pairLast.get(k), now), PAIR_RECENCY_HORIZON_DAYS)

      const base =
        W_ITEM_RECENCY * itemRecency +
        W_ITEM_USAGE * itemUsage +
        W_PAIR_USAGE * pairUsage +
        W_PAIR_RECENCY * pairRecency +
        W_JITTER * Math.random()

      for (const categoryId of shared) {
        const penalty =
          penaliseCategoriesUsedToday && categoriesUsedToday.has(categoryId) ? 0.12 : 0
        candidates.push({ top, bottom, categoryId, score: base - penalty, key: `${k}:${categoryId}` })
      }
    }
  }

  if (candidates.length === 0) return { candidates: [], reason: 'NO_COMPATIBILITY' }

  candidates.sort((a, b) => b.score - a.score)

  // One pair can qualify under several categories; show each pair once.
  const seenPairs = new Set<string>()
  const deduped = candidates.filter((c) => {
    const k = pairKey(c.top.id!, c.bottom.id!)
    if (seenPairs.has(k)) return false
    seenPairs.add(k)
    return true
  })

  return { candidates: deduped, reason: 'NONE' }
}

export interface InnerwearCandidate {
  item: ClothingItem
  score: number
}

export function recommendInnerwear(
  items: ClothingItem[],
  events: { itemId: number; timestamp: number }[],
): InnerwearCandidate[] {
  const pool = items.filter((i) => i.role === 'INNERWEAR' && i.state === 'AVAILABLE')
  if (pool.length === 0) return []
  const now = Date.now()
  const maxWear = Math.max(1, ...pool.map((i) => i.lifetimeWears))
  void events
  return pool
    .map((item) => ({
      item,
      score:
        0.45 * cap(dayGap(item.lastWornAt, now), RECENCY_HORIZON_DAYS) +
        0.45 * (1 - item.lifetimeWears / maxWear) +
        0.1 * Math.random(),
    }))
    .sort((a, b) => b.score - a.score)
}

export const FAILURE_COPY: Record<Exclude<FailureReason, 'NONE'>, { title: string; body: string }> =
  {
    NO_ITEMS: {
      title: 'Your wardrobe is empty',
      body: 'Add some clothes to start generating pairs.',
    },
    NO_CATEGORIES: {
      title: 'No categories enabled',
      body: 'Choose which categories should appear in Today.',
    },
    NO_TOPS: {
      title: 'No tops in this category',
      body: 'Add a top and assign it to this category.',
    },
    NO_BOTTOMS: {
      title: 'No bottoms in this category',
      body: 'Add a bottom and assign it to this category.',
    },
    ALL_IN_LAUNDRY: {
      title: 'Everything suitable is in laundry',
      body: 'Your available wardrobe does not currently contain a suitable pair.',
    },
    ALL_IN_REPAIR: {
      title: 'Everything suitable is under repair',
      body: 'Your available wardrobe does not currently contain a suitable pair.',
    },
    NO_COMPATIBILITY: {
      title: 'No compatible pair',
      body: 'Set up your Top + Bottom compatibility to start generating outfits.',
    },
  }
