import assert from "node:assert/strict";
import { test } from "node:test";

import { APP_STORE_URL, PLAY_STORE_URL } from "./app-links.ts";
import { appStoreCampaignToken, storeUrlForCampaign } from "./store-campaign.ts";

// A `/download` link's UTM parameters travel on to the store, so each store
// can count the installs a campaign brings.

const ad = new URLSearchParams({
  utm_source: "meta",
  utm_medium: "paid_social",
  utm_campaign: "creator_reels_nov2026",
  utm_content: "aarontjj7_tng",
});

test("the App Store link carries the provider, a campaign token and the app medium", () => {
  const url = new URL(storeUrlForCampaign("ios", ad));
  assert.equal(`${url.origin}${url.pathname}`, APP_STORE_URL);
  assert.equal(url.searchParams.get("pt"), "128646860");
  assert.equal(url.searchParams.get("ct"), "meta-aarontjj7_tng");
  assert.equal(url.searchParams.get("mt"), "8");
});

test("the campaign token falls back to the campaign, then the source, and keeps to 40 characters", () => {
  assert.equal(appStoreCampaignToken(new URLSearchParams({ utm_source: "threads", utm_campaign: "launch" })), "threads-launch");
  assert.equal(appStoreCampaignToken(new URLSearchParams({ utm_source: "xiaohongshu" })), "xiaohongshu");
  assert.equal(appStoreCampaignToken(new URLSearchParams({ utm_content: "a".repeat(60) }))?.length, 40);
  assert.equal(appStoreCampaignToken(new URLSearchParams()), undefined);
});

test("a long source never crowds out the detail", () => {
  const token = appStoreCampaignToken(new URLSearchParams({ utm_source: "s".repeat(39), utm_content: "ad1" }));
  assert.equal(token, `${"s".repeat(12)}-ad1`);
  const long = appStoreCampaignToken(new URLSearchParams({ utm_source: "meta", utm_content: "c".repeat(60) }));
  assert.equal(long?.length, 40);
  assert.ok(long?.startsWith("meta-c"));
});

test("any UTM tag gives an App Store token, as it gives a Play referrer", () => {
  assert.equal(appStoreCampaignToken(new URLSearchParams({ utm_id: "123", utm_medium: "paid_social" })), "paid_social-123");
  assert.equal(appStoreCampaignToken(new URLSearchParams({ utm_term: "budget" })), "budget");
  const url = new URL(storeUrlForCampaign("ios", new URLSearchParams({ utm_medium: "email" })));
  assert.equal(url.searchParams.get("ct"), "email");
});

test("the Play link carries the UTM parameters as its install referrer", () => {
  const url = new URL(storeUrlForCampaign("android", ad));
  assert.equal(url.searchParams.get("id"), "com.nelsongan.money2time");
  assert.equal(url.searchParams.get("referrer"), ad.toString());
});

test("a link without a campaign goes to the plain store page", () => {
  assert.equal(storeUrlForCampaign("ios", new URLSearchParams()), APP_STORE_URL);
  assert.equal(storeUrlForCampaign("android", new URLSearchParams()), PLAY_STORE_URL);
});
