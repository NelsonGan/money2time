---
name: ui-mockups
description: Generate a UI mockup image with the imagegen skill (any available image model) and use it as the design guide for every visible UI change in this repository, in the app, the website, the Web Dashboard or App Studio, then check the built UI against it before the PR. Also use it for a design review, a UX or user review, or a review of a UI PR, where a mockup of how the screen should look becomes the yardstick. Use alongside frontend-design or work-on-website whenever you add, restyle or redesign a screen, page, sheet, card, empty state, onboarding or paywall, or review how one looks.
---

# Design from a mockup, check against it

Agents design noticeably better UI when they have a picture to work toward. Going
straight from words to code tends to land on the generic: a centred stack of evenly
weighted cards. An image model has seen far more good interfaces and commits to a
hierarchy, so its picture is usually more coherent than what an agent would build
from a description. So for every visible UI change: draw it first, build it in the
project's real system with the picture as the guide, then hold the result up
against the picture before calling it done. Reviews work the same way: a mockup of
how the screen should look shows what the real one is missing.

Pictures come from [imagegen](../imagegen/SKILL.md), which uses whichever image
model is available (Codex or Antigravity today). Read its `SKILL.md` once per
session for the flags. An image takes 30-90 s: run the script in the background or
with a timeout of 10+ minutes, and start independent images in parallel.

## When

**Always** for a change that adds or alters visible UI in `apps/mobile`, `apps/web`
(the website and the Web Dashboard) or `apps/app-studio`: a new screen, page, sheet,
card or row, a redesign or restyle, an empty, loading, onboarding or paywall
moment, a new state of an existing screen. Also for every design review, user or
UX review, and review of a PR that changes UI.

**Skip it only** when nothing about how the screen looks changes (a bug fix that
restores the existing design, a copy change, data wired into an existing layout,
an exact spacing value the user gave), or when the user supplied the design (a
Figma file, a screenshot, a spec): theirs is the guide, and the check below runs
against it instead. Say in the PR why there is no mockup.

If every image backend fails (signed out, usage limits), say so once and carry on
from the project's design rules alone. Do not block the task on it, and say in the
PR that no mockup was made.

## 1. Gather context

1. Read the design rules for the surface: [frontend-design](../frontend-design/SKILL.md)
   for the app, [work-on-website](../work-on-website/SKILL.md) and `apps/web`'s
   `globals.css` tokens for the website and dashboard, [work-on-app-studio](../work-on-app-studio/SKILL.md)
   for store art. Note the palette, typography, radius and spacing scale.
2. Screenshot the current screen, or the nearest existing one if the screen is
   new: the app on a leased device (`device_open`, then `agent-device screenshot`),
   the website through the preview tools. Use the `rosewood` theme the store art
   uses unless the change is about another theme.
3. Make the topic folder: `.github/pr-assets/<topic>/` (ignored by git), the same
   one the PR's evidence goes in. Mockups and the screenshots they were made from
   live there.

## 2. Make the mockup

Pass one or two of the screenshots with `-i` and say what they are for: "Match the
visual language of the attached screenshots (palette, type, corner radius,
density). Design a new <screen>." For a redesign of an existing screen, `-e -i
<current.png>` keeps the rest of the app recognisable.

```text
Asset type: high-fidelity UI mockup of one <iPhone app screen | Android app screen | web page at desktop width>, flat screenshot, no device frame, no hands, no perspective
Product: Money2Time, an expense tracker that shows what things cost in hours of the user's work; calm, warm, trustworthy
Screen: <what this screen is for, what the user does here, the primary action>
Content (use exactly): <real labels, realistic amounts in a real currency, hours, account and category names; sections in priority order>
Visual language: match the references (rosewood accent on neutral surfaces, Work Sans in the app or DM Sans on the web, soft rounded cards, generous spacing), <light or dark>
Platform: <iOS: safe areas, floating tab bar, sheet grabber | Android: Material conventions | web: nav, max content width>
Composition: portrait 9:19.5 (phone) | landscape 3:2 (web, iPad)
Avoid: lorem ipsum, placeholder boxes, watermark, device frame, multiple screens in one image
```

Real content matters most. A mockup of fake content is a design for fake content.

```bash
.agents/skills/imagegen/scripts/imagegen.sh -n 2 \
  -i .github/pr-assets/<topic>/current.png \
  -o .github/pr-assets/<topic>/mockup.png "<brief>"
