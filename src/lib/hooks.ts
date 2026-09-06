import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Category, ClothingItem, ClothingType, RoleLabels } from '../db/types'
import { resolveRoleLabels } from '../db/types'

/** Read-only: live queries run in a read-only transaction, so the settings row
 *  is created by seedDefaults() at startup rather than lazily here. */
export function useSettings() {
  return useLiveQuery(() => db.settings.toCollection().first(), [])
}

/** Always resolved, so screens never have to fall back on a default themselves. */
export function useRoleLabels(): RoleLabels {
  const stored = useLiveQuery(async () => {
    const s = await db.settings.toCollection().first()
    return s?.roleLabels ?? {}
  }, [])
  return resolveRoleLabels(stored)
}

export function useCategories(): Category[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.categories.toArray()
    return all.filter((c) => c.active).sort((a, b) => a.order - b.order)
  }, [])
}

export function useClothingTypes(): ClothingType[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.clothingTypes.toArray()
    return all.filter((t) => t.active)
  }, [])
}

export function useItems(): ClothingItem[] | undefined {
  return useLiveQuery(() => db.items.toArray(), [])
}

export function useCompatibility() {
  return useLiveQuery(() => db.compatibility.toArray(), [])
}

export function useWearEvents() {
  return useLiveQuery(() => db.wearEvents.toArray(), [])
}

export function useSoloWearEvents() {
  return useLiveQuery(() => db.soloWearEvents.toArray(), [])
}

export function useInnerwearEvents() {
  return useLiveQuery(() => db.innerwearEvents.toArray(), [])
}

export function useItem(id?: number) {
  return useLiveQuery(() => (id === undefined ? undefined : db.items.get(id)), [id])
}

export function categoryName(categories: Category[] | undefined, id?: number) {
  if (id === undefined) return undefined
  return categories?.find((c) => c.id === id)?.name
}
