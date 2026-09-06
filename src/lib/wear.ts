import { db } from '../db/db'
import type { ClothingItem, InnerwearWearEvent, WearEvent, WearSource } from '../db/types'
import { pairKey } from '../db/types'
import { todayKey } from './dates'

export class WearError extends Error {}

/** Reversals recompute last-worn across every kind of record, so any transaction
 *  that reverses one has to hold all of them. */
const eventTx = <T>(body: () => Promise<T>) =>
  db.transaction('rw', db.items, db.wearEvents, db.soloWearEvents, db.innerwearEvents, body)

interface RecordWearArgs {
  topId: number
  bottomId: number
  categoryId?: number
  source: WearSource
  /** ISO day; defaults to today. Historical import supplies past days. */
  date?: string
  timestamp?: number
  /** Past-dated records skip the availability guard and the laundry counter:
   *  those clothes have already been through the wash since. */
  historical?: boolean
}

function applyWear(
  item: ClothingItem,
  timestamp: number,
  historical = false,
): Partial<ClothingItem> {
  const base = {
    lifetimeWears: item.lifetimeWears + 1,
    lastWornAt: Math.max(item.lastWornAt ?? 0, timestamp),
    updatedAt: Date.now(),
  }
  if (historical) return base

  const wearsSinceLaundry = item.wearsSinceLaundry + 1
  const reachedThreshold = item.laundryThreshold > 0 && wearsSinceLaundry >= item.laundryThreshold
  return {
    ...base,
    wearsSinceLaundry,
    state: reachedThreshold && item.state === 'AVAILABLE' ? 'LAUNDRY' : item.state,
  }
}

/** Single atomic transaction, per spec §45: validate, log, increment both items,
 *  update laundry counters and roll qualifying items into LAUNDRY. */
export async function recordWear(args: RecordWearArgs) {
  const timestamp = args.timestamp ?? Date.now()
  const date = args.date ?? todayKey(new Date(timestamp))

  return db.transaction('rw', db.items, db.wearEvents, async () => {
    const top = await db.items.get(args.topId)
    const bottom = await db.items.get(args.bottomId)
    if (!top || !bottom) throw new WearError('That item no longer exists.')
    if (top.role !== 'TOP') throw new WearError(`${top.name} is not a top.`)
    if (bottom.role !== 'BOTTOM') throw new WearError(`${bottom.name} is not a bottom.`)

    if (!args.historical) {
      for (const i of [top, bottom]) {
        if (i.state === 'RETIRED') throw new WearError(`${i.name} is retired.`)
        if (i.state === 'REPAIR') throw new WearError(`${i.name} is under repair.`)
      }
    }

    await db.wearEvents.add({
      date,
      timestamp,
      topId: top.id!,
      bottomId: bottom.id!,
      categoryId: args.categoryId,
      source: args.source,
      pairKey: pairKey(top.id!, bottom.id!),
    })

    await db.items.update(top.id!, applyWear(top, timestamp, args.historical))
    await db.items.update(bottom.id!, applyWear(bottom, timestamp, args.historical))
  })
}

/** An item can be worn as half of a pair, on its own, or as the day's essentials,
 *  and all three count towards when it was last worn. Every reversal recomputes
 *  from all three so no kind of record can be orphaned by deleting another. */
async function recomputeLastWorn(itemId: number, ignore: { kind: EventKind; id?: number }) {
  const skip = (kind: EventKind, id?: number) => kind === ignore.kind && id === ignore.id
  const stamps: number[] = []

  for (const e of await db.wearEvents.where('topId').equals(itemId).toArray())
    if (!skip('pair', e.id)) stamps.push(e.timestamp)
  for (const e of await db.wearEvents.where('bottomId').equals(itemId).toArray())
    if (!skip('pair', e.id)) stamps.push(e.timestamp)
  for (const e of await db.soloWearEvents.where('itemId').equals(itemId).toArray())
    if (!skip('solo', e.id)) stamps.push(e.timestamp)
  for (const e of await db.innerwearEvents.where('itemId').equals(itemId).toArray())
    if (!skip('innerwear', e.id)) stamps.push(e.timestamp)

  return stamps.length > 0 ? Math.max(...stamps) : undefined
}

type EventKind = 'pair' | 'solo' | 'innerwear'

/** The laundry side of a reversal. An imported wear never touched the laundry
 *  counter (see applyWear), so undoing one must not decrement it either: doing so
 *  is what let counts drift below the event log. */
function reverseLaundry(item: ClothingItem, historical: boolean): Partial<ClothingItem> {
  if (historical) return {}
  const wearsSinceLaundry = Math.max(0, item.wearsSinceLaundry - 1)
  const freed =
    item.state === 'LAUNDRY' && item.laundryThreshold > 0 && wearsSinceLaundry < item.laundryThreshold
  return { wearsSinceLaundry, state: freed ? 'AVAILABLE' : item.state }
}

/** Reverses one item's share of a wear: decrement counts, recompute last-worn
 *  from the events that remain, and lift it back out of laundry if this wear is
 *  what pushed it there. Recomputing rather than remembering keeps the item
 *  honest no matter which event was removed. */
async function reverseWear(itemId: number, event: WearEvent) {
  const item = await db.items.get(itemId)
  if (!item) return

  await db.items.update(itemId, {
    lifetimeWears: Math.max(0, item.lifetimeWears - 1),
    lastWornAt: await recomputeLastWorn(itemId, { kind: 'pair', id: event.id }),
    ...reverseLaundry(item, event.source === 'HISTORICAL_IMPORT'),
    updatedAt: Date.now(),
  })
}

