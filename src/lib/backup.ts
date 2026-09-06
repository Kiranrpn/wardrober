import { db } from '../db/db'
import type {
  Category,
  ClothingItem,
  ClothingType,
  Compatibility,
  InnerwearWearEvent,
  Settings,
  SoloWearEvent,
  WearEvent,
} from '../db/types'

export const BACKUP_FORMAT = 'batte-backup'
export const BACKUP_VERSION = 2

/** A photo travelling as text. Kept as an object rather than a bare string so a
 *  future format can carry a different encoding without guessing. */
interface EncodedPhoto {
  encoding: 'base64'
  type: string
  data: string
}

type ExportedItem = Omit<ClothingItem, 'photo'> & { photo?: EncodedPhoto }

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: number
  includesPhotos: boolean
  counts: Record<string, number>
  data: {
    settings: Settings[]
    categories: Category[]
    clothingTypes: ClothingType[]
    items: ExportedItem[]
    compatibility: Compatibility[]
    wearEvents: WearEvent[]
    innerwearEvents: InnerwearWearEvent[]
    /** Absent in version 1 files, which predate solo wears. */
    soloWearEvents?: SoloWearEvent[]
  }
}

export class BackupError extends Error {}

function encodePhoto(blob: Blob): Promise<EncodedPhoto> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new BackupError('Could not read a stored photo.'))
    reader.onload = () => {
      const url = String(reader.result)
      resolve({ encoding: 'base64', type: blob.type || 'image/jpeg', data: url.split(',')[1] ?? '' })
    }
    reader.readAsDataURL(blob)
  })
}

function decodePhoto(photo: EncodedPhoto): Blob {
  const binary = atob(photo.data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: photo.type || 'image/jpeg' })
}

/** Reads every table into one plain object. Photos are optional because base64
 *  inflates them by about a third and a wardrobe of a hundred photographed items
 *  lands somewhere near 15 MB; without them the same backup is a few hundred KB. */
export async function buildBackup(includePhotos: boolean): Promise<BackupFile> {
  const [
    settings,
    categories,
    clothingTypes,
    items,
    compatibility,
    wearEvents,
    innerwearEvents,
    soloWearEvents,
  ] = await Promise.all([
      db.settings.toArray(),
      db.categories.toArray(),
      db.clothingTypes.toArray(),
      db.items.toArray(),
      db.compatibility.toArray(),
      db.wearEvents.toArray(),
      db.innerwearEvents.toArray(),
      db.soloWearEvents.toArray(),
    ])

  const exportedItems: ExportedItem[] = await Promise.all(
    items.map(async ({ photo, ...rest }) => ({
      ...rest,
      photo: includePhotos && photo ? await encodePhoto(photo) : undefined,
    })),
  )

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    includesPhotos: includePhotos && items.some((i) => i.photo),
    counts: {
      items: items.length,
      categories: categories.length,
      clothingTypes: clothingTypes.length,
      compatibility: compatibility.length,
      wearEvents: wearEvents.length,
      innerwearEvents: innerwearEvents.length,
      soloWearEvents: soloWearEvents.length,
      photos: items.filter((i) => i.photo).length,
    },
    data: {
      settings,
      categories,
      clothingTypes,
      items: exportedItems,
      compatibility,
      wearEvents,
      innerwearEvents,
      soloWearEvents,
    },
  }
}

export function backupFilename(file: BackupFile): string {
  const d = new Date(file.exportedAt)
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
  return `batte-backup-${stamp}${file.includesPhotos ? '' : '-nophotos'}.json`
}

const TABLES = [
  'settings',
  'categories',
  'clothingTypes',
  'items',
  'compatibility',
  'wearEvents',
  'innerwearEvents',
] as const

/** Rejects anything that is not recognisably one of our backups before a single
 *  row is written, so a wrong file cannot half-restore over a live wardrobe. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('That file is not valid JSON.')
  }
  if (typeof raw !== 'object' || raw === null) throw new BackupError('That file is not a backup.')

  const candidate = raw as Partial<BackupFile>
  if (candidate.format !== BACKUP_FORMAT) {
    throw new BackupError('That file was not exported by this app.')
  }
  if (typeof candidate.version !== 'number' || candidate.version > BACKUP_VERSION) {
    throw new BackupError('That backup was made by a newer version of the app.')
  }
  const data = candidate.data as Record<string, unknown> | undefined
  if (!data || typeof data !== 'object') throw new BackupError('That backup has no data in it.')
  for (const table of TABLES) {
    if (!Array.isArray(data[table])) throw new BackupError(`That backup is missing ${table}.`)
  }
  return candidate as BackupFile
}

export interface RestoreSummary {
  items: number
  /** Every kind of wear record together, which is what a person means by "wears". */
  wearRecords: number
  photos: number
}

/** Replaces the wardrobe wholesale rather than merging. Merging would have to
 *  renumber every id and rebuild the references between items, compatibility and
 *  wear events; a straight replace keeps ids intact, which is the only way the
 *  restored history is guaranteed to still point at the right clothes. */
export async function restoreBackup(file: BackupFile): Promise<RestoreSummary> {
  const items: ClothingItem[] = file.data.items.map(({ photo, ...rest }) => ({
    ...rest,
    photo: photo ? decodePhoto(photo) : undefined,
  }))

  await db.transaction(
    'rw',
    [
      db.settings,
      db.categories,
      db.clothingTypes,
      db.items,
      db.compatibility,
      db.wearEvents,
      db.innerwearEvents,
      db.soloWearEvents,
    ],
    async () => {
      await Promise.all([
        db.settings.clear(),
        db.categories.clear(),
        db.clothingTypes.clear(),
        db.items.clear(),
        db.compatibility.clear(),
        db.wearEvents.clear(),
        db.innerwearEvents.clear(),
        db.soloWearEvents.clear(),
      ])

      // bulkPut keeps the inbound ids, so compatibility rows and wear events still
      // resolve to the items they were written against.
      await db.categories.bulkPut(file.data.categories)
      await db.clothingTypes.bulkPut(file.data.clothingTypes)
      await db.items.bulkPut(items)
      await db.compatibility.bulkPut(file.data.compatibility)
      await db.wearEvents.bulkPut(file.data.wearEvents)
      await db.innerwearEvents.bulkPut(file.data.innerwearEvents)
      // Version 1 files have none; the table is simply left empty.
      await db.soloWearEvents.bulkPut(file.data.soloWearEvents ?? [])

      // A backup with no settings row would leave the app with nothing to read,
      // so one is rebuilt with setup already marked done.
      if (file.data.settings.length > 0) await db.settings.bulkPut(file.data.settings)
      else
        await db.settings.add({
          setupComplete: true,
          impliedCompatibility: true,
          defaultLaundryThreshold: 2,
          currency: '₹',
          createdAt: Date.now(),
        })
    },
  )

  return {
    items: items.length,
    wearRecords:
      file.data.wearEvents.length +
      file.data.innerwearEvents.length +
      (file.data.soloWearEvents?.length ?? 0),
    photos: items.filter((i) => i.photo).length,
  }
}
