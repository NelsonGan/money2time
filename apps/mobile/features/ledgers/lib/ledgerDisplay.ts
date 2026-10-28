import { DEFAULT_LEDGER_ID } from '~/lib/db/ledgerScope';
import { I18n } from '~/lib/i18n';
import type { Ledger } from '~/types';

/** Icon a ledger shows until the user picks one, in the category icon grammar. */
const DEFAULT_LEDGER_ICON = 'emoji:🏠';
const NEW_LEDGER_ICON = 'emoji:💼';

/** The name to show: the default ledger is "Main" until renamed. */
export function ledgerDisplayName(ledger: Pick<Ledger, 'id' | 'name'>): string {
  if (ledger.name) return ledger.name;
  return ledger.id === DEFAULT_LEDGER_ID
    ? I18n.t('ledgers.default_name')
    : I18n.t('ledgers.untitled');
}

/** The icon to show, a tagged icon value for `CategoryEmoji`. */
export function ledgerIcon(ledger: Pick<Ledger, 'id' | 'emoji'> | null): string {
  if (ledger?.emoji) return ledger.emoji;
  return ledger?.id === DEFAULT_LEDGER_ID ? DEFAULT_LEDGER_ICON : NEW_LEDGER_ICON;
}

/** The line under a ledger's name: its currency and how many entries it holds. */
export function ledgerSummary(ledger: Pick<Ledger, 'currencyCode'>, entryCount: number): string {
  const entries = I18n.t(entryCount === 1 ? 'ledgers.entries_one' : 'ledgers.entries_other', {
    count: entryCount,
  });
  return ledger.currencyCode ? `${ledger.currencyCode} · ${entries}` : entries;
}

/** What a screen reader says for a ledger row. */
export function ledgerAccessibilityLabel(
  ledger: Pick<Ledger, 'id' | 'name' | 'currencyCode'>,
  entryCount: number,
  locked: boolean,
): string {
  return [
    ledgerDisplayName(ledger),
    ledgerSummary(ledger, entryCount),
    locked ? I18n.t('ledgers.locked_note') : null,
  ]
    .filter(Boolean)
    .join(', ');
}
