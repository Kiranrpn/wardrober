# Batte

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
laundry basket in the header carries a live count of what is waiting to be washed, and a
clock beside it opens **Recent wears**: the last five pairs you actually wore, from
anywhere in the app, each with **Wear again** and an `✕` that removes the record. The
**Wear calendar** sits at the top of that sheet, for anything older than those five.

**Wardrobe** holds your clothes, laundry, repairs, retired items, compatibility, search,
and a free-use **Generate pair** for any category, including ones you left out of Today.

**Profile** configures your name, which categories feed Today, your categories and
clothing types, statistics, theme, backup and restore, and app settings. **Statistics**
reports rotation coverage and money over time alongside the item lists.

**Setup** asks two things before anything else: your name, and what you want to call the
three roles. `Top`, `Bottom` and `Essentials` are pre-filled as suggestions, so `Next`
alone accepts them. The same screen offers **Restore from a backup file**, because a fresh
install and a wardrobe that was just reset are exactly when someone reaches for one.

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
log it through `Log what I wore` or `Recent wears` so wear counts and laundry thresholds
stay accurate. A second wear in a category is kept in full and the card shows the newest
one, so `Cancel` and `Generate again` reverse what actually went on last.

**Recent wears is the event log, not a favourites list.** It reads the same wear events
every screen writes, so a pair worn from Today, one worn from `Generate pair` in the
wardrobe and one logged by hand all appear together, newest first, labelled with where
they came from. `Wear again` is an ordinary wear dated today: both items are incremented,
laundry thresholds apply, and it carries the original pair's category. `✕` asks once and
then reverses the record exactly as `Cancel` does. Repeats are listed individually rather
than collapsed by pair, so what you delete is the record you are looking at.

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

**Laundry is an event log, not a counter reset.** Marking an item clean has always set
`wearsSinceLaundry` back to zero, which destroyed the only record that the wash happened;
laundry was the one part of the app whose history could not be read back. Marking clean now
also writes a wash record carrying the length of the cycle it closed, and an item's page
shows how many times it has been washed, when it was last washed, and how many wears it
actually goes between washes against the threshold set on it. Nothing else changed: no new
button, no new step, and the counter resets exactly as before. Coming back from repair goes
through a different path and is not a wash, so it writes nothing. Wash records are a log
rather than a reversible transaction: the wears that followed have already moved the
counter on, so there is no honest way to un-wash something, and they are kept as written.

**The calendar reads the log; it does not keep its own.** Every wear kind lands on the day
it was recorded for, so a day in the calendar shows the pairs, the solo wears and the
essentials record together. `Wear again` there is an ordinary wear dated today, not the day
you tapped, and `✕` reverses the record exactly as `Cancel` does.

**Coverage, not counts.** Wear counts say which clothes are busy; they cannot say how much
of the wardrobe the rotation is reaching. Statistics reports the share of items worn in the
last thirty days, the share of the pairs your wardrobe actually allows that you have ever
worn, and the share of recent wears coming from the five busiest items. All three are
counted over everything not retired, so clothes sitting in the laundry basket today do not
shrink the total and flatter the number, and a pair ruled out in compatibility leaves both
sides of the pair figure at once.

**Statistics reads the event log, not the counters on items.** The denormalised
`lifetimeWears` on an item answers "how many times, ever" and nothing else. Every windowed
or dated figure, the calendar, coverage over thirty days, dormant money and the cost per
wear line, is computed from the wear, solo and essentials tables instead. `Least worn` also
excludes never-worn items now, because it was otherwise the same list as the `Never worn`
tile beside it until every last item had been worn once.

**Money is reported over time, not just as a total.** Spend by year comes from purchase
dates, retired items included, because what a wardrobe cost does not stop being true when
something leaves it. The cost per wear line is a running portfolio figure: everything bought
by the end of each month divided by every wear recorded by then, so it falls as clothes get
worn and steps up when something new arrives. Items with a price but no purchase date cannot
sit on a timeline and are counted out loud beside the chart rather than folded in at month
zero.

**Retire, do not delete.** Retired items leave the rotation and keep every wear record,
so lifetime cost per wear stays honest. Deleting a category detaches it from items and
keeps the wear history intact.

