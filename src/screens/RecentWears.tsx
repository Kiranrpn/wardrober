import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/toast'
import { Thumb } from '../components/ui'
import type { Category, ClothingItem, WearEvent } from '../db/types'
import { WEAR_SOURCE_LABEL } from '../db/types'
import { relativeDay } from '../lib/dates'
import { recordWear, undoWear, WearError } from '../lib/wear'

/** Enough to cover "what did I wear the last few days"; more turns a quick
 *  repeat into a scroll through history, which is what an item's page is for. */
const LIMIT = 5

export function RecentWears({
  events,
  items,
  categories,
  onWorn,
  onLeave,
}: {
  events: WearEvent[]
  items: ClothingItem[]
  categories: Category[]
  /** Lets Today close the sheet once a repeat is recorded, so the change is visible. */
  onWorn?: () => void
  /** Called when the calendar takes over, so the sheet is not left open behind it. */
  onLeave?: () => void
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<number | null>(null)

  // Newest first, across every source: a pair worn from Today, one worn from
  // Generate pair and one logged by hand all land in the same event log, so all
  // three show up here without Generate pair needing to know about this list.
  const recent = useMemo(
    () => [...events].sort((a, b) => b.timestamp - a.timestamp).slice(0, LIMIT),
    [events],
  )

  async function wearAgain(event: WearEvent) {
    if (busy) return
    setBusy(true)
    try {
      // A plain wear: both items are counted, laundry thresholds apply, and it is
      // dated today rather than borrowing the original event's date.
      await recordWear({
        topId: event.topId,
        bottomId: event.bottomId,
        categoryId: event.categoryId,
        source: 'WEAR_AGAIN',
      })
      toast('Logged again. Have a good one.')
      onWorn?.()
    } catch (e) {
      toast(e instanceof WearError ? e.message : 'Could not record that wear.', true)
    } finally {
      setBusy(false)
    }
  }

  async function remove(event: WearEvent) {
    if (busy) return
    setBusy(true)
    try {
      await undoWear(event.id!)
      setConfirming(null)
      toast('Wear removed.')
    } catch {
      toast('Could not remove that.', true)
    } finally {
      setBusy(false)
    }
  }

  const calendarTile = (
    <Link className="list-tile" to="/history" onClick={() => onLeave?.()}>
      <span style={{ fontSize: 19 }}>🗓️</span>
      <span className="grow">
        <span style={{ fontWeight: 600 }}>Wear calendar</span>
        <span className="tiny faint" style={{ display: 'block' }}>
          Every day you have logged, with wear again and delete
        </span>
      </span>
      <span className="arrow">›</span>
    </Link>
  )

  if (recent.length === 0) {
    return (
      <div className="stack tight">
        {calendarTile}
        <div className="card small muted">
          Nothing worn yet. Wear a pair from Today or from Generate pair and it shows up here.
        </div>
      </div>
    )
  }

  return (
    <div className="stack tight">
      {calendarTile}
      <div className="section-label" style={{ margin: 0 }}>
        Last {recent.length}
      </div>
      {recent.map((event) => {
        const top = items.find((i) => i.id === event.topId)
        const bottom = items.find((i) => i.id === event.bottomId)
        const category = categories.find((c) => c.id === event.categoryId)
        const gone = !top || !bottom

        return (
          <div className="card stack tight" key={event.id}>
            <div className="worn-items">
              <Thumb item={top} />
              <Thumb item={bottom} />
              <div className="names">
                <div className="n">{top?.name ?? 'Removed item'}</div>
                <div className="n muted">{bottom?.name ?? 'Removed item'}</div>
                <div className="tiny faint">
                  {relativeDay(event.timestamp)}
                  {category ? ` · ${category.name}` : ''}
                  {WEAR_SOURCE_LABEL[event.source] ? ` · ${WEAR_SOURCE_LABEL[event.source]}` : ''}
                </div>
              </div>
            </div>

            {confirming === event.id ? (
              <div className="row" style={{ alignItems: 'center' }}>
                <span className="small grow">Delete this record?</span>
                <button className="btn sm danger" disabled={busy} onClick={() => remove(event)}>
                  Delete
                </button>
                <button className="btn sm ghost" onClick={() => setConfirming(null)}>
                  Keep
                </button>
              </div>
            ) : (
              <div className="row" style={{ alignItems: 'center' }}>
                {gone ? (
                  <span className="small faint grow">
                    One of these is no longer in your wardrobe.
                  </span>
                ) : (
                  <button
                    className="btn sm primary grow"
                    disabled={busy}
                    onClick={() => wearAgain(event)}
                  >
                    Wear again
                  </button>
                )}
                <button
                  className="btn sm ghost"
                  aria-label="Delete this record"
                  onClick={() => setConfirming(event.id!)}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        )
      })}

      <div className="tiny faint">
        Wearing again counts fully: both items are incremented and laundry thresholds apply.
        Deleting a record reverses it the same way Cancel does. Older days are in the calendar.
      </div>
    </div>
  )
}
