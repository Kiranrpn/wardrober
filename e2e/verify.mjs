// End-to-end verification of setup, backup/restore and past-wear import, driven
// through a real browser against a production build.
//
//   npm i -D playwright && npx playwright install chromium
//   npm run build && npx vite preview --port 4173 &
//   node e2e/verify.mjs
//
// Playwright is deliberately not a dependency of the app: nothing here ships.
// Set PW_CHROMIUM to point at an existing Chromium instead of downloading one.
import { chromium } from 'playwright'
import fs from 'node:fs'

const URL = 'http://localhost:4173/'
const TMP = fs.mkdtempSync('/tmp/batte-e2e-')
const PHOTO = `${TMP}/photo.png`
const BACKUP = `${TMP}/backup.json`
// A tiny PNG, written fresh so the repo carries no binary fixture.
fs.writeFileSync(PHOTO, Buffer.from(
  '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' +
  'L8/L+/IHlD3x01RK4PEAAAAASUVORK5CYII=', 'base64'))

let failures = 0
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ::  ' + extra : ''}`)
  if (!cond) failures++
}

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
)
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, acceptDownloads: true })
const page = await ctx.newPage()
page.on('pageerror', (e) => { console.log('PAGEERROR ' + e.message); failures++ })
await page.goto(URL)

/** Toasts linger 2.6s, so a stale one is easy to mistake for a fresh one. */
async function toastAfter(action) {
  await page.locator('.toast').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
  await action()
  await page.locator('.toast').waitFor({ state: 'visible', timeout: 20000 })
  const text = await page.locator('.toast').innerText()
  await page.waitForTimeout(250)
  return text
}
/** A hash-only goto does not remount the app, so a screen would keep the state
 *  the previous step left in it. Reload to get a genuinely fresh mount. */