**Past wears are imported item by item, not outfit by outfit.** Nobody remembers what a
shirt was paired with six months ago, but most people do know they wore it often. So the
default import mode is a number against each item, recorded as a wear of that item alone:
its count, its last-worn date and its place in the rotation all become right, and no
outfit it never wore is invented to hold the record. A second mode records a pair for an
outfit you genuinely remember, and only that mode feeds pair history. Logging today's
outfit still requires both halves, because at the moment of wearing you do know.

**Imported history skips the laundry counter.** Twelve past wears should not send a shirt
to the wash: those clothes have already been through it. Imported occurrences are spread
one week apart backwards from the date you give, so rotation starts from something like
reality. Undoing an imported wear is symmetric: it leaves the laundry counter alone too,
because that wear never touched it. In outfit mode a pair, an essentials item, or both can
be imported in one go, and a day that already holds an essentials record is left as the
user logged it. An item's history shows all three kinds of record together, and deleting
any one of them recomputes last-worn from every kind that remains.

## Data and privacy

Everything lives in IndexedDB on the device. There is no account, no server, and no
network call. Photos are downscaled to 900px and re-encoded as JPEG before storage.
Clearing site data erases the wardrobe, so keep a backup.

**Backup and restore** live in Profile. Export writes one JSON file holding settings,
categories, clothing types, every item, every wear record and every wash record. Photos are
included by
default as base64, which inflates them by about a third; turn that off for a file a few
hundred KB instead of several MB, and those items come back showing their emoji or first
letter. Where the file goes depends on how the app is running. Installed from the APK it is
written straight to device storage, Documents first and falling back through the other
writable locations, and then handed to the Android share sheet so it can also go to Drive
or a computer; the screen names the folder it actually landed in. Neither browser route
works inside that WebView, which has no download manager and no Web Share, so both would
fail silently. In a browser it uses Web Share where that exists and a plain download
otherwise. The APK workflow installs `@capacitor/filesystem` and `@capacitor/share` for
this; without them the export button does nothing.

**Restore replaces, it does not merge.** Merging would mean renumbering every id and
rebuilding the references between items, compatibility and wear events; a straight replace
keeps ids intact, which is the only way restored history is guaranteed to still point at
the right clothes. The file is validated and previewed before a single row is written, and
the current wardrobe is erased in the same transaction that loads the new one.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the built app
npm run lint
```

There is no unit test suite. `e2e/verify.mjs` drives a real browser through setup, adding
clothes, importing past wears, the backup round trip and a wiped-then-restored device, and
asserts against IndexedDB directly. Playwright is deliberately not a dependency of the app:

```bash
npm i -D playwright && npx playwright install chromium
npm run build && npx vite preview --port 4173 &
node e2e/verify.mjs
```

The built app is a PWA: it works offline and installs to a phone home screen from the
browser's share menu. Theme follows the device by default and can be pinned to light or
dark in Profile → Settings.

## Packaging as a mobile app

The build is entirely static, uses hash routing and a relative base path, and stores
everything locally, so it wraps into a native shell without code changes:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init Batte com.example.wardrober --web-dir=dist
npm run build && npx cap add ios && npx cap add android && npx cap sync
```

Adding an item offers both **Take photo** (an input with `capture="environment"`, which
opens the camera directly) and **Choose from device** (no `capture`, so the phone offers
the gallery and any file provider). Tapping the picture slot itself focuses a hidden text
field, so the device's own keyboard and emoji picker open: there is no in-app emoji list
to fall behind the platform's. An item with neither photo nor emoji shows the first letter
of its name. For a native picker later, swap `src/lib/photo.ts` to `@capacitor/camera`; it
is the only place image capture is handled.

## Layout

```
src/
  db/          Dexie schema, entity types, seeding
  lib/         rotation engine, wear transactions, statistics, hooks
  components/  shared UI primitives
  screens/     Today, Wear calendar, Wardrobe, Profile, onboarding
```

The rotation engine in `src/lib/recommend.ts` is a pure function: give it items,
compatibility, wear events and the eligible categories, and it returns every valid pair
ranked best-first. All the wardrobe-mutating logic lives in `src/lib/wear.ts` and runs in
a single transaction per wear.

## Not in this version

Weather, mood, colour inference, outfit ratings, likes, shoes and accessories, social
features, shopping, wardrobe scores, and a separate events tab. Special occasions are
handled by making a category and using Generate pair.
