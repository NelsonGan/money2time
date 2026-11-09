import { bindings, defineConfig, defineWorker, triggers } from "cf/config";

/**
 * The one Worker that serves www.money2time.com and the Web Dashboard at
 * app.money2time.com. vinext builds it with Vite, and `cf` deploys it from this
 * file, so this is where every binding, domain and runtime flag lives. There
 * is no `wrangler.jsonc`. README: *Hosting*.
 */
export default defineConfig({
  accountId: "1807480618facf8aedfbbe714a0707b7",
  worker: defineWorker({
    name: "money2time-workers-web",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-27",

    /* The Node built-ins the server expects (`Buffer` in the OG cards), and `process.env`. */
    compatibilityFlags: ["nodejs_compat"],

    /*
     * Every request reaches the Worker first except hashed build output and
     * the Web Dashboard's art in `public/dashboard-assets`, which come straight from
     * Static Assets with `public/_headers` applied. Worker-first covers
     * `/_vinext/static-cache/*`, where the prerendered pages are kept, so
     * nobody can fetch a raw cache file, and it means the `next.config.ts`
     * headers (the dashboard's CSP) and redirects apply to every page.
     */
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*", "!/dashboard-assets/*"],
    },

    /*
     * `www` is the site and `app` the Web Dashboard (`src/proxy.ts` tells them
     * apart); each is a custom domain, so Cloudflare keeps its DNS record.
     */
    domains: ["www.money2time.com", "app.money2time.com"],

    /*
     * The apex only `308`s to `www` (`src/proxy.ts`). It reaches the Worker
     * through this route, which runs on the originless `AAAA 100::` record,
     * proxied, that the zone keeps for it. README: *Services and resources*.
     */
    triggers: [triggers.fetch({ pattern: "money2time.com/*", zone: "money2time.com" })],

    /*
     * No `*.workers.dev` copy and no preview URLs: either would publish a
     * second, complete copy of the site and the dashboard under a name no
     * canonical mentions, and the dashboard's relay accepts only its own
     * origins anyway.
     */
    workersDev: false,
    previewUrls: false,

    observability: { enabled: true },

    env: {
      /* Build output, and the prerendered pages vinext reads back from it. */
      ASSETS: bindings.assets(),
    },
  }),
});
