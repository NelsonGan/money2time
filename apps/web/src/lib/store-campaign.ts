import { APP_STORE_PROVIDER_ID, APP_STORE_URL, PLAY_STORE_URL } from "./app-links.ts";

type StorePlatform = "android" | "ios";

// App Store Connect keeps campaign tokens up to 40 characters.
const CAMPAIGN_TOKEN_LIMIT = 40;

/**
 * The App Store campaign token for a `/download` link's UTM parameters: the
 * source and the most specific of content or campaign, for example
 * `meta-aarontjj7_tng`. App Store Connect's App Analytics counts product page
 * views and downloads under it (Acquisition › Campaigns).
 */
export function appStoreCampaignToken(campaign: URLSearchParams): string | undefined {
  const source = campaign.get("utm_source");
  const detail = campaign.get("utm_content") ?? campaign.get("utm_campaign");
  const token = [source, detail].filter(Boolean).join("-");
  return token ? Array.from(token).slice(0, CAMPAIGN_TOKEN_LIMIT).join("") : undefined;
}

/**
 * The store a `/download` visitor is sent to, carrying the link's campaign so
 * the store can count the installs it brings: App Store Connect reads `pt` and
 * `ct`, and Google Play reads the UTM parameters in `referrer`. A link without
 * UTM parameters goes to the plain store page.
 */
export function storeUrlForCampaign(platform: StorePlatform, campaign: URLSearchParams): string {
  if (platform === "android") {
    if (!campaign.size) return PLAY_STORE_URL;
    const url = new URL(PLAY_STORE_URL);
    url.searchParams.set("referrer", campaign.toString());
    return url.toString();
  }

  const token = appStoreCampaignToken(campaign);
  if (!token) return APP_STORE_URL;
  const url = new URL(APP_STORE_URL);
  url.searchParams.set("pt", APP_STORE_PROVIDER_ID);
  url.searchParams.set("ct", token);
  url.searchParams.set("mt", "8");
  return url.toString();
}
