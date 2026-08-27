---
name: update-tutorials
description: Recapture, annotate and re-sync the in-app tutorial screenshots after a UI change, and write new tutorials. Use when a screen shown in features/tutorials/content has been redesigned, a feature was added or removed, a tutorial frame looks stale, or someone asks to refresh/regenerate the tutorials on the app or money2time.com.
---

# Keeping the tutorials true

`features/tutorials/` teaches the app through **real captures of the real app** with the
control to tap circled in red. That is its whole value and its whole fragility: the moment
a screen is redesigned, a tutorial frame becomes a picture of an app that no longer exists,
and a confidently wrong guide is worse than no guide.

This skill is the loop that fixes that. Work through it in order.

## What lives where

| Thing | Path | Committed? |
| --- | --- | --- |
| Copy (English prose, both platforms) | `features/tutorials/content/*.ts` | yes |
| Marker spec (source + red marks) | `scripts/data/tutorial-shots.json` | yes |
| Annotated frames | `assets/tutorials/<image>.png` | yes |
| Metro `require()` registry | `features/tutorials/content/images.generated.ts` | yes, generated |
| Raw simulator captures | `.tutorial-raw/<name>.png` | **no**, gitignored |
| Website copy of both | `money2time-web` `src/lib/tutorials.generated.ts`, `public/tutorials/` | yes, generated |

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

1. `list-devices`, then use the booted iPhone (the shipped frames are iPhone 17 Pro, 1179x2556).
   Recapturing a subset on a different device is fine — marks are normalised — but the frames
   will not match each other visually, so prefer the same device.
2. Start Metro yourself with `npx expo start --localhost` (see CLAUDE.md; tunnel/LAN do not work
   on this machine). Let Argent connect to it, never let it start its own.
3. **Demo data, not empty state.** A tutorial of an empty app teaches nothing. The seeded
   simulator already has accounts, a month of transactions, albums and goals.
4. **Dismiss dev noise first.** The RevenueCat "Invalid API Key" LogBox reopens itself; tap
   Dismiss and re-check before every capture. A red error banner in a shipped frame is a bug report.
5. **Never capture the photo library, a contact picker, or anything else holding real user
   data.** The simulator's albums contain the owner's personal photos. Use only synthetic
   imagery. If a step needs a photo, generate one.

## 3. Capture

For each frame:

```
describe(udid)                          # ALWAYS. Never eyeball a coordinate.
gesture-tap / run-sequence              # navigate to the screen
screenshot(scale: 1, includeImageInContext: false)
```

Then copy the file Argent just wrote into `.tutorial-raw/<name>.png`. A helper worth
recreating:

```bash
cat > /tmp/cap.sh <<'SH'
#!/bin/zsh
d=$(ls -td /var/folders/*/*/T/simserver-*/media | head -1)
cp "$(ls -t "$d"/*.png | head -1)" "$(git rev-parse --show-toplevel)/.tutorial-raw/$1.png"
SH
chmod +x /tmp/cap.sh
```

Things that bite, all of them learned the hard way:

- **`scale: 1` and `includeImageInContext: false`.** The auto-screenshot attached to every
  gesture result is downscaled to ~360px and useless as source art. Take an explicit one.
- **Typing races.** `keyboard` without a delay drops and reorders characters ("Japan trip" came
  out "Hpan tripa"). Always pass `delayMs: 150-180`.
- **Transient UI.** A "Listening…" overlay or a toast will not survive a separate screenshot
  call. Chain it: `run-sequence` with the tap, then a short `delayMs`, then capture immediately.
- **Long-press.** A bare Down/Up will not trigger it. Use `gesture-custom` with several tiny
  `Move` events during the hold.
- **Permission resets kill the app** (expected iOS behaviour). Relaunch after.
- **Features that need a network or hardware** (receipt scan Worker, the microphone) fail in the
  simulator. Capture the state *before* the failure, or reach the same screen another way.

## 4. Write the marks

Take them from `describe`, not from the picture. `describe` reports an element's frame as
normalised `[0,1]` fractions — exactly the space the spec stores — so a mark lifted from the
accessibility tree lands on the control and survives a recapture at a different size.

```jsonc
"accounts-4": {
  "source": "RAW/accounts-4.png",       // resolves against .tutorial-raw/
  "marks": [
    { "type": "rect", "x": 0.04, "y": 0.152, "w": 0.92, "h": 0.115,
      "radius": 0.03, "pad": 0.005 }   // x/y/w/h straight off `describe`
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
    im = Image.open(f'assets/tutorials/{n}.png').convert('RGB'); im.thumbnail((TW-8, TH-8))
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

Then in `money2time-web`: `npx tsc --noEmit && npm run lint && npm run build`.

Never hand-edit `src/lib/tutorials.generated.ts` or `public/tutorials/` — this script owns them.

## 8. Adding a whole new tutorial

Everything above, plus:

- Pick a **slug that matches the title**. It is the URL (`money2time.com/tutorials/<slug>`) and
  the deep link (`money2time://tutorial?id=<slug>`). Renaming one after release needs a redirect.
- Append it to the right `content/<category>.ts`. Category order is `TUTORIAL_CATEGORY_IDS` in
  `content/types.ts`; a new category needs an i18n key in **all 23 locales** and on the web side.
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
  as 256-colour indexed PNGs for the same reason (~10MB, not ~40MB).
- **Orphans cost real bytes.** Deleting a step without deleting its PNG leaves it in the binary;
  the test catches this, so do not silence it.
- **Do not recapture what did not change.** Every recapture is bytes in the diff and a chance to
  introduce dev-build noise into a shipped frame.
