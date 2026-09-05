import type { ThemeChoice } from '../db/types'

const DARK_BG = '#0e0f12'
const LIGHT_BG = '#f5f6f8'

const media = () => window.matchMedia('(prefers-color-scheme: light)')

function paint(resolved: 'light' | 'dark') {
  document.documentElement.dataset.theme = resolved
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'light' ? LIGHT_BG : DARK_BG)
}

/** Applies the chosen theme and, for 'system', keeps following the OS while
 *  that choice stands. Returns a cleanup for the listener. */
export function applyTheme(choice: ThemeChoice = 'system'): () => void {
  if (choice !== 'system') {
    paint(choice)
    return () => {}
  }
  const mq = media()
  const sync = () => paint(mq.matches ? 'light' : 'dark')
  sync()
  mq.addEventListener('change', sync)
  return () => mq.removeEventListener('change', sync)
}
