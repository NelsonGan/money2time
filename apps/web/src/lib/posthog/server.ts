import { POSTHOG_HOST, POSTHOG_PROJECT_TOKEN } from "@/lib/analytics-config";

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const CAPTURE_URL = `${POSTHOG_HOST}/i/v0/e/`;

export type ServerEventProperties = Record<
  string,
  string | number | boolean | undefined
>;

/**
 * Sends an event straight to the PostHog capture API. Needed for routes that
 * never reach the browser — a redirect has no page for `posthog-js` to run on.
 * Every server event is anonymous (`$process_person_profile: false`), the
 * cheapest kind, and carries no IP address. Never throws: analytics must not
 * break the response.
 */
export async function trackServerEvent(
  event: string,
  distinctId: string,
  properties: ServerEventProperties,
): Promise<void> {
  if (!POSTHOG_PROJECT_TOKEN) {
    if (!IS_PRODUCTION) {
      console.warn("PostHog project token is missing!");
    }
    return;
  }

  const definedProperties = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  );

  try {
    const response = await fetch(CAPTURE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        api_key: POSTHOG_PROJECT_TOKEN,
        event,
        distinct_id: distinctId,
        timestamp: new Date().toISOString(),
        properties: {
          ...definedProperties,
          $process_person_profile: false,
          // The server request's own IP is Cloudflare's, never the visitor's;
          // skip GeoIP so it is not mistaken for theirs.
          $geoip_disable: true,
          $lib: "money2time-web-server",
        },
      }),
    });

    if (!response.ok) {
      console.error(
        "Error tracking server event:",
        event,
        response.status,
        await response.text(),
      );
    }
  } catch (error) {
    console.error("Error tracking server event:", event, error);
  }
}
