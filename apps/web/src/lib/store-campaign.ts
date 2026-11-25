import { APP_STORE_PROVIDER_ID, APP_STORE_URL, PLAY_STORE_URL } from "./app-links.ts";

type StorePlatform = "android" | "ios";

// App Store Connect keeps campaign tokens up to 40 characters.
const CAMPAIGN_TOKEN_LIMIT = 40;
// The source is a short channel name; capping it keeps room for the detail.
const SOURCE_LIMIT = 12;

const truncate = (value: string, limit: number) => Array.from(value).slice(0, limit).join("");

/**
 * The App Store campaign token for a `/download` link's UTM parameters: the
 * source (or medium) and the most specific detail the link has (content, then
 * campaign, id or term), for example `meta-aarontjj7_tng`. App Store Connect's
 * App Analytics counts product page views and downloads under it
 * (Acquisition › Campaigns), so a link's `utm_content` should be unique across
 * campaigns. Any UTM tag yields a token, as any UTM tag yields a Play referrer.
 */
export function appStoreCampaignToken(campaign: URLSearchParams): string | undefined {
  const source = campaign.get("utm_source") || campaign.get("utm_medium");
  const detail =
    campaign.get("utm_content") ||
    campaign.get("utm_campaign") ||
    campaign.get("utm_id") ||
    campaign.get("utm_term");

  const head = source ? truncate(source, SOURCE_LIMIT) : "";
  if (!detail) return head || undefined;
  if (!head) return truncate(detail, CAMPAIGN_TOKEN_LIMIT);
  return `${head}-${truncate(detail, CAMPAIGN_TOKEN_LIMIT - Array.from(head).length - 1)}`;
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
