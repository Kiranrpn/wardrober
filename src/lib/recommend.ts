import type {
  ClothingItem,
  Compatibility,
  RoleLabels,
  SoloWearEvent,
  WearEvent,
} from '../db/types'
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
  /** Item-only wears (past-wear import). They count toward an item's recent usage;
   *  they carry no pair, so pair history ignores them. */
  soloWearEvents?: SoloWearEvent[]
  categoryIds: number[]
  impliedCompatibility: boolean
  /** Mild penalty for categories already worn today, so a day flows between contexts. */
  penaliseCategoriesUsedToday?: boolean
}

const W_ITEM_RECENCY = 0.45
const W_ITEM_USAGE = 0.2
const W_PAIR_RECENCY = 0.2
const W_PAIR_USAGE = 0.1
const W_JITTER = 0.05
/** Recency keeps rising up to this many days, so a long-forgotten item still
 *  outranks one rested for only a month. */
const RECENCY_HORIZON_DAYS = 180
/** Usage counts wears inside this window, not over the item's lifetime, so heavy
 *  old history does not bench an item and a new one does not chase its count. */
const USAGE_WINDOW_DAYS = 90
const INNERWEAR_RECENCY_HORIZON_DAYS = 30
const DAY_MS = 86400000

const dayGap = (ts: number | undefined, now: number) =>
  ts === undefined ? Infinity : (now - ts) / DAY_MS

const cap = (gap: number, horizon: number) =>
  gap === Infinity ? 1 : Math.min(gap, horizon) / horizon

/** 0 for worn just now, 1 at the horizon or never worn. Log-shaped so short gaps
 *  (2 days vs 20) stay far apart while long ones keep climbing slowly. */
const logRecency = (gap: number, horizon: number) =>
  gap === Infinity ? 1 : Math.min(1, Math.log1p(Math.max(0, gap)) / Math.log1p(horizon))

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
    soloWearEvents = [],
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

  const windowStart = now - USAGE_WINDOW_DAYS * DAY_MS
  const itemRecent = new Map<number, number>()
  const bump = (id: number) => itemRecent.set(id, (itemRecent.get(id) ?? 0) + 1)
  const pairRecent = new Map<string, number>()
  const pairLast = new Map<string, number>()
  const categoriesUsedToday = new Set<number>()
  for (const e of wearEvents) {
    const k = e.pairKey
    pairLast.set(k, Math.max(pairLast.get(k) ?? 0, e.timestamp))
    if (e.timestamp >= windowStart) {
      pairRecent.set(k, (pairRecent.get(k) ?? 0) + 1)
      bump(e.topId)
      bump(e.bottomId)
    }
    if (e.date === today && e.categoryId !== undefined) categoriesUsedToday.add(e.categoryId)
  }
  for (const e of soloWearEvents) if (e.timestamp >= windowStart) bump(e.itemId)

  const recentWears = (i: ClothingItem) => itemRecent.get(i.id!) ?? 0
  const maxRecentTop = Math.max(1, ...tops.map(recentWears))
  const maxRecentBottom = Math.max(1, ...bottoms.map(recentWears))
  const maxPairRecent = Math.max(1, ...pairRecent.values())

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
        (logRecency(dayGap(top.lastWornAt, now), RECENCY_HORIZON_DAYS) +
          logRecency(dayGap(bottom.lastWornAt, now), RECENCY_HORIZON_DAYS)) /
        2
      const itemUsage =
        (1 - recentWears(top) / maxRecentTop + (1 - recentWears(bottom) / maxRecentBottom)) / 2
      const pairUsage = 1 - (pairRecent.get(k) ?? 0) / maxPairRecent
      const pairRecency = logRecency(dayGap(pairLast.get(k), now), RECENCY_HORIZON_DAYS)

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
        0.45 * cap(dayGap(item.lastWornAt, now), INNERWEAR_RECENCY_HORIZON_DAYS) +
        0.45 * (1 - item.lifetimeWears / maxWear) +
        0.1 * Math.random(),
    }))
    .sort((a, b) => b.score - a.score)
}

/** Copy is built from the user's own role names rather than hardcoded words. */
export function failureCopy(
  reason: FailureReason,
  labels: RoleLabels,
): { title: string; body: string } | undefined {
  const top = labels.TOP.toLowerCase()
  const bottom = labels.BOTTOM.toLowerCase()
  switch (reason) {
    case 'NO_ITEMS':
      return { title: 'Your wardrobe is empty', body: 'Add some clothes to start generating pairs.' }
    case 'NO_CATEGORIES':
      return {
        title: 'No categories enabled',
        body: 'Choose which categories should appear in Today.',
      }
    case 'NO_TOPS':
      return {
        title: `No ${top} in this category`,
        body: `Add a ${top} and assign it to this category.`,
      }
    case 'NO_BOTTOMS':
      return {
        title: `No ${bottom} in this category`,
        body: `Add a ${bottom} and assign it to this category.`,
      }
    case 'ALL_IN_LAUNDRY':
      return {
        title: 'Everything suitable is in laundry',
        body: 'Your available wardrobe does not currently contain a suitable pair.',
      }
    case 'ALL_IN_REPAIR':
      return {
        title: 'Everything suitable is under repair',
        body: 'Your available wardrobe does not currently contain a suitable pair.',
      }
    case 'NO_COMPATIBILITY':
      return {
        title: 'No compatible pair',
        body: `Set up your ${labels.TOP} + ${labels.BOTTOM} compatibility to start generating outfits.`,
      }
    default:
      return undefined
  }
}
