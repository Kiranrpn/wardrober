import { Link } from 'react-router-dom'
import { Empty } from '../../components/ui'
import { db } from '../../db/db'
import { useCategories, useItems } from '../../lib/hooks'
import { ScreenHeader } from '../wardrobe/ScreenHeader'

export function TodaySettings() {
  const categories = useCategories()
  const items = useItems()

  return (
    <div className="screen">
      <ScreenHeader
        title="Today categories"
        subtitle="Only these feed the automatic daily recommendation"
      />

      {(categories ?? []).length === 0 ? (
        <Empty
          title="No categories yet"
          body="Create a category first."
          action={
            <Link className="btn primary" to="/profile/categories">
              Manage categories
            </Link>
          }
        />
      ) : (
        <div className="stack tight">
          {(categories ?? []).map((c) => {
            const count = (items ?? []).filter(
              (i) => i.state !== 'RETIRED' && i.categoryIds.includes(c.id!),
            ).length
            return (
              <div
                className={`item-row ${c.includedInToday ? 'selected' : ''}`}
                key={c.id}
                onClick={() => db.categories.update(c.id!, { includedInToday: !c.includedInToday })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    db.categories.update(c.id!, { includedInToday: !c.includedInToday })
                  }
                }}
              >
                <div className="body">
                  <div className="name">{c.name}</div>
                  <div className="tiny faint">
                    {count} item{count === 1 ? '' : 's'}
                  </div>
                </div>
                <span className="badge">{c.includedInToday ? 'In Today' : 'Off'}</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="card small muted" style={{ marginTop: 16 }}>
        Categories left out still work through Wardrobe → Generate pair whenever you need them.
      </div>
    </div>
  )
}
