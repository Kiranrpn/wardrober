import { useState } from 'react'
import { useToast } from '../../components/toast'
import { Empty, Sheet } from '../../components/ui'
import { db } from '../../db/db'
import type { Category } from '../../db/types'
import { useCategories, useItems } from '../../lib/hooks'
import { ScreenHeader } from '../wardrobe/ScreenHeader'

export function Categories() {
  const categories = useCategories()
  const items = useItems()
  const toast = useToast()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [name, setName] = useState('')

  function open(target: Category | 'new') {
    setEditing(target)
    setName(target === 'new' ? '' : target.name)
  }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed || !editing) return
    if (editing === 'new') {
      const order = (categories ?? []).length
      await db.categories.add({
        name: trimmed,
        order,
        includedInToday: true,
        active: true,
        createdAt: Date.now(),
      })
      toast('Category added.')
    } else {
      await db.categories.update(editing.id!, { name: trimmed })
      toast('Renamed.')
    }
    setEditing(null)
  }

  async function move(category: Category, delta: number) {
    const list = categories ?? []
    const from = list.findIndex((c) => c.id === category.id)
    const to = from + delta
    if (to < 0 || to >= list.length) return
    const reordered = [...list]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    await db.transaction('rw', db.categories, async () => {
      for (let i = 0; i < reordered.length; i++) {
        await db.categories.update(reordered[i].id!, { order: i })
      }
    })
  }

  /** Detaches the category from items but leaves wear history intact (spec §42). */
  async function remove(category: Category) {
    const affected = (items ?? []).filter((i) => i.categoryIds.includes(category.id!))
    await db.transaction('rw', db.categories, db.items, async () => {
      for (const item of affected) {
        await db.items.update(item.id!, {
          categoryIds: item.categoryIds.filter((c) => c !== category.id),
          updatedAt: Date.now(),
        })
      }
      await db.categories.delete(category.id!)
    })
    setEditing(null)
    toast(`Deleted. ${affected.length} item${affected.length === 1 ? '' : 's'} kept.`)
  }

  return (
    <div className="screen">
      <ScreenHeader
        title="Categories"
        action={
          <button className="btn sm primary" onClick={() => open('new')}>
            + Add
          </button>
        }
      />

      {(categories ?? []).length === 0 ? (
        <Empty
          title="No categories"
          body="Categories are your contexts: lounge, office, a wedding, whatever you actually do."
          action={
            <button className="btn primary" onClick={() => open('new')}>
              Add category
            </button>
          }
        />
      ) : (
        <div className="stack tight">
          {(categories ?? []).map((c, i) => {
            const count = (items ?? []).filter(
              (it) => it.state !== 'RETIRED' && it.categoryIds.includes(c.id!),
            ).length
            return (
              <div className="item-row" key={c.id}>
                <div className="body">
                  <div className="name">{c.name}</div>
                  <div className="tiny faint">
                    {count} item{count === 1 ? '' : 's'}
                    {c.includedInToday ? ' · in Today' : ''}
                  </div>
                </div>
                <button
                  className="btn sm ghost"
                  disabled={i === 0}
                  onClick={() => move(c, -1)}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  className="btn sm ghost"
                  disabled={i === (categories ?? []).length - 1}
                  onClick={() => move(c, 1)}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button className="btn sm" onClick={() => open(c)}>
                  Edit
                </button>
              </div>
            )
          })}
        </div>
      )}

      <Sheet
        open={editing !== null}
        title={editing === 'new' ? 'New category' : 'Edit category'}
        onClose={() => setEditing(null)}
      >
        <div className="stack">
          <div className="field">
            <label>Name</label>
            <input
              value={name}
              autoFocus
              placeholder="Client meeting"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          </div>
          <button className="btn primary block" onClick={save} disabled={!name.trim()}>
            Save
          </button>
          {editing !== null && editing !== 'new' && (
            <button className="btn block ghost danger" onClick={() => remove(editing)}>
              Delete category
            </button>
          )}
          <div className="tiny faint">
            Deleting a category never deletes clothes or past wears.
          </div>
        </div>
      </Sheet>
    </div>
  )
}