```

Make two variants (`-n 2`) for open-ended work; the second often finds a better
structure. For a third take from another model, run once more with
`-b antigravity` (or `-b codex`, whichever did not make the first) and
`-o .github/pr-assets/<topic>/mockup-alt.png`. The script never overwrites a file,
so always use the paths it prints. For a feature
that spans screens, mock the key screen first, then pass it with `-i` when mocking
the others so they read as one product. A change shown on both the app and the Web
Dashboard gets a mockup for each, the second made with the first as reference.

## 3. Read it, do not trace it

Look at every mockup and pick one (name it `mockup.png`). Write down, in two or
three lines, what you are taking from it: this is the guide the check in step 5 and
the PR hold the result to.

**Take:** the hierarchy (what is biggest, what comes first), grouping and
sectioning, spacing rhythm and density, how key figures and data are featured, the
treatment of the primary action, ideas for empty and edge states, and the small
touches that make it feel finished.

**Leave:**

- exact colours: map them to the theme tokens (all eight palettes, light and dark)
- fonts: use the project's typography
- invented components: build from `components/ui/` and the existing sheets
- logos, photos and illustrated icons it drew in (a café's logo, a food photo):
  the app shows its own category emoji, `AccountLogo` and mascot art
- invented features, data or navigation: ignore them
- text in the image: often garbled; write the copy yourself, through i18n
- pixel measurements: use the spacing scale

**The project's rules win every conflict with the mockup.** It is direction, not a
spec. Deviate wherever the real platform, real data, accessibility or an existing
pattern says otherwise, and the repo's own conventions (helper text behind an info
button, standard rows and settings layouts) still apply.

## 4. Build

Build it with [frontend-design](../frontend-design/SKILL.md) or
[work-on-website](../work-on-website/SKILL.md) as usual, with the mockup open.

## 5. Check the result against the mockup

Before you say you are done, screenshot the real UI in the same state and theme as
the mockup and compare them side by side. Go through what you said you would take:

- Is the same thing biggest and first? Are the groups and their order the same?
- Did the density and spacing rhythm survive, or did it slide back into a generic
  stack of equal cards?
- Is the primary action treated the way the mockup treats it?
- Did the finishing touches you picked make it in?

Fix every gap the project's rules allow, then screenshot again. Write down each
deliberate difference and why (a token instead of the mockup's colour, an existing
primitive instead of an invented one). Then run the surface's usual checks (dark
mode, small screens and iPad, long text and other locales, its checklist).

## Reviews: design, user and PR

For a design review, a user or UX review of a screen, or a review of a PR that
changes UI:

1. Screenshot the screen as it is (for a PR, as the PR builds it).
2. If the PR description has a mockup, that is the guide. Otherwise make one: the
   screenshot with `-e -i <screenshot.png>` and a brief that names the screen's job
   and asks for "the same screen redesigned so the primary task is obvious and the
   hierarchy is clear; keep the product's visual language and real content".
3. Compare as in step 5, and also against the user's view: what someone opening
   this screen is trying to do, and whether the screen makes that the easiest thing.
4. Report each gap as a finding with both images, the screenshot and the mockup,
   and say which gaps the project's rules allow fixing. A mockup that breaks the
   rules is not a finding against the screen.

## In the PR

The mockup is evidence like any screenshot: it stays in `.github/pr-assets/<topic>/`,
is never committed, and is uploaded with `--attach`. [create-pr](../create-pr/SKILL.md)
puts it in the Evidence table beside the result (`| Mockup | Result |`) and gives
the comparison a row in the Verification table: what matched and each deliberate
difference. When reporting to the user, show the mockup next to a screenshot of the
result too.

## Art for the UI

When the UI needs raster art (empty-state and onboarding illustrations, mascot
poses, illustrated icons, badges, store and marketing art), make it with
[imagegen](../imagegen/SKILL.md) instead of a hand-written SVG, an emoji stand-in or
a placeholder. Not for real brand logos (banks, payment networks, companies: they
must be the official artwork), UI icons from Lucide, charts or anything
data-driven, or simple shapes that code does better.

- **Find the family first** and pass one or two members with `-i`: "match the
  style, lighting, palette and framing of the references exactly". The chick is
  always an existing mascot PNG edited with `-e`, never redrawn. A new family's
  first image needs the user's approval, since it sets the style.
- **Use `-t`** for anything placed over UI, and confirm the alpha channel is real.
- **Fit the pipeline** (sizes, WebP, the asset scripts) and **never overwrite** an
  existing asset: write a sibling (`name-v2.png`) and let the user pick.
- **Check it at real size** in the real UI, in both themes. A detailed 1254 px image
  can turn to mush at 48 px; if it does, regenerate with fewer details and a bolder
  silhouette.
