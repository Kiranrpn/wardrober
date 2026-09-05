import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/toast'
import { Empty, Photo, Sheet, StateBadge } from '../components/ui'
import type { ClothingItem } from '../db/types'
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
import { recordInnerwear, recordWear, WearError } from '../lib/wear'
import { LogWhatIWore } from './LogWhatIWore'

export function Today() {
  const items = useItems()
  const categories = useCategories()
  const compatibility = useCompatibility()
  const wearEvents = useWearEvents()
  const innerwearEvents = useInnerwearEvents()
  const settings = useSettings()
  const toast = useToast()

  const [cursor, setCursor] = useState(0)
  const [seed, setSeed] = useState(0)
  const [logging, setLogging] = useState(false)
  const [busy, setBusy] = useState(false)

  const todayCategoryIds = useMemo(
    () => (categories ?? []).filter((c) => c.includedInToday).map((c) => c.id!),
    [categories],
  )

  const result = useMemo(() => {
    if (!items || !compatibility || !wearEvents || !settings) return null
    void seed
    return recommendPairs({
      items,
      compatibility,
      wearEvents,
      categoryIds: todayCategoryIds,
      impliedCompatibility: settings.impliedCompatibility,
      penaliseCategoriesUsedToday: true,
    })
    // `seed` deliberately re-rolls the ranking when the user asks for another pair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, compatibility, wearEvents, settings, todayCategoryIds, seed])

  const today = todayKey()
  const todaysInnerwearEvent = innerwearEvents?.find((e) => e.date === today)
  const innerwearItem = todaysInnerwearEvent
    ? items?.find((i) => i.id === todaysInnerwearEvent.itemId)
    : undefined

  const innerwearSuggestion = useMemo(() => {
    if (!items || todaysInnerwearEvent) return undefined
    void seed
    return recommendInnerwear(items, [])[0]?.item
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, todaysInnerwearEvent, seed])

  const sessionsToday = wearEvents?.filter((e) => e.date === today).length ?? 0
  const laundryCount = items?.filter((i) => i.state === 'LAUNDRY').length ?? 0

  if (!items || !categories || !result) return <div className="screen" />

  const pick = result.candidates.length > 0 ? result.candidates[cursor % result.candidates.length] : null
  const categoryLabel = pick ? categories.find((c) => c.id === pick.categoryId)?.name : undefined

  async function wearIt() {
    if (!pick || busy) return
    setBusy(true)
    try {
      await recordWear({
        topId: pick.top.id!,
        bottomId: pick.bottom.id!,
        categoryId: pick.categoryId,
        source: 'TODAY_RECOMMENDATION',
      })
      setCursor(0)
      setSeed((s) => s + 1)
      toast('Logged. Have a good one.')
    } catch (e) {
      toast(e instanceof WearError ? e.message : 'Could not record that wear.', true)
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
          <h1>Today</h1>
          <div className="sub">
            {sessionsToday === 0
              ? 'No wears logged yet'
              : `${sessionsToday} wear${sessionsToday > 1 ? 's' : ''} logged today`}
          </div>
        </div>
      </div>

      {pick ? (
        <div className="stack">
          <div className="card stack">
            <div className="row" style={{ alignItems: 'center' }}>
              <span className="chip static on">{categoryLabel ?? 'Today'}</span>
              <span className="grow" />
              <span className="tiny faint">
                {result.candidates.length} option{result.candidates.length > 1 ? 's' : ''}
              </span>
            </div>

            <div className="pair">
              <PairSlot item={pick.top} />
              <PairSlot item={pick.bottom} />
            </div>

            <button className="btn primary block" onClick={wearIt} disabled={busy}>
              Wear it
            </button>
            <div className="row">
              <button
                className="btn grow"
                onClick={() => {
                  if (result.candidates.length > 1) setCursor((c) => c + 1)
                  else setSeed((s) => s + 1)
                }}
              >
                Recommend another
              </button>
              <button className="btn grow ghost" onClick={() => setLogging(true)}>
                Log what I wore
              </button>
            </div>
          </div>

          <InnerwearCard
            logged={innerwearItem}
            suggestion={innerwearSuggestion}
            onAccept={acceptInnerwear}
          />

          {laundryCount > 0 && (
            <div className="card row small" style={{ alignItems: 'center' }}>
              <span className="muted grow">
                {laundryCount} item{laundryCount > 1 ? 's' : ''} waiting in laundry
              </span>
              <Link className="btn sm" to="/wardrobe/laundry">
                Review
              </Link>
            </div>
          )}
        </div>
      ) : (
        <NoPair reason={result.reason} onLog={() => setLogging(true)} />
      )}

      <Sheet open={logging} title="Log what I wore" onClose={() => setLogging(false)}>
        <LogWhatIWore
          onDone={() => {
            setLogging(false)
            setCursor(0)
            setSeed((s) => s + 1)
          }}
        />
      </Sheet>
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
}: {
  logged?: ClothingItem
  suggestion?: ClothingItem
  onAccept: (item: ClothingItem) => void
}) {
  if (logged) {
    return (
      <div className="card row small" style={{ alignItems: 'center' }}>
        <span className="grow">
          <span className="faint">Innerwear today · </span>
          {logged.name}
        </span>
        <StateBadge state={logged.state} />
      </div>
    )
  }
  if (!suggestion) {
    return (
      <div className="card small muted">
        No innerwear available. Add innerwear items or clear some from laundry.
      </div>
    )
  }
  return (
    <div className="card row small" style={{ alignItems: 'center' }}>
      <span className="grow">
        <span className="faint">Innerwear today · </span>
        {suggestion.name}
      </span>
      <button className="btn sm primary" onClick={() => onAccept(suggestion)}>
        Log
      </button>
    </div>
  )
}

function NoPair({ reason, onLog }: { reason: string; onLog: () => void }) {
  const copy = FAILURE_COPY[reason as keyof typeof FAILURE_COPY]
  const action =
    reason === 'NO_ITEMS' ? (
      <Link className="btn primary" to="/wardrobe/add">
        Add clothing
      </Link>
    ) : reason === 'NO_COMPATIBILITY' ? (
      <Link className="btn primary" to="/wardrobe/compatibility">
        Manage compatibility
      </Link>
    ) : reason === 'NO_CATEGORIES' ? (
      <Link className="btn primary" to="/profile/today">
        Choose Today categories
      </Link>
    ) : reason === 'ALL_IN_LAUNDRY' ? (
      <Link className="btn primary" to="/wardrobe/laundry">
        Open laundry
      </Link>
    ) : (
      <Link className="btn primary" to="/wardrobe">
        View items
      </Link>
    )

  return (
    <div className="stack">
      <Empty title={copy?.title ?? 'Nothing to recommend'} body={copy?.body} action={action} />
      <button className="btn block ghost" onClick={onLog}>
        Log what I wore
      </button>
    </div>
  )
}
