import { db } from '../db/db'
import type { ClothingItem, WearSource } from '../db/types'
import { pairKey } from '../db/types'
import { todayKey } from './dates'

export class WearError extends Error {}

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

/** Innerwear is one record per day (spec §25-27). Returns false when the day
 *  already has a record, so changing outfits never double-counts. */
export async function recordInnerwear(
  itemId: number,
  source: WearSource = 'TODAY_RECOMMENDATION',
  opts: { force?: boolean; date?: string; timestamp?: number } = {},
): Promise<boolean> {
  const timestamp = opts.timestamp ?? Date.now()
  const date = opts.date ?? todayKey(new Date(timestamp))

  return db.transaction('rw', db.items, db.innerwearEvents, async () => {
    if (!opts.force) {
      const existing = await db.innerwearEvents.where('date').equals(date).first()
      if (existing) return false
    }
    const item = await db.items.get(itemId)
    if (!item) throw new WearError('That item no longer exists.')
    if (item.role !== 'INNERWEAR') throw new WearError(`${item.name} is not innerwear.`)

    await db.innerwearEvents.add({ date, timestamp, itemId, source })
    await db.items.update(itemId, applyWear(item, timestamp))
    return true
  })
}

/** Reverses one item's share of a wear: decrement counts, recompute last-worn
 *  from the events that remain, and lift it back out of laundry if this wear is
 *  what pushed it there. Recomputing rather than remembering keeps the item
 *  honest no matter which event was removed. */
async function reverseWear(itemId: number, ignoreEventId: number) {
  const item = await db.items.get(itemId)
  if (!item) return

  const remaining = (
    await db.wearEvents.where('topId').equals(itemId).toArray()
  ).concat(await db.wearEvents.where('bottomId').equals(itemId).toArray())
  const others = remaining.filter((e) => e.id !== ignoreEventId)

  const wearsSinceLaundry = Math.max(0, item.wearsSinceLaundry - 1)
  const freedFromLaundry =
    item.state === 'LAUNDRY' && item.laundryThreshold > 0 && wearsSinceLaundry < item.laundryThreshold

  await db.items.update(itemId, {
    lifetimeWears: Math.max(0, item.lifetimeWears - 1),
    wearsSinceLaundry,
    lastWornAt: others.length > 0 ? Math.max(...others.map((e) => e.timestamp)) : undefined,
    state: freedFromLaundry ? 'AVAILABLE' : item.state,
    updatedAt: Date.now(),
  })
}

/** Undoes a recorded wear completely. Used by Today's Cancel and Generate again,
 *  and by deleting a wrong entry from an item's history. */
export async function undoWear(eventId: number) {
  return db.transaction('rw', db.items, db.wearEvents, async () => {
    const event = await db.wearEvents.get(eventId)
    if (!event) return
    await reverseWear(event.topId, eventId)
    await reverseWear(event.bottomId, eventId)
    await db.wearEvents.delete(eventId)
  })
}

export async function undoInnerwear(eventId: number) {
  return db.transaction('rw', db.items, db.innerwearEvents, async () => {
    const event = await db.innerwearEvents.get(eventId)
    if (!event) return
    const item = await db.items.get(event.itemId)
    await db.innerwearEvents.delete(eventId)
    if (!item) return

    const others = (await db.innerwearEvents.where('itemId').equals(event.itemId).toArray()).filter(
      (e) => e.id !== eventId,
    )
    const wearsSinceLaundry = Math.max(0, item.wearsSinceLaundry - 1)
    const freedFromLaundry =
      item.state === 'LAUNDRY' &&
      item.laundryThreshold > 0 &&
      wearsSinceLaundry < item.laundryThreshold

    await db.items.update(event.itemId, {
      lifetimeWears: Math.max(0, item.lifetimeWears - 1),
      wearsSinceLaundry,
      lastWornAt: others.length > 0 ? Math.max(...others.map((e) => e.timestamp)) : undefined,
      state: freedFromLaundry ? 'AVAILABLE' : item.state,
      updatedAt: Date.now(),
    })
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
