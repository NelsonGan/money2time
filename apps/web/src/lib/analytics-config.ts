/**
 * PostHog routing shared by the browser client (`analytics.ts`) and server
 * routes (`posthog/server.ts`).
 *
 * The project token is a public, write-only ingestion key (the mobile app ships
 * the same one), so like the GA4 measurement ID it is checked in rather than
 * configured per deployment. The website shares the app's "Money2Time" project
 * (id 658608, US Cloud) so web acquisition and app behaviour sit in one place.
 * `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` can point a deployment at another project.
 */
export const POSTHOG_PROJECT_TOKEN =
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim() ||
  "phc_zDp6LuXmZ7qkXkzHU5pKPPDnMPUK4wDoY8kqs4HRYqxR";

export const POSTHOG_HOST = "https://us.i.posthog.com";