async function nav(hash) {
  await page.goto(URL + hash)
  await page.reload()
}
const dump = () => page.evaluate(async () => {
  const open = indexedDB.open('wardrober')
  const db = await new Promise((res, rej) => { open.onsuccess = () => res(open.result); open.onerror = () => rej(open.error) })
  const read = (s) => new Promise((res, rej) => {
    const r = db.transaction(s).objectStore(s).getAll()
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
  const [items, wearEvents, innerwearEvents, settings, categories] = await Promise.all(
    ['items', 'wearEvents', 'innerwearEvents', 'settings', 'categories'].map(read))
  db.close()
  return {
    items: items.map(({ photo, ...i }) => ({ ...i, photoSize: photo ? photo.size : 0 })),
    wearEvents, innerwearEvents, settings, categories,
  }
})

console.log('\n--- 1. Onboarding asks name + role names, defaults accepted with one tap ---')
await page.waitForSelector('h1')
check('step 1 is the new setup step', (await page.locator('h1').first().innerText()) === 'Set up')
check('progress shows 1/3', (await page.locator('.topbar .tiny.faint').first().innerText()) === '1/3')
const roleInputs = page.locator('input[aria-label^="Name for"]')
check('three role-name fields', (await roleInputs.count()) === 3)
check('Top / Bottom / Essentials offered as defaults',
  JSON.stringify(await roleInputs.evaluateAll((e) => e.map((x) => x.placeholder))) === '["Top","Bottom","Essentials"]')
check('all role fields start empty so Next alone accepts the defaults',
  (await roleInputs.evaluateAll((e) => e.map((x) => x.value))).every((v) => v === ''))
check('restore offered on the first screen',
  (await page.getByRole('button', { name: 'Restore from a backup file' }).count()) === 1)

await page.getByPlaceholder('Optional').fill('Kiran')
await roleInputs.nth(2).fill('Basics')
await page.getByRole('button', { name: 'Next' }).click()
await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Your contexts')
check('step 2 is contexts', true)
await page.getByRole('button', { name: 'Continue' }).click()
await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'What runs daily')
check('step 3 is daily categories', true)
await page.getByRole('button', { name: 'Start adding clothes' }).click()
await page.waitForSelector('.tabbar')
check('name from setup greets on Today', (await page.locator('.topbar h1').first().innerText()).includes('Kiran'))

let state = await dump()
check('name persisted to settings', state.settings[0].userName === 'Kiran')
check('renamed role persisted', state.settings[0].roleLabels.INNERWEAR === 'Basics')
check('untouched roles left blank so they follow the default',
  state.settings[0].roleLabels.TOP === undefined && state.settings[0].roleLabels.BOTTOM === undefined,
  JSON.stringify(state.settings[0].roleLabels))

async function addItem(name, roleLabel, category, photo) {
  await nav('#/wardrobe/add')
  await page.waitForSelector('input[placeholder="White oxford shirt"]')
  await page.getByPlaceholder('White oxford shirt').fill(name)
  await page.locator('.field', { hasText: 'Role' }).first()
    .getByRole('button', { name: roleLabel, exact: true }).click()
  if (category) {
    const chip = page.locator('.field', { hasText: 'Categories' }).first()
      .getByRole('button', { name: category, exact: true })
    if (!(await chip.getAttribute('class')).includes('on')) await chip.click()
  }
  if (photo) {
    await page.locator('input[type=file]').first().setInputFiles(photo)
    await page.waitForSelector('button:has-text("Remove photo")')
  }
  await toastAfter(() => page.getByRole('button', { name: 'Add to wardrobe' }).click())
}

await addItem('Blue shirt', 'Top', 'Lounge', PHOTO)
await addItem('Grey trousers', 'Bottom', 'Lounge')
await addItem('Cotton vest', 'Basics')

await nav('#/wardrobe/items')
await page.waitForSelector('.scroller .chip')
check('renamed role used app-wide', (await page.locator('.scroller .chip').allInnerTexts()).includes('Basics'))
state = await dump()
check('photo stored and compressed', state.items.find((i) => i.name === 'Blue shirt').photoSize > 0,
  state.items.find((i) => i.name === 'Blue shirt').photoSize + ' bytes')

console.log('\n--- 3. Import past wears now covers essentials ---')
await nav('#/profile/import')
await page.waitForSelector('.select-grid')
check('essentials picker present', (await page.locator('.field', { hasText: 'Basics' }).count()) > 0)
await page.locator('.field').filter({ hasText: 'Times worn' }).locator('input').fill('3')
await page.locator('.field', { hasText: /^Top/ }).locator('.cell', { hasText: 'Blue shirt' }).click()
await page.locator('.field', { hasText: /^Bottom/ }).locator('.cell', { hasText: 'Grey trousers' }).click()
await page.locator('.field', { hasText: /^Basics/ }).locator('.cell', { hasText: 'Cotton vest' }).click()
const importToast = await toastAfter(() => page.getByRole('button', { name: /^Import 3 wears$/ }).click())
check('import reports pairs and essentials separately',
  /3 past wears/.test(importToast) && /3 basics/i.test(importToast), importToast)

state = await dump()
const vest = state.items.find((i) => i.name === 'Cotton vest')
const shirt = state.items.find((i) => i.name === 'Blue shirt')
check('3 essentials events written', state.innerwearEvents.length === 3)
check('spread one week apart, one per day', new Set(state.innerwearEvents.map((e) => e.date)).size === 3,
  state.innerwearEvents.map((e) => e.date).join(' '))
check('tagged HISTORICAL_IMPORT', state.innerwearEvents.every((e) => e.source === 'HISTORICAL_IMPORT'))
check('essentials lifetime wears counted', vest.lifetimeWears === 3, String(vest.lifetimeWears))
check('essentials laundry counter untouched by import', vest.wearsSinceLaundry === 0)
check('essentials not pushed into laundry', vest.state === 'AVAILABLE')
check('pair import unchanged', shirt.lifetimeWears === 3 && shirt.wearsSinceLaundry === 0 && shirt.state === 'AVAILABLE')

console.log('\n--- essentials-only import (no pair selected) ---')
await nav('#/profile/import')
await page.waitForSelector('.select-grid')
await page.locator('.field').filter({ hasText: 'Last worn on' }).locator('input').fill('2026-01-05')
await page.locator('.field', { hasText: /^Basics/ }).locator('.cell', { hasText: 'Cotton vest' }).click()
const soloToast = await toastAfter(() => page.getByRole('button', { name: /^Import 1 wear$/ }).click())
check('essentials can be imported with no pair at all', /1 basics/i.test(soloToast), soloToast)
state = await dump()
check('essentials-only import wrote no pair event', state.wearEvents.length === 3, String(state.wearEvents.length))
check('essentials event count now 4', state.innerwearEvents.length === 4)

console.log('\n--- drift regression: undoing an imported wear ---')
const vestId = state.items.find((i) => i.name === 'Cotton vest').id
await nav(`#/wardrobe/items/${vestId}`)
await page.waitForSelector('.card .kv button.link')
await page.locator('.card .kv button.link').first().click()
await toastAfter(() => page.getByRole('button', { name: 'Remove this wear' }).click())
state = await dump()
const vest2 = state.items.find((i) => i.name === 'Cotton vest')
check('undo decrements lifetime wears', vest2.lifetimeWears === 3, String(vest2.lifetimeWears))
check('undo of an IMPORTED wear leaves the laundry counter alone (was the drift bug)',
  vest2.wearsSinceLaundry === 0, String(vest2.wearsSinceLaundry))

console.log('\n--- real wears still count normally ---')
await nav('#/')
await page.waitForSelector('.tabbar')
await page.waitForTimeout(400)
if (await page.getByRole('button', { name: 'Wear it' }).count()) {
  await toastAfter(() => page.getByRole('button', { name: 'Wear it' }).first().click())
  state = await dump()
  const s2 = state.items.find((i) => i.name === 'Blue shirt')
  check('a real wear does increment the laundry counter', s2.wearsSinceLaundry === 1, String(s2.wearsSinceLaundry))
  check('real wear logged', state.wearEvents.some((e) => e.source === 'TODAY_RECOMMENDATION'))
  await toastAfter(() => page.getByRole('button', { name: 'Cancel' }).first().click())
  state = await dump()
  const s3 = state.items.find((i) => i.name === 'Blue shirt')
  check('cancelling a real wear does decrement the laundry counter', s3.wearsSinceLaundry === 0, String(s3.wearsSinceLaundry))
} else check('Today offered a pair', false, 'no Wear it button')

console.log('\n--- 2. Export ---')
await nav('#/profile/backup')
await page.waitForSelector('button:has-text("Save a backup file")')
const dl = page.waitForEvent('download', { timeout: 20000 })
await page.getByRole('button', { name: 'Save a backup file' }).click()
const download = await dl
await download.saveAs(BACKUP)
check('backup filename is date-stamped', /^batte-backup-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()),
  download.suggestedFilename())
