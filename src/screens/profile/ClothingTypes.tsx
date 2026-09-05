import { useState } from 'react'
import { useToast } from '../../components/toast'
import { Sheet } from '../../components/ui'
import { db } from '../../db/db'
import type { ClothingType, SystemRole } from '../../db/types'
import { ROLES } from '../../db/types'
import { useClothingTypes, useItems, useRoleLabels } from '../../lib/hooks'
import { ScreenHeader } from '../wardrobe/ScreenHeader'

export function ClothingTypes() {
  const types = useClothingTypes()
  const items = useItems()
  const roleLabels = useRoleLabels()
  const toast = useToast()
  const [editing, setEditing] = useState<ClothingType | 'new' | null>(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState<SystemRole>('TOP')

  function open(target: ClothingType | 'new') {
    setEditing(target)
    setName(target === 'new' ? '' : target.name)
    setRole(target === 'new' ? 'TOP' : target.role)
  }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed || !editing) return
    if (editing === 'new') {
      await db.clothingTypes.add({ name: trimmed, role, active: true, createdAt: Date.now() })
      toast('Type added.')
    } else {
      await db.clothingTypes.update(editing.id!, { name: trimmed, role })
      toast('Saved.')
    }
    setEditing(null)
  }

  /** Types are metadata only, so removal just clears the reference on items. */
  async function remove(type: ClothingType) {
    const affected = (items ?? []).filter((i) => i.typeId === type.id)
    await db.transaction('rw', db.clothingTypes, db.items, async () => {
      for (const item of affected) {
        await db.items.update(item.id!, { typeId: undefined, updatedAt: Date.now() })
      }
      await db.clothingTypes.delete(type.id!)
    })
    setEditing(null)
    toast('Type deleted.')
  }

  return (
    <div className="screen">
      <ScreenHeader
        title="Clothing types"
        action={
          <button className="btn sm primary" onClick={() => open('new')}>
            + Add
          </button>
        }
      />

      {ROLES.map((r) => {
        const list = (types ?? []).filter((t) => t.role === r)
        return (
          <div key={r}>
            <div className="section-label">{roleLabels[r]}</div>
            {list.length === 0 ? (
              <div className="card small muted">No types yet.</div>
            ) : (
              <div className="stack tight">
                {list.map((t) => {
                  const count = (items ?? []).filter((i) => i.typeId === t.id).length
                  return (
                    <div className="item-row" key={t.id} onClick={() => open(t)}>
                      <div className="body">
                        <div className="name">{t.name}</div>
                        <div className="tiny faint">
                          {count} item{count === 1 ? '' : 's'}
                        </div>
                      </div>
                      <span className="arrow">›</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      <Sheet
        open={editing !== null}
        title={editing === 'new' ? 'New type' : 'Edit type'}
        onClose={() => setEditing(null)}
      >
        <div className="stack">
          <div className="field">
            <label>Name</label>
            <input
              value={name}
              autoFocus
              placeholder="Linen shirt"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Counts as</label>
            <div className="row">
              {ROLES.map((r) => (
                <button
                  key={r}
                  className={`chip grow ${role === r ? 'on' : ''}`}
                  style={{ justifyContent: 'center' }}
                  onClick={() => setRole(r)}
                >
                  {roleLabels[r]}
                </button>
              ))}
            </div>
          </div>
          <button className="btn primary block" onClick={save} disabled={!name.trim()}>
            Save
          </button>
          {editing !== null && editing !== 'new' && (
            <button className="btn block ghost danger" onClick={() => remove(editing)}>
              Delete type
            </button>
          )}
        </div>
      </Sheet>
    </div>
  )
}
