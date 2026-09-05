import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/toast'
import { Empty, Photo, Sheet, Thumb } from '../components/ui'
import type { Category, ClothingItem, WearEvent } from '../db/types'
import { relativeDay, todayKey } from '../lib/dates'
import {
  useCategories,
  useCompatibility,
  useInnerwearEvents,
  useItems,
  useSettings,
  useWearEvents,
} from '../lib/hooks'
import { FAILURE_COPY, recommendInnerwear, recommendPairs } from '../lib/recommend'
import { recordInnerwear, recordWear, undoInnerwear, undoWear, WearError } from '../lib/wear'
import { LogWhatIWore } from './LogWhatIWore'

export function Today() {
  const items = useItems()
  const categories = useCategories()
  const compatibility = useCompatibility()
  const wearEvents = useWearEvents()
  const innerwearEvents = useInnerwearEvents()
  const settings = useSettings()
  const toast = useToast()

  // One cursor and one re-roll seed per category, so re-rolling Lounge does not
  // disturb the pair already on offer for Work.
  const [cursors, setCursors] = useState<Record<number, number>>({})
  const [seeds, setSeeds] = useState<Record<number, number>>({})
  const [logging, setLogging] = useState(false)
  const [busy, setBusy] = useState(false)

  const today = todayKey()
  const todayCategories = useMemo(
    () => (categories ?? []).filter((c) => c.includedInToday),
    [categories],
  )

  const wornTodayByCategory = useMemo(() => {
    const map = new Map<number, WearEvent>()
    for (const e of wearEvents ?? []) {
      if (e.date === today && e.categoryId !== undefined && !map.has(e.categoryId)) {
        map.set(e.categoryId, e)
      }
    }
    return map
  }, [wearEvents, today])

  const laundryCount = (items ?? []).filter((i) => i.state === 'LAUNDRY').length
  const todaysInnerwearEvent = (innerwearEvents ?? []).find((e) => e.date === today)
  const innerwearItem = todaysInnerwearEvent
    ? items?.find((i) => i.id === todaysInnerwearEvent.itemId)
    : undefined

  const innerwearSuggestion = useMemo(() => {
    if (!items || todaysInnerwearEvent) return undefined
    void seeds
    return recommendInnerwear(items, [])[0]?.item
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, todaysInnerwearEvent, seeds])

  if (!items || !categories || !settings || !wearEvents || !compatibility) {
    return <div className="screen" />
  }

  const doneCount = todayCategories.filter((c) => wornTodayByCategory.has(c.id!)).length

  async function wearIt(pick: { top: ClothingItem; bottom: ClothingItem; categoryId: number }) {
    if (busy) return
    setBusy(true)
    try {
      await recordWear({
        topId: pick.top.id!,
        bottomId: pick.bottom.id!,
        categoryId: pick.categoryId,
        source: 'TODAY_RECOMMENDATION',
      })
      toast('Logged. Have a good one.')
    } catch (e) {
      toast(e instanceof WearError ? e.message : 'Could not record that wear.', true)
    } finally {
      setBusy(false)
    }
  }

  /** Both Cancel and Generate again reverse the recorded wear; Generate again
   *  additionally re-rolls so a fresh pair is waiting. */
  async function undo(event: WearEvent, reroll: boolean) {
    if (busy) return
    setBusy(true)
    try {
      await undoWear(event.id!)
      if (reroll && event.categoryId !== undefined) {
        setSeeds((s) => ({ ...s, [event.categoryId!]: (s[event.categoryId!] ?? 0) + 1 }))
        setCursors((c) => ({ ...c, [event.categoryId!]: 0 }))
      }
      toast(reroll ? 'Rolled a new pair.' : "Cleared today's outfit.")
    } catch {
      toast('Could not undo that.', true)
    } finally {
      setBusy(false)
    }
  }

  async function acceptInnerwear(item: ClothingItem) {
    try {
      const created = await recordInnerwear(item.id!, 'TODAY_RECOMMENDATION')
      toast(created ? 'Innerwear logged for today.' : 'Already logged for today.')
    } catch {
      toast('Could not record that.', true)
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <div className="grow">
          <h1>
            Today{settings.userName ? <span className="sub">, {settings.userName}</span> : null}
          </h1>
          <div className="sub">
            {todayCategories.length === 0
              ? 'No categories in Today'
              : doneCount === todayCategories.length
                ? 'All set for today'
                : `${doneCount} of ${todayCategories.length} sorted`}
          </div>
        </div>
        <Link className="icon-btn" to="/wardrobe/laundry" aria-label={`Laundry, ${laundryCount}`}>
          🧺
          {laundryCount > 0 && <span className="count">{laundryCount}</span>}
        </Link>
      </div>

      {todayCategories.length === 0 ? (
        <Empty
          title="No categories in Today"
          body="Choose which categories should produce a daily recommendation."
          action={
            <Link className="btn primary" to="/profile/today">
              Choose Today categories
            </Link>
          }
        />
      ) : (
        <div className="stack">
          {todayCategories.map((category) => {
            const worn = wornTodayByCategory.get(category.id!)
            return worn ? (
              <WornCard
                key={category.id}
                category={category}
                event={worn}
                items={items}
                busy={busy}
                onCancel={() => undo(worn, false)}
                onRegenerate={() => undo(worn, true)}
              />
            ) : (
              <RecommendationCard
                key={category.id}
                category={category}
                items={items}
                compatibility={compatibility}
                wearEvents={wearEvents}
                impliedCompatibility={settings.impliedCompatibility}
                cursor={cursors[category.id!] ?? 0}
                seed={seeds[category.id!] ?? 0}
                busy={busy}
                onAnother={(optionCount) =>
                  optionCount > 1
                    ? setCursors((c) => ({ ...c, [category.id!]: (c[category.id!] ?? 0) + 1 }))
                    : setSeeds((s) => ({ ...s, [category.id!]: (s[category.id!] ?? 0) + 1 }))
                }
                onWear={wearIt}
              />
            )
          })}

          <InnerwearCard
            logged={innerwearItem}
            suggestion={innerwearSuggestion}
            onAccept={acceptInnerwear}
            onUndo={
              todaysInnerwearEvent
                ? async () => {
                    await undoInnerwear(todaysInnerwearEvent.id!)
                    toast('Innerwear cleared.')
                  }
                : undefined
            }
          />

          <button className="btn block ghost" onClick={() => setLogging(true)}>
            Log what I wore
          </button>
          <div className="tiny faint" style={{ textAlign: 'center' }}>
            Changed again later? Log it here; Today offers one pair per category a day.
          </div>
        </div>
      )}

      <Sheet open={logging} title="Log what I wore" onClose={() => setLogging(false)}>
        <LogWhatIWore onDone={() => setLogging(false)} />
      </Sheet>
    </div>
  )
}

function RecommendationCard({
  category,
  items,
  compatibility,
  wearEvents,
  impliedCompatibility,
  cursor,
  seed,
  busy,
  onAnother,
  onWear,
}: {
  category: Category
  items: ClothingItem[]
  compatibility: Parameters<typeof recommendPairs>[0]['compatibility']
  wearEvents: WearEvent[]
  impliedCompatibility: boolean
  cursor: number
  seed: number
  busy: boolean
  onAnother: (optionCount: number) => void
  onWear: (pick: { top: ClothingItem; bottom: ClothingItem; categoryId: number }) => void
}) {
  const result = useMemo(() => {
    void seed
    return recommendPairs({
      items,
      compatibility,
      wearEvents,
      categoryIds: [category.id!],
      impliedCompatibility,
    })
    // `seed` deliberately re-rolls the ranking when the user asks for another pair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, compatibility, wearEvents, category.id, impliedCompatibility, seed])

  if (result.candidates.length === 0) {
    const copy = FAILURE_COPY[result.reason as keyof typeof FAILURE_COPY]
    return (
      <div className="card stack tight">
        <span className="chip static on">{category.name}</span>
        <div style={{ fontWeight: 600 }}>{copy?.title ?? 'Nothing to recommend'}</div>
        <div className="small muted">{copy?.body}</div>
        <Link
          className="btn sm"
          to={result.reason === 'NO_ITEMS' ? '/wardrobe/add' : '/wardrobe/compatibility'}
          style={{ alignSelf: 'flex-start' }}
        >
          {result.reason === 'NO_ITEMS' ? 'Add clothing' : 'Fix this'}
        </Link>
      </div>
    )
  }

  const pick = result.candidates[cursor % result.candidates.length]

  return (
    <div className="card stack">
      <div className="row" style={{ alignItems: 'center' }}>
        <span className="chip static on">{category.name}</span>
        <span className="grow" />
        <span className="tiny faint">
          {result.candidates.length} option{result.candidates.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="pair">
        <PairSlot item={pick.top} />
        <PairSlot item={pick.bottom} />
      </div>

      <button
        className="btn primary block"
        disabled={busy}
        onClick={() => onWear({ top: pick.top, bottom: pick.bottom, categoryId: category.id! })}
      >
        Wear it
      </button>
      <button className="btn block" onClick={() => onAnother(result.candidates.length)}>
        Recommend another
      </button>
    </div>
  )
}

function WornCard({
  category,
  event,
  items,
  busy,
  onCancel,
  onRegenerate,
}: {
  category: Category
  event: WearEvent
  items: ClothingItem[]
  busy: boolean
  onCancel: () => void
  onRegenerate: () => void
}) {
  const top = items.find((i) => i.id === event.topId)
  const bottom = items.find((i) => i.id === event.bottomId)

  return (
    <div className="card worn stack tight">
      <div className="row" style={{ alignItems: 'center' }}>
        <span className="label grow">You're wearing today</span>
        <span className="tiny faint">{category.name}</span>
      </div>

      <div className="worn-items">
        <Thumb item={top} />
        <Thumb item={bottom} />
        <div className="names">
          <div className="n">{top?.name ?? 'Removed item'}</div>
          <div className="n muted">{bottom?.name ?? 'Removed item'}</div>
        </div>
      </div>

      <div className="row">
        <button className="btn grow" disabled={busy} onClick={onRegenerate}>
          Generate again
        </button>
        <button className="btn grow ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function PairSlot({ item }: { item: ClothingItem }) {
  return (
    <div className="slot">
      <Photo item={item} />
      <div className="name">{item.name}</div>
      <div className="meta">
        {relativeDay(item.lastWornAt)} · {item.lifetimeWears} wear
        {item.lifetimeWears === 1 ? '' : 's'}
      </div>
    </div>
  )
}

function InnerwearCard({
  logged,
  suggestion,
  onAccept,
  onUndo,
}: {
  logged?: ClothingItem
  suggestion?: ClothingItem
  onAccept: (item: ClothingItem) => void
  onUndo?: () => void
}) {
  if (logged) {
    return (
      <div className="card row small" style={{ alignItems: 'center' }}>
        <span className="grow">
          <span className="faint">Essentials today · </span>
          {logged.name}
        </span>
        {onUndo && (
          <button className="btn sm ghost" onClick={onUndo}>
            Undo
          </button>
        )}
      </div>
    )
  }
  if (!suggestion) {
    return (
      <div className="card small muted">
        No essentials available. Add inner items or clear some from laundry.
      </div>
    )
  }
  return (
    <div className="card row small" style={{ alignItems: 'center' }}>
      <span className="grow">
        <span className="faint">Essentials today · </span>
        {suggestion.name}
      </span>
      <button className="btn sm primary" onClick={() => onAccept(suggestion)}>
        Log
      </button>
    </div>
  )
}
