import type { MetadataRoute } from "next";

import { routing } from "@/i18n/routing";
import { localeAlternates, localizedUrl, type SeoPath } from "@/lib/seo";
import { TUTORIALS } from "@/lib/tutorials";

type Route = {
  path: SeoPath;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  lastModified: string;
  priority: number;
};

/** Baseline date for tutorials without a newer content update. */
const TUTORIALS_UPDATED = "2026-08-27";
const TUTORIAL_UPDATED_DATES: Record<string, string> = {
  accounts: "2026-10-02",
  review: "2026-10-02",
  recurring: "2026-11-01",
  "split-a-bill": "2026-10-08",
  widgets: "2026-10-02",
};

const routes: Route[] = [
  {
    path: "",
    changeFrequency: "monthly",
    lastModified: "2026-10-20",
    priority: 1,
  },
  {
    path: "/tutorials",
    changeFrequency: "monthly",
    lastModified: "2026-10-02",
    priority: 0.9,
  },
  ...TUTORIALS.map(
    (tutorial): Route => ({
      path: `/tutorials/${tutorial.id}`,
      changeFrequency: "monthly",
      lastModified: TUTORIAL_UPDATED_DATES[tutorial.id] ?? TUTORIALS_UPDATED,
      priority: 0.7,
    }),
  ),
  {
    path: "/cost-in-hours",
    changeFrequency: "monthly",
    lastModified: "2026-08-19",
    priority: 0.8,
  },
  {
    path: "/statements-import",
    changeFrequency: "monthly",
    lastModified: "2026-06-03",
    priority: 0.7,
  },
  {
    path: "/contact",
    changeFrequency: "yearly",
    lastModified: "2026-06-03",
    priority: 0.5,
  },
  {
    path: "/privacy",
    changeFrequency: "yearly",
    lastModified: "2026-10-22",
    priority: 0.3,
  },
  {
    path: "/terms",
    changeFrequency: "yearly",
    lastModified: "2026-06-03",
    priority: 0.3,
  },
  {
    path: "/data-deletion",
    changeFrequency: "yearly",
    lastModified: "2026-10-20",
    priority: 0.3,
  },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.flatMap(({ changeFrequency, lastModified, path, priority }) => {
    return routing.locales.map((locale) => ({
      url: localizedUrl(path, locale),
      lastModified: new Date(`${lastModified}T00:00:00.000Z`),
      changeFrequency,
      priority,
      images:
        path === "" ? [localizedUrl("/opengraph-image", locale)] : undefined,
      alternates: {
        languages: localeAlternates(path),
      },
    }));
  });
}
