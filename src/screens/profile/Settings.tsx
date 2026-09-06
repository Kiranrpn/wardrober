import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../../components/toast'
import { Sheet } from '../../components/ui'
import { db, resetSeedGuard, seedDefaults, updateSettings } from '../../db/db'
import type { SystemRole, ThemeChoice } from '../../db/types'
import { DEFAULT_ROLE_LABELS, ROLES } from '../../db/types'
import { useRoleLabels, useSettings } from '../../lib/hooks'
import { ScreenHeader } from '../wardrobe/ScreenHeader'

const CURRENCIES = ['₹', '$', '£', '€', '¥']

const THEMES: Array<{ value: ThemeChoice; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const ROLE_HINT: Record<SystemRole, string> = {
  TOP: 'The upper half of a pair.',
  BOTTOM: 'The lower half of a pair.',
  INNERWEAR: 'Innerwears & under-garments.',
}

export function Settings() {
  const settings = useSettings()
  const roleLabels = useRoleLabels()
  const toast = useToast()
  const [confirmReset, setConfirmReset] = useState(false)

  if (!settings) return <div className="screen" />

  /** Stores the name only; the underlying role and all its behaviour are untouched. */
  const renameRole = (role: SystemRole, value: string) =>
    updateSettings({ roleLabels: { ...settings.roleLabels, [role]: value } })

  async function reset() {
    await db.transaction(
      'rw',
      [db.items, db.categories, db.clothingTypes, db.compatibility, db.wearEvents, db.innerwearEvents, db.settings],
      async () => {
        await Promise.all([
          db.items.clear(),
          db.categories.clear(),
          db.clothingTypes.clear(),
          db.compatibility.clear(),
          db.wearEvents.clear(),
          db.innerwearEvents.clear(),
          db.settings.clear(),
        ])
      },
    )
    resetSeedGuard()
    await seedDefaults()
    setConfirmReset(false)
    toast('Wardrobe reset.')
  }

  return (
    <div className="screen">
      <ScreenHeader title="Settings" />

      <div className="stack">
        <div className="field">
          <label>Your name</label>
          <input
            value={settings.userName ?? ''}
            placeholder="Kiran"
            onChange={(e) => updateSettings({ userName: e.target.value || undefined })}
          />
        </div>

        <div className="field">
          <label>Theme</label>
          <div className="row">
            {THEMES.map((t) => (
              <button
                key={t.value}
                className={`chip grow ${(settings.theme ?? 'system') === t.value ? 'on' : ''}`}
                style={{ justifyContent: 'center' }}
                onClick={() => updateSettings({ theme: t.value })}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="tiny faint">System follows your phone's light or dark setting.</div>
        </div>

        <div className="field">
          <label>What you call things</label>
          <div className="tiny faint" style={{ marginBottom: 2 }}>
            Rename these to suit you. Only the wording changes; how the app pairs and tracks
            clothes stays exactly the same.
          </div>
          {ROLES.map((r) => (
            <div className="row" key={r} style={{ alignItems: 'center' }}>
              <input
                className="input grow"
                value={settings.roleLabels?.[r] ?? ''}
                placeholder={DEFAULT_ROLE_LABELS[r]}
                aria-label={`Name for ${DEFAULT_ROLE_LABELS[r]}`}
                onChange={(e) => renameRole(r, e.target.value)}
              />
              <span className="tiny faint" style={{ flex: '0 0 42%' }}>
                {ROLE_HINT[r]}
              </span>
            </div>
          ))}
          <div className="tiny faint">
            Showing as: {roleLabels.TOP} · {roleLabels.BOTTOM} · {roleLabels.INNERWEAR}
          </div>
        </div>

        <div className="field">
          <label>Currency</label>
          <div className="row">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                className={`chip grow ${settings.currency === c ? 'on' : ''}`}
                style={{ justifyContent: 'center' }}
                onClick={() => updateSettings({ currency: c })}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Default laundry threshold for new items</label>
          <input
            type="number"
            min={1}
            value={settings.defaultLaundryThreshold}
            onChange={(e) =>
              updateSettings({ defaultLaundryThreshold: Math.max(1, Number(e.target.value) || 1) })
            }
          />
        </div>

        <div className="card stack tight">
          <div className="row" style={{ alignItems: 'center' }}>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>Auto-pair within a category</div>
              <div className="tiny faint">
                Off means every {roleLabels.TOP.toLowerCase()} and{' '}
                {roleLabels.BOTTOM.toLowerCase()} combination must be linked by hand.
              </div>
            </div>
            <button
              className={`chip ${settings.impliedCompatibility ? 'on' : ''}`}
              onClick={() =>
                updateSettings({ impliedCompatibility: !settings.impliedCompatibility })
              }
            >
              {settings.impliedCompatibility ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        <div className="card small muted">
          Everything lives on this device. Nothing is uploaded anywhere, which also means nothing
          is recoverable if you clear site data or lose the phone. Keep a copy from{' '}
          <Link to="/profile/backup">Backup &amp; restore</Link>.
        </div>

        <div className="divider" />

        <button className="btn block ghost danger" onClick={() => setConfirmReset(true)}>
          Reset everything
        </button>
      </div>

      <Sheet open={confirmReset} title="Reset everything?" onClose={() => setConfirmReset(false)}>
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>
            This deletes every item, photo, category and wear record on this device. It cannot be
            undone.
          </p>
          <button className="btn block danger" onClick={reset}>
            Yes, erase my wardrobe
          </button>
          <button className="btn block ghost" onClick={() => setConfirmReset(false)}>
            Cancel
          </button>
        </div>
      </Sheet>
    </div>
  )
}
