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
 * sampled far more often than everyday launches. At ~38K first-day launches
 * (~19K installs) and ~375K later launches a month this is roughly
 * 1,500 + 560 recordings, leaving headroom for growth.
 */
export const SESSION_REPLAY_NEW_INSTALL_RATE = 0.04;
export const SESSION_REPLAY_RETURNING_RATE = 0.0015;
