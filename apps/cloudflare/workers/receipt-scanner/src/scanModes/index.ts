// Router for the scan modes (./quick, ./itemized, ./screenshot). Preps the
// shared inputs (categories, currency, and — screenshot only — account names)
// and dispatches to exactly one mode.

import {
  compilePrompt,
  NO_ACCOUNTS_SECTION,
  PROMPT_NAMES,
  type PromptEnv,
  type ResolvedPrompt,
  resolvePrompt,
} from '../prompts';
import { ITEMIZED_MAX_TOKENS } from './itemized';
import { QUICK_MAX_TOKENS } from './quick';
import { SCREENSHOT_MAX_TOKENS } from './screenshot';

export type { ScannedReceiptDetail, ScannedReceiptItem } from './itemized';
export { normalizeReceiptDetail } from './itemized';

// Fallback category list when the app sends none (mirrors the app's 8 defaults).
const DEFAULT_EXPENSE_CATEGORIES = [
  'Food',
  'Groceries',
  'Transport',
  'Housing',
  'Bills',
  'Healthcare',
  'Shopping',
  'Other',
];

/** A valid 3-letter ISO-ish currency code, uppercased; falls back to USD. */
function normalizeCurrencyCode(currency: string): string {
  return typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency.trim())
    ? currency.trim().toUpperCase()
    : 'USD';
}

export type ScanMode = 'quick' | 'itemized' | 'screenshot';

/** De-dupe, trim, and keep a clean comma list for the model. */
function toAllowedLine(list: string[]): string {
  return Array.from(new Set(list.map((c) => String(c).trim()).filter(Boolean))).join(', ');
}

export interface BuiltPrompt {
  /** The whole prompt: `shared` followed by `personal`. */
  text: string;
  /** The part every user is sent word for word, which Claude caches once for all of them. */
  shared: string;
  /**
   * This user's settings (currency, categories, accounts); empty when the
   * template has no shareable part, and `shared` is then the whole prompt.
   */
  personal: string;
  /** The mode's main prompt, for `$ai_prompt_name` / `$ai_prompt_version`. */
  prompt: ResolvedPrompt;
}

/**
 * Where a template's per-user part starts. Everything above it is the same for
 * every user, so Claude's prompt cache can hold it once for all of them; a
 * template without it (an older hosted version) is cached per user as a whole.
 */
export const USER_SETTINGS_HEADING = "## This user's settings";

/**
 * The compiled prompt, split where the template's per-user part starts. A
 * template whose part above the heading is blank or fills in a variable (a
 * hosted edit that put the currency back in the schema, say) has nothing every
 * user shares, so it is treated like one without the heading: cached whole and
 * per user, rather than an hour-long cache write per user that nobody reads,
 * or an empty block Anthropic rejects.
 */
function built(
  template: string,
  variables: Record<string, string>,
  prompt: ResolvedPrompt,
): BuiltPrompt {
  const text = compilePrompt(template, variables);
  const at = template.indexOf(USER_SETTINGS_HEADING);
  const shared = at < 0 ? '' : template.slice(0, at);
  if (!shared.trim() || compilePrompt(shared, variables) !== shared) {
    return { text, shared: text, personal: '', prompt };
  }
  return { text, shared, personal: compilePrompt(template.slice(at), variables), prompt };
}

// Build the prompt for `mode` from its PostHog-hosted template (bundled copy as
// fallback). `accounts` feeds screenshot detection; other modes ignore it.
export async function buildReceiptPrompt(
  env: PromptEnv,
  categories: string[],
  currency: string,
  mode: ScanMode = 'quick',
  accounts: string[] = [],
): Promise<BuiltPrompt> {
  const list =
    Array.isArray(categories) && categories.length > 0 ? categories : DEFAULT_EXPENSE_CATEGORIES;
  const variables: Record<string, string> = {
    allowed_categories: toAllowedLine(list),
    currency_code: normalizeCurrencyCode(currency),
  };

  if (mode === 'screenshot') {
    const accountsLine = toAllowedLine(Array.isArray(accounts) ? accounts : []);
    const [main, accountsPrompt] = await Promise.all([
      resolvePrompt(env, PROMPT_NAMES.screenshot),
      accountsLine ? resolvePrompt(env, PROMPT_NAMES.screenshotAccounts) : Promise.resolve(null),
    ]);
    // No account list to match against: pin `account` to "" and drop the
    // matching section rather than invite a free-text guess the app can't use.
    variables.accounts_section = accountsPrompt
      ? compilePrompt(accountsPrompt.template, { allowed_accounts: accountsLine })
      : NO_ACCOUNTS_SECTION;
    return built(main.template, variables, main);
  }

  const prompt = await resolvePrompt(
    env,
    mode === 'itemized' ? PROMPT_NAMES.itemized : PROMPT_NAMES.quick,
  );
  return built(prompt.template, variables, prompt);
}

/** The output-token budget for `mode` (each path owns its own). */
export function maxTokensForMode(mode: ScanMode): number {
  if (mode === 'itemized') return ITEMIZED_MAX_TOKENS;
  if (mode === 'screenshot') return SCREENSHOT_MAX_TOKENS;
  return QUICK_MAX_TOKENS;
}
