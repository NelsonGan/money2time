# live-earnings Worker

Pushes the money figure to the app's live-earnings Live Activity, once a minute,
for the life of a session.

## Why this exists

A Live Activity repaints only its **time-derived** views on its own: the elapsed
clock and the progress bar are drawn by iOS from two dates and move with no help
from anyone. The money figure is a plain string, frozen at whatever the last
update carried. On the Lock Screen the app is suspended and cannot run code, so
the only thing left that can move that string is an ActivityKit push.

That is the whole feature. Everything below is plumbing for it.

An ActivityKit push is **not a notification**: no banner, no sound, nothing in
Notification Center, and — the part that makes this acceptable to ship — it
requires **no notification permission at all**. Live Activity delivery is
independent of an app's notification settings, so this works for users who have
denied notifications outright.

## Shape

```
POST /live-earnings/register     { appUserId, pushToken, environment, startedAt, endsAt, hourlyRate, currencySymbol }
POST /live-earnings/unregister   { appUserId, pushToken? }
GET  /health                     { ok, configured }
cron * * * * *                   push every running session, prune the rest
```

`register` is an upsert keyed by the push token, so the app can call it freely:
that one call covers first registration, repair after being offline, and a token
ActivityKit rotated mid-session.

In practice the first call happens on the app's **first transition out of the
foreground**, not when the clock starts. ActivityKit mints the token per
activity and asynchronously, so `Activity.request()` returns before it exists -
measured on a simulator it is still nil seconds later, on an install that has
run sessions before. An early version waited for it and bought nothing but a
Start button that stalled. Leaving the app is the moment before the Lock Screen
is looked at anyway, so nothing is lost.

`unregister` without a token drops every card for the account, which is what a
sign-out wants.

## What the cron does

For each row still running it computes the amount from `(started_at,
hourly_rate)` — money accrues linearly, so the figure at any instant is
arithmetic — and pushes it, unless the formatted figure is identical to the last
one pushed. That skip matters: late in a long session at a modest rate the
amount only changes every few minutes, and each push not sent is one left in
Apple's delivery budget.

A session past its end gets one final `end` event and its row is dropped. A
token APNs rejects as dead (`Unregistered`, `BadDeviceToken`) is dropped
immediately; anything transient (429, 5xx, a rejected provider token) leaves the
row for the next minute.

**The amount is formatted here, not sent from the app.** It has to be, because
the app is asleep — but it also has to match, because the app formats the figure
it pushes on foreground and a user must never see the number change shape
depending on which one got there last. `src/earnings.ts` is a deliberate port of
the app's own helpers, and `__tests__/services/liveEarningsPushContract.test.ts`
in the app imports both sides and fails if they drift.

## Cost, and what bounds it

The cron fires every minute forever, whether or not anyone is tracking. That is
cheap and deliberately so:

- **Invocations.** ~43,800 a month, against 10M included on the paid plan.
- **CPU.** Workers bill CPU time, not wall clock. A window sleeps ~50 seconds
  between ticks and sleeping is not CPU, so a long window costs nothing extra.
  This is worth knowing before the 60-second window looks alarming.
- **D1 when idle.** A window with no sessions does one read and, nine minutes in
  ten, nothing else — the reaper is throttled to one minute in ten precisely so
  an idle deployment is not doing ~43,000 pointless deletes a month.
- **D1 when busy.** One read per window and one write per session that actually
  moved, because the ticks share an in-memory view rather than re-reading and
  re-writing per tick.
- **APNs.** One push per session per tick, skipped entirely when the formatted
  figure has not changed.

Three things bound the blast radius, all of them tested:

1. **A session cannot outlive its own end.** Registration rejects anything
   longer than the 8 hours iOS itself allows, and the reaper drops the row once
   `ends_at` has passed. There is no path to a row that is pushed forever.
2. **A window cannot exceed its subrequest budget.** External subrequests are
   capped per invocation (10,000 paid, **50** free). Rather than assume the
   ceiling, the window scales to it: the tick rate falls as concurrent sessions
   rise, every session keeps its one guaranteed metered push a minute, and both
   the degradation and the point where sessions would be dropped entirely are
   logged. A free-plan deployment must lower `MAX_PUSHES_PER_WINDOW`.
3. **A window cannot overlap the next one.** It stops starting ticks at
   `WINDOW_DEADLINE_MS`, so a slow APNs round trip costs resolution rather than
   doubling every push.

## Security model

Be clear about what the request signature is: a shared secret shipped inside
the app bundle (`EXPO_PUBLIC_REQUEST_SIGNING_KEY`), so it is extractable by
anyone who unpacks the IPA. It raises the cost of casual abuse. It is not
authentication, and nothing here should be designed as though it were.

What that leaves, and why it is acceptable:

- **Registering someone else's card.** Needs a valid ActivityKit push token for
  this app's topic, which cannot be forged and is only ever issued to a real
  install of this app.
- **Registering junk to make the cron work.** Bounded on both axes: rows expire
  with the session (8 hours, hard), and an account keeps at most
  `MAX_SESSIONS_PER_USER` of them. A fabricated token also self-heals in one
  window - APNs answers `BadDeviceToken` and the row is dropped.
- **Unregistering someone else's session.** Possible if their `appUserId` is
  known; it is a v4 UUID that never leaves the device except in these calls.
  The cost is one stopped card, recovered on their next app foreground.
- **What is stored.** Push token, app user id, session window, currency symbol,
  and the user's **hourly rate** - which is salary-derived and the most
  sensitive field here. It is required to compute the figure, it is never
  logged, and it lives at most 8 hours. Nothing else about the user is stored,
  and no transaction data ever reaches this Worker.

Tokens are never written to logs. A dropped token is reported by APNs reason
only.

## Configuration

`APNS_BUNDLE_ID` is a plain var in `wrangler.toml` (the Worker appends the
`.push-type.liveactivity` topic suffix itself). The rest are **secrets**, added
in the dashboard under Settings → Variables and Secrets:

| Secret                           | Where it comes from                                          |
| -------------------------------- | ------------------------------------------------------------ |
| `APNS_KEY_ID`                    | Key ID of the APNs auth key (Apple Developer → Keys)         |
| `APNS_TEAM_ID`                   | Apple Developer Team ID                                      |
| `APNS_PRIVATE_KEY`               | Contents of the `.p8`, PEM, BEGIN/END lines included         |
| `MONEY2TIME_REQUEST_SIGNING_KEY` | Same value as the app's `EXPO_PUBLIC_REQUEST_SIGNING_KEY`    |

The APNs key must be enabled for **Apple Push Notifications service**; one key
serves every app on the team, and the same key works for both gateways.

Until those are set the Worker still accepts registrations and simply does not
push — `GET /health` reports `configured: false`, and each cron tick logs that it
skipped. That is deliberate: a half-configured deploy leaves cards frozen (which
is the old behaviour) rather than dropping sessions on the floor.

## Sandbox vs production

A push token minted by a development build is rejected outright by the
production gateway, and vice versa. The app states which kind of build it is at
registration (`environment`) rather than leaving the Worker to guess or to try
both — so a debug build on a device pushes through `api.sandbox.push.apple.com`
and a TestFlight/App Store build through `api.push.apple.com`.

## Local

```bash
npm run dev        # wrangler dev
npm run typecheck
```

The interesting logic is covered by the **app's** test suite rather than a
runner here — `__tests__/services/liveEarnings{PushContract,Apns,Cron}.test.ts`
import these modules directly, including a real P-256 key to verify the ES256
provider token end to end.
