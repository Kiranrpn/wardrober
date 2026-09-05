import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Empty, ItemRow } from '../../components/ui'
import { relativeDay } from '../../lib/dates'
import { useItems, useSettings, useWearEvents } from '../../lib/hooks'
import { costPerWear, money, pairStats, wardrobeStats } from '../../lib/stats'
import { ScreenHeader } from '../wardrobe/ScreenHeader'

export function Statistics() {
  const items = useItems()
  const wearEvents = useWearEvents()
  const settings = useSettings()
  const navigate = useNavigate()

  const stats = useMemo(
    () => (items && wearEvents ? wardrobeStats(items, wearEvents) : null),
    [items, wearEvents],
  )
  const pairs = useMemo(() => pairStats(wearEvents ?? []).slice(0, 8), [wearEvents])

  if (!stats || !settings || !items) return <div className="screen" />

  const byId = (id: number) => items.find((i) => i.id === id)
  const currency = settings.currency

  if (stats.activeItems === 0) {
    return (
      <div className="screen">
        <ScreenHeader title="Statistics" />
        <Empty title="Nothing to measure yet" body="Add clothes and log a few wears." />
      </div>
    )
  }

  return (
    <div className="screen">
      <ScreenHeader title="Statistics" />

      <div className="stat-grid">
        <Stat v={stats.activeItems} k="Active items" />
        <Stat v={stats.totalWears} k="Recorded wears" />
        <Stat v={money(stats.totalValue, currency)} k="Wardrobe value" />
        <Stat v={money(stats.averageCostPerWear, currency)} k="Avg cost per wear" />
        <Stat v={stats.neverWorn} k="Never worn" />
      </div>

      <div className="section-label">Most worn</div>
      <List items={stats.mostWorn} onOpen={(id) => navigate(`/wardrobe/items/${id}`)} />

      <div className="section-label">Least worn</div>
      <List items={stats.leastWorn} onOpen={(id) => navigate(`/wardrobe/items/${id}`)} />

      <div className="section-label">Highest cost per wear</div>
      {stats.highestCostPerWear.length === 0 ? (
        <div className="card small muted">Add purchase prices to see this.</div>
      ) : (
        <div className="stack tight">
          {stats.highestCostPerWear.map(({ item, cpw }) => (
            <ItemRow
              key={item.id}
              item={item}
              onClick={() => navigate(`/wardrobe/items/${item.id}`)}
              subtitle={`${item.lifetimeWears} wears`}
              right={<span className="small">{money(cpw, currency)}</span>}
            />
          ))}
        </div>
      )}

      <div className="section-label">Most used pairs</div>
      {pairs.length === 0 ? (
        <div className="card small muted">No pairs recorded yet.</div>
      ) : (
        <div className="card">
          {pairs.map((p) => {
            const top = byId(p.topId)
            const bottom = byId(p.bottomId)
            return (
              <div className="kv" key={p.pairKey}>
                <span className="k" style={{ minWidth: 0 }}>
                  {top?.name ?? 'Removed'} + {bottom?.name ?? 'Removed'}
                </span>
                <span className="small">
                  {p.count}× · {relativeDay(p.lastUsed)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({ v, k }: { v: string | number; k: string }) {
  return (
    <div className="stat">
      <div className="v">{v}</div>
      <div className="k">{k}</div>
    </div>
  )
}

function List({
  items,
  onOpen,
}: {
  items: import('../../db/types').ClothingItem[]
  onOpen: (id: number) => void
}) {
  const settings = useSettings()
  if (items.length === 0) return <div className="card small muted">Nothing yet.</div>
  return (
    <div className="stack tight">
      {items.map((item) => {
        const cpw = costPerWear(item)
        return (
          <ItemRow
            key={item.id}
            item={item}
            onClick={() => onOpen(item.id!)}
            subtitle={`${relativeDay(item.lastWornAt)}${
              cpw !== null && settings ? ` · ${money(cpw, settings.currency)} per wear` : ''
            }`}
            right={<span className="small">{item.lifetimeWears}</span>}
          />
        )
      })}
    </div>
  )
}
