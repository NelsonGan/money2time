import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      /*
       * `/download` redirects by user agent, so there is nothing at the end of
       * it to index — yet it sits in the header of every page in all 32
       * locales, making it the most-linked URL here. It also cannot be cached
       * (`force-dynamic`, plus an analytics event per visit), so each crawl
       * costs a cold invocation and a phantom download event.
       *
       * Disallow rather than `nofollow`: `nofollow` only stops authority
       * passing along the link, not the fetch, and the fetch is the cost.
       */
      disallow: "/download",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
