import { after, NextResponse, type NextRequest } from "next/server";

import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/app-links";
import { trackServerEvent } from "@/lib/posthog/server";
import {
  isProductionHost,
  mobilePlatformFromUserAgent,
} from "@/lib/platform";

const storeUrls = {
  android: PLAY_STORE_URL,
  ios: APP_STORE_URL,
} as const;

const UTM_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_id",
  "utm_term",
] as const;
const UTM_VALUE_LIMIT = 100;

export const dynamic = "force-dynamic";

function campaignParameters(searchParams: URLSearchParams): URLSearchParams {
  const campaign = new URLSearchParams();

  for (const parameter of UTM_PARAMS) {
    const value = searchParams.get(parameter);
    if (value) {
      campaign.set(
        parameter,
        Array.from(value).slice(0, UTM_VALUE_LIMIT).join(""),
      );
    }
  }

  return campaign;
}

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
  const campaign = campaignParameters(searchParams);
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

  const destination = platform ? storeUrls[platform] : homeUrl.toString();

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
