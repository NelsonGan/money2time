---
name: update-tutorials
description: 'Recapture, annotate and re-sync the in-app tutorial screenshots after a UI change, and write new tutorials. Use when a screen shown in features/tutorials/content has been redesigned, a feature was added or removed, a tutorial frame looks stale, or someone asks to refresh/regenerate the tutorials on the app or money2time.com.'
---

# Keeping the tutorials true

`features/tutorials/` teaches the app through **real captures of the real app** with the
control to tap circled in red. That is its whole value and its whole fragility: the moment
a screen is redesigned, a tutorial frame becomes a picture of an app that no longer exists,
and a confidently wrong guide is worse than no guide.

This skill is the loop that fixes that. Work through it in order.

## What lives where

| Thing                                | Path                                                                  | Committed?         |
| ------------------------------------ | --------------------------------------------------------------------- | ------------------ |
| Copy (English prose, both platforms) | `features/tutorials/content/*.ts`                                     | yes                |
| Marker spec (source + red marks)     | `scripts/data/tutorial-shots.json`                                    | yes                |
| Annotated frames                     | `assets/tutorials/<image>.webp`                                       | yes                |
| Metro `require()` registry           | `features/tutorials/content/images.generated.ts`                      | yes, generated     |
| Raw simulator captures               | `.tutorial-raw/<name>.png`                                            | **no**, gitignored |
| Website copy of both                 | `money2time-web` `src/lib/tutorials.generated.ts`, `media/tutorials/` | yes, generated     |

`image` names and tutorial `id`s are independent. Renumbering a tutorial's steps renames the
**output**, not the raw capture: the spec entry keeps pointing at whatever the file on disk is
called. That is why the spec stores `source` separately.

## 1. Work out what is stale

Do this before touching the simulator, or you will recapture the wrong things.

```bash
# every screen a tutorial claims to show, by tutorial
node -e "
const {TUTORIALS}=require('./features/tutorials/content/tutorials.ts');
" 2>/dev/null || grep -rn \"image: '\" features/tutorials/content/*.ts
```

Cross-check the diff that prompted this against the frames:

- Which files changed? Map them to screens (`features/settings/screens/AccountsScreen.tsx`
  → the `accounts-*` frames).
- Did a **string** change? The frame shows the old wording.
- Did a **control move**? The red mark is now circling empty space — worse than a stale label,
  because it actively misdirects.
- Did a **feature** appear or disappear? That is a new tutorial or a deleted one, not a recapture.

List the affected image ids. That list drives everything below.

## 2. Set the simulator up so captures look right

Captures go into the committed binary, so they have to look deliberate.

1. `device_list`, then `device_open` `simlock:ios:iPhone 18 Pro` from the Simlock pool so it
   shows in T3 Code's Device panel, and use the `agent-device` command it returns for everything below (the
   shipped frames are iPhone 17 Pro, 1179x2556). Recapturing a subset on a different device is
   fine — marks are normalised — but the frames will not match each other visually, so prefer
   the same device.
2. Start Metro and open the app with `simlock-metro <device id> <agent-device command>`
   from the worktree (see AGENTS.md).
3. **Demo data, not empty state.** A tutorial of an empty app teaches nothing, and a leased
   device starts empty and signed out. Seed accounts, a month of transactions, albums and
   goals first: the `nlsn-mock-data` branch's `services/previewData`, copied in temporarily
   and exposed through a dev-only global (do not commit it).
4. **Dismiss dev noise first.** The RevenueCat "Invalid API Key" LogBox reopens itself; tap
   Dismiss and re-check before every capture. A red error banner in a shipped frame is a bug report.
5. **Never capture the photo library, a contact picker, or anything else holding real user
   data.** Use only synthetic imagery. If a step needs a photo, generate one.

## 3. Capture

For each frame, from `apps/mobile` (the annotate script reads `apps/mobile/.tutorial-raw/`):

```
agent-device snapshot -i                # ALWAYS. Never eyeball a coordinate.
agent-device press @e12 --settle        # navigate to the screen by ref or selector
agent-device screenshot "$PWD/.tutorial-raw/<name>.png" --pixel-density 3
```

Things that bite, all of them learned the hard way:

- **Full resolution.** iOS simulator screenshots default to 1x logical points, far too small
  for source art. Pass `--pixel-density 3` to get the device's native pixels.
- **Typing races.** Typing without a delay drops and reorders characters ("Japan trip" came
  out "Hpan tripa"). Pass `--delay-ms 150-180` to `agent-device type`.
- **Transient UI.** A "Listening…" overlay or a toast will not survive a separate screenshot
  call. Chain it: `agent-device batch` with the press and the screenshot in one request.
- **Long-press.** Use `agent-device longpress <target> [durationMs]`, not a bare press.
- **Permission resets kill the app** (expected iOS behaviour). Relaunch after.
- **Features that need a network or hardware** (receipt scan Worker, the microphone) fail in the
  simulator. Capture the state _before_ the failure, or reach the same screen another way.

## 4. Write the marks

