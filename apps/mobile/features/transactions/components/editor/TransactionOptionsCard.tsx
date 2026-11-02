import { FileText, Tag, Undo2, Wallet } from 'lucide-react-native';
import React from 'react';

import { CategoryEmoji, Text } from '~/components/ui';
import { BelongsToPicker } from '~/features/sharedLedgers/components/BelongsToPicker';
import type { LedgerPeople } from '~/features/sharedLedgers/lib/ledgerPeople';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { TransactionType } from '~/types';

import { OptionRow, OptionsCard } from './OptionRow';

interface TransactionOptionsCardProps {
  type: TransactionType;
  /** The longer note, previewed on one line; tapping it expands it for typing. */
  details: string;
  onEditDetails: () => void;
  /** Shared ledgers: whose entry this is (null = the owner) and who added it. */
  people: LedgerPeople | null;
  memberId: string | null;
  createdBy?: string | null;
  onSelectMember: (memberId: string | null) => void;
  /** Expenses: the reimbursement switch, read-only once the money came back. */
  reimbursable: boolean;
  isReimbursed: boolean;
  onToggleReimbursable: () => void;
  /** Transfers: counted as spending, and the category it is filed under. */
  countsAsExpense: boolean;
  onToggleCountsAsExpense: () => void;
  category: { name: string; icon: string | null | undefined } | null;
  onPickCategory: () => void;
}

/**
 * The transaction editor's options panel (the More button): every option is
 * a row of one card, all alike, shown by type and by whether the ledger is
 * shared. See README.md > Transaction details and Shared ledgers.
 */
export function TransactionOptionsCard({
  type,
  details,
  onEditDetails,
  people,
  memberId,
  createdBy,
  onSelectMember,
  reimbursable,
  isReimbursed,
  onToggleReimbursable,
  countsAsExpense,
  onToggleCountsAsExpense,
  category,
  onPickCategory,
}: TransactionOptionsCardProps) {
  const themeColors = useThemeColors();
  const tile = { size: 16, color: themeColors.primary };
  const trimmedDetails = details.trim();

  return (
    <OptionsCard>
      <OptionRow
        icon={<FileText {...tile} />}
        label={I18n.t('transactions.editor.details.title')}
        accessibilityValue={trimmedDetails || undefined}
        value={
          <Text variant="body" tone="muted" numberOfLines={1} className="shrink">
            {trimmedDetails || I18n.t('transactions.editor.details.empty')}
          </Text>
        }
        onPress={onEditDetails}
      />
      {people ? (
        <BelongsToPicker
          divider
          people={people}
          memberId={memberId}
          createdBy={createdBy}
          onSelect={onSelectMember}
        />
      ) : null}
      {type === 'expense' ? (
        <OptionRow
          divider
          icon={<Undo2 {...tile} />}
          label={
            isReimbursed
              ? I18n.t('reimbursements.editor_reimbursed_label')
              : I18n.t('reimbursements.editor_label')
          }
          info={{
            title: I18n.t('reimbursements.editor_label'),
            tooltip: I18n.t('reimbursements.editor_tooltip'),
          }}
          disabled={isReimbursed}
          switchValue={reimbursable}
          onToggle={onToggleReimbursable}
        />
      ) : null}
      {type === 'transfer' ? (
        <OptionRow
          divider
          icon={<Wallet {...tile} />}
          label={I18n.t('transactions.editor.transfer_expense_label')}
          info={{
            title: I18n.t('transactions.editor.transfer_expense_label'),
            tooltip: I18n.t('transactions.editor.transfer_expense_tooltip'),
          }}
          switchValue={countsAsExpense}
          onToggle={onToggleCountsAsExpense}
        />
      ) : null}
      {type === 'transfer' && countsAsExpense ? (
        /* The category a counted transfer is filed under: a row rather than the
           page's category grid, since a transfer's page has no category slot. */
        <OptionRow
          divider
          icon={<Tag {...tile} />}
          label={I18n.t('transactions.editor.category')}
          accessibilityValue={category?.name}
          value={
            category ? (
              <>
                <CategoryEmoji icon={category.icon} size={18} />
                <Text variant="body" tone="muted" numberOfLines={1} className="shrink">
                  {category.name}
                </Text>
              </>
            ) : null
          }
          onPress={onPickCategory}
        />
      ) : null}
    </OptionsCard>
  );
}