const backup = JSON.parse(fs.readFileSync(BACKUP, 'utf8'))
state = await dump()
check('format tag present', backup.format === 'batte-backup' && backup.version === 1)
check('settings exported', backup.data.settings[0].userName === 'Kiran' && backup.data.settings[0].roleLabels.INNERWEAR === 'Basics')
check('items exported', backup.data.items.length === 3)
check('wear events exported', backup.data.wearEvents.length === state.wearEvents.length)
check('essentials events exported', backup.data.innerwearEvents.length === state.innerwearEvents.length)
check('categories exported', backup.data.categories.length === state.categories.length)
check('photo exported as base64', backup.includesPhotos === true &&
  backup.data.items.find((i) => i.name === 'Blue shirt').photo?.encoding === 'base64')
check('file size reported honestly', fs.statSync(BACKUP).size > 1000, fs.statSync(BACKUP).size + ' bytes')

const noPhotoDl = page.waitForEvent('download', { timeout: 20000 })
await page.locator('.card', { hasText: 'Include photos' }).getByRole('button').click()
await page.getByRole('button', { name: 'Save a backup file' }).click()
const np = await noPhotoDl
await np.saveAs(`${TMP}/nophoto.json`)
check('photo-free export named differently', /-nophotos\.json$/.test(np.suggestedFilename()), np.suggestedFilename())
check('photo-free export is much smaller',
  fs.statSync(`${TMP}/nophoto.json`).size < fs.statSync(BACKUP).size,
  `${fs.statSync(`${TMP}/nophoto.json`).size} < ${fs.statSync(BACKUP).size}`)

