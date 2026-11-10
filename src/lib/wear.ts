import { db } from '../db/db'
import type { ClothingItem, InnerwearWearEvent, WearEvent, WearSource } from '../db/types'
import { pairKey } from '../db/types'
import { todayKey } from './dates'

export class WearError extends Error {}

/** Reversals recompute last-worn across every kind of record, so any transaction
 *  that reverses one has to hold all of them. */
const eventTx = <T>(body: () => Promise<T>) =>
  db.transaction(
    'rw',
    db.items,
    db.wearEvents,
    db.soloWearEvents,
    db.innerwearEvents,
    db.washEvents,
    body,
  )

/** Noon on an ISO day: the timestamp given to a wear logged for a past date,
 *  where the real time of day is unknown. */
export const noonOf = (date: string) => new Date(date + 'T12:00:00').getTime()

/** Now for today, noon for any other day. */
const stampFor = (date: string) => (date === todayKey() ? Date.now() : noonOf(date))

/** A wear belongs to the item's current laundry cycle only if it happened after
 *  the last recorded wash. A wear logged today always does; a backdated one from
 *  before the wash was already cleaned away, so it must neither raise the counter
 *  when recorded nor lower it when deleted. */
async function inCurrentCycle(itemId: number, timestamp: number) {
  const washes = await db.washEvents.where('itemId').equals(itemId).toArray()
  return washes.every((w) => w.timestamp < timestamp)
}

interface RecordWearArgs {
  topId: number
  bottomId: number
  categoryId?: number
  source: WearSource
  /** ISO day; defaults to today. A past day without `historical` is a backdated
   *  wear: it still counts towards laundry unless the item was washed since. */
  date?: string
  timestamp?: number
  /** Bulk import of old history: skips the availability guard and never touches
   *  the laundry counter. */
  historical?: boolean
}

/** Whether an item's current state stops it being worn. Only today's wears are
 *  checked: an item in repair now may well have been worn last week. */
function assertWearable(item: ClothingItem, date: string, historical?: boolean) {
  if (historical || date < todayKey()) return
  if (item.state === 'RETIRED') throw new WearError(`${item.name} is retired.`)
  if (item.state === 'REPAIR') throw new WearError(`${item.name} is under repair.`)
}

async function applyWear(
  item: ClothingItem,
  timestamp: number,
  historical = false,
): Promise<Partial<ClothingItem>> {
  const base = {
    lifetimeWears: item.lifetimeWears + 1,
    lastWornAt: Math.max(item.lastWornAt ?? 0, timestamp),
    updatedAt: Date.now(),
  }
  if (historical || !(await inCurrentCycle(item.id!, timestamp))) return base

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
  const timestamp = args.timestamp ?? (args.date ? stampFor(args.date) : Date.now())
  const date = args.date ?? todayKey(new Date(timestamp))

  return db.transaction('rw', db.items, db.wearEvents, db.washEvents, async () => {
    const top = await db.items.get(args.topId)
    const bottom = await db.items.get(args.bottomId)
    if (!top || !bottom) throw new WearError('That item no longer exists.')
    if (top.role !== 'TOP') throw new WearError(`${top.name} is not a top.`)
    if (bottom.role !== 'BOTTOM') throw new WearError(`${bottom.name} is not a bottom.`)

    for (const i of [top, bottom]) assertWearable(i, date, args.historical)

    await db.wearEvents.add({
      date,
      timestamp,
      topId: top.id!,
      bottomId: bottom.id!,
      categoryId: args.categoryId,
      source: args.source,
      pairKey: pairKey(top.id!, bottom.id!),
    })

    await db.items.update(top.id!, await applyWear(top, timestamp, args.historical))
    await db.items.update(bottom.id!, await applyWear(bottom, timestamp, args.historical))
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
 *  is what let counts drift below the event log. The same holds for any wear from
 *  before the item's last wash: that cycle is closed, and the counter now belongs
 *  to wears that came after it. */
async function reverseLaundry(
  item: ClothingItem,
  event: { timestamp: number; source: WearSource },
): Promise<Partial<ClothingItem>> {
  if (event.source === 'HISTORICAL_IMPORT') return {}
  if (!(await inCurrentCycle(item.id!, event.timestamp))) return {}
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
    ...(await reverseLaundry(item, event)),
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
    ...(await reverseLaundry(item, event)),
    updatedAt: Date.now(),
  })
}

/** Sets (or swaps) the day's single innerwear record in one transaction, so the
 *  outgoing item is fully reversed before the new one is counted. A past `date`
 *  is stamped at noon of that day and counts towards laundry like any other
 *  backdated wear. */
export async function setTodaysInnerwear(
  itemId: number,
  source: WearSource = 'TODAY_RECOMMENDATION',
  date = todayKey(),
) {
  const timestamp = stampFor(date)
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
    await db.items.update(itemId, await applyWear(fresh!, timestamp))
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

/** Closes a laundry cycle: logs the wash, then resets the counter. The reset is
 *  what the app has always done; the log is what makes it readable afterwards.
 *  Only ever called for an item coming out of laundry, never for one coming back
 *  from repair, or the ledger would fill with washes that never happened. */
export async function markClean(itemId: number) {
  const timestamp = Date.now()
  return db.transaction('rw', db.items, db.washEvents, async () => {
    const item = await db.items.get(itemId)
    if (!item) return
    await db.washEvents.add({
      itemId,
      date: todayKey(new Date(timestamp)),
      timestamp,
      wearsAtWash: item.wearsSinceLaundry,
    })
    await db.items.update(itemId, {
      state: 'AVAILABLE',
      wearsSinceLaundry: 0,
      updatedAt: timestamp,
    })
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
    await db.items.update(args.itemId, await applyWear(item, args.timestamp, true))
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
  const timestamp = args.timestamp ?? (args.date ? stampFor(args.date) : Date.now())
  const date = args.date ?? todayKey(new Date(timestamp))

  return db.transaction('rw', db.items, db.soloWearEvents, db.washEvents, async () => {
    const item = await db.items.get(args.itemId)
    if (!item) throw new WearError('That item no longer exists.')
    assertWearable(item, date, args.historical)

    await db.soloWearEvents.add({ date, timestamp, itemId: args.itemId, source: args.source })
    await db.items.update(args.itemId, await applyWear(item, timestamp, args.historical))
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
        ...(await reverseLaundry(item, event)),
        updatedAt: Date.now(),
      })
    }
    await db.soloWearEvents.delete(eventId)
  })
}
