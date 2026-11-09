import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { MEDIA_ORIGIN } from "./src/lib/media";

const relayOrigin = new URL(
  process.env.NEXT_PUBLIC_WEB_DASHBOARD_RELAY_URL || "https://workers-web-dashboard.money2time.com",
);
relayOrigin.protocol = relayOrigin.protocol === "http:" ? "ws:" : "wss:";

/**
 * The Web Dashboard holds the visitor's decrypted data, so its host runs only
 * this site's own scripts and Google's tag (GA4), shows pictures only from
 * itself and the media bucket, can reach only the relay, PostHog and GA4's
 * collection endpoints, cannot be framed, and sends no referrer. Production
 * only: development needs eval and the dev server's own socket.
 */
const googleTag = "https://www.googletagmanager.com";
const googleAnalytics = "https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com";
const dashboardPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${googleTag}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${MEDIA_ORIGIN} ${googleAnalytics}`,
  "font-src 'self'",
  `connect-src 'self' ${relayOrigin.origin} https://us.i.posthog.com ${googleAnalytics}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Pictures and videos that used to be files in `public/`, and are now served
 * from the media bucket at the same path under `web/`. The redirects keep any
 * old URL working: an image search result, a cached page, a link in an email.
 */
const MOVED_MEDIA: { source: string; path: string }[] = [
  { source: "/book-cover.jpg", path: "/book-cover.jpg" },
  { source: "/icon.png", path: "/icon.png" },
  { source: "/category-icons/:path*", path: "/category-icons/:path*" },
  { source: "/clay-icons/:path*", path: "/clay-icons/:path*" },
  { source: "/mascots/:path*", path: "/mascots/:path*" },
  { source: "/screenshots/:path*", path: "/screenshots/:path*" },
  // Not `/tutorials/:path*`: that is also where the tutorial pages live.
  { source: "/tutorials/:image([^/]+\\.png)", path: "/tutorials/:image" },
  { source: "/tutorials/:image([^/]+\\.webp)", path: "/tutorials/:image" },
  { source: "/videos/:path*", path: "/videos/:path*" },
];

const nextConfig: NextConfig = {
  /*
   * Metadata goes in the `<head>` for every visitor, not just the bots on
   * Next's short list. Otherwise a page rendered per request (the English
   * pages, which the locale rewrite keeps out of the prerender cache) streams
   * its title, canonical and hreflang after `</head>`, and Google ignores a
   * canonical in the body. Resolving it first costs nothing here: no page's
   * metadata waits on the network.
   */
  htmlLimitedBots: /.*/,

  async headers() {
    const headers = [
      /*
       * Only the real hosts belong in an index. Nothing else serves these pages
       * (the Worker has no workers.dev or preview URLs), but turning
       * either on would publish a full copy under a name no canonical names.
       * `missing` rather than a list of hosts to exclude, so a host nobody has
       * thought of yet is covered too.
       */
      {
        source: "/:path*",
        missing: [{ type: "host" as const, value: "((www|app)\\.)?money2time\\.com" }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
    if (process.env.NODE_ENV !== "production") return headers;
    return [
      ...headers,
      {
        source: "/:path*",
        has: [{ type: "host" as const, value: "app\\..*" }],
        headers: [
          { key: "Content-Security-Policy", value: dashboardPolicy },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },

  async redirects() {
    return [
      ...MOVED_MEDIA.map(({ source, path }) => ({
        source,
        destination: `${MEDIA_ORIGIN}/web${path}`,
        permanent: true,
      })),
    ];
  },

  /**
   * Nothing is optimized by the site itself. The large captures are resized
   * at Cloudflare's edge (`responsiveMedia` in `src/lib/media.ts`); every
   * other picture in the media bucket is exported at about twice the size it
   * is drawn, so `next/image` renders a plain `<img>`.
   */
  images: { unoptimized: true },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