console.log('\n--- 4. Reset, then restore from the setup screen ---')
await nav('#/profile/settings')
await page.waitForSelector('button:has-text("Reset everything")')
await page.getByRole('button', { name: 'Reset everything' }).click()
// Clearing the settings row unmounts the whole tree, so the reset lands the user
// straight back on setup. That is exactly when someone reaches for their backup.
await page.getByRole('button', { name: 'Yes, erase my wardrobe' }).click()
await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Set up', null, { timeout: 20000 })
state = await dump()
check('reset emptied the wardrobe', state.items.length === 0 && state.wearEvents.length === 0)
check('a wiped wardrobe lands on setup', true)
check('restore reachable from setup without completing onboarding first',
  (await page.getByRole('button', { name: 'Restore from a backup file' }).count()) === 1)

await page.locator('input[type=file]').setInputFiles(BACKUP)
await page.waitForSelector('.sheet')
const sheet = await page.locator('.sheet').innerText()
check('restore previews what is in the file before writing anything',
  /Items/.test(sheet) && /\b3\b/.test(sheet), sheet.replace(/\n/g, ' | '))
await page.getByRole('button', { name: 'Replace my wardrobe' }).click()
await page.waitForSelector('.tabbar', { timeout: 15000 })

state = await dump()
check('items restored', state.items.length === 3, String(state.items.length))
check('wear events restored', state.wearEvents.length === backup.data.wearEvents.length)
check('essentials events restored', state.innerwearEvents.length === backup.data.innerwearEvents.length)
check('categories restored', state.categories.length === backup.data.categories.length)
check('settings restored', state.settings[0]?.userName === 'Kiran' && state.settings[0]?.roleLabels?.INNERWEAR === 'Basics')
check('photo restored as a real blob',
  state.items.find((i) => i.name === 'Blue shirt').photoSize > 0,
  state.items.find((i) => i.name === 'Blue shirt').photoSize + ' bytes')
check('restored wear events still resolve to real items',
  state.wearEvents.every((e) => state.items.some((i) => i.id === e.topId) && state.items.some((i) => i.id === e.bottomId)))
check('restored essentials events still resolve to a real item',
  state.innerwearEvents.every((e) => state.items.some((i) => i.id === e.itemId)))
check('counters survive the round trip',
  state.items.find((i) => i.name === 'Cotton vest').lifetimeWears === 3)
check('restore skipped onboarding entirely', await page.locator('.tabbar').isVisible())

console.log('\n--- 5. A file that is not a backup is refused ---')
fs.writeFileSync(`${TMP}/bad.json`, JSON.stringify({ hello: 'world' }))
await nav('#/profile/backup')
await page.waitForSelector('button:has-text("Choose a backup file")')
await page.locator('input[type=file]').setInputFiles(`${TMP}/bad.json`)
await page.waitForSelector('.toast.error', { timeout: 8000 })
check('non-backup JSON rejected', (await page.locator('.toast.error').innerText()).includes('not exported by this app'))
fs.writeFileSync(`${TMP}/trunc.json`, '{"format":"batte-backup","version":1,"data":{"items":[]}}')
await page.locator('.toast').waitFor({ state: 'detached' }).catch(() => {})
await page.locator('input[type=file]').setInputFiles(`${TMP}/trunc.json`)
await page.waitForSelector('.toast.error', { timeout: 8000 })
check('a backup missing tables is rejected', /missing/.test(await page.locator('.toast.error').innerText()))
state = await dump()
check('wardrobe untouched by both rejections', state.items.length === 3)

await browser.close()
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`)
process.exit(failures === 0 ? 0 : 1)
