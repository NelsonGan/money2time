import React, { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp, useTransactions } from '~/context/AppContext';
import { PersonAvatar } from '~/features/transactions/components/PersonAvatar';
import { debtPartyKey } from '~/features/transactions/lib/debtParty';
import { billPayer } from '~/features/transactions/lib/splitPayer';
import { useSelfPerson } from '~/hooks/useSelfPerson';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { currencySymbolForCode } from '~/utils/currency';
import {
  dayKeyFromDateLocal,
  formatCurrency,
  formatRelativeDate,
  formatTimeOfDay,
} from '~/utils/formatters';

import type { AlbumGroup } from '../hooks/useAlbumGroup';
import { type ActivityLine, describeActivity, groupActivityByDay } from '../lib/activityLines';
import {
  listGroupActivity,
  listGroupBills,
  subscribeAlbumGroups,
} from '../services/albumGroupStore';

/** The newest this many changes show until the user asks for all of them. */
const COLLAPSED_ROWS = 5;

interface AlbumActivityProps {
  group: AlbumGroup;
  /** Opens a bill the user has an entry for. */
  onOpenBill: (transactionId: string) => void;
}

/**
 * A shared album's activity log, under its Balances: every change anyone made
 * to it, newest first, by day, one line each, in one card (the newest five
 * until Show all). A change someone else made to the user's own money has an
 * accent bar and a second line saying how; a tap opens the bill, and a
 * deleted bill can be brought back with Restore. The log is written by the
 * Worker with each change, so it is the same on every phone (README: Album
 * members and shared albums > Activity).
 */
export function AlbumActivity({ group, onOpenBill }: AlbumActivityProps) {
  const { restoreAlbumBill } = useApp();
  const { transactions } = useTransactions();
  const themeColors = useThemeColors();
  const me = useSelfPerson();
  const groupId = group.share?.ledgerId ?? null;
  const activity = useSyncExternalStore(subscribeAlbumGroups, () => listGroupActivity(groupId));
  const [restoring, setRestoring] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const selfId = group.self?.id ?? null;

  const lines = useMemo(() => {
    if (!groupId) return [];
    const names = new Map(group.members.map((member) => [member.id, member.name]));
    const deleted = new Set(
      listGroupBills(groupId)
        .filter((bill) => bill.deletedAt)
        .map((bill) => bill.id),
    );
    const byId = new Map(transactions.map((tx) => [tx.id, tx]));
    return activity.map((entry) =>
      describeActivity(entry, {
        selfId,
        nameOf: (memberId) =>
          (memberId ? names.get(memberId) : null) ?? I18n.t('transactions.settleUp.someone'),
        money: (amount, currency) => formatCurrency(amount, currencySymbolForCode(currency)),
        day: (date) => formatRelativeDate(date),
        needsAccount: (billId) => {
          const tx = byId.get(billId);
          return !!tx?.albumGroupId && !tx.accountId && !billPayer(tx.splits);
        },
        isDeleted: (billId) => deleted.has(billId),
      }),
    );
    // The group's rows change with `activity` (one store), and the entries with `transactions`.
  }, [activity, group.members, groupId, selfId, transactions]);
  const entryIds = useMemo(() => new Set(transactions.map((tx) => tx.id)), [transactions]);

  const restore = useCallback(
    (billId: string) => {
      if (!groupId || restoring) return;
      void triggerHaptic('selection');
      setRestoring(billId);
      void restoreAlbumBill(groupId, billId).finally(() => setRestoring(null));
    },
    [groupId, restoreAlbumBill, restoring],
  );

  // Nothing has happened yet only before anyone joined: the card waits.
  if (!lines.length) return null;

  const shown = expanded ? lines : lines.slice(0, COLLAPSED_ROWS);
  const days = groupActivityByDay(shown, (iso) => dayKeyFromDateLocal(new Date(iso)));

  const row = (line: ActivityLine, first: boolean) => {
    const actorName = group.members.find((member) => member.id === line.actorId)?.name ?? null;
    const isSelf = !!selfId && line.actorId === selfId;
    const time = new Date(line.createdAt);
    const opens = !!line.billId && entryIds.has(line.billId);
    // Who did it reads first, in bold, when the sentence starts with them.
    const lead = [isSelf ? I18n.t('albums.activity.you') : actorName].find(
      (name): name is string => !!name && line.text.startsWith(name),
    );
    return (
      <Pressable
        key={line.id}
        disabled={!opens}
        onPress={() => {
          if (!line.billId) return;
          void triggerHaptic('selection');
          onOpenBill(line.billId);
        }}
        accessibilityRole={opens ? 'button' : 'text'}
        accessibilityLabel={[line.text, line.mine].filter(Boolean).join('. ')}
        testID={`album-activity-${line.id}`}
        className="flex-row items-center gap-2.5 px-4 py-2.5 active:opacity-70"
      >
        {/* A change someone else made to the user's own money. */}
        {line.mine ? (
          <View className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-primary" />
        ) : null}
        {first ? null : <View className="absolute left-[50px] right-4 top-0 h-px bg-border/20" />}
        <PersonAvatar
          name={isSelf ? me.name : actorName}
          partyKey={isSelf ? null : debtPartyKey(actorName)}
          size={24}
          imageUri={isSelf ? me.avatarUri : null}
        />
        <View className="min-w-0 flex-1">
          <Text variant="body" numberOfLines={2}>
            {lead ? <Text variant="bodyStrong">{lead}</Text> : null}
            {lead ? line.text.slice(lead.length) : line.text}
          </Text>
          {line.mine ? (
            <Text variant="caption" className="text-primary" numberOfLines={1}>
              {line.mine}
            </Text>
          ) : null}
        </View>
        {line.restorable && line.billId && group.self ? (
          <Pressable
            onPress={() => restore(line.billId!)}
            disabled={restoring !== null}
            accessibilityRole="button"
            testID={`album-activity-restore-${line.billId}`}
            hitSlop={8}
            className="active:opacity-60"
          >
            {restoring === line.billId ? (
              <ActivityIndicator size="small" color={themeColors.primary} />
            ) : (
              <Text variant="bodyStrong" className="text-primary">
                {I18n.t('albums.activity.restore')}
              </Text>
            )}
          </Pressable>
        ) : (
          <Text variant="caption" tone="muted">
            {formatTimeOfDay(time.getHours(), time.getMinutes())}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <View className="px-5 pt-4" testID="album-activity">
      <View className="overflow-hidden rounded-2xl border border-border/30 bg-card pb-1">
        <Text variant="bodyStrong" className="px-4 pb-0.5 pt-3.5">
          {I18n.t('albums.activity.tab')}
        </Text>
        {days.map((day) => (
          <View key={day.day}>
            <Text variant="caption" tone="muted" className="px-4 pb-0.5 pt-2.5">
              {formatRelativeDate(`${day.day}T12:00:00`)}
            </Text>
            {day.lines.map((line, index) => row(line, index === 0))}
          </View>
        ))}
        {lines.length > COLLAPSED_ROWS ? (
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              setExpanded((open) => !open);
            }}
            accessibilityRole="button"
            className="mx-4 items-center border-t border-border/20 py-3 active:opacity-70"
          >
            <Text variant="bodyStrong" className="text-primary">
              {expanded
                ? I18n.t('albums.activity.show_less')
                : I18n.t('albums.activity.show_all', { count: lines.length })}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
