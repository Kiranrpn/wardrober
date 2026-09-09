import type {
  Category,
  ClothingItem,
  Compatibility,
  InnerwearWearEvent,
  SoloWearEvent,
  WashEvent,
  WearEvent,
} from '../db/types'
import { pairKey } from '../db/types'
import { buildCompatibilityIndex, isCompatible } from './recommend'

export function costPerWear(item: ClothingItem): number | null {
  if (!item.purchasePrice || item.lifetimeWears === 0) return null
  return item.purchasePrice / item.lifetimeWears
}

export function money(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 100) / 100
  return `${currency}${rounded.toLocaleString()}`
}

export interface PairStat {
  pairKey: string
  topId: number
  bottomId: number
  count: number
  lastUsed: number
}

export function pairStats(events: WearEvent[]): PairStat[] {
  const map = new Map<string, PairStat>()
  for (const e of events) {
    const existing = map.get(e.pairKey)
    if (existing) {
      existing.count += 1
      existing.lastUsed = Math.max(existing.lastUsed, e.timestamp)
    } else {
      map.set(e.pairKey, {
        pairKey: e.pairKey,
        topId: e.topId,
        bottomId: e.bottomId,
        count: 1,
        lastUsed: e.timestamp,
      })
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

export interface WardrobeStats {
  activeItems: number
  totalValue: number
  totalWears: number
  averageCostPerWear: number | null
  mostWorn: ClothingItem[]
  leastWorn: ClothingItem[]
  highestCostPerWear: Array<{ item: ClothingItem; cpw: number }>
  neverWorn: number
}

export function wardrobeStats(items: ClothingItem[]): WardrobeStats {
  const active = items.filter((i) => i.state !== 'RETIRED')
  const totalValue = active.reduce((sum, i) => sum + (i.purchasePrice ?? 0), 0)
  const totalWears = items.reduce((sum, i) => sum + i.lifetimeWears, 0)

  const withCpw = items
    .map((item) => ({ item, cpw: costPerWear(item) }))
    .filter((x): x is { item: ClothingItem; cpw: number } => x.cpw !== null)

  const averageCostPerWear =
    withCpw.length > 0 ? withCpw.reduce((s, x) => s + x.cpw, 0) / withCpw.length : null

  const byWear = [...active].sort((a, b) => b.lifetimeWears - a.lifetimeWears)

  return {
    activeItems: active.length,
    totalValue,
    totalWears,
    averageCostPerWear,
    mostWorn: byWear.slice(0, 5),
    // Never-worn items have their own tile. Leaving them in here made the two
    // lists the same list until every last item had been worn once.
    leastWorn: byWear.filter((i) => i.lifetimeWears > 0).reverse().slice(0, 5),
    highestCostPerWear: [...withCpw].sort((a, b) => b.cpw - a.cpw).slice(0, 5),
    neverWorn: active.filter((i) => i.lifetimeWears === 0).length,
  }
}

/* ------------------------------------------------------------------ laundry */

export interface WashSummary {
  washes: number
  lastWashedAt?: number
  /** Mean wears per completed cycle, counting only cycles that carried a wear.
   *  Marking an item clean when nothing has been worn since the last wash is a
   *  correction rather than a cycle, and averaging those zeros in would drag the
   *  figure below any real laundry habit. */
  averageWearsPerWash: number | null
}

export function washSummary(events: WashEvent[]): WashSummary {
  if (events.length === 0) return { washes: 0, averageWearsPerWash: null }
  const cycles = events.filter((e) => e.wearsAtWash > 0)
  return {
    washes: events.length,
    lastWashedAt: Math.max(...events.map((e) => e.timestamp)),
    averageWearsPerWash:
      cycles.length > 0
        ? cycles.reduce((sum, e) => sum + e.wearsAtWash, 0) / cycles.length
        : null,
  }
}

/* ------------------------------------------------------- the wear event log */

export interface WearLog {
  pair: WearEvent[]
  solo: SoloWearEvent[]
  innerwear: InnerwearWearEvent[]
}

export interface ItemWear {
  itemId: number
  timestamp: number
}

/** Every wear the app has recorded, flattened to one row per item per wear. The
 *  denormalised counters on an item answer "how many times, ever"; only the log
 *  can answer "how many times since March", which is what every figure below
 *  needs. A pair wear contributes two rows, one for each half. */
export function itemWears(log: WearLog): ItemWear[] {
  const rows: ItemWear[] = []
  for (const e of log.pair) {
    rows.push({ itemId: e.topId, timestamp: e.timestamp })
    rows.push({ itemId: e.bottomId, timestamp: e.timestamp })
  }
  for (const e of log.solo) rows.push({ itemId: e.itemId, timestamp: e.timestamp })
  for (const e of log.innerwear) rows.push({ itemId: e.itemId, timestamp: e.timestamp })
  return rows
}

/* ----------------------------------------------------------------- rotation */

export interface RotationStats {
  windowDays: number
  activeItems: number
  /** Distinct items worn at least once inside the window. */
  wornInWindow: number
  utilisation: number | null
  /** Share of the window's wears coming from the five busiest items. */
  concentration: number | null
  busiest: Array<{ item: ClothingItem; wears: number }>
  validPairs: number
  wornPairs: number
  pairCoverage: number | null
  /** Worn at some point, but not inside the window. Never-worn items are a
   *  separate figure: they are a buying problem, these are a rotation problem. */
  idle: ClothingItem[]
}

export interface RotationInput {
  items: ClothingItem[]
  categories: Category[]
  compatibility: Compatibility[]
  impliedCompatibility: boolean
  log: WearLog
  windowDays: number
  now?: number
}

/** Coverage rather than counts: how much of the wardrobe, and how much of the
 *  wardrobe's combinations, the rotation is actually reaching. Pairs are counted
 *  structurally, over everything not retired, so an item sitting in the laundry
 *  basket today does not shrink the denominator and flatter the number. */
export function rotationStats(input: RotationInput): RotationStats {
  const { items, categories, compatibility, impliedCompatibility, log, windowDays } = input
  const now = input.now ?? Date.now()
  const since = now - windowDays * 86400000

  const active = items.filter((i) => i.state !== 'RETIRED')
  const activeCategoryIds = new Set(categories.filter((c) => c.active).map((c) => c.id!))

  const wears = itemWears(log)
  const inWindow = wears.filter((w) => w.timestamp >= since)

  const perItem = new Map<number, number>()
  for (const w of inWindow) perItem.set(w.itemId, (perItem.get(w.itemId) ?? 0) + 1)

  const activeIds = new Set(active.map((i) => i.id!))
  let windowWears = 0
  const ranked: Array<{ item: ClothingItem; wears: number }> = []
  for (const [itemId, count] of perItem) {
    if (!activeIds.has(itemId)) continue
    const item = active.find((i) => i.id === itemId)
    if (!item) continue
    windowWears += count
    ranked.push({ item, wears: count })
  }
  ranked.sort((a, b) => b.wears - a.wears)

  const busiest = ranked.slice(0, 5)
  const topWears = busiest.reduce((s, r) => s + r.wears, 0)

  const everWorn = new Set(wears.map((w) => w.itemId))
  const idle = active.filter((i) => everWorn.has(i.id!) && !perItem.has(i.id!))

  // Structural pair space: every top/bottom the wardrobe would accept today.
  const index = buildCompatibilityIndex(compatibility)
  const tops = active.filter((i) => i.role === 'TOP')
  const bottoms = active.filter((i) => i.role === 'BOTTOM')
  const valid = new Set<string>()
  for (const top of tops) {
    for (const bottom of bottoms) {
      const shares = top.categoryIds.some(
        (c) => activeCategoryIds.has(c) && bottom.categoryIds.includes(c),
      )
      if (!shares) continue
      if (!isCompatible(index, top, bottom, impliedCompatibility)) continue
      valid.add(pairKey(top.id!, bottom.id!))
    }
  }

  // Intersected with the valid set on purpose: a pair worn last year and ruled
  // out since is no longer a combination available to the rotation, and counting
  // it would let coverage exceed the space it is measured against.
  const worn = new Set<string>()
  for (const e of log.pair) if (valid.has(e.pairKey)) worn.add(e.pairKey)

  return {
    windowDays,
    activeItems: active.length,
    wornInWindow: ranked.length,
    utilisation: active.length > 0 ? ranked.length / active.length : null,
    concentration: windowWears > 0 ? topWears / windowWears : null,
    busiest,
    validPairs: valid.size,
    wornPairs: worn.size,
    pairCoverage: valid.size > 0 ? worn.size / valid.size : null,
    idle: idle.sort((a, b) => (a.lastWornAt ?? 0) - (b.lastWornAt ?? 0)),
  }
}

/* -------------------------------------------------------------------- money */

export interface SpendYear {
  year: string
  total: number
  items: number
}

export interface CostPerWearPoint {
  label: string
  monthEnd: number
  /** Null until the tracked items have been worn at least once by that month. */
  cpw: number | null
}

export interface MoneyStats {
  spendByYear: SpendYear[]
  /** Priced items with no purchase date: real money, but it cannot be placed on
   *  a timeline, so it is reported beside the chart rather than inside it. */
  undatedSpend: number
  undatedItems: number
  dormantDays: number
  dormantValue: number
  dormantItems: number
  costPerWearTrend: CostPerWearPoint[]
  trackedItems: number
  untrackedItems: number
}

const MONTHS_TRACKED = 12

const monthEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1

export interface MoneyInput {
  items: ClothingItem[]
  log: WearLog
  dormantDays: number
  now?: number
}

/** What the wardrobe cost, and whether it is earning that back. The trend is a
 *  running portfolio cost per wear: at the end of each month, everything bought
 *  by then divided by every wear recorded by then. It falls as clothes get worn
 *  and steps up when something new is bought, which is the honest shape. */
export function moneyStats(input: MoneyInput): MoneyStats {
  const { items, log, dormantDays } = input
  const now = input.now ?? Date.now()

  const priced = items.filter((i) => (i.purchasePrice ?? 0) > 0)

  const byYear = new Map<string, SpendYear>()
  let undatedSpend = 0
  let undatedItems = 0
  for (const item of priced) {
    const year = item.purchaseDate?.slice(0, 4)
    if (!year || !/^\d{4}$/.test(year)) {
      undatedSpend += item.purchasePrice!
      undatedItems += 1
      continue
    }
    const row = byYear.get(year) ?? { year, total: 0, items: 0 }
    row.total += item.purchasePrice!
    row.items += 1
    byYear.set(year, row)
  }

  const wears = itemWears(log)
  const lastWorn = new Map<number, number>()
  for (const w of wears) {
    lastWorn.set(w.itemId, Math.max(lastWorn.get(w.itemId) ?? 0, w.timestamp))
  }

  const dormantSince = now - dormantDays * 86400000
  const dormant = priced.filter(
    (i) => i.state !== 'RETIRED' && (lastWorn.get(i.id!) ?? 0) < dormantSince,
  )

  // Only items carrying both a price and a purchase date can sit on a timeline;
  // the rest are counted out loud rather than silently folded in at month zero.
  const tracked = priced.filter((i) => i.purchaseDate && !Number.isNaN(Date.parse(i.purchaseDate)))
  const trackedIds = new Set(tracked.map((i) => i.id!))
  const trackedWears = wears
    .filter((w) => trackedIds.has(w.itemId))
    .sort((a, b) => a.timestamp - b.timestamp)

  const costPerWearTrend: CostPerWearPoint[] = []
  const cursor = new Date(now)
  cursor.setDate(1)
  cursor.setMonth(cursor.getMonth() - (MONTHS_TRACKED - 1))
  for (let m = 0; m < MONTHS_TRACKED; m++) {
    const end = monthEnd(cursor)
    const spend = tracked.reduce(
      (sum, i) => (Date.parse(i.purchaseDate! + 'T00:00:00') <= end ? sum + i.purchasePrice! : sum),
      0,
    )
    const count = trackedWears.filter((w) => w.timestamp <= end).length
    costPerWearTrend.push({
      label: cursor.toLocaleDateString(undefined, { month: 'short' }),
      monthEnd: end,
      cpw: spend > 0 && count > 0 ? spend / count : null,
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return {
    spendByYear: [...byYear.values()].sort((a, b) => a.year.localeCompare(b.year)),
    undatedSpend,
    undatedItems,
    dormantDays,
    dormantValue: dormant.reduce((sum, i) => sum + i.purchasePrice!, 0),
    dormantItems: dormant.length,
    costPerWearTrend,
    trackedItems: tracked.length,
    untrackedItems: priced.length - tracked.length,
  }
}
