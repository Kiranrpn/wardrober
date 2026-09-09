import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Empty, ItemRow } from '../../components/ui'
import type { ClothingItem } from '../../db/types'
import { relativeDay } from '../../lib/dates'
import {
  useCategories,
  useCompatibility,
  useInnerwearEvents,
  useItems,
  useSettings,
  useSoloWearEvents,
  useWearEvents,
} from '../../lib/hooks'
import type { CostPerWearPoint, SpendYear, WearLog } from '../../lib/stats'
import { costPerWear, money, moneyStats, pairStats, rotationStats, wardrobeStats } from '../../lib/stats'
import { ScreenHeader } from '../wardrobe/ScreenHeader'

/** A month is too short to say anything about rotation and a year is too long to
 *  act on; 30 days is roughly one full turn of a wardrobe. */
const WINDOW_DAYS = 30

/** Six months without a wear is past "I have not got round to it" and into
 *  money that is not doing anything. */
const DORMANT_DAYS = 180

const percent = (value: number | null) =>
  value === null ? '—' : `${Math.round(value * 100)}%`

export function Statistics() {
  const items = useItems()
  const categories = useCategories()
  const compatibility = useCompatibility()
  const wearEvents = useWearEvents()
  const soloEvents = useSoloWearEvents()
  const innerwearEvents = useInnerwearEvents()
  const settings = useSettings()
  const navigate = useNavigate()

  const log = useMemo<WearLog | null>(
    () =>
      wearEvents && soloEvents && innerwearEvents
        ? { pair: wearEvents, solo: soloEvents, innerwear: innerwearEvents }
        : null,
    [wearEvents, soloEvents, innerwearEvents],
  )

  const stats = useMemo(() => (items ? wardrobeStats(items) : null), [items])
  const pairs = useMemo(() => pairStats(wearEvents ?? []).slice(0, 8), [wearEvents])

  const rotation = useMemo(
    () =>
      items && categories && compatibility && log && settings
        ? rotationStats({
            items,
            categories,
            compatibility,
            impliedCompatibility: settings.impliedCompatibility,
            log,
            windowDays: WINDOW_DAYS,
          })
        : null,
    [items, categories, compatibility, log, settings],
  )

  const spend = useMemo(
    () => (items && log ? moneyStats({ items, log, dormantDays: DORMANT_DAYS }) : null),
    [items, log],
  )

  if (!stats || !settings || !items || !rotation || !spend) return <div className="screen" />

  const byId = (id: number) => items.find((i) => i.id === id)
  const currency = settings.currency
  const open = (id: number) => navigate(`/wardrobe/items/${id}`)

  if (stats.activeItems === 0) {
    return (
      <div className="screen">
        <ScreenHeader title="Statistics" />
        <Empty title="Nothing to measure yet" body="Add clothes and log a few wears." />
      </div>
    )
  }

  const latestCpw = [...spend.costPerWearTrend].reverse().find((p) => p.cpw !== null)?.cpw ?? null

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

      {/* ------------------------------------------------------------ rotation */}

      <div className="section-label">Rotation coverage</div>
      <div className="stat-grid">
        <Stat v={percent(rotation.utilisation)} k={`Worn in ${WINDOW_DAYS} days`} />
        <Stat v={percent(rotation.pairCoverage)} k="Pairs ever used" />
        <Stat v={percent(rotation.concentration)} k="From the top 5" />
      </div>

      <div className="card">
        <div className="kv">
          <span className="k">Items in rotation</span>
          <span>
            {rotation.wornInWindow} of {rotation.activeItems}
          </span>
        </div>
        <div className="kv">
          <span className="k">Pairs your wardrobe allows</span>
          <span>{rotation.validPairs.toLocaleString()}</span>
        </div>
        <div className="kv">
          <span className="k">Pairs you have actually worn</span>
          <span>{rotation.wornPairs.toLocaleString()}</span>
        </div>
        <div className="kv">
          <span className="k">Idle over {WINDOW_DAYS} days</span>
          <span>{rotation.idle.length}</span>
        </div>
      </div>
      <div className="tiny faint">
        Counted over everything not retired, so clothes sitting in the laundry basket today do
        not shrink the total and flatter the percentage. A pair ruled out in compatibility
        leaves both sides of the figure.
      </div>

      {rotation.busiest.length > 0 && (
        <>
          <div className="section-label">Carrying the rotation</div>
          <div className="stack tight">
            {rotation.busiest.map(({ item, wears }) => (
              <ItemRow
                key={item.id}
                item={item}
                onClick={() => open(item.id!)}
                subtitle={relativeDay(item.lastWornAt)}
                right={<span className="small">{wears}×</span>}
              />
            ))}
          </div>
        </>
      )}

      {rotation.idle.length > 0 && (
        <>
          <div className="section-label">Idle, but not new</div>
          <List items={rotation.idle.slice(0, 5)} onOpen={open} />
          <div className="tiny faint">
            Worn at some point, nothing in the last {WINDOW_DAYS} days. Retiring one keeps its
            history and takes it out of the rotation.
          </div>
        </>
      )}

      {/* --------------------------------------------------------------- money */}

      <div className="section-label">Money over time</div>
      <div className="stat-grid">
        <Stat v={money(latestCpw, currency)} k="Cost per wear now" />
        <Stat v={money(spend.dormantValue, currency)} k={`Idle ${DORMANT_DAYS / 30} months`} />
        <Stat v={spend.dormantItems} k="Items sitting still" />
      </div>

      <CostPerWearTrend points={spend.costPerWearTrend} currency={currency} />
      {spend.untrackedItems > 0 && (
        <div className="tiny faint">
          {spend.untrackedItems} priced item{spend.untrackedItems === 1 ? '' : 's'} left out of the
          line: without a purchase date there is no month to place {spend.untrackedItems === 1 ? 'it' : 'them'} in.
        </div>
      )}

      <div className="section-label">Spend by year</div>
      {spend.spendByYear.length === 0 ? (
        <div className="card small muted">
          Add purchase prices and dates to see what the wardrobe cost, year by year.
        </div>
      ) : (
        <>
          <SpendBars rows={spend.spendByYear} currency={currency} />
          {spend.undatedItems > 0 && (
            <div className="tiny faint">
              Plus {money(spend.undatedSpend, currency)} across {spend.undatedItems} item
              {spend.undatedItems === 1 ? '' : 's'} with no purchase date.
            </div>
          )}
        </>
      )}

      {/* ------------------------------------------------------------- classics */}

      <div className="section-label">Most worn</div>
      <List items={stats.mostWorn} onOpen={open} />

      <div className="section-label">Least worn</div>
      <List items={stats.leastWorn} onOpen={open} />

      <div className="section-label">Highest cost per wear</div>
      {stats.highestCostPerWear.length === 0 ? (
        <div className="card small muted">Add purchase prices to see this.</div>
      ) : (
        <div className="stack tight">
          {stats.highestCostPerWear.map(({ item, cpw }) => (
            <ItemRow
              key={item.id}
              item={item}
              onClick={() => open(item.id!)}
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

function List({ items, onOpen }: { items: ClothingItem[]; onOpen: (id: number) => void }) {
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

const CHART_W = 320
const CHART_H = 84
const PAD = 6

/** One series, so no legend: the heading names it. Drawn from a zero baseline
 *  because a cost per wear halving from ₹900 to ₹450 is the whole point, and a
 *  cropped axis would turn every wardrobe into a dramatic collapse. */
function CostPerWearTrend({
  points,
  currency,
}: {
  points: CostPerWearPoint[]
  currency: string
}) {
  const withValues = points.filter((p) => p.cpw !== null)
  if (withValues.length < 2) {
    return (
      <div className="card small muted">
        Not enough history yet. Once priced items have been worn across two months, this shows
        what a wear has been costing you.
      </div>
    )
  }

  const max = Math.max(...withValues.map((p) => p.cpw!))
  const step = (CHART_W - PAD * 2) / Math.max(1, points.length - 1)
  const y = (v: number) => CHART_H - PAD - (v / max) * (CHART_H - PAD * 2)

  const drawn = points
    .map((p, i) => ({ ...p, x: PAD + i * step }))
    .filter((p): p is typeof p & { cpw: number } => p.cpw !== null)

  const path = drawn.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${y(p.cpw)}`).join(' ')
  const last = drawn[drawn.length - 1]
  const first = drawn[0]

  return (
    <div className="card stack tight">
      <svg
        className="spark"
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        role="img"
        aria-label={`Cost per wear by month: ${drawn
          .map((p) => `${p.label} ${Math.round(p.cpw)}`)
          .join(', ')}`}
      >
        <line
          className="axis"
          x1={PAD}
          y1={CHART_H - PAD}
          x2={CHART_W - PAD}
          y2={CHART_H - PAD}
        />
        <path className="line" d={path} />
        <circle className="dot" cx={last.x} cy={y(last.cpw)} r={4} />
      </svg>
      <div className="row small" style={{ alignItems: 'baseline' }}>
        <span className="faint">
          {first.label} · {money(first.cpw, currency)}
        </span>
        <span className="grow" />
        <span>
          {last.label} · <strong>{money(last.cpw, currency)}</strong>
        </span>
      </div>
      <div className="tiny faint">
        Everything bought by the end of each month, divided by every wear recorded by then. It
        falls as clothes get worn and steps up when something new arrives.
      </div>
    </div>
  )
}

function SpendBars({ rows, currency }: { rows: SpendYear[]; currency: string }) {
  const max = Math.max(...rows.map((r) => r.total))
  return (
    <div className="card stack tight">
      {rows.map((row) => (
        <div className="bar-row" key={row.year}>
          <span className="lab tiny">{row.year}</span>
          <span className="track">
            <span
              className="fill"
              style={{ width: `${Math.max(2, (row.total / max) * 100)}%` }}
            />
          </span>
          <span className="val small">{money(row.total, currency)}</span>
        </div>
      ))}
      <div className="tiny faint">
        {rows.reduce((s, r) => s + r.items, 0)} dated purchases, retired items included: what a
        wardrobe cost does not stop being true when something leaves it.
      </div>
    </div>
  )
}
