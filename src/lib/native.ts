/** Talks to Capacitor through the bridge it injects at runtime rather than by
 *  importing its packages. The web app stays dependency-free and its bundle
 *  unchanged; the plugins only have to exist in the native project, which is
 *  where the APK workflow installs them. */

interface WriteResult {
  uri: string
}

interface CapacitorBridge {
  isNativePlatform?: () => boolean
  Plugins?: {
    Filesystem?: {
      writeFile(options: {
        path: string
        data: string
        directory: string
        encoding?: string
        recursive?: boolean
      }): Promise<WriteResult>
    }
    Share?: {
      share(options: {
        title?: string
        text?: string
        url?: string
        files?: string[]
        dialogTitle?: string
      }): Promise<unknown>
    }
  }
}

const bridge = (): CapacitorBridge | undefined =>
  (globalThis as { Capacitor?: CapacitorBridge }).Capacitor

export const isNativeApp = (): boolean => bridge()?.isNativePlatform?.() === true

/** Where the file went, in terms a person can act on: a folder they can open in
 *  Files, not a URI. */
export interface SavedFile {
  uri: string
  folder: string
  shared: boolean
}

/** Documents is the one a file manager shows, so it is tried first. The rest are
 *  fallbacks for devices or API levels that refuse it; Cache always works but is
 *  the app's own space, so a file landing there is only useful once it has been
 *  shared out, which is why the share sheet follows the write. */
const TARGETS: Array<{ directory: string; folder: string }> = [
  { directory: 'DOCUMENTS', folder: 'Documents' },
  { directory: 'EXTERNAL_STORAGE', folder: 'Internal storage' },
  { directory: 'EXTERNAL', folder: 'Android app storage' },
  { directory: 'CACHE', folder: "the app's own storage" },
]

/** Writes the backup into device storage and then opens the share sheet so it can
 *  also be sent to Drive or a computer. Returns null when not running natively,
 *  leaving the caller on its browser path. Throws only when every target failed. */
export async function saveFileNatively(name: string, text: string): Promise<SavedFile | null> {
  const cap = bridge()
  const fs = cap?.Plugins?.Filesystem
  if (!isNativeApp() || !fs) return null

  let written: { uri: string; folder: string } | undefined
  let lastError: unknown

  for (const target of TARGETS) {
    try {
      const result = await fs.writeFile({
        path: name,
        data: text,
        directory: target.directory,
        encoding: 'utf8',
        recursive: true,
      })
      written = { uri: result.uri, folder: target.folder }
      break
    } catch (e) {
      lastError = e
    }
  }

  if (!written) {
    throw lastError instanceof Error ? lastError : new Error('Could not write the file.')
  }

  // Best effort: the file is already on disk, so a refused or cancelled share
  // is not a failure worth reporting as one.
  let shared = false
  try {
    const share = cap?.Plugins?.Share
    if (share) {
      await share.share({
        title: name,
        text: 'Batte wardrobe backup',
        url: written.uri,
        files: [written.uri],
        dialogTitle: 'Save or send your backup',
      })
      shared = true
    }
  } catch {
    shared = false
  }

  return { ...written, shared }
}
