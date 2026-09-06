import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useToast } from '../../components/toast'
import { Photo, Sheet, StateBadge } from '../../components/ui'
import { formatDate, relativeDay } from '../../lib/dates'
import {
  useCategories,
  useClothingTypes,
  useInnerwearEvents,
  useItem,
  useItems,
  useRoleLabels,
  useSettings,
  useSoloWearEvents,
  useWearEvents,
} from '../../lib/hooks'
import { costPerWear, money } from '../../lib/stats'
import { markClean, setItemState, undoInnerwear, undoSoloWear, undoWear } from '../../lib/wear'
import { ScreenHeader } from './ScreenHeader'

type HistoryKind = 'pair' | 'solo' | 'innerwear'

interface HistoryRow {
  key: string
  eventId: number
  kind: HistoryKind
  date: string
  timestamp: number
  label: string
}

export function ItemDetail() {
  const { id } = useParams()
  const itemId = Number(id)
  const item = useItem(itemId)
  const items = useItems()
  const categories = useCategories()
  const types = useClothingTypes()
  const wearEvents = useWearEvents()
  const innerwearEvents = useInnerwearEvents()
  const soloEvents = useSoloWearEvents()
  const settings = useSettings()
  const roleLabels = useRoleLabels()
  const navigate = useNavigate()
  const toast = useToast()

  const [pendingDelete, setPendingDelete] = useState<HistoryRow | null>(null)

  /** An item can be worn as half of a pair, on its own, or as the day's essentials.
   *  All three belong in one list, newest first, or deleting the wrong kind of
   *  record would be the only way to notice the others existed. */
  const history = useMemo<HistoryRow[]>(() => {
    if (!item) return []
    const rows: HistoryRow[] = []

    for (const e of innerwearEvents ?? []) {
      if (e.itemId !== itemId) continue
      rows.push({
        key: `i${e.id}`,
        eventId: e.id!,
        kind: 'innerwear',
        date: e.date,
        timestamp: e.timestamp,
        label: 'Worn',
      })
    }

    for (const e of soloEvents ?? []) {
      if (e.itemId !== itemId) continue
      rows.push({
        key: `s${e.id}`,
        eventId: e.id!,
        kind: 'solo',
        date: e.date,
        timestamp: e.timestamp,
        label: 'Worn on its own',
      })
    }

    for (const e of wearEvents ?? []) {
      if (e.topId !== itemId && e.bottomId !== itemId) continue
      const otherId = e.topId === itemId ? e.bottomId : e.topId
      const other = items?.find((i) => i.id === otherId)
      const cat = categories?.find((c) => c.id === e.categoryId)
      rows.push({
        key: `w${e.id}`,
        eventId: e.id!,
        kind: 'pair',
        date: e.date,
        timestamp: e.timestamp,
        label: `with ${other?.name ?? 'removed item'}${cat ? ` · ${cat.name}` : ''}`,
      })
    }

    return rows.sort((a, b) => b.timestamp - a.timestamp).slice(0, 30)
  }, [item, itemId, wearEvents, soloEvents, innerwearEvents, items, categories])

  if (!item || !settings) return <div className="screen" />

  const cpw = costPerWear(item)
  const type = types?.find((t) => t.id === item.typeId)
  const itemCategories = (categories ?? []).filter((c) => item.categoryIds.includes(c.id!))

  async function change(state: 'LAUNDRY' | 'REPAIR' | 'RETIRED' | 'AVAILABLE') {
    if (state === 'AVAILABLE') await markClean(itemId)
    else await setItemState(itemId, state)
    toast(
      state === 'AVAILABLE'
        ? 'Available again.'
        : state === 'RETIRED'
          ? 'Retired. History kept.'
          : `Moved to ${state.toLowerCase()}.`,
    )
  }

  return (
    <div className="screen">
      <ScreenHeader
        title={item.name}
        action={
          <button className="btn sm" onClick={() => navigate(`/wardrobe/items/${itemId}/edit`)}>
            Edit
          </button>
        }
      />

      <div className="stack">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ width: 140, flex: 'none' }}>
            <Photo item={item} />
          </div>
          <div className="stack tight grow">
            <StateBadge state={item.state} />
            <div className="small muted">
              {roleLabels[item.role]}
              {type ? ` · ${type.name}` : ''}
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              {itemCategories.map((c) => (
                <span key={c.id} className="chip static">
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="kv">
            <span className="k">Lifetime wears</span>
            <span>{item.lifetimeWears}</span>
          </div>
          <div className="kv">
            <span className="k">Last worn</span>
            <span>{relativeDay(item.lastWornAt)}</span>
          </div>
          <div className="kv">
            <span className="k">Since last wash</span>
            <span>
              {item.wearsSinceLaundry} / {item.laundryThreshold}
            </span>
          </div>
          <div className="kv">
            <span className="k">Cost per wear</span>
            <span>{cpw === null ? 'Not yet worn' : money(cpw, settings.currency)}</span>
          </div>
          <div className="kv">
            <span className="k">Purchase price</span>
            <span>{money(item.purchasePrice ?? null, settings.currency)}</span>
          </div>
          <div className="kv">
            <span className="k">Purchase date</span>
            <span>{formatDate(item.purchaseDate)}</span>
          </div>
          {item.brand && (
            <div className="kv">
              <span className="k">Brand</span>
              <span>{item.brand}</span>
            </div>
          )}
          {item.size && (
            <div className="kv">
              <span className="k">Size</span>
              <span>{item.size}</span>
            </div>
          )}
          {item.color && (
            <div className="kv">
              <span className="k">Colour</span>
              <span>{item.color}</span>
            </div>
          )}
          {item.material && (
            <div className="kv">
              <span className="k">Material</span>
              <span>{item.material}</span>
            </div>
          )}
          {item.purchaseLocation && (
            <div className="kv">
              <span className="k">Bought from</span>
              <span>{item.purchaseLocation}</span>
            </div>
          )}
        </div>

        {item.notes && <div className="card small muted">{item.notes}</div>}

        <div className="section-label">Availability</div>
        <div className="row wrap">
          {item.state !== 'AVAILABLE' && (
            <button className="btn" onClick={() => change('AVAILABLE')}>
              {item.state === 'LAUNDRY' ? 'Mark clean' : 'Mark available'}
            </button>
          )}
          {item.state !== 'LAUNDRY' && item.state !== 'RETIRED' && (
            <button className="btn" onClick={() => change('LAUNDRY')}>
              Send to laundry
            </button>
          )}
          {item.state !== 'REPAIR' && item.state !== 'RETIRED' && (
            <button className="btn" onClick={() => change('REPAIR')}>
              Send to repair
            </button>
          )}
          {item.state !== 'RETIRED' && (
            <button className="btn danger" onClick={() => change('RETIRED')}>
              Retire
            </button>
          )}
        </div>

        <div className="section-label">Recent wears</div>
        {history.length === 0 ? (
          <div className="card small muted">No wears recorded yet.</div>
        ) : (
          <>
            <div className="card">
              {history.map((h) => (
                <div className="kv" key={h.key}>
                  <span className="k">{formatDate(h.date)}</span>
                  <span className="small grow" style={{ textAlign: 'right' }}>
                    {h.label}
                  </span>
                  <button
                    className="link"
                    style={{ color: 'var(--text-faint)' }}
                    onClick={() => setPendingDelete(h)}
                    aria-label={`Delete wear on ${h.date}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="tiny faint">
              Logged something by mistake? Remove it here and every count, last-worn date and
              laundry state recalculates from what remains.
            </div>
          </>
        )}
      </div>

      <Sheet
        open={pendingDelete !== null}
        title="Remove this wear?"
        onClose={() => setPendingDelete(null)}
      >
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>
            {pendingDelete && formatDate(pendingDelete.date)} · {pendingDelete?.label}
          </p>
          <p className="muted small" style={{ margin: 0 }}>
            {pendingDelete?.kind === 'pair'
              ? 'Both items in this wear are decremented and their last-worn dates recomputed.'
              : "This item's count is decremented and its last-worn date recomputed."}{' '}
            Anything this wear pushed into laundry comes back out.
          </p>
          <button
            className="btn block danger"
            onClick={async () => {
              if (!pendingDelete) return
              if (pendingDelete.kind === 'innerwear') await undoInnerwear(pendingDelete.eventId)
              else if (pendingDelete.kind === 'solo') await undoSoloWear(pendingDelete.eventId)
              else await undoWear(pendingDelete.eventId)
              setPendingDelete(null)
              toast('Wear removed.')
            }}
          >
            Remove this wear
          </button>
          <button className="btn block ghost" onClick={() => setPendingDelete(null)}>
            Keep it
          </button>
        </div>
      </Sheet>
    </div>
  )
}
