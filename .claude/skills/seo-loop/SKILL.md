---
name: seo-loop
description: Run the SEO engineering loop for money2time.com — decide whether a keyword deserves a new page (CREATE/IMPROVE/REJECT) using Search Console data, audit the implementation across all 32 locales, pass the pre-deploy gate, verify the production HTML, then measure in GSC and decide KEEP/ITERATE/REVERT. Use whenever asked to add, change, or investigate an SEO page, target a keyword, write titles/meta/canonicals/hreflang/sitemap entries, work on locale or translation coverage, diagnose a traffic or ranking drop, or check whether a page is indexed correctly.
---

# The SEO loop

The site is `apps/web`. Paths in this skill and its references are relative
to it, and every command runs from it (`cd apps/web`); the checker is
`../../.claude/skills/seo-loop/scripts/seo-check.mjs` from there. The README's
*Website* section covers the rest of the site.

Not an AI writer. An SEO engineer with rules, tools, and real feedback data.

```
GSC → intent & ownership check → audit → pre-deploy gate → deploy
    → production verification → GSC measurement → keep/iterate/revert
```

GSC is the source of truth. Everything else in this loop exists to keep code
honest between two GSC readings.

## The two hosts, and what Google actually does with them

`SITE_URL` in `src/lib/seo.ts` is `https://money2time.com`, and that host does
not serve the site: it answers `308` to `https://www.money2time.com`
(`src/proxy.ts`), which returns `200`. Every canonical, hreflang alternate and
`<loc>` derives from `SITE_URL`, so all of them name the redirecting host.

**Google has resolved this correctly, and the URL Inspection API says so:**

| URL | verdict | coverage | Google's canonical |
| --- | --- | --- | --- |
| `https://money2time.com/` | `PASS` | Submitted and indexed | `https://money2time.com/` |
| `https://www.money2time.com/` | `NEUTRAL` | Alternate page with proper canonical tag | `https://money2time.com/` |

So the apex is the indexed page, `www` is a recognised alternate, and the
canonical tag is doing its job. This is **not** an emergency, and it is not a
reason to hold up page work. Check it against live data before acting on it —
`index_inspect` on both hosts is two calls.

One thing is still worth fixing when convenient, and it is not urgent:

- **The sitemap lists URLs that redirect.** Every `<loc>` is an apex URL that
  `308`s. Google is following them, but a sitemap is meant to name the URL you
  want crawled, and this one names the hop before it.

Performance data still shows both hosts as separate rows (`money2time.com/` at
440 clicks, `www.money2time.com/` at 18) — the residue of the split. Sum them
before reading any total, and expect the `www` rows to shrink, not grow.

The checker reports the hop as a **warning**, not a failure, and follows it to
audit the page at the end. It compares the hreflang self-reference against the
page's declared canonical rather than the URL requested, which is what makes a
clean run possible on a site whose canonical host and serving host differ.

## Known, checked, and deliberately left alone

Three things look like defects, have been checked against live data, and are
being left as they are. Re-deciding them needs new evidence, not a re-reading.

**The `/` locale rewrite for MY and SG.** `src/proxy.ts` sends visitors in every
other mapped country to their locale URL with a redirect, and *rewrites*
Malaysia and Singapore instead — so `/` serves
`en-my` / `en-sg` content under the unprefixed URL, and its canonical varies
with the visitor's IP. Making them redirect like everyone else would settle
that — and would put a redirect in front of the site's highest-traffic page
(`/` is 440 of 507 clicks) for its biggest market. The theoretical gain is
consistency under locale-adaptive crawling; the risk is real traffic. Left
alone deliberately.

**The apex/`www` split.** Covered above: Google has consolidated onto the apex
and says so. The redirect is a permanent `308`.

**`/statements-import` is thin** — 60 words and a video, no `h2`. That is a real
weakness and the fix is copy, in 32 languages. It is the owner's call, not a
mechanical one.

## Open, and needing a decision

**Every locale's `costInHours` description names a country count that is wrong.**
`WAGES` in `src/lib/wages.ts` holds 29 countries; the descriptions say "ten
countries", "zehn Ländern", "十个国家" — the number spelled out as a word in all
32 files. It is the single claim on the page that Google prints verbatim, and it
understates the page by nineteen countries.

