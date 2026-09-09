import { useMemo, useState } from 'react'
import { useToast } from '../components/toast'
import { Thumb } from '../components/ui'
import type { ClothingItem } from '../db/types'
import { WEAR_SOURCE_LABEL } from '../db/types'
import { formatDate, todayKey } from '../lib/dates'
import {
  useCategories,
  useInnerwearEvents,
  useItems,
  useRoleLabels,
  useSoloWearEvents,
  useWearEvents,
} from '../lib/hooks'
import {
  recordSoloWear,
  recordWear,
  setTodaysInnerwear,
  undoInnerwear,
  undoSoloWear,
  undoWear,
  WearError,
} from '../lib/wear'
import { ScreenHeader } from './wardrobe/ScreenHeader'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

interface DayRecord {
  key: string
  timestamp: number
  source: string
  /** A pair carries two items; the other kinds carry one. */
  items: Array<ClothingItem | undefined>
  names: string[]
  caption: string
  /** False once a referenced item has been deleted, which makes repeating it impossible. */
  repeatable: boolean
  repeat: () => Promise<void>
  remove: () => Promise<void>
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** Monday-first offset for the 1st of the month, so the grid lines up under the
 *  weekday row above it. */
function leadingBlanks(year: number, month: number) {
  return (new Date(year, month, 1).getDay() + 6) % 7
}

export function WearCalendar() {
  const items = useItems()
  const categories = useCategories()
  const wearEvents = useWearEvents()
  const soloEvents = useSoloWearEvents()
  const innerwearEvents = useInnerwearEvents()
  const roleLabels = useRoleLabels()
  const toast = useToast()

  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selected, setSelected] = useState<string>(() => todayKey())
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)

  /** How many records each day holds, for the dots under the numbers. Built once
   *  over the whole log rather than per cell, so paging months is free. */
  const countsByDay = useMemo(() => {
    const map = new Map<string, number>()
    const bump = (date: string) => map.set(date, (map.get(date) ?? 0) + 1)
    for (const e of wearEvents ?? []) bump(e.date)
    for (const e of soloEvents ?? []) bump(e.date)
    for (const e of innerwearEvents ?? []) bump(e.date)
    return map
  }, [wearEvents, soloEvents, innerwearEvents])

  const records = useMemo<DayRecord[]>(() => {
    if (!items) return []
    const find = (id: number) => items.find((i) => i.id === id)
    const rows: DayRecord[] = []

    for (const e of wearEvents ?? []) {
      if (e.date !== selected) continue
      const top = find(e.topId)
      const bottom = find(e.bottomId)
      const category = categories?.find((c) => c.id === e.categoryId)
      rows.push({
        key: `w${e.id}`,
        timestamp: e.timestamp,
        source: WEAR_SOURCE_LABEL[e.source] ?? '',
        items: [top, bottom],
        names: [top?.name ?? 'Removed item', bottom?.name ?? 'Removed item'],
        caption: category?.name ?? 'No category',
        repeatable: Boolean(top && bottom),
        repeat: () =>
          recordWear({
            topId: e.topId,
            bottomId: e.bottomId,
            categoryId: e.categoryId,
            source: 'WEAR_AGAIN',
          }).then(() => undefined),
        remove: () => undoWear(e.id!).then(() => undefined),
      })
    }

    for (const e of soloEvents ?? []) {
      if (e.date !== selected) continue
      const item = find(e.itemId)
      rows.push({
        key: `s${e.id}`,
        timestamp: e.timestamp,
        source: WEAR_SOURCE_LABEL[e.source] ?? '',
        items: [item],
        names: [item?.name ?? 'Removed item'],
        caption: 'Worn on its own',
        repeatable: Boolean(item),
        repeat: () =>
          recordSoloWear({ itemId: e.itemId, source: 'WEAR_AGAIN' }).then(() => undefined),
        remove: () => undoSoloWear(e.id!).then(() => undefined),
      })
    }

    for (const e of innerwearEvents ?? []) {
      if (e.date !== selected) continue
      const item = find(e.itemId)
      rows.push({
        key: `i${e.id}`,
        timestamp: e.timestamp,
        source: WEAR_SOURCE_LABEL[e.source] ?? '',
        items: [item],
        names: [item?.name ?? 'Removed item'],
        caption: roleLabels.INNERWEAR,
        repeatable: Boolean(item),
        // Today holds one essentials record, so repeating one swaps today's
        // rather than adding a second.
        repeat: () => setTodaysInnerwear(e.itemId, 'WEAR_AGAIN').then(() => undefined),
        remove: () => undoInnerwear(e.id!).then(() => undefined),
      })
    }

    return rows.sort((a, b) => b.timestamp - a.timestamp)
  }, [selected, items, categories, wearEvents, soloEvents, innerwearEvents, roleLabels])

  if (!items || !wearEvents) return <div className="screen" />

  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const blanks = leadingBlanks(year, monthIndex)
  const today = todayKey()
  const monthRecords = [...countsByDay.entries()]
    .filter(([date]) => date.startsWith(monthKey(month)))
    .reduce((sum, [, n]) => sum + n, 0)

  const shift = (by: number) => setMonth(new Date(year, monthIndex + by, 1))

  async function run(action: () => Promise<void>, ok: string) {
    if (busy) return
    setBusy(true)
    try {
      await action()
      setConfirming(null)
      toast(ok)
    } catch (e) {
      toast(e instanceof WearError ? e.message : 'Could not do that.', true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <ScreenHeader
        title="Wear calendar"
        subtitle={`${monthRecords} record${monthRecords === 1 ? '' : 's'} this month`}
      />

      <div className="stack">
        <div className="cal-nav">
          <button className="btn sm" onClick={() => shift(-1)} aria-label="Previous month">
            ‹
          </button>
          <div className="grow" style={{ textAlign: 'center', fontWeight: 600 }}>
            {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </div>
          <button className="btn sm" onClick={() => shift(1)} aria-label="Next month">
            ›
          </button>
        </div>

        <div className="card">
          <div className="cal-grid heads">
            {WEEKDAYS.map((d, i) => (
              <div className="tiny faint" key={i}>
                {d}
              </div>
            ))}
          </div>
          <div className="cal-grid">
            {Array.from({ length: blanks }, (_, i) => (
              <div key={`b${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1
              const date = `${monthKey(month)}-${String(day).padStart(2, '0')}`
              const count = countsByDay.get(date) ?? 0
              const classes = [
                'cal-day',
                count > 0 ? 'has' : '',
                date === selected ? 'on' : '',
                date === today ? 'today' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <button
                  key={date}
                  className={classes}
                  aria-pressed={date === selected}
                  aria-label={`${formatDate(date)}, ${count} record${count === 1 ? '' : 's'}`}
                  onClick={() => setSelected(date)}
                >
                  <span className="n">{day}</span>
                  <span className="dots">
                    {Array.from({ length: Math.min(count, 3) }, (_, d) => (
                      <i key={d} />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="section-label">{formatDate(selected)}</div>

        {records.length === 0 ? (
          <div className="card small muted">Nothing recorded on this day.</div>
        ) : (
          records.map((record) => (
            <div className="card stack tight" key={record.key}>
              <div className="worn-items">
                {record.items.map((item, i) => (
                  <Thumb key={i} item={item} />
                ))}
                <div className="names">
                  {record.names.map((name, i) => (
                    <div className={`n ${i > 0 ? 'muted' : ''}`} key={i}>
                      {name}
                    </div>
                  ))}
                  <div className="tiny faint">
                    {record.caption}
                    {record.source ? ` · ${record.source}` : ''}
                  </div>
                </div>
              </div>

              {confirming === record.key ? (
                <div className="row" style={{ alignItems: 'center' }}>
                  <span className="small grow">Delete this record?</span>
                  <button
                    className="btn sm danger"
                    disabled={busy}
                    onClick={() => run(record.remove, 'Record removed.')}
                  >
                    Delete
                  </button>
                  <button className="btn sm ghost" onClick={() => setConfirming(null)}>
                    Keep
                  </button>
                </div>
              ) : (
                <div className="row" style={{ alignItems: 'center' }}>
                  {record.repeatable ? (
                    <button
                      className="btn sm primary grow"
                      disabled={busy}
                      onClick={() => run(record.repeat, 'Logged again for today.')}
                    >
                      Wear again
                    </button>
                  ) : (
                    <span className="small faint grow">
                      One of these is no longer in your wardrobe.
                    </span>
                  )}
                  <button
                    className="btn sm ghost"
                    aria-label="Delete this record"
                    onClick={() => setConfirming(record.key)}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))
        )}

        {records.length > 0 && (
          <div className="tiny faint">
            Wearing again is dated today, not the day you tapped: counts go up and laundry
            thresholds apply. Deleting reverses the record exactly as Cancel does.
          </div>
        )}
      </div>
    </div>
  )
}
