import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useToast } from '../../components/toast'
import { Photo, StateBadge } from '../../components/ui'
import { ROLE_LABEL } from '../../db/types'
import { formatDate, relativeDay } from '../../lib/dates'
import {
  useCategories,
  useClothingTypes,
  useInnerwearEvents,
  useItem,
  useItems,
  useSettings,
  useWearEvents,
} from '../../lib/hooks'
import { costPerWear, money } from '../../lib/stats'
import { markClean, setItemState } from '../../lib/wear'
import { ScreenHeader } from './ScreenHeader'

export function ItemDetail() {
  const { id } = useParams()
  const itemId = Number(id)
  const item = useItem(itemId)
  const items = useItems()
  const categories = useCategories()
  const types = useClothingTypes()
  const wearEvents = useWearEvents()
  const innerwearEvents = useInnerwearEvents()
  const settings = useSettings()
  const navigate = useNavigate()
  const toast = useToast()

  const history = useMemo(() => {
    if (!item) return []
    if (item.role === 'INNERWEAR') {
      return (innerwearEvents ?? [])
        .filter((e) => e.itemId === itemId)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 20)
        .map((e) => ({ key: `i${e.id}`, date: e.date, label: 'Worn' }))
    }
    return (wearEvents ?? [])
      .filter((e) => e.topId === itemId || e.bottomId === itemId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20)
      .map((e) => {
        const otherId = e.topId === itemId ? e.bottomId : e.topId
        const other = items?.find((i) => i.id === otherId)
        const cat = categories?.find((c) => c.id === e.categoryId)
        return {
          key: `w${e.id}`,
          date: e.date,
          label: `with ${other?.name ?? 'removed item'}${cat ? ` · ${cat.name}` : ''}`,
        }
      })
  }, [item, itemId, wearEvents, innerwearEvents, items, categories])

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
              {ROLE_LABEL[item.role]}
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
          <div className="card">
            {history.map((h) => (
              <div className="kv" key={h.key}>
                <span className="k">{formatDate(h.date)}</span>
                <span className="small">{h.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