It was left unfixed on purpose: correcting it means editing a numeral inside a
translated sentence in 32 languages, several of which inflect the noun after the
number, and shipping guessed grammar is its own defect. Either regenerate those
strings properly, or rewrite the sentence once to stop naming a count — which is
what `en-za` now does.

## The two rules that override enthusiasm

1. **No page is created before the ownership check.** The cheapest way to lose
   traffic is to publish a second page for an intent an existing URL already
   ranks for. Every new page starts at step 1, never at the editor.
2. **No page ships on what the source says it does.** The gate is what the
   server actually returned. Source can be right and the response wrong: the
   host arrangement above is invisible in `seo.ts` and obvious in a `curl -I`.

## Step 1 — Decide, with data, before writing code

Read `references/intent-check.md`. Output must be one of `CREATE`,
`IMPROVE EXISTING`, or `REJECT`, with the query, the URL that already ranks (if
any), and the numbers behind it. State the verdict before writing anything.

The `gsc` MCP server (`mcp-server-gsc`, read-only) supplies the data. Never
silently skip the check, and never invent GSC numbers.

## Step 2 — Build it the way this site builds pages

| Concern | Where it lives |
| --- | --- |
| `SITE_URL`, brand names, locale helpers | `src/lib/seo.ts` |
| canonical + hreflang for a page | `pageAlternates()`, `localeAlternates()` |
| absolute/relative localised URLs | `localizedUrl()`, `localizedPath()` |
| `og:locale`, `<html lang>` | `ogLocale()`, `htmlLang()` |
| Open Graph / Twitter blocks | `pageOpenGraph()`, `pageTwitter()` |
| structured data | `breadcrumbLd()`, `jsonLd()` |
| which URLs are announced, and their real dates | `src/app/sitemap.ts` |
| crawl rules and declared host | `src/app/robots.ts` |
| every word on every page, per locale | `messages/<locale>.json` (32 files) |
| routing locales, default, prefix strategy | `src/i18n/routing.ts` |

Three standing constraints this codebase imposes:

- **A page is a page times thirty-two.** Copy lives in `messages/`, not in
  components. A page whose strings exist only in `en.json` ships thirty-one
  broken locales. `node scripts/validate-messages.mjs` is the parity check, and
  it runs in the gate.
- **`localePrefix` is `"as-needed"`**, so `en` is unprefixed: `/cost-in-hours`
  and `/en/cost-in-hours` are the same page. Only one may be indexable, and it
  is the unprefixed one.
- **`sitemap.ts` carries hand-maintained `lastModified` dates.** They are real
  dates and that is what makes the field worth having — Google ignores `lastmod`
  wholesale on sites where it is a build timestamp. Bump the date for the route
  you changed, and only that route.

## Step 3 — Audit before the gate

Read `references/audit.md`: intent, cannibalisation, title/H1/description
alignment, canonical, indexability, internal linking, thin or near-duplicate
content, locale parity, sitemap membership, unsupported claims, performance.

## Step 4 — The pre-deploy gate

Read `references/pre-deploy-gate.md` and run it:

```bash
npm run dev                                                          # shell one
node ../../.claude/skills/seo-loop/scripts/seo-check.mjs http://localhost:3000 /route
node scripts/validate-messages.mjs
npm run lint && npm run build
```

The checker is locale-aware: a title shared by `/x` and `/en-my/x` is a warning
(they may be one page in two locales), while a title shared by two different
pages is a failure. Exit code 1 means the gate is closed. **A failed gate is not
deployed.**

## Step 5 — Deploy, then verify production

Merging to `main` deploys: the `Deploy` GitHub Actions workflow builds the
site and deploys the `money2time-workers-web` Worker. After the deployment is live:

```bash
node ../../.claude/skills/seo-loop/scripts/seo-check.mjs https://www.money2time.com /route
```

Read `references/post-deploy-verify.md`. Check the host that serves `200`, and
separately check what `index_inspect` says Google chose as canonical. Those are
two different questions, and on this site they have two different answers.

## Step 6 — Measure, then decide

Wait for meaningful GSC data, then read `references/gsc-triage.md` and return
`KEEP`, `ITERATE`, or `REVERT` with the evidence.

On a drop, investigate **site → page → query → indexing/canonical → recent code
changes** before writing a single new word. On this site add one more step: with
32 locales, check whether the drop is one locale or all of them. One locale is a
translation or an hreflang problem; all of them is not.
