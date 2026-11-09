import type { MetadataRoute } from "next";

import { SITE_NAME } from "@/lib/seo";
import { media } from "@/lib/media";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} - Expense Tracker`,
    short_name: SITE_NAME,
    description:
      "An expense tracker that turns every purchase into hours of your life.",
    start_url: "/",
    display: "standalone",
    background_color: "#F8F3EA",
    theme_color: "#B65F48",
    icons: [
      {
        src: media("/icon.png"),
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/favicon.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
  };
}
