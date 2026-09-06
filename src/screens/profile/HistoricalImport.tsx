import { useState } from 'react'
import { useToast } from '../../components/toast'
import { Thumb } from '../../components/ui'
import type { ClothingItem } from '../../db/types'
import { todayKey } from '../../lib/dates'
import { useCategories, useItems, useRoleLabels } from '../../lib/hooks'
import { recordHistoricalInnerwear, recordWear, WearError } from '../../lib/wear'
import { ScreenHeader } from '../wardrobe/ScreenHeader'

const WEEK_MS = 7 * 86400000

export function HistoricalImport() {
  const items = useItems()
  const categories = useCategories()
  const roleLabels = useRoleLabels()
  const toast = useToast()

  const [lastWorn, setLastWorn] = useState(todayKey())
  const [occurrences, setOccurrences] = useState(1)
  const [categoryId, setCategoryId] = useState<number | undefined>()
  const [topId, setTopId] = useState<number | undefined>()
  const [bottomId, setBottomId] = useState<number | undefined>()
  const [innerId, setInnerId] = useState<number | undefined>()
  const [busy, setBusy] = useState(false)

  const pool = (items ?? []).filter((i) => i.state !== 'RETIRED')
  const tops = pool.filter((i) => i.role === 'TOP')
  const bottoms = pool.filter((i) => i.role === 'BOTTOM')
  // Essentials carry no category, so the chips above never filter them.
  const inners = pool.filter((i) => i.role === 'INNERWEAR')

  const hasPair = topId !== undefined && bottomId !== undefined
  const halfPair = (topId === undefined) !== (bottomId === undefined)
  const canSubmit = !busy && !halfPair && (hasPair || innerId !== undefined)

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    const anchor = new Date(lastWorn + 'T12:00:00').getTime()
    let pairs = 0
    let inner = 0
    let skipped = 0
    try {
      for (let n = 0; n < occurrences; n++) {
        const timestamp = anchor - n * WEEK_MS
        const date = todayKey(new Date(timestamp))
        if (hasPair) {
          await recordWear({
            topId: topId!,
            bottomId: bottomId!,
            categoryId,
            source: 'HISTORICAL_IMPORT',
            date,
            timestamp,
            historical: true,
          })
          pairs++
        }
        if (innerId !== undefined) {
          // One essentials record per day is the rule everywhere else in the app,
          // so a day that already has one is left exactly as the user logged it.
          if (await recordHistoricalInnerwear({ itemId: innerId, date, timestamp })) inner++
          else skipped++
        }
      }

      const parts: string[] = []
      if (pairs > 0) parts.push(`${pairs} past wear${pairs > 1 ? 's' : ''}`)
      if (inner > 0)
        parts.push(`${inner} ${roleLabels.INNERWEAR.toLowerCase()} record${inner > 1 ? 's' : ''}`)
      const tail = skipped > 0 ? ` ${skipped} day${skipped > 1 ? 's' : ''} already had one.` : ''
      toast(parts.length > 0 ? `Imported ${parts.join(' and ')}.${tail}` : `Nothing to import.${tail}`)
      setOccurrences(1)
    } catch (e) {
      toast(e instanceof WearError ? e.message : 'Could not import those wears.', true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <ScreenHeader title="Import past wears" subtitle="So rotation starts from reality" />

      <div className="card small muted" style={{ marginBottom: 16 }}>
        Record something you already wore: a pair, an {roleLabels.INNERWEAR.toLowerCase()} item, or
        both. Multiple occurrences are spread back one week apart from the date you give, so counts
        and rotation reflect real use. Laundry counters are left alone.
      </div>

      <div className="stack">
        <div className="grid-2">
          <div className="field">
            <label>Last worn on</label>
            <input
              type="date"
              value={lastWorn}
              max={todayKey()}
              onChange={(e) => setLastWorn(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Times worn</label>
            <input
              type="number"
              min={1}
              max={200}
              value={occurrences}
              onChange={(e) =>
                setOccurrences(Math.min(200, Math.max(1, Number(e.target.value) || 1)))
              }
            />
          </div>
        </div>

        <div className="field">
          <label>Category</label>
          <div className="scroller">
            {(categories ?? []).map((c) => (
              <button
                key={c.id}
                className={`chip ${categoryId === c.id ? 'on' : ''}`}
                onClick={() => setCategoryId(categoryId === c.id ? undefined : c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <Picker label={roleLabels.TOP} items={tops} value={topId} onChange={setTopId} />
        <Picker label={roleLabels.BOTTOM} items={bottoms} value={bottomId} onChange={setBottomId} />
        <Picker
          label={roleLabels.INNERWEAR}
          items={inners}
          value={innerId}
          onChange={setInnerId}
          note={`Optional, and independent of the pair above. Tap again to unselect.`}
        />

        {halfPair && (
          <div className="tiny faint">
            Pick both a {roleLabels.TOP.toLowerCase()} and a {roleLabels.BOTTOM.toLowerCase()}, or
            neither.
          </div>
        )}

        <div className="sticky-actions">
          <button className="btn primary block" disabled={!canSubmit} onClick={submit}>
            Import {occurrences} wear{occurrences > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

function Picker({
  label,
  items,
  value,
  onChange,
  note,
}: {
  label: string
  items: ClothingItem[]
  value?: number
  onChange: (id: number | undefined) => void
  note?: string
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {note && <div className="tiny faint">{note}</div>}
      {items.length === 0 ? (
        <div className="small faint">Nothing here yet.</div>
      ) : (
        <div className="select-grid">
          {items.map((i) => (
            <div
              key={i.id}
              className={`cell ${value === i.id ? 'on' : ''}`}
              role="button"
              tabIndex={0}
              aria-pressed={value === i.id}
              onClick={() => onChange(value === i.id ? undefined : i.id!)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onChange(value === i.id ? undefined : i.id!)
                }
              }}
            >
              <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                <Thumb item={i} />
                <span className="tiny grow" style={{ minWidth: 0 }}>
                  {i.name}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
