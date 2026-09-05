import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../../components/toast'
import { Empty, ItemRow, SearchField, StateBadge } from '../../components/ui'
import type { ItemState, SystemRole } from '../../db/types'
import { relativeDay } from '../../lib/dates'
import { useCategories, useClothingTypes, useItems } from '../../lib/hooks'
import { markClean, setItemState } from '../../lib/wear'
import { ScreenHeader } from './ScreenHeader'

interface Props {
  state?: ItemState
  title: string
}

export function ItemList({ state, title }: Props) {
  const items = useItems()
  const categories = useCategories()
  const types = useClothingTypes()
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [role, setRole] = useState<SystemRole | 'ALL'>('ALL')
  const [query, setQuery] = useState('')

  const categoryParam = params.get('category')
  const categoryId = categoryParam ? Number(categoryParam) : undefined

  const filtered = useMemo(() => {
    let list = items ?? []
    list = state ? list.filter((i) => i.state === state) : list.filter((i) => i.state !== 'RETIRED')
    if (categoryId !== undefined) list = list.filter((i) => i.categoryIds.includes(categoryId))
    if (role !== 'ALL') list = list.filter((i) => i.role === role)

    // Search spans the fields you would actually remember an item by, not just its name.
    const q = query.trim().toLowerCase()
    if (q) {
      const typeName = (id?: number) => types?.find((t) => t.id === id)?.name ?? ''
      const catNames = (ids: number[]) =>
        ids.map((id) => categories?.find((c) => c.id === id)?.name ?? '').join(' ')
      list = list.filter((i) =>
        [i.name, i.brand, i.color, i.material, i.size, i.notes, typeName(i.typeId), catNames(i.categoryIds)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [items, state, categoryId, role, query, types, categories])

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

      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search name, brand, colour, category"
      />

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
          title={query ? `Nothing matches "${query}"` : 'Nothing here'}
          body={
            query
              ? 'Try a different word, or clear the search.'
              : state === 'LAUNDRY'
              ? 'Nothing is waiting to be washed.'
              : state === 'REPAIR'
                ? 'Nothing is under repair.'
                : state === 'RETIRED'
                  ? 'You have not retired anything yet.'
                  : 'Add clothing to fill your wardrobe.'
          }
          action={
            query ? (
              <button className="btn" onClick={() => setQuery('')}>
                Clear search
              </button>
            ) : (
              !state && (
                <Link className="btn primary" to="/wardrobe/add">
                  + Add clothing
                </Link>
              )
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
