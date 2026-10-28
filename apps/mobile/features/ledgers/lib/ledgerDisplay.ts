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

/** Whether the open ledger needs Pro: every ledger but the default one does. */
export function ledgerNeedsPro(ledgerId: string): boolean {
  return ledgerId !== DEFAULT_LEDGER_ID;
}
