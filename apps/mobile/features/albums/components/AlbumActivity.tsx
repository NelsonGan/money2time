import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '~/components/ui';
import { PersonAvatar } from '~/features/transactions/components/PersonAvatar';
import { debtPartyKey } from '~/features/transactions/lib/debtParty';
import { useSelfPerson } from '~/hooks/useSelfPerson';
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
import {
  type ActivityLine,
  describeActivity,
  groupActivityByDay,
  type MineTone,
} from '../lib/activityLines';
import { listGroupActivity, subscribeAlbumGroups } from '../services/albumGroupStore';

/** The newest this many changes show until the user asks for all of them. */
const COLLAPSED_ROWS = 5;

/** The note of how a change moved the user's money: green in, rose out, grey neither. */
const MINE_CHIP: Record<MineTone, { chip: string; text: string }> = {
  in: { chip: 'bg-success/10', text: 'text-success' },
  out: { chip: 'bg-primary/10', text: 'text-primary' },
  neutral: { chip: 'bg-muted', text: 'text-muted-foreground' },
};

interface AlbumActivityProps {
  group: AlbumGroup;
}

/**
 * A shared album's activity log, under its Balances: every change anyone made
 * to it, newest first, by day, one line each, in one card (the newest five
 * until Show all). Plain history for reference, nothing to tap. A change
 * someone else made to the user's own money carries a small chip under its
 * line saying how, tinted by which way the money went. The log is written
 * with each change, in the same write, and syncs with the group, so it is the
 * same on every phone (README: Album members and shared albums > Activity).
 */
export function AlbumActivity({ group }: AlbumActivityProps) {
  const me = useSelfPerson();
  const groupId = group.share?.ledgerId ?? null;
  const activity = useSyncExternalStore(subscribeAlbumGroups, () => listGroupActivity(groupId));
  const [expanded, setExpanded] = useState(false);
  const selfId = group.self?.id ?? null;

  const lines = useMemo(() => {
    if (!groupId) return [];
    const names = new Map(group.members.map((member) => [member.id, member.name]));
    return activity.map((entry) =>
      describeActivity(entry, {
        selfId,
        nameOf: (memberId) =>
          (memberId ? names.get(memberId) : null) ?? I18n.t('transactions.settleUp.someone'),
        money: (amount, currency) => formatCurrency(amount, currencySymbolForCode(currency)),
        day: (date) => formatRelativeDate(date),
      }),
    );
  }, [activity, group.members, groupId, selfId]);

  // Nothing has happened yet only before anyone joined: the card waits.
  if (!lines.length) return null;

  const shown = expanded ? lines : lines.slice(0, COLLAPSED_ROWS);
  const days = groupActivityByDay(shown, (iso) => dayKeyFromDateLocal(new Date(iso)));

  const row = (line: ActivityLine, first: boolean) => {
    const actorName = group.members.find((member) => member.id === line.actorId)?.name ?? null;
    const isSelf = !!selfId && line.actorId === selfId;
    const time = new Date(line.createdAt);
    // Who did it reads first, in bold, when the sentence starts with them.
    const lead = [isSelf ? I18n.t('albums.activity.you') : actorName].find(
      (name): name is string => !!name && line.text.startsWith(name),
    );
    return (
      <View
        key={line.id}
        accessible
        accessibilityLabel={[line.text, line.mine].filter(Boolean).join('. ')}
        testID={`album-activity-${line.id}`}
        className="flex-row items-center gap-2.5 px-4 py-2.5"
      >
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
            <View className={`mt-1 self-start rounded-xl px-2 py-0.5 ${MINE_CHIP[line.tone].chip}`}>
              <Text
                variant="caption"
                className={`font-semibold ${MINE_CHIP[line.tone].text}`}
                numberOfLines={2}
              >
                {line.mine}
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="caption" tone="muted">
          {formatTimeOfDay(time.getHours(), time.getMinutes())}
        </Text>
      </View>
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
