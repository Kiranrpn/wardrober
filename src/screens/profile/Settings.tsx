import { useState } from 'react'
import { useToast } from '../../components/toast'
import { Sheet } from '../../components/ui'
import { db, resetSeedGuard, seedDefaults, updateSettings } from '../../db/db'
import { useSettings } from '../../lib/hooks'
import { ScreenHeader } from '../wardrobe/ScreenHeader'

const CURRENCIES = ['₹', '$', '£', '€', '¥']

export function Settings() {
  const settings = useSettings()
  const toast = useToast()
  const [confirmReset, setConfirmReset] = useState(false)

  if (!settings) return <div className="screen" />

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
                Off means every top and bottom combination must be linked by hand.
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
          Everything lives on this device. Nothing is uploaded anywhere.
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
