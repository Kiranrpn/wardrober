import { useEffect, useState } from 'react'
import { RestoreControl } from '../components/restore'
import { db, updateSettings } from '../db/db'
import type { SystemRole } from '../db/types'
import { DEFAULT_ROLE_LABELS, ROLES } from '../db/types'
import { useCategories } from '../lib/hooks'

const ROLE_HINT: Record<SystemRole, string> = {
  TOP: 'The upper half of a pair.',
  BOTTOM: 'The lower half of a pair.',
  INNERWEAR: 'Innerwears & under-garments.',
}

const TITLES = ['Set up', 'Your contexts', 'What runs daily']
const SUBTITLES = [
  'Your name and what you call things. Defaults are fine.',
  'Where do your clothes actually go? Edit these.',
  'Only these feed the automatic Today recommendation.',
]

export function Onboarding({ onDone }: { onDone: () => void }) {
  const categories = useCategories()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  // Blank means "use the default": resolveRoleLabels falls back on empty strings,
  // so the placeholders below are a live preview of what happens if you skip this.
  const [labels, setLabels] = useState<Partial<Record<SystemRole, string>>>({})
  const [draft, setDraft] = useState<string[]>([])
  const [today, setToday] = useState<string[]>([])
  const [newName, setNewName] = useState('')

  useEffect(() => {
    if (categories && draft.length === 0) {
      const names = categories.map((c) => c.name)
      setDraft(names)
      setToday(categories.filter((c) => c.includedInToday).map((c) => c.name))
    }
  }, [categories, draft.length])

  /** Written on Next rather than at the end, so quitting mid-setup does not
   *  discard what was already typed. */
  async function saveIdentity() {
    await updateSettings({
      userName: name.trim() || undefined,
      roleLabels: Object.fromEntries(
        ROLES.map((r) => [r, labels[r]?.trim() ?? '']).filter(([, v]) => v !== ''),
      ),
    })
    setStep(1)
  }

  async function finish() {
    const now = Date.now()
    await db.transaction('rw', db.categories, async () => {
      await db.categories.clear()
      for (let i = 0; i < draft.length; i++) {
        await db.categories.add({
          name: draft[i],
          order: i,
          includedInToday: today.includes(draft[i]),
          active: true,
          createdAt: now,
        })
      }
    })
    await updateSettings({ setupComplete: true })
    onDone()
  }

  return (
    <div className="screen" style={{ paddingBottom: 40 }}>
      <div className="topbar">
        <div className="grow">
          <h1>{TITLES[step]}</h1>
          <div className="sub">{SUBTITLES[step]}</div>
        </div>
        <span className="tiny faint">{step + 1}/3</span>
      </div>

      {step === 0 ? (
        <div className="stack">
          <div className="field">
            <label>Your name</label>
            <input
              value={name}
              autoFocus
              placeholder="Optional"
              onChange={(e) => setName(e.target.value)}
            />
            <div className="tiny faint">Only used to greet you on the Today screen.</div>
          </div>

          <div className="field">
            <label>What you call things</label>
            <div className="tiny faint" style={{ marginBottom: 2 }}>
              Leave these alone if the suggestions suit you. Only the wording changes; how the app
              pairs and tracks clothes stays exactly the same.
            </div>
            {ROLES.map((r) => (
              <div className="row" key={r} style={{ alignItems: 'center' }}>
                <input
                  className="input grow"
                  value={labels[r] ?? ''}
                  placeholder={DEFAULT_ROLE_LABELS[r]}
                  aria-label={`Name for ${DEFAULT_ROLE_LABELS[r]}`}
                  onChange={(e) => setLabels({ ...labels, [r]: e.target.value })}
                />
                <span className="tiny faint" style={{ flex: '0 0 42%' }}>
                  {ROLE_HINT[r]}
                </span>
              </div>
            ))}
            <div className="tiny faint">
              Showing as: {labels.TOP?.trim() || DEFAULT_ROLE_LABELS.TOP} ·{' '}
              {labels.BOTTOM?.trim() || DEFAULT_ROLE_LABELS.BOTTOM} ·{' '}
              {labels.INNERWEAR?.trim() || DEFAULT_ROLE_LABELS.INNERWEAR}
            </div>
          </div>

          <button className="btn primary block" onClick={saveIdentity}>
            Next
          </button>
          <div className="tiny faint" style={{ textAlign: 'center' }}>
            All of this stays editable in Profile → Settings.
          </div>

          <div className="divider" />

          {/* A fresh install and a wardrobe that was just reset both land here, and
              both are exactly when someone reaches for their backup. */}
          <RestoreControl
            label="Restore from a backup file"
            className="btn block ghost"
            onRestored={onDone}
          />
          <div className="tiny faint" style={{ textAlign: 'center' }}>
            Coming from another device? Restore instead of setting up again.
          </div>
        </div>
      ) : step === 1 ? (
        <div className="stack">
          <div className="stack tight">
            {draft.map((name) => (
              <div className="item-row" key={name}>
                <div className="body">
                  <div className="name">{name}</div>
                </div>
                <button
                  className="btn sm ghost danger"
                  onClick={() => {
                    setDraft(draft.filter((d) => d !== name))
                    setToday(today.filter((t) => t !== name))
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="row">
            <input
              className="input grow"
              value={newName}
              placeholder="Add a context, e.g. Client meeting"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim() && !draft.includes(newName.trim())) {
                  setDraft([...draft, newName.trim()])
                  setNewName('')
                }
              }}
            />
            <button
              className="btn"
              disabled={!newName.trim() || draft.includes(newName.trim())}
              onClick={() => {
                setDraft([...draft, newName.trim()])
                setNewName('')
              }}
            >
              Add
            </button>
          </div>

          <button
            className="btn primary block"
            disabled={draft.length === 0}
            onClick={() => setStep(2)}
          >
            Continue
          </button>
          <button className="btn block ghost" onClick={() => setStep(0)}>
            Back
          </button>
        </div>
      ) : (
        <div className="stack">
          <div className="stack tight">
            {draft.map((name) => {
              const on = today.includes(name)
              return (
                <div
                  className={`item-row ${on ? 'selected' : ''}`}
                  key={name}
                  onClick={() =>
                    setToday(on ? today.filter((t) => t !== name) : [...today, name])
                  }
                >
                  <div className="body">
                    <div className="name">{name}</div>
                  </div>
                  <span className="badge">{on ? 'In Today' : 'Off'}</span>
                </div>
              )
            })}
          </div>
          <div className="card small muted">
            The rest still work any time through Wardrobe → Generate pair.
          </div>
          <button className="btn primary block" onClick={finish}>
            Start adding clothes
          </button>
          <button className="btn block ghost" onClick={() => setStep(1)}>
            Back
          </button>
        </div>
      )}
    </div>
  )
}
