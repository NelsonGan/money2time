import { ArrowRight, Check, ChevronRight } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { LoadingDots } from '~/components/feedback/LoadingDots';
import { Button, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { PersonAvatar } from '~/features/transactions/components/PersonAvatar';
import {
  type SettleUpConfirmContent,
  SettleUpConfirmSheet,
} from '~/features/transactions/components/SettleUpConfirmSheet';
import { debtPartyKey } from '~/features/transactions/lib/debtParty';
import { personBalanceState } from '~/features/transactions/lib/settleUp';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { SettleUpSummary } from '~/types';
import { cn } from '~/utils';
import { currencySymbolForCode } from '~/utils/currency';
import { formatCurrency } from '~/utils/formatters';

import type { AlbumGroup } from '../hooks/useAlbumGroup';
import { useGroupDebts } from '../hooks/useGroupDebts';
import type { GroupDebt } from '../lib/groupDebts';

interface AlbumBalancesProps {
  /** The roll-up of the album's own bills (`useSettleUpSummary(albumId)`). */
  summary: SettleUpSummary;
  group: AlbumGroup;
  /** Opens the person's page, with only this album's bills. */
  onOpenPerson: (personKey: string) => void;
  /** Opens the album's People page, where someone who joined says who they are. */
  onOpenPeople: () => void;
  /** Opens a new expense in this album, split with its people. */
  onAddExpense: () => void;
}

/** A line of "Who owes whom". */
interface DebtRow {
  key: string;
  /** How the debt is the user's: owed to them, owed by them, or between two others. */
  mine: 'owed' | 'owe' | null;
  /** The two people's names; the user's side is not read. */
  fromName: string | null;
  toName: string | null;
  amountText: string;
  onPress?: () => void;
}

/**
 * An album's Balances: what the user is owed or owes across the album's
 * bills, then who owes whom. An album that is not shared lists the user's own
 * balance with each person; a shared one lists the whole group's debts
 * (simplified when the group has that on) and what the group spent.
 */
export function AlbumBalances({
  summary,
  group,
  onOpenPerson,
  onOpenPeople,
  onAddExpense,
}: AlbumBalancesProps) {
  const { settings, settleGroupDebt } = useApp();
  const colors = useThemeColors();
  const groupId = group.share?.ledgerId ?? null;
  const selfId = group.self?.id ?? null;
  const shared = useGroupDebts(groupId, selfId);
  /** The simplified debt being settled, while its sheet is open. */
  const [settling, setSettling] = useState<GroupDebt | null>(null);

  // Money, whatever the display mode: a balance is what changes hands.
  const format = (amount: number) => formatCurrency(amount, settings.currencySymbol);
  const formatIn = (amount: number, currency: string) =>
    formatCurrency(amount, currencySymbolForCode(currency));
  const net = summary.netReporting;
  const open = summary.billCount > 0;
  const netState = net >= 0.005 ? 'owed' : net <= -0.005 ? 'owe' : 'even';

  const nameOf = (memberId: string) =>
    group.members.find((member) => member.id === memberId)?.name ?? null;

  // The user's own first (what they are owed, then what they owe), the
  // larger first within each.
  const mineOf = (debt: GroupDebt) =>
    debt.to === selfId ? 'owed' : debt.from === selfId ? 'owe' : null;
  const rankOf = (debt: GroupDebt) => ['owed', 'owe', null].indexOf(mineOf(debt));
  const rows: DebtRow[] = shared
    ? [...shared.debts]
        .sort((a, b) => rankOf(a) - rankOf(b) || b.amount - a.amount)
        .map((debt): DebtRow => {
          const mine = mineOf(debt);
          const fromName = nameOf(debt.from);
          const toName = nameOf(debt.to);
          const personKey = debtPartyKey(mine === 'owed' ? fromName : toName);
          // The person's page lists this album's bills with them; a member
          // with none here yet (renamed since, or nameless) is settled as the
          // debt stands instead of opening a page that would find nobody.
          const hasPage = summary.people.some((person) => person.key === personKey);
          return {
            key: `${debt.currency}:${debt.from}:${debt.to}`,
            mine,
            fromName,
            toName,
            amountText: formatIn(debt.amount, debt.currency),
            // A simplified debt is settled as it stands; a pair's own on the
            // person's page, beside its bills.
            onPress: !mine
              ? undefined
              : shared.simplified || !hasPage
                ? () => setSettling(debt)
                : () => onOpenPerson(personKey),
          };
        })
    : summary.people.flatMap((person): DebtRow[] => {
        const state = personBalanceState(person);
        if (state !== 'owes_you' && state !== 'you_owe') return [];
        return [
          {
            key: person.key,
            mine: state === 'owes_you' ? 'owed' : 'owe',
            fromName: person.name,
            toName: person.name,
            amountText: format(Math.abs(person.netReporting)),
            onPress: () => onOpenPerson(person.key),
          },
        ];
      });

  // The people with nothing to pay either way (settled, or level): their
  // bills in the album are reached from here.
  const settledPeople = summary.people.filter((person) => {
    const state = personBalanceState(person);
    return state === 'settled' || state === 'even';
  });

  const settleContent = useMemo<SettleUpConfirmContent | null>(() => {
    if (!settling) return null;
    const receive = settling.to === selfId;
    const name =
      group.members.find((member) => member.id === (receive ? settling.from : settling.to))?.name ??
      null;
    const shown = name ?? I18n.t('transactions.settleUp.someone');
    return {
      personKey: debtPartyKey(name),
      personName: name,
      flow: receive ? 'receive' : 'pay',
      caption: I18n.t(
        receive ? 'transactions.settleUp.person_pays_you' : 'transactions.settleUp.you_pay_person',
        { name: shown },
      ),
      amountText: formatCurrency(settling.amount, currencySymbolForCode(settling.currency)),
      partial: { full: settling.amount, prefix: currencySymbolForCode(settling.currency) },
      confirmLabel: I18n.t('transactions.settleUp.settle_up'),
    };
  }, [group.members, selfId, settling]);

  // Joined, and not on the album's list yet: none of its bills are theirs
  // until they are. With a name to pick, that question is all there is to
  // show; with none, they are being added as themselves.
  if (group.share && !group.self && !group.mustClaim) {
    return (
      <View className="items-center px-5 pt-8">
        <LoadingDots />
      </View>
    );
  }
  if (group.mustClaim) {
    return (
      <View className="px-5 pt-5">
        <Pressable
          onPress={() => {
            void triggerHaptic('selection');
            onOpenPeople();
          }}
          accessibilityRole="button"
          testID="album-balances-who"
          className="flex-row items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3.5 active:opacity-70"
        >
          <View className="flex-1 gap-0.5">
            <Text variant="bodyStrong">{I18n.t('albums.people.who_title')}</Text>
            <Text variant="caption" tone="muted">
              {I18n.t('albums.people.who_message')}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
      </View>
    );
  }

  const avatar = (name: string | null, isSelf: boolean) => (
    <PersonAvatar
      name={isSelf ? I18n.t('transactions.editor.split.me_label') : name}
      partyKey={isSelf ? null : debtPartyKey(name)}
      size={26}
    />
  );
  const shown = (name: string | null) => name ?? I18n.t('transactions.settleUp.someone');

  const debtRow = (row: DebtRow, index: number) => {
    const sentence =
      row.mine === 'owed'
        ? I18n.t('albums.balances.owes_you', { name: shown(row.fromName) })
        : row.mine === 'owe'
          ? I18n.t('transactions.settleUp.section_you_owe', { name: shown(row.toName) })
          : I18n.t('albums.balances.owes', {
              from: shown(row.fromName),
              to: shown(row.toName),
            });
    return (
      <Pressable
        key={row.key}
        disabled={!row.onPress}
        onPress={() => {
          void triggerHaptic('selection');
          row.onPress?.();
        }}
        accessibilityRole={row.onPress ? 'button' : 'text'}
        accessibilityLabel={`${sentence}, ${row.amountText}`}
        className={cn(
          'flex-row items-center gap-2.5 px-4 py-3 active:opacity-70',
          index > 0 ? 'border-t border-border/15' : '',
        )}
      >
        <View className="flex-row items-center gap-1">
          {avatar(row.fromName, row.mine === 'owe')}
          <ArrowRight size={12} color={colors.textMuted} />
          {avatar(row.toName, row.mine === 'owed')}
        </View>
        <Text
          variant="caption"
          tone={row.mine ? undefined : 'muted'}
          // Small, and on two lines when it must: long names stay whole.
          numberOfLines={2}
          className="flex-1"
        >
          {sentence}
        </Text>
        <Text
          variant="caption"
          className={
            row.mine === 'owed'
              ? 'text-success'
              : row.mine === 'owe'
                ? 'text-destructive'
                : 'text-muted-foreground'
          }
        >
          {row.amountText}
        </Text>
        {/* Kept as a gap on rows that open nothing, so the amounts line up. */}
        <View className="w-4">
          {row.onPress ? <ChevronRight size={16} color={colors.textMuted} /> : null}
        </View>
      </Pressable>
    );
  };

  const tile = (label: string, value: string) => (
    <View className="flex-1 gap-0.5 rounded-xl bg-secondary/40 px-3 py-2.5">
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </View>
  );

  // Before the album's first split bill there is no balance to state: the
  // empty message says what goes here instead of "All settled up".
  const empty = rows.length === 0 && summary.people.length === 0 && !shared?.spending.size;

  return (
    <View className="gap-4 px-5 pt-5">
      {empty ? null : (
        <View className="items-center">
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
      )}

      {rows.length > 0 ? (
        <View className="overflow-hidden rounded-2xl border border-border/30 bg-card">
          <Text variant="bodyStrong" className="px-4 pb-1 pt-3.5">
            {I18n.t('albums.balances.who_owes_whom')}
          </Text>
          {rows.map(debtRow)}
        </View>
      ) : empty ? (
        <Text variant="body" tone="muted" className="px-4 pt-3 text-center">
          {I18n.t('albums.balances.empty_message')}
        </Text>
      ) : null}

      {settledPeople.length > 0 ? (
        <View className="overflow-hidden rounded-2xl border border-border/15 bg-secondary/20">
          <Text variant="label" tone="muted" className="px-4 pb-1 pt-3">
            {I18n.t('transactions.settleUp.settled_up')}
          </Text>
          {settledPeople.map((person) => (
            <Pressable
              key={person.key}
              onPress={() => {
                void triggerHaptic('selection');
                onOpenPerson(person.key);
              }}
              accessibilityRole="button"
              className="flex-row items-center gap-2.5 px-4 py-2.5 active:opacity-70"
            >
              <View style={{ opacity: 0.55 }}>{avatar(person.name, false)}</View>
              <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1">
                {shown(person.name)}
              </Text>
              {personBalanceState(person) === 'even' ? (
                // Bills open both ways that come to nothing: not paid, just level.
                <Text variant="caption" tone="muted">
                  {I18n.t('transactions.settleUp.even_tag')}
                </Text>
              ) : (
                <Check size={16} color={colors.success} />
              )}
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {shared && shared.spending.size > 0 ? (
        <View className="gap-2.5 rounded-2xl border border-border/30 bg-card px-4 py-3.5">
          <Text variant="bodyStrong">{I18n.t('albums.balances.group_spending')}</Text>
          {[...shared.spending].map(([currency, spent]) => (
            <View key={currency} className="flex-row gap-2">
              {tile(
                I18n.t('transactions.settleUp.receipt_total_label'),
                formatIn(spent.total, currency),
              )}
              {tile(I18n.t('transactions.settleUp.you_paid'), formatIn(spent.selfPaid, currency))}
              {tile(I18n.t('albums.balances.your_share'), formatIn(spent.selfShare, currency))}
            </View>
          ))}
        </View>
      ) : null}

      <Button onPress={onAddExpense} testID="album-add-expense">
        <Text>{I18n.t('onboarding.bootstrap.add_transaction')}</Text>
      </Button>

      <SettleUpConfirmSheet
        content={settleContent}
        onClose={() => setSettling(null)}
        onConfirm={(accountId, amount) => {
          if (groupId && settling) {
            settleGroupDebt(groupId, { ...settling, amount: amount ?? settling.amount }, accountId);
          }
          setSettling(null);
        }}
      />
    </View>
  );
}
