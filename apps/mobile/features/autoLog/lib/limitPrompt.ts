/**
 * The paywall a free member gets after the iOS "Log Card Payment" automation
 * turned a payment away because the free automatic logs were used up.
 *
 * The App Intent runs in the background and cannot open the app, so it records
 * each refused payment in the App Group (`autolog_limit_blocked`, see
 * plugins/withMoney2TimeAutoLog.js) and throws the limit error the Shortcut
 * shows. The next time the app comes to the foreground, `AutoLogLimitPrompt`
 * (components/AutoLogLimitPrompt.tsx) reads that record and opens the paywall
 * (source `autolog`), at most once per `AUTO_LOG_LIMIT_PROMPT_INTERVAL_MS`.
 */

/** What the App Intent recorded: how many payments it refused, and the latest. */
export interface AutoLogLimitBlocked {
  count: number;
  /** ISO-8601 time of the latest refused payment. */
  lastAt: string;
}

/**
 * The paywall shows at most once every 20 hours, however many payments were
 * refused: about once a day, without drifting later each day.
 */
export const AUTO_LOG_LIMIT_PROMPT_INTERVAL_MS = 20 * 60 * 60 * 1000;

/** Parse the App Group record; anything unreadable counts as no record. */
export function parseAutoLogLimitBlockedJson(
  json: string | null | undefined,
): AutoLogLimitBlocked | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const { count, lastAt } = raw as Record<string, unknown>;
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 1) return null;
  if (typeof lastAt !== 'string' || Number.isNaN(Date.parse(lastAt))) return null;
  return { count: Math.floor(count), lastAt };
}

export type AutoLogLimitPromptDecision =
  /** Nothing was refused: nothing to do. */
  | 'none'
  /**
   * Pro now (bought elsewhere, restored), or automatic logs are allowed again
   * (accounts archived under the free limit): the record is stale, drop it.
   */
  | 'clear'
  /** Shown too recently: keep the record for a later foreground. */
  | 'wait'
  /** Open the paywall, then drop the record. */
  | 'prompt';

export function decideAutoLogLimitPrompt(input: {
  isPro: boolean;
  /**
   * Whether a payment would be refused right now: no automatic logs left, or
   * the free account limit blocks it. Omitted counts as still blocked.
   */
  stillBlocked?: boolean;
  blocked: AutoLogLimitBlocked | null;
  /** Epoch-ms the paywall last opened for this reason, or null if never. */
  lastPromptAt: number | null;
  now: number;
}): AutoLogLimitPromptDecision {
  if (!input.blocked) return 'none';
  if (input.isPro || input.stillBlocked === false) return 'clear';
  if (
    input.lastPromptAt !== null &&
    input.now >= input.lastPromptAt &&
    input.now - input.lastPromptAt < AUTO_LOG_LIMIT_PROMPT_INTERVAL_MS
  ) {
    return 'wait';
  }
  return 'prompt';
}
