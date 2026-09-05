import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../../components/toast'
import { Empty, Photo } from '../../components/ui'
import type { ClothingItem } from '../../db/types'
import { relativeDay } from '../../lib/dates'
import {
  useCategories,
  useCompatibility,
  useItems,
  useRoleLabels,
  useSettings,
  useWearEvents,
} from '../../lib/hooks'
import { failureCopy, recommendPairs } from '../../lib/recommend'
import { recordWear, WearError } from '../../lib/wear'
import { ScreenHeader } from './ScreenHeader'

export function GeneratePair() {
  const items = useItems()
  const categories = useCategories()
  const compatibility = useCompatibility()
  const wearEvents = useWearEvents()
  const settings = useSettings()
  const roleLabels = useRoleLabels()
  const toast = useToast()

  const [categoryId, setCategoryId] = useState<number | undefined>()
  const [cursor, setCursor] = useState(0)
  const [seed, setSeed] = useState(0)
  const [busy, setBusy] = useState(false)

  const result = useMemo(() => {
    if (!items || !compatibility || !wearEvents || !settings || categoryId === undefined) return null
    void seed
    return recommendPairs({
      items,
      compatibility,
      wearEvents,
      categoryIds: [categoryId],
      impliedCompatibility: settings.impliedCompatibility,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, compatibility, wearEvents, settings, categoryId, seed])

  const pick =
    result && result.candidates.length > 0
      ? result.candidates[cursor % result.candidates.length]
      : null

  async function wearIt() {
    if (!pick || busy) return
    setBusy(true)
    try {
      await recordWear({
        topId: pick.top.id!,
        bottomId: pick.bottom.id!,
        categoryId: pick.categoryId,
        source: 'GENERATE_PAIR',
      })
      setCursor(0)
      setSeed((s) => s + 1)
      toast('Logged.')
    } catch (e) {
      toast(e instanceof WearError ? e.message : 'Could not record that wear.', true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <ScreenHeader title="Generate pair" subtitle="An outfit for any category, right now" />

      <div className="field">
        <label>Category</label>
        <div className="row wrap">
          {(categories ?? []).map((c) => (
            <button
              key={c.id}
              className={`chip ${categoryId === c.id ? 'on' : ''}`}
              onClick={() => {
                setCategoryId(c.id)
                setCursor(0)
                setSeed((s) => s + 1)
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        {categoryId === undefined ? (
          <Empty title="Pick a category" body="Then you get one pair, ready to wear." />
        ) : pick ? (
          <div className="card stack">
            <div className="pair">
              <Slot item={pick.top} />
              <Slot item={pick.bottom} />
            </div>
            <button className="btn primary block" onClick={wearIt} disabled={busy}>
              Wear it
            </button>
            <button
              className="btn block"
              onClick={() => {
                if (result && result.candidates.length > 1) setCursor((c) => c + 1)
                else setSeed((s) => s + 1)
              }}
            >
              Generate again
            </button>
          </div>
        ) : (
          <Empty
            title={failureCopy(result!.reason, roleLabels)?.title ?? 'No pair available'}
            body={
              failureCopy(result!.reason, roleLabels)?.body ??
              'There is no available compatible pair in this category.'
            }
            action={
              <Link className="btn primary" to="/wardrobe/compatibility">
                Manage compatibility
              </Link>
            }
          />
        )}
      </div>
    </div>
  )
}

function Slot({ item }: { item: ClothingItem }) {
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
