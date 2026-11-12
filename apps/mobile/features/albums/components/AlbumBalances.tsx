import { Check, ChevronRight, UserPlus } from 'lucide-react-native';
import React, { useMemo, useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { PersonAvatar } from '~/features/transactions/components/PersonAvatar';
import { personBalanceState } from '~/features/transactions/lib/settleUp';
import { useSettleUpSummary } from '~/features/transactions/lib/useSettleUpSummary';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { AlbumExpense, PersonDebt } from '~/types';
import { cn } from '~/utils';
import { currencySymbolForCode } from '~/utils/currency';
import { formatCurrency } from '~/utils/formatters';

import type { AlbumGroup } from '../hooks/useAlbumGroup';
import { groupTotals } from '../lib/albumGroup';
import { listGroupExpenses, subscribeAlbumGroups } from '../services/albumGroupStore';

interface AlbumBalancesProps {
  albumId: string;
  group: AlbumGroup;
  /** Opens the person's page, with only this album's bills. */
  onOpenPerson: (personKey: string) => void;
  onOpenPeople: () => void;
}

const NO_EXPENSES: AlbumExpense[] = [];

/**
 * An album's Balances: what the user is owed or owes across the album's
 * bills, then one row per person with their net. The same roll-up as the
 * Balances page, over this album's entries alone. A shared album adds what
 * the whole group spent and the user's share of it.
 */
export function AlbumBalances({ albumId, group, onOpenPerson, onOpenPeople }: AlbumBalancesProps) {
  const { settings } = useApp();
  const colors = useThemeColors();
  const summary = useSettleUpSummary(albumId);
  const groupId = group.share?.ledgerId ?? null;
  const expenses = useSyncExternalStore(subscribeAlbumGroups, () =>
    groupId ? listGroupExpenses(groupId) : NO_EXPENSES,
  );
  const totals = useMemo(
    () => (groupId ? groupTotals(expenses, group.self?.id ?? null) : null),
    [expenses, group.self?.id, groupId],
  );

  // Money, whatever the display mode: a balance is what changes hands.
  const format = (amount: number) => formatCurrency(amount, settings.currencySymbol);
  const net = summary.netReporting;
  const open = summary.billCount > 0;
  const netState = net >= 0.005 ? 'owed' : net <= -0.005 ? 'owe' : 'even';

  // Nobody to split with yet: say what the page is for, once.
  if (!group.share && group.others.length === 0 && summary.people.length === 0) {
    return (
      <View className="items-center gap-3 px-8 pt-10">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-primary/15">
          <UserPlus size={24} color={colors.primary} />
        </View>
        <Text variant="subheading" className="text-center">
          {I18n.t('albums.balances.add_people_title')}
        </Text>
        <Text variant="body" tone="muted" className="text-center">
          {I18n.t('albums.balances.add_people_message')}
        </Text>
        <Button onPress={onOpenPeople} className="mt-1 self-stretch">
          <Text>{I18n.t('albums.balances.add_people_action')}</Text>
        </Button>
      </View>
    );
  }

  const row = (person: PersonDebt, index: number) => {
    const state = personBalanceState(person);
    const settled = state === 'settled';
    return (
      <Pressable
        key={person.key}
        onPress={() => {
          void triggerHaptic('selection');
          onOpenPerson(person.key);
        }}
        accessibilityRole="button"
        className={cn(
          'flex-row items-center gap-3 px-4 py-3 active:opacity-70',
          index > 0 ? 'border-t border-border/15' : '',
        )}
      >
        <View style={{ opacity: settled ? 0.55 : 1 }}>
          <PersonAvatar name={person.name} partyKey={person.key} size={40} />
        </View>
        <Text
          variant="bodyStrong"
          tone={settled ? 'muted' : undefined}
          numberOfLines={1}
          className="flex-1"
        >
          {person.name ?? I18n.t('transactions.settleUp.someone')}
        </Text>
        {settled ? (
          <Check size={18} color={colors.success} />
        ) : (
          <View className="items-end">
            <Text variant="caption" tone="muted">
              {state === 'owes_you'
                ? I18n.t('transactions.settleUp.person_owes_label')
                : state === 'you_owe'
                  ? I18n.t('transactions.settleUp.you_owe_tag')
                  : I18n.t('transactions.settleUp.even_tag')}
            </Text>
            <Text
              variant="bodyStrong"
              className={
                state === 'owes_you'
                  ? 'text-success'
                  : state === 'you_owe'
                    ? 'text-destructive'
                    : 'text-muted-foreground'
              }
            >
              {format(Math.abs(person.netReporting))}
            </Text>
          </View>
        )}
        <ChevronRight size={18} color={colors.textMuted} />
      </Pressable>
    );
  };

  return (
    <View className="px-5 pt-5">
      <View className="items-center pb-4">
        <Text variant="caption" tone="muted">
          {I18n.t(
            !open
              ? 'transactions.settleUp.hero_settled'
              : netState === 'owed'
                ? 'transactions.settleUp.hero_owed'
                : netState === 'owe'
                  ? 'transactions.settleUp.you_owe_tag'
                  : 'transactions.settleUp.hero_even',
          )}
        </Text>
        <Text
          variant="title"
          className={cn(
            'mt-1',
            open && netState === 'owed'
              ? 'text-success'
              : open && netState === 'owe'
                ? 'text-destructive'
                : '',
          )}
        >
          {format(Math.abs(net))}
        </Text>
      </View>

      {summary.people.length > 0 ? (
        <View className="overflow-hidden rounded-2xl border border-border/30 bg-card">
          {summary.people.map(row)}
        </View>
      ) : (
        <Text variant="body" tone="muted" className="px-4 text-center">
          {I18n.t('albums.balances.empty_message')}
        </Text>
      )}

      {totals && totals.size > 0 ? (
        <View className="mt-4 items-center gap-0.5">
          {[...totals].map(([currency, entry]) => (
            <Text key={currency} variant="caption" tone="muted" className="text-center">
              {I18n.t('albums.balances.total_line', {
                total: formatCurrency(entry.total, currencySymbolForCode(currency)),
                share: formatCurrency(entry.selfShare, currencySymbolForCode(currency)),
              })}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
