import { Link } from 'react-router-dom'
import { useCategories, useItems, useSettings } from '../../lib/hooks'

export function ProfileHome() {
  const categories = useCategories()
  const items = useItems()
  const settings = useSettings()

  const todayCount = (categories ?? []).filter((c) => c.includedInToday).length

  return (
    <div className="screen">
      <div className="topbar">
        <div className="grow">
          <h1>{settings?.userName || 'Profile'}</h1>
          <div className="sub">{settings?.userName ? 'Your wardrobe setup' : 'Set it up once'}</div>
        </div>
      </div>

      <div className="stack tight">
        <Tile
          to="/profile/today"
          label="Today categories"
          value={`${todayCount} of ${(categories ?? []).length}`}
        />
        <Tile to="/profile/categories" label="Categories" value={(categories ?? []).length} />
        <Tile to="/profile/types" label="Clothing types" />
      </div>

      <div className="section-label">Insight</div>
      <div className="stack tight">
        <Tile to="/profile/statistics" label="Statistics" value={(items ?? []).length} />
        <Tile to="/profile/import" label="Import past wears" />
      </div>

      <div className="section-label">App</div>
      <div className="stack tight">
        <Tile to="/profile/settings" label="Settings" />
      </div>

      <div className="credit">
        <div className="name">Batte</div>
        <div className="by">Made by Kiran</div>
      </div>
    </div>
  )
}

function Tile({ to, label, value }: { to: string; label: string; value?: string | number }) {
  return (
    <Link className="list-tile" to={to}>
      <span className="grow">{label}</span>
      {value !== undefined && <span className="faint small">{value}</span>}
      <span className="arrow">›</span>
    </Link>
  )
}
