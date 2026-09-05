import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useToast } from '../../components/toast'
import { IconPicker, Photo } from '../../components/ui'
import { db } from '../../db/db'
import type { ClothingItem, SystemRole } from '../../db/types'
import { ROLE_LABEL } from '../../db/types'
import { useCategories, useClothingTypes, useItem, useSettings } from '../../lib/hooks'
import { compressPhoto } from '../../lib/photo'
import { ScreenHeader } from './ScreenHeader'

type Draft = Omit<ClothingItem, 'id' | 'createdAt' | 'updatedAt'>

const emptyDraft = (threshold: number): Draft => ({
  name: '',
  role: 'TOP',
  categoryIds: [],
  laundryThreshold: threshold,
  state: 'AVAILABLE',
  wearsSinceLaundry: 0,
  lifetimeWears: 0,
})

export function ItemForm() {
  const { id } = useParams()
  const itemId = id ? Number(id) : undefined
  const existing = useItem(itemId)
  const categories = useCategories()
  const types = useClothingTypes()
  const settings = useSettings()
  const navigate = useNavigate()
  const toast = useToast()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [showOptional, setShowOptional] = useState(false)
  const [showTracking, setShowTracking] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (draft) return
    if (itemId !== undefined) {
      if (existing) setDraft({ ...existing })
    } else if (settings) {
      setDraft(emptyDraft(settings.defaultLaundryThreshold))
    }
  }, [draft, existing, itemId, settings])

  if (!draft) return <div className="screen" />

  const current: Draft = draft
  const patch = (p: Partial<Draft>) => setDraft({ ...current, ...p })
  const typesForRole = (types ?? []).filter((t) => t.role === current.role)

  const pickPhoto = async (file?: File) => {
    if (!file) return
    try {
      patch({ photo: await compressPhoto(file) })
    } catch {
      toast('Could not read that image.', true)
    }
  }

  const save = async () => {
    if (!current.name.trim()) {
      toast('Give the item a name.', true)
      return
    }
    setBusy(true)
    const now = Date.now()
    try {
      if (itemId !== undefined) {
        await db.items.update(itemId, { ...current, updatedAt: now })
        toast('Saved.')
        navigate(-1)
      } else {
        await db.items.add({ ...current, createdAt: now, updatedAt: now })
        toast('Added to your wardrobe.')
        navigate('/wardrobe/items', { replace: true })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <ScreenHeader title={itemId === undefined ? 'Add clothing' : 'Edit item'} />

      <div className="stack">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ width: 128, flex: 'none' }}>
            <Photo item={{ ...draft, id: 0, createdAt: 0, updatedAt: 0 }} />
          </div>
          <div className="stack tight grow">
            <button className="btn sm" onClick={() => cameraRef.current?.click()}>
              📷 Take photo
            </button>
            <button className="btn sm" onClick={() => galleryRef.current?.click()}>
              🖼 Choose from device
            </button>
            {current.photo && (
              <button className="btn sm ghost danger" onClick={() => patch({ photo: undefined })}>
                Remove photo
              </button>
            )}
            {/* `capture` opens the camera directly; the second input omits it so the
                phone offers the gallery and any file provider instead. */}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => pickPhoto(e.target.files?.[0])}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => pickPhoto(e.target.files?.[0])}
            />
          </div>
        </div>

        <div className="field">
          <label>Icon {current.photo ? '(shown only if you remove the photo)' : ''}</label>
          <IconPicker
            role={current.role}
            value={current.icon}
            onChange={(icon) => patch({ icon })}
          />
        </div>

        <div className="field">
          <label>Name</label>
          <input
            value={current.name}
            placeholder="White oxford shirt"
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Role</label>
          <div className="row">
            {(['TOP', 'BOTTOM', 'INNERWEAR'] as SystemRole[]).map((r) => (
              <button
                key={r}
                className={`chip grow ${current.role === r ? 'on' : ''}`}
                style={{ justifyContent: 'center' }}
                onClick={() => patch({ role: r, typeId: undefined })}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>

        {current.role !== 'INNERWEAR' && (
          <div className="field">
            <label>Categories</label>
            <div className="row wrap">
              {(categories ?? []).map((c) => {
                const on = current.categoryIds.includes(c.id!)
                return (
                  <button
                    key={c.id}
                    className={`chip ${on ? 'on' : ''}`}
                    onClick={() =>
                      patch({
                        categoryIds: on
                          ? current.categoryIds.filter((x) => x !== c.id)
                          : [...current.categoryIds, c.id!],
                      })
                    }
                  >
                    {c.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid-2">
          <div className="field">
            <label>Laundry after</label>
            <input
              type="number"
              min={1}
              value={current.laundryThreshold}
              onChange={(e) => patch({ laundryThreshold: Math.max(1, Number(e.target.value)) })}
            />
          </div>
          <div className="field">
            <label>Type</label>
            <select
              value={current.typeId ?? ''}
              onChange={(e) =>
                patch({ typeId: e.target.value ? Number(e.target.value) : undefined })
              }
            >
              <option value="">None</option>
              {typesForRole.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label>Purchase date</label>
            <input
              type="date"
              value={current.purchaseDate ?? ''}
              onChange={(e) => patch({ purchaseDate: e.target.value || undefined })}
            />
          </div>
          <div className="field">
            <label>Purchase price</label>
            <input
              type="number"
              min={0}
              inputMode="decimal"
              value={current.purchasePrice ?? ''}
              onChange={(e) =>
                patch({ purchasePrice: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </div>
        </div>

        <button className="link" onClick={() => setShowOptional((v) => !v)}>
          {showOptional ? 'Hide' : 'Show'} optional details
        </button>

        {showOptional && (
          <div className="stack">
            <div className="grid-2">
              <TextField label="Brand" value={current.brand} onChange={(v) => patch({ brand: v })} />
              <TextField label="Size" value={current.size} onChange={(v) => patch({ size: v })} />
              <TextField label="Colour" value={current.color} onChange={(v) => patch({ color: v })} />
              <TextField
                label="Material"
                value={current.material}
                onChange={(v) => patch({ material: v })}
              />
            </div>
            <TextField
              label="Bought from"
              value={current.purchaseLocation}
              onChange={(v) => patch({ purchaseLocation: v })}
            />
            <div className="field">
              <label>Notes</label>
              <textarea
                value={current.notes ?? ''}
                onChange={(e) => patch({ notes: e.target.value || undefined })}
              />
            </div>
          </div>
        )}

        {itemId !== undefined && (
          <>
            <button className="link" onClick={() => setShowTracking((v) => !v)}>
              {showTracking ? 'Hide' : 'Show'} tracking numbers
            </button>
            {showTracking && (
              <div className="stack tight">
                <div className="grid-2">
                  <div className="field">
                    <label>Lifetime wears</label>
                    <input
                      type="number"
                      min={0}
                      value={current.lifetimeWears}
                      onChange={(e) =>
                        patch({ lifetimeWears: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Wears since wash</label>
                    <input
                      type="number"
                      min={0}
                      value={current.wearsSinceLaundry}
                      onChange={(e) =>
                        patch({ wearsSinceLaundry: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                  </div>
                </div>
                <div className="card tiny muted">
                  Typing a number here overrides the count without touching the wear history, so
                  the two can disagree. To correct a specific mistake, delete that wear from the
                  item's history instead: everything recalculates from what is left.
                </div>
              </div>
            )}
          </>
        )}

        <div className="sticky-actions">
          <button className="btn primary block" onClick={save} disabled={busy}>
            {itemId === undefined ? 'Add to wardrobe' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string
  value?: string
  onChange: (v: string | undefined) => void
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />
    </div>
  )
}
