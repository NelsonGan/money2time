# Step 6 — GSC measurement: `KEEP / ITERATE / REVERT`

Wait for meaningful data before deciding. At this site's traffic, a fortnight;
longer for a page with few impressions. A three-day dip is noise, and a fresh
page has no position to defend yet.

## On a drop, investigate in this order

**site → page → query → indexing/canonical → recent code changes**

1. **Site** — `search_analytics` with dimension `date`, no page filter: is total
   clicks/impressions down, or only this page? A site-wide
   move is an algorithm update or an infrastructure problem, not this page's
   copy.
2. **Page** — which URLs lost. If a page lost exactly what another page gained,
   that is cannibalisation, and the fix is a merge or a canonical, not content.
3. **Query** — did the page lose *queries* or lose *position on the same
   queries*? Losing queries means Google re-decided what the page is about.
   Losing position on the same queries means competition or a quality signal.
4. **Indexing / canonical** — `index_inspect`. Is it still indexed? Is Google's
   selected canonical still the declared one? Impressions to near-zero overnight
   is almost always this, not writing.
5. **Recent code changes** — `git log --since="<date the drop started>" --oneline`
   and look at anything touching `src/lib/seo.ts`, `sitemap.ts`, `robots.ts`,
   `src/i18n/routing.ts`, `messages/`, `layout.tsx`, or the route itself. Correlate the drop date
   with a deploy date before theorising.

Do not generate new content as the first response to a drop. Content is the
answer to exactly one of these five findings.

6. **Locale** — one locale or all of them? Break `search_analytics` down by
   `page` and by `country`. A single locale falling is a translation, an
   hreflang tag, or a market-specific competitor. All 32 at once is none of
   those, and is usually the host, the canonical, or the sitemap.

## The verdict

**KEEP** — impressions and position hold or improve, and the page is not taking
queries from a page that ranked better for them. Change nothing; re-measure at
the next interval.

**ITERATE** — impressions present but CTR low (the result is not being chosen:
title and description), or position 5–20 (the answer is not good enough:
substance, internal links, specificity). Iterate on one variable, note the date,
re-measure. Changing three things at once forfeits the measurement.

**REVERT** — the change coincided with a drop and the drop survives the
investigation above; or the new page cannibalised an existing ranking URL. Revert
first and diagnose after: a live cannibalisation costs traffic every day it
stands.

## Record the decision

Each cycle, write down: the date, the change, the metric before, the metric
after, and the verdict. Without that record the loop is not a loop — it is a
series of unrelated guesses, and the next drop starts the investigation from
nothing.
