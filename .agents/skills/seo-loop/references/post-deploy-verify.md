# Step 5 — Verify production, not the source

The source implementation can be correct and the production HTML wrong. That
gap is the reason this step exists — it has caught real bugs on this site.

Ways it happens: a stale CDN cache; a deployment that built but did not
promote; a route that fell back to dynamic rendering and now emits a different
head; a `SITE_URL` that names a host the deployment does not serve — which is
the live bug on this site; a build that succeeded locally against data the
deploy did not have.

Check the **serving** host, then check that the sitemap names the same host.
Those are two different questions and today they have two different answers.

## Run it against the real origin

```bash
node ../../.claude/skills/seo-loop/scripts/seo-check.mjs https://www.money2time.com /route
node ../../.claude/skills/seo-loop/scripts/seo-check.mjs https://www.money2time.com --sitemap=40
```

Then confirm by hand the three things a checker reads but a human should see:

```bash
curl -sI https://www.money2time.com/route | head -5                       # status, cache
curl -s https://www.money2time.com/route | grep -iE "<title|canonical|og:|hreflang|<h1"
curl -s https://www.money2time.com/robots.txt
curl -s https://www.money2time.com/sitemap.xml | grep -c "<loc>"          # count sanity
curl -s https://www.money2time.com/sitemap.xml | grep "/route"            # this URL, live
curl -sI "$(curl -s https://www.money2time.com/sitemap.xml | grep -o '<loc>[^<]*' | head -1 | cut -c6-)" | head -1
#   ^ does the first URL Google is handed actually return 200?
```

## What must be true in the response

- `200`, no redirect chain, and not a soft 404 (a 200 that renders the not-found
  page is worse than a 404 — Google indexes it).
- Rendered title, description, canonical, robots, H1 identical to intent.
- The tags are in the **first response**, not added after hydration.
- `sitemap.xml` served by production contains the URL (or correctly omits it),
  and its `<loc>` count has not collapsed.
- `robots.txt` served by production still disallows only what it should.

## Crawlability, from Google's side

Run `index_inspect` (the `gsc` MCP server) on the deployed URL and record:
indexing state, Google-selected canonical vs declared canonical, last crawl,
mobile usability, and any rich-result verdict. A Google-selected canonical that
differs from the declared one is the single highest-value finding here — it
means Google disagrees with the page about what it is, and no amount of new
content fixes it.

Only then request indexing. Requesting indexing on a page that fails the above
just gets the failure indexed faster.
