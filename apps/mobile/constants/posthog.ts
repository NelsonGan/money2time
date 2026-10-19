/**
 * PostHog project routing for the app.
 *
 * The project token is a public, write-only ingestion key: it ships inside every
 * client anyway and cannot read data, so it is checked in like the website's
 * GA4 measurement ID rather than kept in an environment variable. An
 * `EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN` override exists for pointing a local build
 * at another project. The project is "Money2Time" (id 658608) on US Cloud.
 */
export const POSTHOG_PROJECT_TOKEN =
  process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim() ||
  'phc_zDp6LuXmZ7qkXkzHU5pKPPDnMPUK4wDoY8kqs4HRYqxR';

export const POSTHOG_HOST = 'https://us.i.posthog.com';

/**
 * Session replay sampling, decided once per app launch by the app itself (see
 * `startSessionReplayForLaunch`). The free tier allows 2,500 mobile recordings
 * a month (the website's 5,000 are a separate allowance), so launches on an
 * install's first day, when onboarding happens and replays teach the most, are
 * sampled far more often than everyday launches. PostHog measured ~6K
 * first-day launches and, once every install runs this build, ~150K later
 * launches a month (week of 2026-10-12), so this is roughly 900 + 600
 * recordings, leaving headroom for growth. The earlier 4% and 0.15%, set from
 * Mixpanel's install count, recorded about 300 a month.
 */
export const SESSION_REPLAY_NEW_INSTALL_RATE = 0.15;
export const SESSION_REPLAY_RETURNING_RATE = 0.004;
