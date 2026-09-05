import { useMemo, useState } from 'react'
import { useToast } from '../../components/toast'
import { ItemRow } from '../../components/ui'
import { db, updateSettings } from '../../db/db'
import type { ClothingItem, Compatibility as CompatRecord } from '../../db/types'
import { pairKey } from '../../db/types'
import { useCategories, useCompatibility, useItems, useSettings } from '../../lib/hooks'
import { isCompatible, buildCompatibilityIndex } from '../../lib/recommend'
import { ScreenHeader } from './ScreenHeader'

export function CompatibilityManager() {
  const items = useItems()
  const categories = useCategories()
  const compatibility = useCompatibility()
  const settings = useSettings()
  const toast = useToast()

  const [categoryId, setCategoryId] = useState<number | undefined>()
  const [selectedTops, setSelectedTops] = useState<number[]>([])
  const [selectedBottoms, setSelectedBottoms] = useState<number[]>([])
  const [busy, setBusy] = useState(false)

  const pool = useMemo(
    () =>
      (items ?? []).filter(
        (i) =>
          i.state !== 'RETIRED' &&
          (categoryId === undefined || i.categoryIds.includes(categoryId)),
      ),
    [items, categoryId],
  )
  const tops = pool.filter((i) => i.role === 'TOP')
  const bottoms = pool.filter((i) => i.role === 'BOTTOM')

  const index = useMemo(() => buildCompatibilityIndex(compatibility ?? []), [compatibility])

  if (!settings) return <div className="screen" />

  const combos = selectedTops.length * selectedBottoms.length

  async function writePairs(excluded: boolean) {
    if (combos === 0 || busy) return
    setBusy(true)
    const now = Date.now()
    try {
      await db.transaction('rw', db.compatibility, async () => {
        for (const topId of selectedTops) {
          for (const bottomId of selectedBottoms) {
            const existing = await db.compatibility
              .where('[topId+bottomId]')
              .equals([topId, bottomId])
              .first()
            if (existing) {
              await db.compatibility.update(existing.id!, { excluded, updatedAt: now })
            } else {
              const record: CompatRecord = {
                topId,
                bottomId,
                excluded,
                createdAt: now,
                updatedAt: now,
              }
              await db.compatibility.add(record)
            }
          }
        }
      })
      toast(
        `${combos} combination${combos > 1 ? 's' : ''} ${excluded ? 'removed' : 'made compatible'}.`,
      )
      setSelectedTops([])
      setSelectedBottoms([])
    } finally {
      setBusy(false)
    }
  }

  function selectAll() {
    setSelectedTops(tops.map((i) => i.id!))
    setSelectedBottoms(bottoms.map((i) => i.id!))
  }

  const compatibleCount = tops.reduce(
    (sum, t) =>
      sum +
      bottoms.filter((b) => isCompatible(index, t, b, settings.impliedCompatibility)).length,
    0,
  )

  return (
    <div className="screen">
      <ScreenHeader
        title="Compatibility"
        subtitle={`${compatibleCount} workable combination${compatibleCount === 1 ? '' : 's'}`}
      />

      <div className="card stack tight">
        <div className="row" style={{ alignItems: 'center' }}>
          <div className="grow">
            <div style={{ fontWeight: 600 }}>Auto-pair within a category</div>
            <div className="tiny faint">
              Tops and bottoms that share a category work together unless you rule them out here.
            </div>
          </div>
          <button
            className={`chip ${settings.impliedCompatibility ? 'on' : ''}`}
            onClick={() => updateSettings({ impliedCompatibility: !settings.impliedCompatibility })}
          >
            {settings.impliedCompatibility ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      <div className="scroller" style={{ margin: '14px -16px' }}>
        <button
          className={`chip ${categoryId === undefined ? 'on' : ''}`}
          onClick={() => setCategoryId(undefined)}
        >
          All
        </button>
        {(categories ?? []).map((c) => (
          <button
            key={c.id}
            className={`chip ${categoryId === c.id ? 'on' : ''}`}
            onClick={() => setCategoryId(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="row" style={{ marginBottom: 4 }}>
        <button className="btn sm grow" onClick={selectAll}>
          Select everything
        </button>
        <button
          className="btn sm grow ghost"
          onClick={() => {
            setSelectedTops([])
            setSelectedBottoms([])
          }}
        >
          Clear
        </button>
      </div>

      <Column
        label={`Tops (${selectedTops.length}/${tops.length})`}
        items={tops}
        selected={selectedTops}
        onToggle={(id) =>
          setSelectedTops((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
        }
        counterpart={bottoms}
        index={index}
        implied={settings.impliedCompatibility}
        role="TOP"
      />

      <Column
        label={`Bottoms (${selectedBottoms.length}/${bottoms.length})`}
        items={bottoms}
        selected={selectedBottoms}
        onToggle={(id) =>
          setSelectedBottoms((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
        }
        counterpart={tops}
        index={index}
        implied={settings.impliedCompatibility}
        role="BOTTOM"
      />

      <div className="sticky-actions stack tight">
        <div className="tiny faint" style={{ textAlign: 'center' }}>
          {combos === 0
            ? 'Select tops and bottoms to link or unlink them'
            : `${combos} combination${combos > 1 ? 's' : ''} selected`}
        </div>
        <div className="row">
          <button
            className="btn primary grow"
            disabled={combos === 0 || busy}
            onClick={() => writePairs(false)}
          >
            Make compatible
          </button>
          <button
            className="btn grow danger"
            disabled={combos === 0 || busy}
            onClick={() => writePairs(true)}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}

function Column({
  label,
  items,
  selected,
  onToggle,
  counterpart,
  index,
  implied,
  role,
}: {
  label: string
  items: ClothingItem[]
  selected: number[]
  onToggle: (id: number) => void
  counterpart: ClothingItem[]
  index: Map<string, boolean>
  implied: boolean
  role: 'TOP' | 'BOTTOM'
}) {
  return (
    <>
      <div className="section-label">{label}</div>
      {items.length === 0 ? (
        <div className="card small muted">Nothing here.</div>
      ) : (
        <div className="stack tight">
          {items.map((item) => {
            const links = counterpart.filter((other) =>
              role === 'TOP'
                ? isCompatible(index, item, other, implied)
                : isCompatible(index, other, item, implied),
            ).length
            void pairKey
            return (
              <ItemRow
                key={item.id}
                item={item}
                selected={selected.includes(item.id!)}
                onClick={() => onToggle(item.id!)}
                subtitle={`${links} match${links === 1 ? '' : 'es'}`}
              />
            )
          })}
        </div>
      )}
    </>
  )
}
