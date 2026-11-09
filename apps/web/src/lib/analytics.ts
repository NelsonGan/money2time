"use client";

import { isLocale, type Locale } from "@/i18n/routing";
import type { CountryCode } from "@/lib/countries";
import { POSTHOG_HOST, POSTHOG_PROJECT_TOKEN } from "@/lib/analytics-config";
import { isAppHost, isProductionHost, type DownloadTarget } from "@/lib/platform";

/**
 * The website's product-analytics contract, fanned out to PostHog and GA4.
 *
 * The event schema is closed and its call sites only supply bounded product
 * values. Full URL query strings, tutorial-search text, and contact-form fields
 * never become event properties; campaign values are the sole allowlisted URL
 * input and are capped below.
 */

/** A GA4 measurement ID is public routing metadata, not a credential. */
const GA_MEASUREMENT_ID = "G-CV6GQ43B16";

export const EVENTS = {
  appDownloadClicked: "App Download Clicked",
  carouselSlideChanged: "Carousel Slide Changed",
  contactFormResult: "Contact Form Submitted",
  costComparisonChanged: "Cost Comparison Changed",
  dashboardDataReceived: "Dashboard Data Received",
  dashboardEdited: "Dashboard Edited",
  dashboardEntryClicked: "Dashboard Entry Clicked",
  dashboardLinked: "Dashboard Linked",
  dashboardProPromptViewed: "Dashboard Pro Prompt Viewed",
  dashboardUnlinked: "Dashboard Unlinked",
  dashboardViewOpened: "Dashboard View Opened",
  discordLinkClicked: "Discord Link Clicked",
  languageChanged: "Language Changed",
  tutorialAppFallback: "Tutorial App Fallback",
  tutorialOpenInApp: "Tutorial Open In App",
  tutorialSelected: "Tutorial Selected",
  viewPage: "Page Viewed",
} as const;

export type AnalyticsEvent = (typeof EVENTS)[keyof typeof EVENTS];

export type DownloadPlacement =
  | "footer"
  | "header_desktop"
  | "header_mobile"
  | "home_hero";

type PageType =
  | "contact"
  | "cost_in_hours"
  | "dashboard"
  | "data_deletion"
  | "home"
  | "legal"
  | "other"
  | "statements_import"
  | "tutorial"
  | "tutorials";

/**
 * The web dashboard's events describe what a visitor did, never what is in
 * their data: views, linking and whether a transfer opened, with no amounts,
 * names, notes, categories or account details.
 */
/** `patch_unusable`: a patch from the phone did not fit the data here, so everything was asked for again. */
type DashboardLoadResult = "success" | "incomplete" | "corrupt" | "unsupported" | "patch_unusable";

/** What a change made on the dashboard did, and how the phone answered it. */
/** `<entity>_<op>`: `transaction_update`, `account_create`, `goal_archive`, `transaction_bulk_delete`, … */
export type DashboardEditAction = `${string}_${string}`;
type DashboardEditResult =
  | "saved"
  | "stale"
  | "conflict"
  | "amount_locked"
  | "pro_required"
  | "off"
  | "invalid"
  | "failed"
  | "busy"
  | "away"
  | "too_large"
  | "unknown";

/** What opened the dashboard's Pro paywall: a longer period, or a free-plan limit (as the phone names it). */
export type DashboardProFeature =
  | "period"
  | "accounts"
  | "categories"
  | "recurring"
  | "reimbursements"
  | "goals"
  | "loans"
  | "items"
  | "albums"
  | "budget_templates"
  | "split_bills"
  | "subcurrencies"
  | "wage_entries"
  | "other";

type DashboardView =
  | "overview"
  | "cash-flow"
  | "spending"
  | "income"
  | "trends"
  | "calendar"
  | "transactions"
  | "categories"
  | "accounts"
  | "net-worth"
  | "budgets"
  | "recurring"
  | "goals"
  | "time"
  | "trips"
  | "items"
  | "splits"
  | "mood";

