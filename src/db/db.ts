import Dexie, { type Table } from 'dexie'
import type {
  Category,
  ClothingItem,
  ClothingType,
  Compatibility,
  InnerwearWearEvent,
  Settings,
  WearEvent,
} from './types'

export class WardroberDB extends Dexie {
  categories!: Table<Category, number>
  clothingTypes!: Table<ClothingType, number>
  items!: Table<ClothingItem, number>
  compatibility!: Table<Compatibility, number>
  wearEvents!: Table<WearEvent, number>
  innerwearEvents!: Table<InnerwearWearEvent, number>
  settings!: Table<Settings, number>

  constructor() {
    super('wardrober')
    this.version(1).stores({
      categories: '++id, order, includedInToday, active',
      clothingTypes: '++id, role, active',
      items: '++id, role, state, lastWornAt, *categoryIds',
      compatibility: '++id, topId, bottomId, [topId+bottomId], excluded',
      wearEvents: '++id, date, timestamp, topId, bottomId, pairKey, categoryId',
      innerwearEvents: '++id, date, timestamp, itemId',
      settings: '++id',
    })
  }
}

export const db = new WardroberDB()

const SUGGESTED_CATEGORIES = ['Lounge', 'Casual / Work', 'Traditional', 'Party']

const SUGGESTED_TYPES: Array<{ name: string; role: 'TOP' | 'BOTTOM' | 'INNERWEAR' }> = [
  { name: 'T-Shirt', role: 'TOP' },
  { name: 'Shirt', role: 'TOP' },
  { name: 'Kurta', role: 'TOP' },
  { name: 'Jeans', role: 'BOTTOM' },
  { name: 'Trousers', role: 'BOTTOM' },
  { name: 'Shorts', role: 'BOTTOM' },
  { name: 'Underwear', role: 'INNERWEAR' },
  { name: 'Undershirt', role: 'INNERWEAR' },
]

export async function getSettings(): Promise<Settings> {
  const existing = await db.settings.toCollection().first()
  if (existing) return existing
  const now = Date.now()
  const fresh: Settings = {
    setupComplete: false,
    impliedCompatibility: true,
    defaultLaundryThreshold: 2,
    currency: '₹',
    createdAt: now,
  }
  const id = await db.settings.add(fresh)
  return { ...fresh, id }
}

export async function updateSettings(patch: Partial<Settings>) {
  const s = await getSettings()
  await db.settings.update(s.id!, patch)
}

let seeding: Promise<void> | undefined

/** Populates suggested categories, types and the settings row. Single-flight and
 *  transactional, so React's double-invoked effects cannot seed twice. */
export function seedDefaults(): Promise<void> {
  seeding ??= db
    .transaction('rw', db.categories, db.clothingTypes, db.settings, async () => {
      const now = Date.now()
      if ((await db.categories.count()) === 0) {
        await db.categories.bulkAdd(
          SUGGESTED_CATEGORIES.map((name, i) => ({
            name,
            order: i,
            includedInToday: i < 2,
            active: true,
            createdAt: now,
          })),
        )
      }
      if ((await db.clothingTypes.count()) === 0) {
        await db.clothingTypes.bulkAdd(
          SUGGESTED_TYPES.map((t) => ({ ...t, active: true, createdAt: now })),
        )
      }
      if ((await db.settings.count()) === 0) {
        await db.settings.add({
          setupComplete: false,
          impliedCompatibility: true,
          defaultLaundryThreshold: 2,
          currency: '₹',
          createdAt: now,
        })
      }
    })
    .catch((e) => {
      seeding = undefined
      throw e
    })
  return seeding
}

/** Lets a reset re-seed a freshly emptied database. */
export function resetSeedGuard() {
  seeding = undefined
}
