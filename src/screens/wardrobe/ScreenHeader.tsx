import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

export function ScreenHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="topbar">
      <button className="back" onClick={() => navigate(-1)} aria-label="Back">
        ‹
      </button>
      <div className="grow">
        <h1 style={{ fontSize: 22 }}>{title}</h1>
        {subtitle && <div className="sub">{subtitle}</div>}
      </div>
      {action}
    </div>
  )
}
