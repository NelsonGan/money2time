# Step 4 — The pre-deploy gate

Every line is checked before an SEO page ships. A page that fails the gate is
not deployed. Not "deployed with a note" — not deployed.

## The checklist

- [ ] One clear primary intent
- [ ] No existing URL owns the same intent (step 1 verdict said so)
- [ ] Unique title, under ~60 wide (a CJK glyph counts double)
- [ ] Useful meta description, ~150 wide
- [ ] Correct H1 — exactly one
- [ ] Correct canonical — absolute, naming this page, consistent with the rest
      of the site's host choice
- [ ] hreflang complete: every locale, `x-default`, and a self-reference
- [ ] Correct robots directive
- [ ] Relevant internal links out; at least one real page links in
- [ ] In `sitemap.ts`, with a real `lastModified` for this route only
- [ ] No `/en/<path>` duplicate of `/<path>`
- [ ] Strings present in all 32 `messages/*.json` — `validate-messages.mjs` passes
- [ ] No thin or near-duplicate generated content
- [ ] Claims match the actual product
- [ ] No obvious performance regression

## Running it

```bash
npm run dev                                                          # shell one
node ../../.claude/skills/seo-loop/scripts/seo-check.mjs http://localhost:3000 /route
node ../../.claude/skills/seo-loop/scripts/seo-check.mjs http://localhost:3000 --sitemap=40
node scripts/validate-messages.mjs
npm run lint && npm run build
```

`seo-check.mjs` covers: HTTP status and redirects, soft 404s, title and
description (presence, length, duplication (locale-aware)), canonical, robots meta and
`robots.txt` conflicts, H1 count, `h2` presence, hreflang self-reference and
duplicates, Open Graph, JSON-LD parse, content volume, internal-link count,
sitemap membership. Exit code 1 = closed gate.

Six things about HOW it measures, because every one of them was a wrong answer
first:

- **`--sitemap=N` samples across the sitemap, not off the front.** A sitemap is
  written in route order, so its first sixty URLs are one route in sixty
  locales. Taking the head is how a sweep reports "0 warnings" having never
  looked at a legal page.
- **It follows a redirect that stays on this site** and audits the page at the
  end, and does not accuse the redirecting route of duplicating the page it was
  sent to. A chain that will not settle in four hops fails.
- **A 404 fails.** `status >= 300` once swallowed one into the redirect branch
  and reported a missing page as clean.
- **Soft 404s fail too.** It asks for a URL that cannot exist, remembers the
  title that comes back, and fails any 200 page wearing it — a 200 that renders
  the not-found page is worse than a 404, because Google indexes it.
- **Length is width, and content is script-aware.** A CJK glyph counts double
  in a title, and two of them count as one word of content, which is measured
  from this site's own pages rather than guessed. Counting characters and
  spaces reports full Chinese, Japanese and Thai pages as empty and short.
- **`robots.txt` rules are read per group.** Only the `User-agent: *` group
  applies to us; both these sites carry Cloudflare-injected per-crawler blocks
  that disallow everything, and read flat they say the site is closed.

It sends `Accept-Language: en-US` by default, to ask for roughly the page
Googlebot asks for; `--lang=de` audits one locale on purpose. It cannot change
the IP it runs from, so on a geo-adaptive site the answer still reflects where
you are sitting.

What it cannot check, and you must:

- Whether the intent is genuinely distinct.
- Whether the copy is true, in any of the 32 languages.
- Whether a translation is fit to publish.
- Whether "in the sitemap" is the right answer for this page.

## The inbound link

```bash
grep -rn "/new-route" src/components src/app messages/en.json
```

A sitemap entry is not an inbound link.
