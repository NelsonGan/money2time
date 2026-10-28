// The live socket's messages and reconnect timing (services/liveSync.ts),
// kept apart from the socket so they can be tested.

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;

export interface LiveChange {
  /** `personal`, or a shared ledger's share id. */
  channel: string;
  /** `access`: membership or the ledger itself changed, so re-read the list. */
  reason: 'data' | 'access';
  /** Who caused an `access` change, when the Worker says. */
  actor: string | null;
}

/** What a message from the Worker says, or null when it is not a change. */
export function parseLiveMessage(data: unknown): LiveChange | null {
  if (typeof data !== 'string' || data === 'pong') return null;
  try {
    const message = JSON.parse(data) as {
      type?: unknown;
      channel?: unknown;
      reason?: unknown;
      actor?: unknown;
    };
    if (message.type !== 'changed' || typeof message.channel !== 'string') return null;
    return {
      channel: message.channel,
      reason: message.reason === 'access' ? 'access' : 'data',
      actor: typeof message.actor === 'string' ? message.actor : null,
    };
  } catch {
    return null;
  }
}

/** The wait before reconnect attempt `attempt` (0-based), doubling up to a minute. */
export function retryDelay(attempt: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** Math.min(attempt, 10));
}
