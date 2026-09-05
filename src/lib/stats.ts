import type { ClothingItem, WearEvent } from '../db/types'

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

export function wardrobeStats(items: ClothingItem[], events: WearEvent[]): WardrobeStats {
  const active = items.filter((i) => i.state !== 'RETIRED')
  const totalValue = active.reduce((sum, i) => sum + (i.purchasePrice ?? 0), 0)
  const totalWears = items.reduce((sum, i) => sum + i.lifetimeWears, 0)

  const withCpw = items
    .map((item) => ({ item, cpw: costPerWear(item) }))
    .filter((x): x is { item: ClothingItem; cpw: number } => x.cpw !== null)

  const averageCostPerWear =
    withCpw.length > 0 ? withCpw.reduce((s, x) => s + x.cpw, 0) / withCpw.length : null

  const byWear = [...active].sort((a, b) => b.lifetimeWears - a.lifetimeWears)

  void events
  return {
    activeItems: active.length,
    totalValue,
    totalWears,
    averageCostPerWear,
    mostWorn: byWear.slice(0, 5),
    leastWorn: [...byWear].reverse().slice(0, 5),
    highestCostPerWear: [...withCpw].sort((a, b) => b.cpw - a.cpw).slice(0, 5),
    neverWorn: active.filter((i) => i.lifetimeWears === 0).length,
  }
}
