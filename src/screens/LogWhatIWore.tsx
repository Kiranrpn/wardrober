import { useState } from 'react'
import { useToast } from '../components/toast'
import { Thumb } from '../components/ui'
import type { ClothingItem } from '../db/types'
import { useCategories, useItems } from '../lib/hooks'
import { recordWear, WearError } from '../lib/wear'

export function LogWhatIWore({ onDone }: { onDone: () => void }) {
  const items = useItems()
  const categories = useCategories()
  const toast = useToast()

  const [categoryId, setCategoryId] = useState<number | undefined>()
  const [topId, setTopId] = useState<number | undefined>()
  const [bottomId, setBottomId] = useState<number | undefined>()
  const [busy, setBusy] = useState(false)

  const pool = (items ?? []).filter((i) => i.state !== 'RETIRED')
  const inCategory = (i: ClothingItem) =>
    categoryId === undefined || i.categoryIds.includes(categoryId)
  const tops = pool.filter((i) => i.role === 'TOP' && inCategory(i))
  const bottoms = pool.filter((i) => i.role === 'BOTTOM' && inCategory(i))

  async function submit() {
    if (topId === undefined || bottomId === undefined || busy) return
    setBusy(true)
    try {
      await recordWear({ topId, bottomId, categoryId, source: 'MANUAL' })
      toast('Wear recorded.')
      onDone()
    } catch (e) {
      toast(e instanceof WearError ? e.message : 'Could not record that wear.', true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
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

      <button
        className="btn primary block"
        disabled={topId === undefined || bottomId === undefined || busy}
        onClick={submit}
      >
        Record wear
      </button>
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