Take them from the accessibility tree, not from the picture. `agent-device snapshot -i --json`
reports each element's frame; divide `x`/`width` by the screen width and `y`/`height` by the
screen height to get the normalised `[0,1]` fractions the spec stores, so a mark lifted from
the tree lands on the control and survives a recapture at a different size.

```jsonc
"accounts-4": {
  "source": "RAW/accounts-4.png",       // resolves against .tutorial-raw/
  "marks": [
    { "type": "rect", "x": 0.04, "y": 0.152, "w": 0.92, "h": 0.115,
      "radius": 0.03, "pad": 0.005 }   // x/y/w/h from the snapshot frame, normalised
  ]
}
```

`type` is `rect` (default), `circle`, or `arrow` (`x`,`y` → `x2`,`y2`). `pad` is the breathing
room outside the control, as a fraction of width; it defaults to a stroke and a half, which is
usually right. One mark per frame — two red boxes make the reader hunt.

## 5. Render, register, verify

```bash
node scripts/annotate-tutorials.mjs accounts     # id prefix, or no args for all
node scripts/generate-tutorial-images.mjs        # rebuilds the Metro require registry
```

Then **look at what you produced.** A mark on the wrong control is invisible to every check in
the repo. Build a contact sheet rather than reading 20 images one at a time:

```bash
python3 - <<'PY'
from PIL import Image, ImageDraw
import sys, os
names = sys.argv[1:]
TW, TH, LAB = 260, 565, 26
sheet = Image.new('RGB', (TW*len(names), TH+LAB), 'white'); d = ImageDraw.Draw(sheet)
for i, n in enumerate(names):
    im = Image.open(f'assets/tutorials/{n}.webp').convert('RGB'); im.thumbnail((TW-8, TH-8))
    sheet.paste(im, (i*TW+4, LAB+4)); d.text((i*TW+6, 7), n, fill='black')
sheet.save('/tmp/sheet.png')
PY
```

## 6. Update the copy

Copy lives in `features/tutorials/content/<category>.ts` as **English prose**, deliberately not
in `lib/i18n/locales/`. Read `content/types.ts` for why before proposing to move it.

House style, enforced partly by `__tests__/features/tutorials.test.ts`:

- **No em or en dashes.** Repo-wide rule for user-facing copy; the test fails on one.
- Step `title`: a few words, an imperative ("Pick where it goes").
- Step `body`: one or two plain sentences. Say what to tap and why it matters. Skip the obvious.
- Name real numbers from `constants/proLimits.ts` rather than "a few" ("The free plan includes
  five accounts") and re-check them when you touch a tutorial.
- `keywords`: the words a user would type that the visible copy does not already contain.
  Include both spellings where they differ ("personalize", "personalise").
- Set `pro: true` only when the whole feature needs Pro, not when it merely has a free limit.
  Set `platform: 'ios'` for iOS-only features.

## 7. Sync the website and run the checks

```bash
node scripts/sync-tutorials-web.mjs      # ../money2time-web, or --web <path>
npm run check && npm test
```

Then in `money2time-web`: `node scripts/upload-media.mjs` to publish the screenshots to its
R2 bucket, then `npm run lint && npm run build && npm run typecheck`.

Never hand-edit `src/lib/tutorials.generated.ts` or `media/tutorials/` — this script owns them.

## 8. Adding a whole new tutorial

Everything above, plus:

- Pick a **slug that matches the title**. It is the URL (`money2time.com/tutorials/<slug>`) and
  the deep link (`money2time://tutorial?id=<slug>`). Renaming one after release needs a redirect.
- Append it to the right `content/<category>.ts`. Category order is `TUTORIAL_CATEGORY_IDS` in
  `content/types.ts`; a new category needs an i18n key in **all 24 locales** and on the web side.
- Give it an icon in `TUTORIAL_ICON` (`features/tutorials/components/TutorialRow.tsx`) **and** in
  the web's `src/lib/tutorials.ts`. Without one it falls back to a generic checklist.
- Run the test suite: it fails on a duplicate id, a step pointing at a missing image, an image
  nothing references, a missing registry entry, and long dashes.

## 9. Verify on device before you call it done

Reload Metro, then open the list and one changed tutorial:

```
money2time://tutorials
money2time://tutorial?id=<slug>
```

Check the frame matches the app you are looking at right now. That is the whole point.

## Watch out for

- **Asset budget.** `assets/tutorials` is deliberately absent from
  `expo.updates.assetPatternsToBeBundled` in `app.json`, so the frames ride the native binary
  instead of eating the 1000-asset OTA cap. Do not "fix" that by adding it. Frames are written
  as quality-85 lossy WebP for the same reason (~7.6MB, against ~12.9MB as 256-colour PNG and
  ~40MB as true-colour PNG). The website serves the same WebP files,
  which `scripts/sync-tutorials-web.mjs` copies across.
- **Orphans cost real bytes.** Deleting a step without deleting its WebP leaves it in the binary;
  the test catches this, so do not silence it.
- **Do not recapture what did not change.** Every recapture is bytes in the diff and a chance to
  introduce dev-build noise into a shipped frame.
