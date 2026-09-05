import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../../components/toast'
import { Empty, ItemRow, StateBadge } from '../../components/ui'
import type { ItemState, SystemRole } from '../../db/types'
import { relativeDay } from '../../lib/dates'
import { useCategories, useItems } from '../../lib/hooks'
import { markClean, setItemState } from '../../lib/wear'
import { ScreenHeader } from './ScreenHeader'

interface Props {
  state?: ItemState
  title: string
}

export function ItemList({ state, title }: Props) {
  const items = useItems()
  const categories = useCategories()
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [role, setRole] = useState<SystemRole | 'ALL'>('ALL')

  const categoryParam = params.get('category')
  const categoryId = categoryParam ? Number(categoryParam) : undefined

  const filtered = useMemo(() => {
    let list = items ?? []
    list = state ? list.filter((i) => i.state === state) : list.filter((i) => i.state !== 'RETIRED')
    if (categoryId !== undefined) list = list.filter((i) => i.categoryIds.includes(categoryId))
    if (role !== 'ALL') list = list.filter((i) => i.role === role)
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [items, state, categoryId, role])

  const activeCategory = categories?.find((c) => c.id === categoryId)

  async function clean(id: number) {
    await markClean(id)
    toast('Marked clean.')
  }

  async function available(id: number) {
    await setItemState(id, 'AVAILABLE')
    toast('Back in the wardrobe.')
  }

  return (
    <div className="screen">
      <ScreenHeader title={activeCategory ? activeCategory.name : title} />

      <div className="scroller" style={{ marginBottom: 14 }}>
        {(['ALL', 'TOP', 'BOTTOM', 'INNERWEAR'] as const).map((r) => (
          <button
            key={r}
            className={`chip ${role === r ? 'on' : ''}`}
            onClick={() => setRole(r)}
          >
            {r === 'ALL' ? 'All' : r === 'TOP' ? 'Tops' : r === 'BOTTOM' ? 'Bottoms' : 'Innerwear'}
          </button>
        ))}
        {activeCategory && (
          <button
            className="chip on"
            onClick={() => {
              params.delete('category')
              setParams(params)
            }}
          >
            {activeCategory.name} ✕
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Empty
          title="Nothing here"
          body={
            state === 'LAUNDRY'
              ? 'Nothing is waiting to be washed.'
              : state === 'REPAIR'
                ? 'Nothing is under repair.'
                : state === 'RETIRED'
                  ? 'You have not retired anything yet.'
                  : 'Add clothing to fill your wardrobe.'
          }
          action={
            !state && (
              <Link className="btn primary" to="/wardrobe/add">
                + Add clothing
              </Link>
            )
          }
        />
      ) : (
        <div className="stack tight">
          {filtered.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onClick={() => navigate(`/wardrobe/items/${item.id}`)}
              subtitle={
                <>
                  {relativeDay(item.lastWornAt)} · {item.lifetimeWears} wear
                  {item.lifetimeWears === 1 ? '' : 's'}
                  {item.state === 'LAUNDRY' &&
                    ` · ${item.wearsSinceLaundry}/${item.laundryThreshold}`}
                </>
              }
              right={
                state === 'LAUNDRY' ? (
                  <button
                    className="btn sm primary"
                    onClick={(e) => {
                      e.stopPropagation()
                      clean(item.id!)
                    }}
                  >
                    Mark clean
                  </button>
                ) : state === 'REPAIR' ? (
                  <button
                    className="btn sm primary"
                    onClick={(e) => {
                      e.stopPropagation()
                      available(item.id!)
                    }}
                  >
                    Available
                  </button>
                ) : (
                  <StateBadge state={item.state} />
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
