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
 * sampled far more often than everyday launches. In the two weeks to
 * 2026-11-10 PostHog counted ~16K installs with a first day and ~3,900
 * recordings a month at the earlier 15% and 0.4%, past the allowance: those
 * rates assumed ~6K first days. About a quarter of recordings carry no app
 * event, such as a sampled launch's new session after 30 idle minutes; counted
 * with the launches they came from, these rates come to roughly 1,000
 * first-day + 550 later recordings, leaving headroom for growth.
 */
export const SESSION_REPLAY_NEW_INSTALL_RATE = 0.05;
export const SESSION_REPLAY_RETURNING_RATE = 0.0025;
