# Whole-tile icon sources

Artwork for app icon variants that are **not** a mascot pose, so there is no head
for `scripts/generate-app-icons.mjs` to frame. Each file is a transparent cut-out
already composed at tile scale (1024x1024), stamped through the generator's
identity framing and then given the same seven faces as every other variant.

| File        | Variant | Origin                                                     |
| ----------- | ------- | ---------------------------------------------------------- |
| `purse.png` | `purse` | The icon worn just before the current mascot, from history |

## How `purse.png` was restored

The coin-purse character the app wore from `6f8d4312` (#58) until the chick
mascot landed at `8acb252a` (#420) survives in history as
`6f8d4312:assets/ios/AppIcon~ios-marketing.png`: the full 1024 tile, artwork
sitting on a flat backdrop with no drop shadow.

That backdrop is `#FDF0D8`, **exactly** the cream every variant is composed on
today, which is a coincidence worth stating because it is what makes the
restoration a one-liner rather than the archaeology the icon before it needed.
The tile went through the same `cutOutFromBackdrop` the generator uses on the
shipped icon: the backdrop is the near-cream region reachable from the tile
border, not every near-cream pixel. That distinction is load-bearing here too,
because **the purse's own belly is cream** and a colour threshold would punch a
hole straight through the character's face; the orange body encloses it, so a
flood fill from the border never reaches it.

The 432px `ic_launcher_foreground.png` at the same commit is a clean
artist-authored cut-out and looks like the easier source, but it is 4.7x too
small for a 1024 tile and was left alone.

Re-deriving it is one call, so there is no committed script; the check is that
the cut-out carries no cream fringe on the midnight face and that the belly and
the sparkle are both still there.
