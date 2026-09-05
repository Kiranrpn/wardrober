import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ClothingItem, ItemState } from '../db/types'
import { STATE_LABEL } from '../db/types'
import { blobUrl } from '../lib/photo'

/** Photo wins; then the chosen emoji; then the first letter of the item's name. */
function itemGlyph(item?: { icon?: string; name?: string }): string {
  if (item?.icon) return item.icon
  const initial = item?.name?.trim().charAt(0)
  return initial ? initial.toUpperCase() : '?'
}

const isLetter = (glyph: string) => /^[\p{L}\p{N}?]$/u.test(glyph)

export function Photo({ item, className }: { item?: ClothingItem; className?: string }) {
  const url = blobUrl(item?.photo)
  const glyph = itemGlyph(item)
  return (
    <div className={`photo ${className ?? ''}`}>
      {url ? (
        <img src={url} alt={item?.name ?? ''} />
      ) : (
        <span className={`glyph ${isLetter(glyph) ? 'letter' : ''}`}>{glyph}</span>
      )}
    </div>
  )
}

export function Thumb({ item }: { item?: ClothingItem }) {
  const url = blobUrl(item?.photo)
  const glyph = itemGlyph(item)
  return (
    <div className="thumb">
      {url ? (
        <img src={url} alt={item?.name ?? ''} />
      ) : (
        <span className={isLetter(glyph) ? 'letter' : ''}>{glyph}</span>
      )}
    </div>
  )
}

/** Keeps only the last grapheme, so a multi-codepoint emoji survives intact
 *  and typing replaces the icon rather than appending to it. */
function lastGrapheme(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed)]
    return parts.at(-1)?.segment
  }
  return [...trimmed].at(-1)
}

/** The item's picture slot, doubling as the icon field. Tapping it focuses a
 *  transparent input so the device's own keyboard (and its emoji picker) opens;
 *  there is no in-app emoji list to keep in sync with the platform. */
export function IconSlot({
  item,
  onChange,
}: {
  item: { icon?: string; name?: string; photo?: Blob }
  onChange: (icon: string | undefined) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const url = blobUrl(item.photo)
  const glyph = itemGlyph(item)

  return (
    <div className="photo icon-slot" onClick={() => ref.current?.focus()}>
      {url ? (
        <img src={url} alt={item.name ?? ''} />
      ) : (
        <span className={`glyph ${isLetter(glyph) ? 'letter' : ''}`}>{glyph}</span>
      )}
      <input
        ref={ref}
        value={item.icon ?? ''}
        aria-label="Item icon"
        onChange={(e) => onChange(lastGrapheme(e.target.value))}
      />
      {!url && <span className="hint">Tap to pick an emoji</span>}
    </div>
  )
}

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="search">
      <span className="glass">🔍</span>
      <input
        type="search"
        value={value}
        placeholder={placeholder ?? 'Search'}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button className="clear" onClick={() => onChange('')} aria-label="Clear search">
          ✕
        </button>
      )}
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
