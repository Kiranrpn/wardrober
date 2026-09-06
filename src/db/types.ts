export type SystemRole = 'TOP' | 'BOTTOM' | 'INNERWEAR'

export type ItemState = 'AVAILABLE' | 'LAUNDRY' | 'REPAIR' | 'RETIRED'

export type WearSource =
  | 'TODAY_RECOMMENDATION'
  | 'GENERATE_PAIR'
  | 'MANUAL'
  | 'HISTORICAL_IMPORT'

export interface Category {
  id?: number
  name: string
  order: number
  includedInToday: boolean
  active: boolean
  createdAt: number
}

export interface ClothingType {
  id?: number
  name: string
  role: SystemRole
  active: boolean
  createdAt: number
}

export interface ClothingItem {
  id?: number
  name: string
  role: SystemRole
  typeId?: number
  categoryIds: number[]
  photo?: Blob
  /** Emoji shown when the item has no photo. */
  icon?: string
  purchaseDate?: string
  purchasePrice?: number
  purchaseLocation?: string
  brand?: string
  size?: string
  material?: string
  color?: string
  notes?: string
  laundryThreshold: number
  state: ItemState
  wearsSinceLaundry: number
  lifetimeWears: number
  lastWornAt?: number
  createdAt: number
  updatedAt: number
}

/** Explicit top-bottom link. Absence is only meaningful when the pair has been
 *  explicitly excluded, or when the wardrobe opted out of category-implied pairing. */
export interface Compatibility {
  id?: number
  topId: number
  bottomId: number
  /** true = user removed this pair; overrides any implied compatibility */
  excluded: boolean
  createdAt: number
  updatedAt: number
}

export interface WearEvent {
  id?: number
  date: string
  timestamp: number
  topId: number
  bottomId: number
  categoryId?: number
  source: WearSource
  /** deterministic key for pair-frequency lookups */
  pairKey: string
}

/** One item worn on its own, with no pair recorded. Past-wear import writes these
 *  when someone remembers how often they wore a shirt but not what it was worn with,
 *  so item counts and rotation are right while pair history stays honestly empty. */
export interface SoloWearEvent {
  id?: number
  date: string
  timestamp: number
  itemId: number
  source: WearSource
}

export interface InnerwearWearEvent {
  id?: number
  date: string
  timestamp: number
  itemId: number
  source: WearSource
}

export type ThemeChoice = 'system' | 'light' | 'dark'

export interface Settings {
  id?: number
  setupComplete: boolean
  userName?: string
  theme?: ThemeChoice
  /** What each system role is called in the UI. The roles themselves never change. */
  roleLabels?: Partial<Record<SystemRole, string>>
  /** When true, items sharing a category pair automatically unless excluded. */
  impliedCompatibility: boolean
  defaultLaundryThreshold: number
  currency: string
  createdAt: number
}

export const pairKey = (topId: number, bottomId: number) => `${topId}:${bottomId}`

export const ROLES: SystemRole[] = ['TOP', 'BOTTOM', 'INNERWEAR']

/** Starting point only. Users rename these in Settings; nothing branches on the text. */
export const DEFAULT_ROLE_LABELS: Record<SystemRole, string> = {
  TOP: 'Top',
  BOTTOM: 'Bottom',
  INNERWEAR: 'Essentials',
}

export type RoleLabels = Record<SystemRole, string>

export function resolveRoleLabels(stored?: Partial<Record<SystemRole, string>>): RoleLabels {
  return {
    TOP: stored?.TOP?.trim() || DEFAULT_ROLE_LABELS.TOP,
    BOTTOM: stored?.BOTTOM?.trim() || DEFAULT_ROLE_LABELS.BOTTOM,
    INNERWEAR: stored?.INNERWEAR?.trim() || DEFAULT_ROLE_LABELS.INNERWEAR,
  }
}

export const STATE_LABEL: Record<ItemState, string> = {
  AVAILABLE: 'Available',
  LAUNDRY: 'Laundry',
  REPAIR: 'Repair',
  RETIRED: 'Retired',
}
