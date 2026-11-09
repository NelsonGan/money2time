import { cloudflare } from "@cloudflare/vite-plugin";
import { staticAssetsAdapter } from "@vinext/cloudflare/cache/static-assets-adapter";
import vinext from "vinext";
import { defineConfig } from "vite";

/**
 * vinext reimplements the Next.js API on Vite, so `src/app` and
 * `next.config.ts` are read as they are. The Cloudflare plugin runs the server
 * in workerd during `vite dev` as well as in production, so a local run and a
 * deployed one fail in the same places. README: *Hosting*.
 */
export default defineConfig({
  /*
   * `npm start` answers to the production hostnames too, so the host rules
   * (the apex redirect, the dashboard host, its CSP) can be checked locally:
   * `curl -H "Host: app.money2time.com" localhost:3000`.
   */
  preview: { allowedHosts: ["money2time.com", "www.money2time.com", "app.money2time.com"] },
  plugins: [
    vinext({
      /*
       * Every page that can be rendered at build time is: all 32 locales of
       * the marketing pages, the legal pages and every tutorial. They ship
       * inside the deploy as Static Assets and are served read-only, so a
       * deploy replaces them all at once. Metadata routes (sitemap, robots,
       * manifest, the OG cards) are not prerendered by vinext and render per
       * request, as do `/download` and the proxy's locale redirects.
       */
      prerender: { routes: "*" },
      cache: { cdn: staticAssetsAdapter() },
    }),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
    }),
  ],
});
