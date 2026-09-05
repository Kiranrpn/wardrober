import { Link } from 'react-router-dom'
import { useCategories, useItems } from '../../lib/hooks'

export function WardrobeHome() {
  const items = useItems()
  const categories = useCategories()

  const active = (items ?? []).filter((i) => i.state !== 'RETIRED')
  const count = (state: string) => (items ?? []).filter((i) => i.state === state).length

  return (
    <div className="screen">
      <div className="topbar">
        <div className="grow">
          <h1>Wardrobe</h1>
          <div className="sub">
            {active.length} active item{active.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div className="stack">
        <Link className="btn primary block" to="/wardrobe/generate">
          Generate pair
        </Link>
        <Link className="btn block" to="/wardrobe/add">
          + Add clothing
        </Link>
      </div>

      <div className="section-label">Browse</div>
      <div className="stack tight">
        <Tile to="/wardrobe/items" label="All items" value={active.length} />
        <Tile to="/wardrobe/laundry" label="Laundry" value={count('LAUNDRY')} />
        <Tile to="/wardrobe/repair" label="Repair" value={count('REPAIR')} />
        <Tile to="/wardrobe/retired" label="Retired" value={count('RETIRED')} />
        <Tile to="/wardrobe/compatibility" label="Compatibility" />
      </div>

      <div className="section-label">Categories</div>
      <div className="stack tight">
        {(categories ?? []).map((c) => (
          <Tile
            key={c.id}
            to={`/wardrobe/items?category=${c.id}`}
            label={c.name}
            value={active.filter((i) => i.categoryIds.includes(c.id!)).length}
          />
        ))}
        {(categories ?? []).length === 0 && (
          <div className="card small muted">
            No categories yet. Create them in <Link to="/profile/categories">Profile</Link>.
          </div>
        )}
      </div>
    </div>
  )
}

function Tile({ to, label, value }: { to: string; label: string; value?: number }) {
  return (
    <Link className="list-tile" to={to}>
      <span className="grow">{label}</span>
      {value !== undefined && <span className="faint small">{value}</span>}
      <span className="arrow">›</span>
    </Link>
  )
}
