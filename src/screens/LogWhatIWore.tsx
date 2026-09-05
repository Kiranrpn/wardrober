import { useState } from 'react'
import { useToast } from '../components/toast'
import { Thumb } from '../components/ui'
import type { ClothingItem } from '../db/types'
import { todayKey } from '../lib/dates'
import { useCategories, useInnerwearEvents, useItems, useRoleLabels } from '../lib/hooks'
import { recordWear, setTodaysInnerwear, WearError } from '../lib/wear'

export function LogWhatIWore({ onDone }: { onDone: () => void }) {
  const items = useItems()
  const categories = useCategories()
  const innerwearEvents = useInnerwearEvents()
  const roleLabels = useRoleLabels()
  const toast = useToast()

  const [categoryId, setCategoryId] = useState<number | undefined>()
  const [topId, setTopId] = useState<number | undefined>()
  const [bottomId, setBottomId] = useState<number | undefined>()
  const [innerId, setInnerId] = useState<number | undefined>()
  const [busy, setBusy] = useState(false)

  const pool = (items ?? []).filter((i) => i.state !== 'RETIRED')
  const inCategory = (i: ClothingItem) =>
    categoryId === undefined || i.categoryIds.includes(categoryId)
  const tops = pool.filter((i) => i.role === 'TOP' && inCategory(i))
  const bottoms = pool.filter((i) => i.role === 'BOTTOM' && inCategory(i))
  // Innerwear carries no category, so it is never filtered by the chips above.
  const inners = pool.filter((i) => i.role === 'INNERWEAR')

  const loggedToday = (innerwearEvents ?? []).find((e) => e.date === todayKey())
  const alreadyLogged = loggedToday
    ? items?.find((i) => i.id === loggedToday.itemId)
    : undefined

  const hasPair = topId !== undefined && bottomId !== undefined
  const halfPair = (topId === undefined) !== (bottomId === undefined)
  const canSubmit = !busy && !halfPair && (hasPair || innerId !== undefined)

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    const done: string[] = []
    try {
      if (hasPair) {
        await recordWear({ topId: topId!, bottomId: bottomId!, categoryId, source: 'MANUAL' })
        done.push('outfit')
      }
      if (innerId !== undefined) {
        const changed = await setTodaysInnerwear(innerId, 'MANUAL')
        if (changed) done.push(roleLabels.INNERWEAR.toLowerCase())
      }
      toast(done.length > 0 ? `Recorded ${done.join(' and ')}.` : 'Nothing changed.')
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

      <Picker label={roleLabels.TOP} items={tops} value={topId} onChange={setTopId} />
      <Picker label={roleLabels.BOTTOM} items={bottoms} value={bottomId} onChange={setBottomId} />
      <Picker
        label={`${roleLabels.INNERWEAR} (optional)`}
        items={inners}
        value={innerId}
        onChange={setInnerId}
        note={
          alreadyLogged
            ? `${alreadyLogged.name} is logged for today. Picking another swaps it.`
            : undefined
        }
      />

      {halfPair && (
        <div className="tiny faint">
          Pick both a {roleLabels.TOP.toLowerCase()} and a {roleLabels.BOTTOM.toLowerCase()}, or
          neither.
        </div>
      )}

      <button className="btn primary block" disabled={!canSubmit} onClick={submit}>
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
              onClick={() => onChange(value === i.id ? undefined : i.id!)}
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
