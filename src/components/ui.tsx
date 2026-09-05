import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ClothingItem, ItemState, SystemRole } from '../db/types'
import { STATE_LABEL } from '../db/types'
import { blobUrl } from '../lib/photo'

const ROLE_GLYPH: Record<SystemRole, string> = {
  TOP: '👕',
  BOTTOM: '👖',
  INNERWEAR: '🩲',
}

export function Photo({ item, className }: { item?: ClothingItem; className?: string }) {
  const url = blobUrl(item?.photo)
  return (
    <div className={`photo ${className ?? ''}`}>
      {url ? (
        <img src={url} alt={item?.name ?? ''} />
      ) : (
        <span className="glyph">{ROLE_GLYPH[item?.role ?? 'TOP']}</span>
      )}
    </div>
  )
}

export function Thumb({ item }: { item?: ClothingItem }) {
  const url = blobUrl(item?.photo)
  return (
    <div className="thumb">
      {url ? <img src={url} alt={item?.name ?? ''} /> : <span>{ROLE_GLYPH[item?.role ?? 'TOP']}</span>}
    </div>
  )
}

export function StateBadge({ state }: { state: ItemState }) {
  return <span className={`badge ${state.toLowerCase()}`}>{STATE_LABEL[state]}</span>
}

export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title?: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function Empty({
  title,
  body,
  action,
}: {
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  )
}

export function ItemRow({
  item,
  subtitle,
  selected,
  onClick,
  right,
}: {
  item: ClothingItem
  subtitle?: ReactNode
  selected?: boolean
  onClick?: () => void
  right?: ReactNode
}) {
  return (
    <div
      className={`item-row ${selected ? 'selected' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <Thumb item={item} />
      <div className="body">
        <div className="name">{item.name}</div>
        <div className="tiny faint">{subtitle}</div>
      </div>
      {right}
    </div>
  )
}

export function Toast({ message, error }: { message: string; error?: boolean }) {
  return createPortal(
    <div className={`toast ${error ? 'error' : ''}`}>{message}</div>,
    document.body,
  )
}
