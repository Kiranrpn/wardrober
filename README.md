# Wardrober

Configure the wardrobe once. Let the app handle the rotation.

A personal wardrobe automation app: it keeps a record of your clothes, decides what you
should wear, and tracks wear history, laundry state, repairs, cost per wear and outfit
rotation on its own.

It is not a styling, shopping or social app. The goal is to remove daily decisions, not
add them.

## What it does

**Today** shows one recommended top and bottom per enabled category, plus one innerwear
suggestion for the day. Wear it and that category collapses to "You're wearing today"
with **Generate again** and **Cancel**; it does not ask you again until tomorrow. A
laundry basket in the header carries a live count of what is waiting to be washed.

**Wardrobe** holds your clothes, laundry, repairs, retired items, compatibility, search,
and a free-use **Generate pair** for any category, including ones you left out of Today.

**Profile** configures your name, which categories feed Today, your categories and
clothing types, statistics, theme, and app settings.

## Design decisions worth knowing

**Compatibility is opt-out, not opt-in.** Declaring every top-bottom pair by hand is the
point where a wardrobe app gets abandoned: twenty items is roughly a hundred decisions
before the app does anything useful. So tops and bottoms sharing a category work together
by default, and the compatibility screen is where you rule out the combinations you would
never wear. Bulk selection makes both directions fast. Turn `Auto-pair within a category`
off in Settings if you want the strict, fully manual model instead.

**Recommendations never write.** Generating, re-rolling and switching categories leave
the database untouched. Counts, laundry state and history change only on `Wear it` or
`Log what I wore`, and asking for another pair is not a rejection signal.

**One pair per category per day.** Once you wear a category's pair, Today stops offering
that category until tomorrow. The trade is that a genuine second session in the same
category, lounge clothes in the morning and again at night, is not offered automatically;
log it through `Log what I wore` so wear counts and laundry thresholds stay accurate.

**Undo is a real reversal, not a second write.** `Cancel`, `Generate again` and deleting
a wear from an item's history all decrement both items, recompute last-worn from the
events that remain, and lift anything that wear pushed into laundry back out. Counts
never drift from the event log. The one exception is the tracking-number override on the
edit form, which changes a count without touching history and says so.

**Rotation balances four things**: how recently each item was worn, how much each has been
worn in total, how often that exact pair has been used, and how recently that pair was
used. Pair history is tracked separately from item history, so a shirt you wear often can
still surface with a trouser it rarely meets. A small random term breaks ties so the app
does not feel deterministic.

**Retire, do not delete.** Retired items leave the rotation and keep every wear record,
so lifetime cost per wear stays honest. Deleting a category detaches it from items and
keeps the wear history intact.

**Imported history skips the laundry counter.** Twelve past wears should not send a shirt
to the wash: those clothes have already been through it. Imported occurrences are spread
one week apart backwards from the date you give, so rotation starts from something like
reality.

## Data and privacy

Everything lives in IndexedDB on the device. There is no account, no server, and no
network call. Photos are downscaled to 900px and re-encoded as JPEG before storage.
Clearing site data erases the wardrobe, and there is no backup yet.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the built app
npm run lint
```

The built app is a PWA: it works offline and installs to a phone home screen from the
browser's share menu. Theme follows the device by default and can be pinned to light or
dark in Profile → Settings.

## Packaging as a mobile app

The build is entirely static, uses hash routing and a relative base path, and stores
everything locally, so it wraps into a native shell without code changes:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init Wardrober com.example.wardrober --web-dir=dist
npm run build && npx cap add ios && npx cap add android && npx cap sync
```

Adding an item offers both **Take photo** (an input with `capture="environment"`, which
opens the camera directly) and **Choose from device** (no `capture`, so the phone offers
the gallery and any file provider). Items without a photo show an emoji you pick from a
list, or a default glyph for their role. For a native picker later, swap
`src/lib/photo.ts` to `@capacitor/camera`; it is the only place image capture is handled.

## Layout

```
src/
  db/          Dexie schema, entity types, seeding
  lib/         rotation engine, wear transactions, statistics, hooks
  components/  shared UI primitives
  screens/     Today, Wardrobe, Profile, onboarding
```

The rotation engine in `src/lib/recommend.ts` is a pure function: give it items,
compatibility, wear events and the eligible categories, and it returns every valid pair
ranked best-first. All the wardrobe-mutating logic lives in `src/lib/wear.ts` and runs in
a single transaction per wear.

## Not in this version

Weather, mood, colour inference, outfit ratings, likes, shoes and accessories, social
features, shopping, wardrobe scores, and a separate events tab. Special occasions are
handled by making a category and using Generate pair.