type AnalyticsPlan = {
  [EVENTS.appDownloadClicked]: {
    placement: DownloadPlacement;
    target: DownloadTarget;
  };
  [EVENTS.carouselSlideChanged]: {
    index: number;
    method: "dot" | "swipe" | "tap";
    screenshot: string;
  };
  [EVENTS.contactFormResult]: {
    status: "error" | "mailto" | "success";
  };
  [EVENTS.costComparisonChanged]: {
    baseCountry: CountryCode;
    fromCountry: CountryCode;
    toCountry: CountryCode;
  };
  [EVENTS.dashboardDataReceived]: { result: DashboardLoadResult };
  [EVENTS.dashboardEdited]: { action: DashboardEditAction; result: DashboardEditResult; count: number };
  [EVENTS.dashboardEntryClicked]: { placement: "home_section" };
  [EVENTS.dashboardLinked]: Record<string, never>;
  [EVENTS.dashboardProPromptViewed]: { feature: DashboardProFeature };
  [EVENTS.dashboardUnlinked]: { by: "browser" | "phone" };
  [EVENTS.dashboardViewOpened]: { view: DashboardView };
  [EVENTS.discordLinkClicked]: {
    placement: "contact_page" | "footer";
  };
  [EVENTS.languageChanged]: {
    fromLocale: Locale;
    toLocale: Locale;
  };
  [EVENTS.tutorialAppFallback]: { tutorial: string };
  [EVENTS.tutorialOpenInApp]: { tutorial: string };
  [EVENTS.tutorialSelected]: {
    results?: number;
    source: "browse" | "search";
    tutorial: string;
  };
  [EVENTS.viewPage]: { pageType: PageType; path: string };
};

type AnalyticsCall = {
  [Event in AnalyticsEvent]: {
    event: Event;
    properties: AnalyticsPlan[Event];
  };
}[AnalyticsEvent];

type PostHog = (typeof import("posthog-js"))["default"];
type PostHogCapture = { event: string; properties?: Record<string, unknown> };
type GtagParameters = Record<string, boolean | number | string>;

const CAMPAIGN_PARAMETERS = {
  utm_campaign: "campaign_name",
  utm_content: "campaign_content",
  utm_id: "campaign_id",
  utm_medium: "campaign_medium",
  utm_source: "campaign_source",
  utm_term: "campaign_term",
} as const;
const CAMPAIGN_VALUE_LIMIT = 100;
/** Ad click identifiers PostHog would otherwise store as campaign context. */
const CLICK_ID_PARAMETERS = [
  "dclid",
  "fbclid",
  "gad_source",
  "gbraid",
  "gclid",
  "gclsrc",
  "igshid",
  "ko_click_id",
  "li_fat_id",
  "mc_cid",
  "msclkid",
  "rdt_cid",
  "sccid",
  "ttclid",
  "twclid",
  "wbraid",
] as const;
/** PostHog's URL properties, reduced to origin + path before sending. */
const POSTHOG_URL_PROPERTIES = [
  "$current_url",
  "$initial_current_url",
  "$session_entry_url",
] as const;
/** PostHog's referrer properties, reduced like GA4's referrer. */
const POSTHOG_REFERRER_PROPERTIES = [
  "$referrer",
  "$initial_referrer",
  "$session_entry_referrer",
] as const;
const PENDING_LIMIT = 30;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let trackingEnabled = false;
let posthog: PostHog | null = null;
let posthogStarting = false;
let googleConfigured = false;
let previousGooglePage: string | null = null;
let lastPageViewPath: string | null = null;
let lastRegisteredLocale: Locale | null = null;
/** The app user this dashboard reports as, once a linked phone has said. */
let dashboardUserId: string | null = null;
/** The app user the providers were last told about. */
let reportedUserId: string | null = null;

const posthogPending: Array<(client: PostHog) => void> = [];

function isProductionSite(): boolean {
  return (
    typeof window !== "undefined" &&
    isProductionHost(window.location.hostname)
  );
}

function browserDoNotTrack(): boolean {
  if (typeof window === "undefined") return false;

  const flags = [
    window.navigator.doNotTrack,
    (window as { doNotTrack?: string }).doNotTrack,
    (window.navigator as { msDoNotTrack?: string }).msDoNotTrack,
  ];

  return flags.some((flag) => flag === "1" || flag === "yes");
}

