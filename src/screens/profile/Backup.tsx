import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RestoreControl } from '../../components/restore'
import { useToast } from '../../components/toast'
import { BackupError, backupFilename, buildBackup } from '../../lib/backup'
import { useItems } from '../../lib/hooks'
import { ScreenHeader } from '../wardrobe/ScreenHeader'

function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function Backup() {
  const items = useItems()
  const navigate = useNavigate()
  const toast = useToast()

  const [includePhotos, setIncludePhotos] = useState(true)
  const [busy, setBusy] = useState(false)

  const photoCount = (items ?? []).filter((i) => i.photo).length

  async function download() {
    if (busy) return
    setBusy(true)
    try {
      const file = await buildBackup(includePhotos)
      const name = backupFilename(file)
      const blob = new Blob([JSON.stringify(file)], { type: 'application/json' })

      // Share first where it exists: a WebView inside a native shell often has no
      // download manager, and the share sheet is the only way out of the app.
      const shareable = new File([blob], name, { type: 'application/json' })
      if (navigator.canShare?.({ files: [shareable] })) {
        try {
          await navigator.share({ files: [shareable], title: name })
          toast(`Backup shared (${readableSize(blob.size)}).`)
          return
        } catch {
          // Cancelled or refused; fall through to a plain download.
        }
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      toast(`Backup saved (${readableSize(blob.size)}).`)
    } catch (e) {
      toast(e instanceof BackupError ? e.message : 'Could not build that backup.', true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <ScreenHeader title="Backup" subtitle="Everything lives on this device, so keep a copy" />

      <div className="stack">
        <div className="section-label">Export</div>

        <div className="card stack tight">
          <div className="row" style={{ alignItems: 'center' }}>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>Include photos</div>
              <div className="tiny faint">
                {photoCount === 0
                  ? 'No photos stored yet, so this changes nothing.'
                  : `${photoCount} photo${photoCount === 1 ? '' : 's'}. Photos travel as text and roughly triple in size on the way out; leaving them out keeps the file small, and those items come back showing their emoji or first letter instead.`}
              </div>
            </div>
            <button
              className={`chip ${includePhotos ? 'on' : ''}`}
              onClick={() => setIncludePhotos((v) => !v)}
            >
              {includePhotos ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        <button className="btn primary block" onClick={download} disabled={busy}>
          Save a backup file
        </button>
        <div className="tiny faint" style={{ textAlign: 'center' }}>
          One JSON file: settings, categories, types, every item and every wear record.
        </div>

        <div className="divider" />

        <div className="section-label">Import</div>

        <div className="card small muted">
          Restoring replaces everything on this device with the contents of the file. It is a
          restore, not a merge: your current wardrobe is erased first, so save a backup before you
          do it if there is anything here worth keeping.
        </div>

        <RestoreControl label="Choose a backup file" onRestored={() => navigate('/')} />
      </div>
    </div>
  )
}
