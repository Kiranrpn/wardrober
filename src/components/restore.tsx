import { useRef, useState } from 'react'
import { Sheet } from './ui'
import { useToast } from './toast'
import { resetSeedGuard } from '../db/db'
import {
  BackupError,
  parseBackup,
  restoreBackup,
  type BackupFile,
} from '../lib/backup'
import { formatDate } from '../lib/dates'

/** Picking, previewing and restoring a backup file. Shared because a restore has
 *  to be reachable from two places: Profile, and the very first setup screen on a
 *  fresh install or after a reset, which is exactly when someone needs it most. */
export function RestoreControl({
  label,
  className,
  onRestored,
}: {
  label: string
  className?: string
  onRestored?: () => void
}) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ file: BackupFile; name: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function choose(file?: File) {
    if (!file) return
    try {
      setPending({ file: parseBackup(await file.text()), name: file.name })
    } catch (e) {
      toast(e instanceof BackupError ? e.message : 'Could not read that file.', true)
    } finally {
      // Lets the same file be picked again after a cancel.
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function restore() {
    if (!pending || busy) return
    setBusy(true)
    try {
      const summary = await restoreBackup(pending.file)
      resetSeedGuard()
      setPending(null)
      toast(`Restored ${summary.items} items and ${summary.wearRecords} wears.`)
      onRestored?.()
    } catch (e) {
      toast(e instanceof BackupError ? e.message : 'Could not restore that backup.', true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        className={className ?? 'btn block'}
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        {label}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => choose(e.target.files?.[0])}
      />

      <Sheet open={pending !== null} title="Restore this backup?" onClose={() => setPending(null)}>
        {pending && (
          <div className="stack">
            <div className="card">
              <Row k="File" v={pending.name} />
              <Row
                k="Made on"
                v={formatDate(new Date(pending.file.exportedAt).toISOString().slice(0, 10))}
              />
              <Row k="Items" v={String(pending.file.data.items.length)} />
              <Row
                k="Wear records"
                v={String(
                  pending.file.data.wearEvents.length +
                    pending.file.data.innerwearEvents.length +
                    (pending.file.data.soloWearEvents?.length ?? 0),
                )}
              />
              <Row k="Categories" v={String(pending.file.data.categories.length)} />
              <Row
                k="Photos"
                v={
                  pending.file.includesPhotos
                    ? String(pending.file.data.items.filter((i) => i.photo).length)
                    : 'Not in this file'
                }
              />
            </div>

            <p className="muted small" style={{ margin: 0 }}>
              Every item, photo, category and wear record currently on this device is erased and
              replaced by the ones above. This cannot be undone.
            </p>

            <button className="btn block danger" onClick={restore} disabled={busy}>
              Replace my wardrobe
            </button>
            <button className="btn block ghost" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        )}
      </Sheet>
    </>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="small" style={{ textAlign: 'right' }}>
        {v}
      </span>
    </div>
  )
}
