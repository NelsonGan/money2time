---
name: work-on-website
description: Work on money2time.com and the Web Dashboard (app.money2time.com), which live in this repository at apps/web. Use for any change under apps/web, a marketing, legal or tutorial page, website copy or translations (messages/*.json), website media or images, the Web Dashboard's pages and editors, website analytics, the website's Worker, domains or deploys, or a website bug. Covers setup in a worktree, running and previewing it, its checks, its rules, and how it ships.
---

# Work on the website (apps/web)

money2time.com (the marketing site and the legal pages the stores link to) and
the Web Dashboard on app.money2time.com are one app in **this repository**, at
`apps/web`. It was the separate `money2time-web` repository until 2026-11-09;
that repository is retired. Never clone it or open a PR there: a website change
is a change in this repo, on the same branch and in the same PR as any app or
Worker change it goes with.

Read the README's **Website** section before you change anything, and the part of
it you are about to touch in full. Paths below are relative to `apps/web`.

## It is not Next.js

The code is written against the Next.js 16 App Router API, but **vinext** builds
and serves it, on Vite, as one Cloudflare Worker (`money2time-workers-web`).
Every `next/*` import is a vinext shim; webpack and Turbopack settings do
nothing; Vite plugins replace them. Before relying on a Next.js feature, check
`node_modules/vinext/README.md` (API coverage, _Known gaps_) and the
[migrate-to-vinext](../migrate-to-vinext/SKILL.md) skill's
`references/compatibility.md`. When the Next.js docs and vinext disagree, vinext
wins.

## Where things are

| You are changing…                                    | Look in                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| a page                                               | `src/app/[locale]/…`; host and locale routing in `src/proxy.ts`           |
| any words on a page                                  | `messages/<locale>.json` (32 files), never the component                  |
| SEO metadata, canonicals, hreflang, structured data  | `src/lib/seo.ts`, `src/app/sitemap.ts`, `src/app/robots.ts`               |
| a picture or video                                   | `media/` (published to R2), URLs from `src/lib/media.ts`                  |
| the Web Dashboard's pages, charts, editors           | `src/components/dashboard/` (`views/`, `edit/`, `nav.ts`)                 |
| how the dashboard reads the phone's backup           | `src/lib/backup/` (the "app-equivalent maths")                            |
| the link protocol, crypto, patches, edit ops         | `src/lib/cloud/` (must match the app's `services/webDashboard*.ts`)       |
| website analytics                                    | `src/lib/analytics.ts`, `src/lib/analytics-config.ts`                     |
| the Worker: domains, routes, flags                   | `cloudflare.config.ts`; headers, CSP and redirects in `next.config.ts`    |

The README's "Where things live on the website" table has the rest.

## Set up and run it

In a worktree, install first: a symlinked `node_modules` breaks the build.

```bash
cd apps/web
npm ci
npm run dev -- --port <free port>   # 3000 by default; often taken by another worktree
```

The site is `http://localhost:<port>` and the Web Dashboard
`http://app.localhost:<port>`. Look at it with the T3 Code preview tools
(`preview_open` with `target: { kind: "environment-port", port }`), and close
the tab and stop the server when you are done. The dev server runs the Worker
in workerd, as production does. For the dashboard with real data from a
simulator (local relay, pairing, the signed dev client), follow the
[sync-web-dashboard](../sync-web-dashboard/SKILL.md) skill's step 4.

Put any local environment value in `.env.development.local`, never
`.env.local`: Vite reads `.env.local` for production builds too.

## Rules

- **A page is a page times thirty-two.** Add every new string to all 32
  `messages/*.json` files. Regional English files (`en-my.json`, `en-gb.json`, …)
  hold only what differs from `en.json`, so leave them alone unless the words
  differ there. Reuse a key when the words match. `node scripts/validate-messages.mjs`
  is the parity check.
- **Real `lastModified` dates.** When a page's content changes, bump its date in
  `src/app/sitemap.ts`, and only that page's.
- **Pictures are published, not deployed.** A deploy does not upload `media/`.
  Run `node scripts/upload-media.mjs` (it needs your `cf` login or
  `CLOUDFLARE_API_TOKEN`) before the change that shows a new picture merges, or
  the workflow's media check fails. Never `--prune` without being asked.
- **Generated files are written by scripts.** Do not hand-edit
  `src/lib/tutorials.generated.ts` (`apps/mobile/scripts/sync-tutorials-web.mjs`),
  `src/lib/icons.generated.ts`, `*.generated.ts` under `src/lib/backup/`, or
  `public/dashboard-assets/` (`node scripts/sync-dashboard-assets.mjs`, which
  reads `../mobile`). The README's "Generated website files" table names each
  script.
- **The dashboard mirrors the app.** When the dashboard's behavior has to match
  the app (totals, editors, free-plan limits, protocol), follow
  [sync-web-dashboard](../sync-web-dashboard/SKILL.md). It is the skill that also
  decides whether an app change needs a website change at all.
- **SEO work** (a new page, titles, canonicals, a ranking drop) goes through the
  [seo-loop](../seo-loop/SKILL.md) skill. No page is created before its Search
  Console ownership check, and never invent Search Console numbers.
- **Analytics.** The website's events are in the README's "Website and Web
  Dashboard analytics" subsection; change it with the code (see
  [maintain-analytics-tracking](../maintain-analytics-tracking/SKILL.md)). Every
  event goes through the typed contract in `src/lib/analytics.ts`, never
  arbitrary visitor text, and the dashboard host never records sessions.
- **Its own conventions.** Double quotes, its own ESLint config, no Prettier,
  Tailwind v4. Tests are `node --test` over `src/**/*.test.ts`: a module under
  test must import values with paths ending in `.ts` and no `@/` alias (type-only
  imports are fine). Match the file you are in, not the mobile app's style.
- **Never import across apps.** Nothing in `apps/web` imports from `apps/mobile`
  or the reverse; code the two must share is mirrored (and named in a comment),
  and assets are copied by the sync scripts.

## Checks

From `apps/web`, before you say you are done:

```bash
npm run lint
npm test
node scripts/validate-messages.mjs
rm -rf .next && npm run build      # a dev server's leftovers can break the build
npm run typecheck                  # after the build: it generates the Worker types first
```

If your change also touched the app, run its checks too (`npm run check` and
`npm test` in `apps/mobile`). After a build, delete `.next`, `dist` and, if you
are done, `node_modules` in a throwaway worktree: the disk on this Mac fills up.

## How it ships

- The `Web` workflow (`.github/workflows/web.yml`) runs only when `apps/web/**`
  changes. On a PR it checks, builds and uploads a Worker version without
  sending it traffic; on `main` it deploys to production. Merging is the deploy.
- A website-only change cuts no store build. A PR that also touches
  `apps/mobile` ships the app through the stores days later, so the website must
  work with older apps and the new one at once (see sync-web-dashboard step 2).
- The workflow uses the repo secret `CLOUDFLARE_WEB_API_TOKEN`; without it a PR
  skips the media check and the upload, and `main` fails to deploy.
- Never `npm run deploy` from your machine unless the user asks: it deploys to
  production.
- PR screenshots of the site are attachments like the app's (`--attach`, never
  committed, see [create-pr](../create-pr/SKILL.md)).
