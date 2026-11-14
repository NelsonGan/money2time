import { ArrowRight, Check, ChevronRight } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import { LoadingDots } from '~/components/feedback/LoadingDots';
import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { PersonAvatar } from '~/features/transactions/components/PersonAvatar';
import {
  type SettleUpConfirmContent,
  SettleUpConfirmSheet,
} from '~/features/transactions/components/SettleUpConfirmSheet';
import { debtPartyKey } from '~/features/transactions/lib/debtParty';
import { currencyOrder } from '~/features/transactions/lib/settleUp';
import { useSelfPerson } from '~/hooks/useSelfPerson';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { PersonDebt, SettleUpSummary } from '~/types';
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
  /**
   * Opens the person's page, with only this album's bills: only those in
   * `currency` when the line was one currency's of several.
   */
  onOpenPerson: (personKey: string, currency?: string) => void;
}

/** A line of "Settled up": a person, or one currency's bills with them. */
interface SettledRow {
  key: string;
  person: PersonDebt;
  /** Set when the album has several currencies: the page opens on it. */
  currency?: string;
  /** Bills open both ways that come to nothing: not paid, just level. */
  even: boolean;
}

/** A line of "Who owes whom". */
interface DebtRow {
  key: string;
  /** How the debt is the user's: owed to them, owed by them, or between two others. */
  mine: 'owed' | 'owe' | null;
  /** The two people's names; the user's side is not read. */
  fromName: string | null;
  toName: string | null;
  /** In `currency`, never converted. */
  amount: number;
  amountText: string;
  /** The debt's currency: the rows are grouped by it. */
  currency: string;
  onPress?: () => void;
}

/**
 * An album's Balances: what the user is owed or owes across the album's
 * bills, then who owes whom. An album that is not shared lists the user's own
 * balance with each person; a shared one lists the whole group's debts
 * (simplified when the group has that on) and what the group spent. Nothing
 * here is converted: every figure is in its bills' own currency, each
 * currency apart.
 */