/** Undoes a recorded wear completely. Used by Today's Cancel and Generate again,
 *  and by deleting a wrong entry from an item's history. */
export async function undoWear(eventId: number) {
  return eventTx(async () => {
    const event = await db.wearEvents.get(eventId)
    if (!event) return
    await reverseWear(event.topId, event)
    await reverseWear(event.bottomId, event)
    await db.wearEvents.delete(eventId)
  })
}

/** Reverses one item's share of an innerwear record. */
async function reverseInnerwear(itemId: number, event: InnerwearWearEvent) {
  const item = await db.items.get(itemId)
  if (!item) return

  await db.items.update(itemId, {
    lifetimeWears: Math.max(0, item.lifetimeWears - 1),
    lastWornAt: await recomputeLastWorn(itemId, { kind: 'innerwear', id: event.id }),
    ...reverseLaundry(item, event.source === 'HISTORICAL_IMPORT'),
    updatedAt: Date.now(),
  })
}

/** Sets (or swaps) the day's single innerwear record in one transaction, so the
 *  outgoing item is fully reversed before the new one is counted. */
export async function setTodaysInnerwear(
  itemId: number,
  source: WearSource = 'TODAY_RECOMMENDATION',
  date = todayKey(),
) {
  const timestamp = Date.now()
  return eventTx(async () => {
    const item = await db.items.get(itemId)
    if (!item) throw new WearError('That item no longer exists.')
    if (item.role !== 'INNERWEAR') throw new WearError(`${item.name} is not in that group.`)

    const existing = await db.innerwearEvents.where('date').equals(date).first()
    if (existing) {
      if (existing.itemId === itemId) return false
      await reverseInnerwear(existing.itemId, existing)
      await db.innerwearEvents.delete(existing.id!)
    }

    const fresh = await db.items.get(itemId)
    await db.innerwearEvents.add({ date, timestamp, itemId, source })
    await db.items.update(itemId, applyWear(fresh!, timestamp))
    return true
  })
}

export async function undoInnerwear(eventId: number) {
  return eventTx(async () => {
    const event = await db.innerwearEvents.get(eventId)
    if (!event) return
    await reverseInnerwear(event.itemId, event)
    await db.innerwearEvents.delete(eventId)
  })
}

export async function markClean(itemId: number) {
  await db.items.update(itemId, {
    state: 'AVAILABLE',
    wearsSinceLaundry: 0,
    updatedAt: Date.now(),
  })
}

/** Deliberately does not touch wearsSinceLaundry: only MARK CLEAN resets the
 *  laundry counter (spec §12), so returning from repair keeps the item honest. */
export async function setItemState(itemId: number, state: ClothingItem['state']) {
  await db.items.update(itemId, { state, updatedAt: Date.now() })
}

/** Past-dated essentials record. Mirrors recordWear's historical mode: the
 *  laundry counter is left alone because those clothes have already been washed.
 *  Returns false when that day already holds a record, so an import spread over
 *  past weeks never double-counts a day the user has already logged. */
export async function recordHistoricalInnerwear(args: {
  itemId: number
  date: string
  timestamp: number
}): Promise<boolean> {
  return eventTx(async () => {
    const item = await db.items.get(args.itemId)
    if (!item) throw new WearError('That item no longer exists.')
    if (item.role !== 'INNERWEAR') throw new WearError(`${item.name} is not in that group.`)

    const existing = await db.innerwearEvents.where('date').equals(args.date).first()
    if (existing) return false

    await db.innerwearEvents.add({
      date: args.date,
      timestamp: args.timestamp,
      itemId: args.itemId,
      source: 'HISTORICAL_IMPORT',
    })
    await db.items.update(args.itemId, applyWear(item, args.timestamp, true))
    return true
  })
}

/** Records an item worn on its own. Past-wear import uses this when someone
 *  remembers how many times they wore a shirt but not what it was paired with:
 *  the item's own counts and rotation become right, and pair history stays empty
 *  rather than being filled with pairings that were never actually worn. */
export async function recordSoloWear(args: {
  itemId: number
  source: WearSource
  date?: string
  timestamp?: number
  /** Past-dated records skip the availability guard and the laundry counter. */
  historical?: boolean
}) {
  const timestamp = args.timestamp ?? Date.now()
  const date = args.date ?? todayKey(new Date(timestamp))

  return db.transaction('rw', db.items, db.soloWearEvents, async () => {
    const item = await db.items.get(args.itemId)
    if (!item) throw new WearError('That item no longer exists.')
    if (!args.historical) {
      if (item.state === 'RETIRED') throw new WearError(`${item.name} is retired.`)
      if (item.state === 'REPAIR') throw new WearError(`${item.name} is under repair.`)
    }

    await db.soloWearEvents.add({ date, timestamp, itemId: args.itemId, source: args.source })
    await db.items.update(args.itemId, applyWear(item, timestamp, args.historical))
  })
}

export async function undoSoloWear(eventId: number) {
  return eventTx(async () => {
    const event = await db.soloWearEvents.get(eventId)
    if (!event) return
    const item = await db.items.get(event.itemId)
    if (item) {
      await db.items.update(event.itemId, {
        lifetimeWears: Math.max(0, item.lifetimeWears - 1),
        lastWornAt: await recomputeLastWorn(event.itemId, { kind: 'solo', id: event.id }),
        ...reverseLaundry(item, event.source === 'HISTORICAL_IMPORT'),
        updatedAt: Date.now(),
      })
    }
    await db.soloWearEvents.delete(eventId)
  })
}
