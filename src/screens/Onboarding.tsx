import { useEffect, useState } from 'react'
import { db, updateSettings } from '../db/db'
import { useCategories } from '../lib/hooks'

export function Onboarding({ onDone }: { onDone: () => void }) {
  const categories = useCategories()
  const [step, setStep] = useState(0)
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
          <h1>{step === 0 ? 'Your contexts' : 'What runs daily'}</h1>
          <div className="sub">
            {step === 0
              ? 'Where do your clothes actually go? Edit these.'
              : 'Only these feed the automatic Today recommendation.'}
          </div>
        </div>
      </div>

      {step === 0 ? (
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
            onClick={() => setStep(1)}
          >
            Continue
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
          <button className="btn block ghost" onClick={() => setStep(0)}>
            Back
          </button>
        </div>
      )}
    </div>
  )
}