export function AlbumBalances({ summary, group, onOpenPerson }: AlbumBalancesProps) {
  const { settleGroupDebt } = useApp();
  const colors = useThemeColors();
  const me = useSelfPerson();
  const groupId = group.share?.ledgerId ?? null;
  const selfId = group.self?.id ?? null;
  const shared = useGroupDebts(groupId, selfId);
  /** The simplified debt being settled, while its sheet is open. */
  const [settling, setSettling] = useState<GroupDebt | null>(null);

  // Money, whatever the display mode: a balance is what changes hands, in the
  // currency it is owed in.
  const formatIn = (amount: number, currency: string) =>
    formatCurrency(amount, currencySymbolForCode(currency));

  // Debts, spending and the user's net never add across currencies: with
  // more than one, each currency is its own section under a chip, so a dollar
  // debt is not read as ringgit beside it. The reporting currency comes first.
  const currencies = [
    ...new Set([
      ...(shared?.debts.map((debt) => debt.currency) ?? []),
      ...(shared ? [...shared.spending.keys()] : []),
      ...summary.people.flatMap((person) => person.netByCurrency.map((entry) => entry.currency)),
    ]),
  ].sort(currencyOrder(summary.reportingCurrency));
  const byCurrency = currencies.length > 1;
  // The user's net in each currency, already in the sections' order. In a
  // shared album it is the group's: what the user owes or is owed there,
  // payments past a share and on deleted bills included (`openShares`).
  const nets = shared
    ? currencies.flatMap((currency) => {
        const amount = shared.debts
          .filter((debt) => debt.currency === currency)
          .reduce(
            (sum, debt) =>
              sum + (debt.to === selfId ? debt.amount : debt.from === selfId ? -debt.amount : 0),
            0,
          );
        return Math.abs(amount) >= 0.005 ? [{ currency, amount }] : [];
      })
    : summary.netByCurrency;
  const open = summary.billCount > 0 || nets.length > 0;
  // A line of one currency of several opens the person's page on that
  // currency's bills alone, so its total is the line's.
  const openPerson = (personKey: string, currency: string) =>
    onOpenPerson(personKey, byCurrency ? currency : undefined);

  const nameOf = (memberId: string) =>
    group.members.find((member) => member.id === memberId)?.name ?? null;

  // Two other people's debt: recorded as it stands, through no account of
  // the user's, after a yes.
  const confirmOthersPaid = (debt: GroupDebt, fromName: string | null, toName: string | null) => {
    void triggerHaptic('selection');
    const someone = I18n.t('transactions.settleUp.someone');
    Alert.alert(
      I18n.t('albums.balances.record_others_title'),
      I18n.t('albums.balances.record_others_body', {
        from: fromName ?? someone,
        to: toName ?? someone,
        amount: formatIn(debt.amount, debt.currency),
      }),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('albums.balances.record_others_confirm'),
          onPress: () => {
            if (groupId) void settleGroupDebt(groupId, debt, null);
          },
        },
      ],
    );
  };

  const mineOf = (debt: GroupDebt) =>
    debt.to === selfId ? 'owed' : debt.from === selfId ? 'owe' : null;
  const rankOf = (row: Pick<DebtRow, 'mine'>) => ['owed', 'owe', null].indexOf(row.mine);
  // Who has a page here, in which currency: the album's bills with them.
  const pages = new Set(
    summary.people.flatMap((person) =>
      person.bills.map((bill) => `${person.key}:${bill.currency}`),
    ),
  );
  const rows: DebtRow[] = (
    shared
      ? shared.debts.map((debt): DebtRow => {
          const mine = mineOf(debt);
          const fromName = nameOf(debt.from);
          const toName = nameOf(debt.to);
          const personKey = debtPartyKey(mine === 'owed' ? fromName : toName);
          // The person's page lists this album's bills with them in the
          // debt's currency; a member with none here yet (renamed since, or
          // nameless) is settled as the debt stands instead of opening a page
          // that would find nobody.
          const hasPage = pages.has(`${personKey}:${debt.currency}`);
          return {
            key: `${debt.currency}:${debt.from}:${debt.to}`,
            mine,
            fromName,
            toName,
            amount: debt.amount,
            amountText: formatIn(debt.amount, debt.currency),
            currency: debt.currency,
            // Anyone in the album records a payment (README: Anyone in it can
            // change it). The user's own: a simplified debt is settled as it
            // stands, a pair's own on the person's page, beside its bills.
            // Between two others: recorded as it stands, through no account.
            onPress: !group.self
              ? undefined
              : !mine
                ? () => confirmOthersPaid(debt, fromName, toName)
                : shared.simplified || !hasPage
                  ? () => setSettling(debt)
                  : () => openPerson(personKey, debt.currency),
          };
        })
      : // The user's own balance with each person, a line per currency.
        summary.people.flatMap((person) =>
          person.netByCurrency.map(
            ({ currency, amount }): DebtRow => ({
              key: `${currency}:${person.key}`,
              mine: amount > 0 ? 'owed' : 'owe',
              fromName: person.name,
              toName: person.name,
              amount: Math.abs(amount),
              amountText: formatIn(Math.abs(amount), currency),
              currency,
              onPress: () => openPerson(person.key, currency),
            }),
          ),
        )
  )
    // The user's own first (what they are owed, then what they owe), the
    // larger first within each, and someone unnamed last on a tie.
    .sort(
      (a, b) =>
        rankOf(a) - rankOf(b) ||
        b.amount - a.amount ||
        Number(!a.fromName || !a.toName) - Number(!b.fromName || !b.toName),
    );

  // What is settled or level with each person (nothing to pay either way):
  // their bills in the album are reached from here. With several currencies
  // it goes per currency, as the lines above do, so a person who still owes
  // in one currency is found here for the others.
  const settledRows: SettledRow[] = summary.people.flatMap((person): SettledRow[] => {
    if (!byCurrency) {
      return person.netByCurrency.length === 0
        ? [{ key: person.key, person, even: person.unpaidBillCount > 0 }]
        : [];
    }
    const owing = new Set(person.netByCurrency.map((entry) => entry.currency));
    return [...new Set(person.bills.map((bill) => bill.currency))]
      .filter((currency) => !owing.has(currency))
      .map((currency) => ({
        key: `${currency}:${person.key}`,
        person,
        currency,
        even: person.bills.some((bill) => bill.currency === currency && !bill.paidAt),
      }));
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

  // Joined, and not on the album's list yet: they are being added as
  // themselves (`syncAlbumGroups`).
  if (group.share && !group.self) {
    return (
      <View className="items-center px-5 pt-8">
        <LoadingDots />
      </View>
    );
  }

  const avatar = (name: string | null, isSelf: boolean) => (
    <PersonAvatar
      name={isSelf ? me.name : name}
      partyKey={isSelf ? null : debtPartyKey(name)}
      size={26}
      imageUri={isSelf ? me.avatarUri : null}
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

  const settledRow = (row: SettledRow) => (
    <Pressable
      key={row.key}
      onPress={() => {
        void triggerHaptic('selection');
        onOpenPerson(row.person.key, row.currency);
      }}
      accessibilityRole="button"
      className="flex-row items-center gap-2.5 px-4 py-2.5 active:opacity-70"
    >
      <View style={{ opacity: 0.55 }}>{avatar(row.person.name, false)}</View>
      <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1">
        {shown(row.person.name)}
      </Text>
      {row.even ? (
        <Text variant="caption" tone="muted">
          {I18n.t('transactions.settleUp.even_tag')}
        </Text>
      ) : (
        <Check size={16} color={colors.success} />
      )}
      <ChevronRight size={16} color={colors.textMuted} />
    </Pressable>
  );

  const currencyHeader = (currency: string) => {
    const symbol = currencySymbolForCode(currency);
    return (
      <View className="flex-row items-center gap-2.5">
        <View className="rounded-full bg-secondary/70 px-3 py-1">
          <Text variant="caption" className="font-semibold">
            {symbol === currency ? currency : `${currency} · ${symbol}`}
          </Text>
        </View>
        <View className="h-px flex-1 bg-border/30" />
      </View>
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

  // Before the album's first split bill there is no balance to state: an
  // empty placeholder instead of "All settled up".
  const empty = rows.length === 0 && summary.people.length === 0 && !shared?.spending.size;
  if (empty) {
    return (
      <EmptyState
        title={I18n.t('albums.balances.empty_title')}
        mascotMood="curious"
        animateIn={false}
      />
    );
  }

  // What the user is owed or owes in one currency, said by its sign.
  const netLabel = (amount: number) =>
    I18n.t(amount > 0 ? 'transactions.settleUp.hero_owed' : 'transactions.settleUp.you_owe_tag');
  const netTone = (amount: number) => (amount > 0 ? 'text-success' : 'text-destructive');

  return (
    <View className="gap-4 px-5 pt-5">
      {open && nets.length > 1 ? (
        // One figure per currency side by side, each with what it is.
        <View className="flex-row flex-wrap justify-center gap-x-8 gap-y-3">
          {nets.map(({ currency, amount }) => (
            <View
              key={currency}
              accessible
              accessibilityLabel={`${netLabel(amount)}, ${formatIn(Math.abs(amount), currency)}`}
              className="items-center"
            >
              <Text variant="caption" tone="muted">
                {netLabel(amount)}
              </Text>
              <Text variant="heading" className={cn('mt-0.5', netTone(amount))}>
                {formatIn(Math.abs(amount), currency)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View className="items-center">
          <Text variant="caption" tone="muted">
            {!open
              ? I18n.t('transactions.settleUp.hero_settled')
              : nets.length === 0
                ? I18n.t('transactions.settleUp.hero_even')
                : netLabel(nets[0]!.amount)}
          </Text>
          <Text
            variant="title"
            className={cn('mt-1', open && nets.length === 1 ? netTone(nets[0]!.amount) : '')}
          >
            {open && nets.length === 1
              ? formatIn(Math.abs(nets[0]!.amount), nets[0]!.currency)
              : formatIn(0, summary.reportingCurrency)}
          </Text>
        </View>
      )}

      {rows.length > 0 ? (
        <View className="overflow-hidden rounded-2xl border border-border/30 bg-card">
          <Text variant="bodyStrong" className="px-4 pb-1 pt-3.5">
            {I18n.t('albums.balances.who_owes_whom')}
          </Text>
          {byCurrency
            ? currencies.map((currency) => {
                const inCurrency = rows.filter((row) => row.currency === currency);
                if (inCurrency.length === 0) return null;
                return (
                  <View key={currency}>
                    <View className="px-4 pb-0.5 pt-2.5">{currencyHeader(currency)}</View>
                    {inCurrency.map(debtRow)}
                  </View>
                );
              })
            : rows.map(debtRow)}
        </View>
      ) : null}

      {settledRows.length > 0 ? (
        <View className="overflow-hidden rounded-2xl border border-border/15 bg-secondary/20">
          <Text variant="label" tone="muted" className="px-4 pb-1 pt-3">
            {I18n.t('transactions.settleUp.settled_up')}
          </Text>
          {byCurrency
            ? currencies.map((currency) => {
                const inCurrency = settledRows.filter((row) => row.currency === currency);
                if (inCurrency.length === 0) return null;
                return (
                  <View key={currency}>
                    <View className="px-4 pb-0.5 pt-2">{currencyHeader(currency)}</View>
                    {inCurrency.map(settledRow)}
                  </View>
                );
              })
            : settledRows.map(settledRow)}
        </View>
      ) : null}

      {shared && shared.spending.size > 0 ? (
        <View className="gap-2.5 rounded-2xl border border-border/30 bg-card px-4 py-3.5">
          <Text variant="bodyStrong">{I18n.t('albums.balances.group_spending')}</Text>
          {currencies.map((currency) => {
            const spent = shared.spending.get(currency);
            if (!spent) return null;
            return (
              <View key={currency} className={cn('gap-2', byCurrency ? 'pt-1' : '')}>
                {byCurrency ? currencyHeader(currency) : null}
                <View className="flex-row gap-2">
                  {tile(
                    I18n.t('transactions.settleUp.receipt_total_label'),
                    formatIn(spent.total, currency),
                  )}
                  {tile(
                    I18n.t('transactions.settleUp.you_paid'),
                    formatIn(spent.selfPaid, currency),
                  )}
                  {tile(I18n.t('albums.balances.your_share'), formatIn(spent.selfShare, currency))}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      <SettleUpConfirmSheet
        content={settleContent}
        onClose={() => setSettling(null)}
        onConfirm={(accountId, amount) => {
          if (groupId && settling) {
            void settleGroupDebt(
              groupId,
              { ...settling, amount: amount ?? settling.amount },
              accountId,
            );
          }
          setSettling(null);
        }}
      />
    </View>
  );
}
