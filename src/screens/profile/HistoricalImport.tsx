import { useState } from 'react'
import { useToast } from '../../components/toast'
import { Thumb } from '../../components/ui'
import type { ClothingItem } from '../../db/types'
import { todayKey } from '../../lib/dates'
import { useCategories, useItems } from '../../lib/hooks'
import { recordWear } from '../../lib/wear'
import { ScreenHeader } from '../wardrobe/ScreenHeader'

const WEEK_MS = 7 * 86400000

export function HistoricalImport() {
  const items = useItems()
  const categories = useCategories()
  const toast = useToast()

  const [lastWorn, setLastWorn] = useState(todayKey())
  const [occurrences, setOccurrences] = useState(1)
  const [categoryId, setCategoryId] = useState<number | undefined>()
  const [topId, setTopId] = useState<number | undefined>()
  const [bottomId, setBottomId] = useState<number | undefined>()
  const [busy, setBusy] = useState(false)

  const pool = (items ?? []).filter((i) => i.state !== 'RETIRED')
  const tops = pool.filter((i) => i.role === 'TOP')
  const bottoms = pool.filter((i) => i.role === 'BOTTOM')

  async function submit() {
    if (topId === undefined || bottomId === undefined || busy) return
    setBusy(true)
    const anchor = new Date(lastWorn + 'T12:00:00').getTime()
    try {
      for (let n = 0; n < occurrences; n++) {
        const timestamp = anchor - n * WEEK_MS
        const d = new Date(timestamp)
        await recordWear({
          topId,
          bottomId,
          categoryId,
          source: 'HISTORICAL_IMPORT',
          date: todayKey(d),
          timestamp,
          historical: true,
        })
      }
      toast(`${occurrences} past wear${occurrences > 1 ? 's' : ''} imported.`)
      setOccurrences(1)
    } catch {
      toast('Could not import those wears.', true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <ScreenHeader title="Import past wears" subtitle="So rotation starts from reality" />

      <div className="card small muted" style={{ marginBottom: 16 }}>
        Record a pair you already wore. Multiple occurrences are spread back one week apart from
        the date you give, so counts and rotation reflect real use. Laundry counters are left alone.
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

        <Picker label="Top" items={tops} value={topId} onChange={setTopId} />
        <Picker label="Bottom" items={bottoms} value={bottomId} onChange={setBottomId} />

        <div className="sticky-actions">
          <button
            className="btn primary block"
            disabled={topId === undefined || bottomId === undefined || busy}
            onClick={submit}
          >
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
}: {
  label: string
  items: ClothingItem[]
  value?: number
  onChange: (id: number) => void
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {items.length === 0 ? (
        <div className="small faint">Nothing here yet.</div>
      ) : (
        <div className="select-grid">
          {items.map((i) => (
            <div
              key={i.id}
              className={`cell ${value === i.id ? 'on' : ''}`}
              onClick={() => onChange(i.id!)}
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
