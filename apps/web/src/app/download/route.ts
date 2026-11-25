import { after, NextResponse, type NextRequest } from "next/server";

import { trackServerEvent } from "@/lib/posthog/server";
import {
  isProductionHost,
  mobilePlatformFromUserAgent,
} from "@/lib/platform";
import { campaignFromQuery, storeUrlForCampaign } from "@/lib/store-campaign";

export const dynamic = "force-dynamic";

function requestReferrer(request: NextRequest): URL | undefined {
  const value = request.headers.get("referer");
  if (!value) return undefined;

  try {
    const referrer = new URL(value);
    if (!["http:", "https:"].includes(referrer.protocol)) return undefined;
    return referrer;
  } catch {
    return undefined;
  }
}

function safeReferrer(referrer: URL | undefined): string | undefined {
  if (!referrer) return undefined;
  return isProductionHost(referrer.hostname)
    ? `${referrer.origin}${referrer.pathname}`
    : referrer.origin;
}

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const campaign = campaignFromQuery(searchParams);
  const platform = mobilePlatformFromUserAgent(
    request.headers.get("user-agent"),
  );
  const referrer = requestReferrer(request);
  const doNotTrack = request.headers.get("dnt") === "1";

  // Everything that is not a phone or tablet lands on the home page, where the
  // proxy picks the locale and both store buttons are shown. The query string
  // rides along so the campaign is still visible to client-side tracking.
  // Any parameter outside the explicit campaign allowlist is dropped.
  const homeUrl = new URL("/", request.url);
  homeUrl.search = campaign.toString();

  // Phones go to their store with the campaign attached, so App Store Connect
  // and Play Console can count the installs each campaign brings.
  const destination = platform
    ? storeUrlForCampaign(platform, campaign)
    : homeUrl.toString();

  // Rendered-site CTAs already emit one client event with the browser's stable
  // anonymous identity. Keep this server event only for direct/external links,
  // which never render a page on which either analytics client can run.
  if (
    !doNotTrack &&
    isProductionHost(request.nextUrl.hostname) &&
    !isProductionHost(referrer?.hostname ?? "")
  ) {
    after(async () => {
      // No browser session to attach to on a redirect, so every visit is its
      // own anonymous device.
      await trackServerEvent("Download Link Visited", crypto.randomUUID(), {
        $referrer: safeReferrer(referrer),
        destination: platform ?? "home",
        path: "/download",
        platform: platform ?? "other",
        ...Object.fromEntries(campaign),
      });
    });
  }

  const response = NextResponse.redirect(destination, 307);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
