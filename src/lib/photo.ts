const MAX_EDGE = 900
const QUALITY = 0.82

/** Downscales and re-encodes a picked photo so wardrobes of a few hundred items
 *  stay well inside the browser's IndexedDB quota. */
export async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  )
  if (!blob) throw new Error('Could not process that image')
  return blob
}

const urlCache = new Map<Blob, string>()

export function blobUrl(blob?: Blob): string | undefined {
  if (!blob) return undefined
  let url = urlCache.get(blob)
  if (!url) {
    url = URL.createObjectURL(blob)
    urlCache.set(blob, url)
  }
  return url
}