/**
 * GA4 runs on every production host, the Web Dashboard included, so its use
 * sits beside the app's in the shared property. It receives only the typed
 * events below (enhanced measurement is off in the property), never the
 * visitor's data, and the dashboard's CSP admits Google's tag for it.
 */
function googleAllowed(): boolean {
  return isProductionSite();
}

export function googleAnalyticsScript(): string | null {
  if (!googleAllowed()) return null;
  return `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
}

function campaignContext(): GtagParameters {
  const context: GtagParameters = {};
  const query = new URLSearchParams(window.location.search);

  for (const [parameter, field] of Object.entries(CAMPAIGN_PARAMETERS)) {
    const value = query.get(parameter);
    if (value) {
      context[field] = Array.from(value)
        .slice(0, CAMPAIGN_VALUE_LIMIT)
        .join("");
    }
  }

  return context;
}

function safeDocumentReferrer(): string | undefined {
  if (typeof document === "undefined" || !document.referrer) return undefined;

  try {
    const referrer = new URL(document.referrer);
    if (!["http:", "https:"].includes(referrer.protocol)) return undefined;

    return isProductionHost(referrer.hostname)
      ? `${referrer.origin}${referrer.pathname}`
      : referrer.origin;
  } catch {
    return undefined;
  }
}

/** `https://host/path` for an http(s) URL, or undefined when unreadable. */
function originAndPath(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

/** Same rule as GA4: a Money2Time path, or only the origin of an external site. */
function safeReferrer(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  if (value === "$direct") return value;
  try {
    const referrer = new URL(value);
    if (!["http:", "https:"].includes(referrer.protocol)) return undefined;
    return isProductionHost(referrer.hostname)
      ? `${referrer.origin}${referrer.pathname}`
      : referrer.origin;
  } catch {
    return undefined;
  }
}

/**
 * PostHog `before_send`: strip query strings and fragments from every URL it
 * records, cut external referrers to their origin, and drop ad click IDs, so
 * PostHog keeps exactly the URL context GA4 does.
 */
function sanitizePostHogEvent<T extends PostHogCapture>(event: T | null): T | null {
  if (!event?.properties) return event;
  const properties: Record<string, unknown> = { ...event.properties };
  for (const key of POSTHOG_URL_PROPERTIES) {
    if (key in properties) properties[key] = originAndPath(properties[key]);
  }
  for (const key of POSTHOG_REFERRER_PROPERTIES) {
    if (key in properties) properties[key] = safeReferrer(properties[key]);
  }
  for (const parameter of CLICK_ID_PARAMETERS) {
    delete properties[parameter];
    delete properties[`$initial_${parameter}`];
  }
  for (const setKey of ["$set", "$set_once"] as const) {
    const set = properties[setKey];
    if (!set || typeof set !== "object") continue;
    const cleaned: Record<string, unknown> = { ...(set as Record<string, unknown>) };
    for (const key of POSTHOG_URL_PROPERTIES) {
      if (key in cleaned) cleaned[key] = originAndPath(cleaned[key]);
    }
    for (const key of POSTHOG_REFERRER_PROPERTIES) {
      if (key in cleaned) cleaned[key] = safeReferrer(cleaned[key]);
    }
    for (const parameter of CLICK_ID_PARAMETERS) {
      delete cleaned[parameter];
      delete cleaned[`$initial_${parameter}`];
    }
    properties[setKey] = cleaned;
  }
  return { ...event, properties };
}

/** The retired Mixpanel client left its state in `mp_*` storage keys. */
function clearRetiredMixpanelStorage(): void {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("mp_")) window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
}

function startPostHog(): void {
  if (!POSTHOG_PROJECT_TOKEN || posthog || posthogStarting) return;

  posthogStarting = true;
  clearRetiredMixpanelStorage();

  void import("posthog-js")
    .then(({ default: loaded }) => {
      if (!trackingEnabled) return;

      loaded.init(POSTHOG_PROJECT_TOKEN, {
        api_host: POSTHOG_HOST,
        ui_host: "https://us.posthog.com",
        // Website visitors are never identified, so their events are
        // anonymous, PostHog's cheapest kind, with no person profiles. A
        // linked dashboard identifies as its phone's app user
        // (`identifyDashboardUser`), so its events, and only its, join that
        // person.
        person_profiles: "identified_only",
        // Only the typed contract below is captured: no autocapture, and page
        // views are sent manually so their URLs can be sanitized.
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        rageclick: false,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        capture_performance: false,
        // Uncaught errors and unhandled rejections go to error tracking, except
        // on the dashboard, where an error message could quote the visitor's
        // own data.
        capture_exceptions: !isPrivatePage(),
        // Recordings follow the project's sample rate and mask every input
        // (the contact form). Network payloads are never recorded, and the
        // web dashboard, which renders a visitor's own finances, never is.
        disable_session_recording: isPrivatePage(),
        session_recording: {
          maskAllInputs: true,
          recordHeaders: false,
          recordBody: false,
        },
        // Flags are an app feature; skipping evaluation here keeps website
        // page loads from ever counting as billable flag requests.
        advanced_disable_feature_flags: true,
        // The dashboard needs nothing from remote config (it records nothing),
        // and loading no outside script keeps PostHog site apps off the page
        // that holds the visitor's data; its CSP would block them anyway.
        advanced_disable_flags: isPrivatePage(),
        disable_external_dependency_loading: isPrivatePage(),
        disable_surveys: true,
        disable_product_tours: true,
        disable_conversations: true,
        disable_web_experiments: true,
        respect_dnt: true,
        // The dashboard keeps PostHog's state in its own host's storage, not
        // the cookie the marketing site shares across money2time.com, so its
        // identified user never follows the browser onto the marketing pages.
        persistence: isPrivatePage() ? "localStorage" : "localStorage+cookie",
        before_send: sanitizePostHogEvent,
      });

      // UTM parameters are recorded by PostHog itself (`utm_*`); click IDs
      // are removed by `sanitizePostHogEvent`.
      posthog = loaded;
      for (const call of posthogPending.splice(0)) call(loaded);
    })
    .catch(() => {
      posthogPending.length = 0;
    })
    .finally(() => {
      posthogStarting = false;
    });
}

function gtag(...args: unknown[]): void {
  if (typeof window === "undefined") return;
  window.dataLayer ??= [];
  window.gtag ??= function googleTagCommand() {
    // gtag.js consumes the function's array-like Arguments object.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };
  window.gtag(...args);
}

function startGoogleAnalytics(): void {
  if (!googleAllowed() || googleConfigured) return;

  // Match the mobile app: analytics is enabled, advertising data is not.
  gtag("consent", "default", {
    ad_personalization: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    analytics_storage: "granted",
  });
  gtag("js", new Date());

  const referrer = safeDocumentReferrer();
  gtag("config", GA_MEASUREMENT_ID, {
    allow_ad_personalization_signals: false,
    allow_google_signals: false,
    // The dashboard's GA4 client ID stays on its own host, so the marketing
    // site visited in the same browser is never tied to its app user.
    ...(isPrivatePage() ? { cookie_domain: "none" } : {}),
    ...(isPrivatePage() && dashboardUserId ? { user_id: dashboardUserId } : {}),
    cookie_flags: "SameSite=Lax;Secure",
    page_location: `${window.location.origin}${window.location.pathname}`,
    ...(referrer ? { page_referrer: referrer } : {}),
    ...campaignContext(),
    send_page_view: false,
  });
  googleConfigured = true;
}

/** Safe to call repeatedly. Already-started providers remain started. */
export function startAnalytics(): boolean {
  if (!isProductionSite() || browserDoNotTrack()) return false;

  trackingEnabled = true;
  if (isPrivatePage()) dashboardUserId ??= readStoredDashboardUser();
  startGoogleAnalytics();
  startPostHog();
  reportDashboardUser();
  return true;
}

function withPostHog(call: (client: PostHog) => void): void {
  if (!trackingEnabled || !POSTHOG_PROJECT_TOKEN) return;

  if (posthog) {
    call(posthog);
    return;
  }

  if (!posthogStarting || posthogPending.length >= PENDING_LIMIT) return;
  posthogPending.push(call);
}

function googleEvent(call: AnalyticsCall): {
  name: string;
  parameters: GtagParameters;
} {
  switch (call.event) {
    case EVENTS.viewPage: {
      const page = `${window.location.origin}${call.properties.path}`;
      const referrer = previousGooglePage ?? safeDocumentReferrer();
      previousGooglePage = page;

      return {
        name: "page_view",
        parameters: {
          content_group: call.properties.pageType,
          page_location: page,
          page_title: document.title,
          ...(referrer ? { page_referrer: referrer } : {}),
        },
      };
    }
    case EVENTS.appDownloadClicked:
      return {
        // A desktop /download CTA returns to the home page instead of opening
        // a store. Keep that intent visible without inflating the store-click
        // key event.
        name:
          call.properties.target === "none"
            ? "m2t_download_cta_clicked"
            : "m2t_app_download_clicked",
        parameters: {
          placement: call.properties.placement,
          target: call.properties.target,
        },
      };
    case EVENTS.carouselSlideChanged:
      return {
        name: "m2t_carousel_slide_changed",
        parameters: {
          mode: call.properties.method,
          position: call.properties.index + 1,
          screenshot: call.properties.screenshot,
        },
      };
    case EVENTS.contactFormResult:
      return {
        name: "m2t_contact_form_result",
        parameters: { form_status: call.properties.status },
      };
    case EVENTS.costComparisonChanged:
      return {
        name: "m2t_cost_comparison_changed",
        parameters: {
          base_country: call.properties.baseCountry,
          compare_from: call.properties.fromCountry,
          compare_to: call.properties.toCountry,
        },
      };
    case EVENTS.dashboardDataReceived:
      return {
        name: "m2t_dashboard_data_received",
        parameters: { result: call.properties.result },
      };
    case EVENTS.dashboardEdited:
      return {
        name: "m2t_dashboard_edited",
        parameters: { action: call.properties.action, result: call.properties.result, count: call.properties.count },
      };
    case EVENTS.dashboardEntryClicked:
      return {
        name: "m2t_dashboard_entry_clicked",
        parameters: { placement: call.properties.placement },
      };
    case EVENTS.dashboardLinked:
      return { name: "m2t_dashboard_linked", parameters: {} };
    case EVENTS.dashboardProPromptViewed:
      return { name: "m2t_dashboard_pro_prompt_viewed", parameters: { feature: call.properties.feature } };
    case EVENTS.dashboardUnlinked:
      return { name: "m2t_dashboard_unlinked", parameters: { by: call.properties.by } };
    case EVENTS.dashboardViewOpened:
      return {
        name: "m2t_dashboard_view_opened",
        parameters: { view: call.properties.view },
      };
    case EVENTS.discordLinkClicked:
      return {
        name: "m2t_discord_link_clicked",
        parameters: { placement: call.properties.placement },
      };
    case EVENTS.languageChanged:
      return {
        name: "m2t_language_changed",
        parameters: {
          locale_from: call.properties.fromLocale,
          locale_to: call.properties.toLocale,
        },
      };
    case EVENTS.tutorialAppFallback:
      return {
        name: "m2t_tutorial_app_fallback",
        parameters: { tutorial: call.properties.tutorial },
      };
    case EVENTS.tutorialOpenInApp:
      return {
        name: "m2t_tutorial_open_in_app",
        parameters: { tutorial: call.properties.tutorial },
      };
    case EVENTS.tutorialSelected:
      return {
        name: "select_content",
        parameters: {
          content_id: call.properties.tutorial,
          content_type: "tutorial",
          source: call.properties.source,
          ...(call.properties.results === undefined
            ? {}
            : { results: call.properties.results }),
        },
      };
  }
}

function postHogEvent(call: AnalyticsCall): {
  name: string;
  properties: Record<string, boolean | number | string>;
} | null {
  switch (call.event) {
    case EVENTS.viewPage:
      return null;
    case EVENTS.appDownloadClicked:
      return {
        name: call.event,
        properties: {
          placement: call.properties.placement,
          target: call.properties.target,
        },
      };
    case EVENTS.carouselSlideChanged:
      return {
        name: call.event,
        properties: {
          method: call.properties.method,
          position: call.properties.index + 1,
          screenshot: call.properties.screenshot,
        },
      };
    case EVENTS.contactFormResult:
      return { name: call.event, properties: { status: call.properties.status } };
    case EVENTS.costComparisonChanged:
      return {
        name: call.event,
        properties: {
          base_country: call.properties.baseCountry,
          compare_from: call.properties.fromCountry,
          compare_to: call.properties.toCountry,
        },
      };
    case EVENTS.dashboardDataReceived:
      return { name: call.event, properties: { result: call.properties.result } };
    case EVENTS.dashboardEdited:
      return {
        name: call.event,
        properties: { action: call.properties.action, result: call.properties.result, count: call.properties.count },
      };
    case EVENTS.dashboardEntryClicked:
      return { name: call.event, properties: { placement: call.properties.placement } };
    case EVENTS.dashboardLinked:
      return { name: call.event, properties: {} };
    case EVENTS.dashboardProPromptViewed:
      return { name: call.event, properties: { feature: call.properties.feature } };
    case EVENTS.dashboardUnlinked:
      return { name: call.event, properties: { by: call.properties.by } };
    case EVENTS.dashboardViewOpened:
      return { name: call.event, properties: { view: call.properties.view } };
    case EVENTS.discordLinkClicked:
      return {
        name: call.event,
        properties: { placement: call.properties.placement },
      };
    case EVENTS.languageChanged:
      return {
        name: call.event,
        properties: {
          locale_from: call.properties.fromLocale,
          locale_to: call.properties.toLocale,
        },
      };
    case EVENTS.tutorialAppFallback:
    case EVENTS.tutorialOpenInApp:
      return { name: call.event, properties: { tutorial: call.properties.tutorial } };
    case EVENTS.tutorialSelected:
      return {
        name: call.event,
        properties: {
          source: call.properties.source,
          tutorial: call.properties.tutorial,
          ...(call.properties.results === undefined
            ? {}
            : { results: call.properties.results }),
        },
      };
  }
}

function sendGoogle(call: AnalyticsCall): void {
  if (!trackingEnabled || !isProductionSite()) return;
  const event = googleEvent(call);

  gtag("event", event.name, {
    page_location:
      previousGooglePage ??
      `${window.location.origin}${window.location.pathname}`,
    send_to: GA_MEASUREMENT_ID,
    ...event.parameters,
  });

  if (
    call.event === EVENTS.contactFormResult &&
    call.properties.status === "success"
  ) {
    gtag("event", "generate_lead", {
      lead_source: "contact_form",
      page_location:
        previousGooglePage ??
        `${window.location.origin}${window.location.pathname}`,
      send_to: GA_MEASUREMENT_ID,
    });
  }
}

export function registerLocale(locale: Locale): void {
  if (!trackingEnabled || locale === lastRegisteredLocale) return;
  lastRegisteredLocale = locale;

  withPostHog((client) => client.register({ site_locale: locale }));
  if (isProductionSite()) {
    // Reuse the mobile app's existing user-scoped `locale` definition so the
    // property can compare app and website audiences without parallel fields.
    gtag("set", "user_properties", { locale });
    gtag("set", { language: locale });
  }
}

/** The app's own user IDs (`m2t_<uuid>`); anything else is not sent anywhere. */
const APP_USER_ID = /^m2t_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/**
 * The dashboard's app user, kept in the app host's own storage (like PostHog's
 * state there), so a visit's first GA4 page view already carries it.
 */
const DASHBOARD_USER_KEY = "m2t_dashboard_user";

function readStoredDashboardUser(): string | null {
  try {
    const value = window.localStorage.getItem(DASHBOARD_USER_KEY);
    return value && APP_USER_ID.test(value) ? value : null;
  } catch {
    return null;
  }
}

function storeDashboardUser(appUserId: string | null): void {
  try {
    if (appUserId) window.localStorage.setItem(DASHBOARD_USER_KEY, appUserId);
    else window.localStorage.removeItem(DASHBOARD_USER_KEY);
  } catch {
    // Storage can be unavailable; the next transfer identifies again.
  }
}

/**
 * Report this dashboard's events as the linked phone's app user: the same
 * PostHog person (one `$identify` per browser; the SDK skips a repeat) and the
 * same GA4 User-ID as the app. Called whenever the phone's data arrives or a
 * kept copy is shown, so it holds across visits. A phone whose app predates
 * the ID sends none and the browser stays anonymous.
 */
export function identifyDashboardUser(appUserId: unknown): void {
  if (typeof appUserId !== "string" || !APP_USER_ID.test(appUserId)) return;
  dashboardUserId = appUserId;
  storeDashboardUser(appUserId);
  // A kept copy can be shown before analytics starts; it reports then.
  reportDashboardUser();
}

function reportDashboardUser(): void {
  const appUserId = dashboardUserId;
  if (!trackingEnabled || !appUserId || appUserId === reportedUserId) return;
  reportedUserId = appUserId;
  withPostHog((client) => {
    if (client.get_distinct_id() !== appUserId) client.identify(appUserId);
  });
  gtag("set", { user_id: appUserId });
}

/**
 * The browser was unlinked: later events are anonymous again, under a new
 * PostHog ID, so the next phone linked here is not merged with this one.
 */
export function resetDashboardUser(): void {
  dashboardUserId = null;
  storeDashboardUser(null);
  if (!trackingEnabled) return;
  reportedUserId = null;
  withPostHog((client) => {
    if (client.get_property("$user_state") !== "identified") return;
    client.reset();
    // `reset` clears super properties too.
    if (lastRegisteredLocale) client.register({ site_locale: lastRegisteredLocale });
  });
  gtag("set", { user_id: null });
}

export function track<Event extends AnalyticsEvent>(
  event: Event,
  properties: AnalyticsPlan[Event],
): void {
  if (!trackingEnabled) return;

  if (event === EVENTS.viewPage) {
    const page = properties as AnalyticsPlan[typeof EVENTS.viewPage];
    if (page.path === lastPageViewPath) return;
    lastPageViewPath = page.path;
  }

  const call = { event, properties } as AnalyticsCall;

  if (event === EVENTS.viewPage) {
    const page = properties as AnalyticsPlan[typeof EVENTS.viewPage];
    withPostHog((client) =>
      client.capture("$pageview", {
        $current_url: `${window.location.origin}${page.path}`,
        page_type: page.pageType,
      }),
    );
  } else {
    const planned = postHogEvent(call);
    if (planned) {
      withPostHog((client) => client.capture(planned.name, planned.properties));
    }
  }

  sendGoogle(call);
}

/** Send the PostHog half immediately, by beacon, when the interaction leaves the page. */
export function trackLeaving<Event extends AnalyticsEvent>(
  event: Event,
  properties: AnalyticsPlan[Event],
): void {
  if (!trackingEnabled) return;
  const call = { event, properties } as AnalyticsCall;
  const planned = postHogEvent(call);

  if (planned) {
    withPostHog((client) =>
      client.capture(planned.name, planned.properties, {
        send_instantly: true,
        transport: "sendBeacon",
      }),
    );
  }

  sendGoogle(call);
}

/**
 * Pages that render a visitor's own data. The dashboard draws balances,
 * transactions and notes from the visitor's backup, so session replay must
 * never capture it.
 */
function isPrivatePage(): boolean {
  return pageTypeOf(window.location.pathname, window.location.hostname) === "dashboard";
}

export function pageTypeOf(pathname: string, hostname?: string): PageType {
  // Every path on the app host is the dashboard (see src/proxy.ts).
  if (hostname && isAppHost(hostname)) return "dashboard";
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] && isLocale(segments[0])) segments.shift();

  const [first, second] = segments;
  if (!first) return "home";
  if (first === "tutorials") return second ? "tutorial" : "tutorials";
  if (first === "cost-in-hours") return "cost_in_hours";
  if (first === "dashboard") return "dashboard";
  if (first === "statements-import") return "statements_import";
  if (first === "contact") return "contact";
  if (first === "data-deletion") return "data_deletion";
  if (first === "privacy" || first === "terms") return "legal";
  return "other";
}
