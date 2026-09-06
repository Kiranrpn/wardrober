import { useMemo, useState } from 'react'
import { useToast } from '../../components/toast'
import { Thumb } from '../../components/ui'
import type { ClothingItem, SystemRole } from '../../db/types'
import { ROLES } from '../../db/types'
import { todayKey } from '../../lib/dates'
import { useCategories, useItems, useRoleLabels } from '../../lib/hooks'
import { recordHistoricalInnerwear, recordSoloWear, recordWear, WearError } from '../../lib/wear'
import { ScreenHeader } from '../wardrobe/ScreenHeader'

const WEEK_MS = 7 * 86400000

type Mode = 'INDIVIDUAL' | 'PAIR'

export function HistoricalImport() {
  const items = useItems()
  const categories = useCategories()
  const roleLabels = useRoleLabels()
  const toast = useToast()

  const [mode, setMode] = useState<Mode>('INDIVIDUAL')
  const [lastWorn, setLastWorn] = useState(todayKey())
  const [occurrences, setOccurrences] = useState(1)
  const [categoryId, setCategoryId] = useState<number | undefined>()
  const [topId, setTopId] = useState<number | undefined>()
  const [bottomId, setBottomId] = useState<number | undefined>()
  const [innerId, setInnerId] = useState<number | undefined>()
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)

  const pool = useMemo(() => (items ?? []).filter((i) => i.state !== 'RETIRED'), [items])
  const byRole = (role: SystemRole) => pool.filter((i) => i.role === role)

  const hasPair = topId !== undefined && bottomId !== undefined
  const halfPair = (topId === undefined) !== (bottomId === undefined)
  const entered = Object.entries(counts).filter(([, n]) => n > 0)
  const totalEntered = entered.reduce((sum, [, n]) => sum + n, 0)

  const canSubmit = busy
    ? false
    : mode === 'PAIR'
      ? !halfPair && (hasPair || innerId !== undefined)
      : entered.length > 0

  const anchorOf = (date: string) => new Date(date + 'T12:00:00').getTime()

  /** Every item the user gave a number to, each spread back one week at a time
   *  from the same date. No pair is invented for them: an item worn on its own is
   *  recorded on its own, so pair statistics stay a record of real outfits. */
  async function submitIndividual() {
    setBusy(true)
    const anchor = anchorOf(lastWorn)
    let written = 0
    try {
      for (const [id, times] of entered) {
        const itemId = Number(id)
        for (let n = 0; n < times; n++) {
          const timestamp = anchor - n * WEEK_MS
          await recordSoloWear({
            itemId,
            source: 'HISTORICAL_IMPORT',
            date: todayKey(new Date(timestamp)),
            timestamp,
            historical: true,
          })
          written++
        }
      }
      toast(
        `Imported ${written} wear${written === 1 ? '' : 's'} across ${entered.length} item${
          entered.length === 1 ? '' : 's'
        }.`,
      )
      setCounts({})
    } catch (e) {
      toast(e instanceof WearError ? e.message : 'Could not import those wears.', true)
    } finally {
      setBusy(false)
    }
  }

  async function submitPair() {
    setBusy(true)
    const anchor = anchorOf(lastWorn)
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

      <div className="row" style={{ marginBottom: 12 }}>
        <button
          className={`chip grow ${mode === 'INDIVIDUAL' ? 'on' : ''}`}
          style={{ justifyContent: 'center' }}
          onClick={() => setMode('INDIVIDUAL')}
        >
          Item by item
        </button>
        <button
          className={`chip grow ${mode === 'PAIR' ? 'on' : ''}`}
          style={{ justifyContent: 'center' }}
          onClick={() => setMode('PAIR')}
        >
          A remembered outfit
        </button>
      </div>

      <div className="card small muted" style={{ marginBottom: 16 }}>
        {mode === 'INDIVIDUAL'
          ? `Put a number against anything you know you have worn. Nobody remembers what a shirt was paired with six months ago, and you do not have to: each item's own count and rotation are what matter, so no outfit is invented for it.`
          : `For an outfit you do remember. Records the ${roleLabels.TOP.toLowerCase()} and ${roleLabels.BOTTOM.toLowerCase()} as a pair, so it also counts towards pair history.`}
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
          {mode === 'PAIR' && (
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
          )}
        </div>
        <div className="tiny faint" style={{ marginTop: -6 }}>
          Wears are spread back one week apart from this date, so rotation starts from something
          like reality. Laundry counters are left alone.
        </div>

        {mode === 'INDIVIDUAL' ? (
          <>
            {ROLES.map((role) => {
              const list = byRole(role)
              if (list.length === 0) return null
              return (
                <div key={role}>
                  <div className="section-label">{roleLabels[role]}</div>
                  <div className="stack tight">
                    {list.map((item) => (
                      <CountRow
                        key={item.id}
                        item={item}
                        value={counts[item.id!] ?? 0}
                        onChange={(n) => setCounts((c) => ({ ...c, [item.id!]: n }))}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
            {pool.length === 0 && (
              <div className="card small muted">Add some clothes first.</div>
            )}
          </>
        ) : (
          <>
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

            <Picker label={roleLabels.TOP} items={byRole('TOP')} value={topId} onChange={setTopId} />
            <Picker
              label={roleLabels.BOTTOM}
              items={byRole('BOTTOM')}
              value={bottomId}
              onChange={setBottomId}
            />
            <Picker
              label={roleLabels.INNERWEAR}
              items={byRole('INNERWEAR')}
              value={innerId}
              onChange={setInnerId}
              note="Optional, and independent of the pair above. Tap again to unselect."
            />

            {halfPair && (
              <div className="tiny faint">
                Pick both a {roleLabels.TOP.toLowerCase()} and a {roleLabels.BOTTOM.toLowerCase()},
                or neither.
              </div>
            )}
          </>
        )}

        <div className="sticky-actions">
          <button
            className="btn primary block"
            disabled={!canSubmit}
            onClick={mode === 'INDIVIDUAL' ? submitIndividual : submitPair}
          >
            {mode === 'INDIVIDUAL'
              ? totalEntered === 0
                ? 'Import'
                : `Import ${totalEntered} wear${totalEntered === 1 ? '' : 's'}`
              : `Import ${occurrences} wear${occurrences > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function CountRow({
  item,
  value,
  onChange,
}: {
  item: ClothingItem
  value: number
  onChange: (n: number) => void
}) {
  return (
    <div className={`item-row ${value > 0 ? 'selected' : ''}`}>
      <Thumb item={item} />
      <div className="body">
        <div className="name">{item.name}</div>
        <div className="tiny faint">
          {item.lifetimeWears} wear{item.lifetimeWears === 1 ? '' : 's'} recorded
        </div>
      </div>
      <button
        className="btn sm ghost"
        disabled={value === 0}
        aria-label={`One fewer wear for ${item.name}`}
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        −
      </button>
      <input
        type="number"
        min={0}
        max={200}
        value={value}
        aria-label={`Times worn: ${item.name}`}
        style={{ width: 62, textAlign: 'center' }}
        onChange={(e) => onChange(Math.min(200, Math.max(0, Number(e.target.value) || 0)))}
      />
      <button
        className="btn sm ghost"
        aria-label={`One more wear for ${item.name}`}
        onClick={() => onChange(Math.min(200, value + 1))}
      >
        +
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
