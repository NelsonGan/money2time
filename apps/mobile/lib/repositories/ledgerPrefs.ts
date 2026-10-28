import { LEDGER_QUICK_ENTRY_KEYS, type LedgerPrefs } from '~/types';

/**
 * How a non-default ledger's own preferences combine with the app-wide JSON
 * blobs on the settings row. Pure, so the settings repository and the Web
 * Dashboard export read a ledger's settings the same way.
 *
 * The settings row's blobs belong to the default ledger. A non-default ledger
 * takes the app-wide parts of them and overlays its own: the quick-entry picks
 * that name its accounts and categories, and the account each payment-alert
 * source logs into. Its own parts are kept in `ledgers.prefs_json`.
 */

/** Quick-entry keys that only ever held a default-ledger id. */
const LEGACY_QUICK_ENTRY_KEYS = ['voiceDefaultAccountId'] as const;

export function parseJsonObject(json: string | null | undefined): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function parseLedgerPrefs(json: string | null | undefined): LedgerPrefs {
  return (parseJsonObject(json) as LedgerPrefs | null) ?? {};
}

/** The quick-entry JSON a non-default ledger reads: app-wide fields, its own picks. */
export function quickEntryJsonForLedger(appJson: string | null, prefs: LedgerPrefs): string {
  const merged = parseJsonObject(appJson) ?? {};
  for (const key of [...LEDGER_QUICK_ENTRY_KEYS, ...LEGACY_QUICK_ENTRY_KEYS]) delete merged[key];
  return JSON.stringify({ ...merged, ...prefs.quickEntry });
}

/**
 * Split a non-default ledger's quick-entry JSON: its own picks, and the app
 * JSON to store, which keeps the default ledger's picks as they were.
 */
export function splitQuickEntryForLedger(
  json: string | null,
  appJson: string | null,
): { own: NonNullable<LedgerPrefs['quickEntry']>; appJson: string } {
  const next = parseJsonObject(json) ?? {};
  const app = parseJsonObject(appJson) ?? {};
  const own: Record<string, unknown> = {};
  for (const key of LEDGER_QUICK_ENTRY_KEYS) {
    if (key in next) own[key] = next[key];
    delete next[key];
    if (key in app) next[key] = app[key];
  }
  return { own: own as NonNullable<LedgerPrefs['quickEntry']>, appJson: JSON.stringify(next) };
}

type SourceMap = Record<string, Record<string, unknown>>;

function sourcesOf(prefs: Record<string, unknown> | null): SourceMap {
  const sources = prefs?.sources;
  return sources && typeof sources === 'object' ? (sources as SourceMap) : {};
}

/** The payment-alert JSON a non-default ledger reads: each source logs into its own pick. */
export function paymentAlertsJsonForLedger(
  appJson: string | null,
  prefs: LedgerPrefs,
): string | null {
  const merged = parseJsonObject(appJson);
  if (!merged) return appJson;
  const own = prefs.paymentAlertAccounts ?? {};
  const sources: SourceMap = {};
  for (const [key, source] of Object.entries(sourcesOf(merged))) {
    sources[key] = { ...source, accountId: own[key] ?? null };
  }
  return JSON.stringify({ ...merged, sources });
}

/**
 * Split a non-default ledger's payment-alert JSON: the account each source
 * logs into in this ledger, and the app JSON to store, where every source
 * keeps the default ledger's account.
 */
export function splitPaymentAlertsForLedger(
  json: string,
  appJson: string | null,
): { own: Record<string, string | null>; appJson: string } {
  const next = parseJsonObject(json) ?? {};
  const appSources = sourcesOf(parseJsonObject(appJson));
  const own: Record<string, string | null> = {};
  const sources: SourceMap = {};
  for (const [key, source] of Object.entries(sourcesOf(next))) {
    own[key] = typeof source.accountId === 'string' ? source.accountId : null;
    const appAccount = appSources[key]?.accountId;
    sources[key] = { ...source, accountId: typeof appAccount === 'string' ? appAccount : null };
  }
  return { own, appJson: JSON.stringify({ ...next, sources }) };
}
