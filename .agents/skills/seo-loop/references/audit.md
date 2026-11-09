# Step 3 — The audit pass

Review the implementation; do not re-ask the model whether it did a good job.
Each item is answered with what was found, not "yes".

## Intent and uniqueness

- **One primary intent per page**, stated in a sentence.
- **No duplicate keyword targets.** The page set is small — `/`,
  `/cost-in-hours`, `/statements-import`, plus legal. A fourth content page has
  to name a job none of those three do.
- **Locale variants are not competitors.** `/en-my/cost-in-hours` and
  `/en-sg/cost-in-hours` target the same intent in different markets; hreflang
  is what keeps that from being cannibalisation. Two *different paths* aimed at
  one intent is cannibalisation, and no hreflang fixes it.

## The tags

- **Title** — unique per page, leads with the searched phrase, under ~60 *wide*
  — a CJK glyph counts double, so a 30-character Japanese title is already at
  the limit and a 60-character one is cut in half.
  Across locales, translated is fine; identical English across `en-*` markets is
  a warning worth a look, since each variant claims its own market.
- **Description** — ~150 wide, opens on the thing searched for, per locale.
  Same doubling: the CJK locales reach it in about 75 characters, which is
  why they look short next to the European ones and are not.
- **H1** — one per page, matching the page's answer.
- **Canonical** — absolute, from `pageAlternates()`, and naming the page it is
  on. It resolves to the apex while the site serves on `www`; see the host
  section in `SKILL.md` for why that is a warning and not a failure.
- **hreflang** — every locale plus `x-default`, and the page's own **canonical**
  among them. A set without a self-reference is dropped by Google wholesale.
  The alternates name apex URLs that redirect; that is consistent with the
  canonicals, which is why the set holds.
- **`og:locale`** — `language_TERRITORY` via `ogLocale()`, never a bare tag.
- **`<html lang>`** — via `htmlLang()`, matching the locale being served.

## Indexability and discovery

- Reachable from another page — no orphans. A sitemap entry is not a link.
- In `src/app/sitemap.ts` with a **real** `lastModified` for the route changed.
- `/en/<path>` does not exist as an indexable duplicate of `/<path>`
  (`localePrefix: "as-needed"`).
- `robots.ts` does not block it, and `host` names the host that serves `200`.

## Content and locale parity

- **`node scripts/validate-messages.mjs` passes.** A key present in `en.json`
  and missing elsewhere is thirty-one pages with a hole in them.
- **Not thin.** The checker flags under 250 words; `/statements-import`
  currently renders ~60. That is a page Google has little reason to rank.
- **Machine translation is a claim too.** If a locale's copy has not been
  reviewed, it is still a public page making promises in that language.
- **Claims match the product.** Generated data pages (`generate-bigmac-data`,
  `generate-energy-data`) must not outlive the data behind them.

## Performance

- No new render-blocking work; no client component where a server one did.
- Compare the built page against production before and after.
