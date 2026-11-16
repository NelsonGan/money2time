import { ChevronRight, Globe, Link2, Minus, Plus } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { CategoryEmoji } from '~/components/ui/CategoryEmoji';
import { useApp } from '~/context/AppContext';
import { AlbumLineIcon } from '~/features/albums/components/AlbumLineIcon';
import { money } from '~/features/budget/lib/format';
import { PersonAvatar } from '~/features/transactions/components/PersonAvatar';
import { debtPartyKey } from '~/features/transactions/lib/debtParty';
import { useSelfPerson } from '~/hooks/useSelfPerson';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

interface ShowcaseProps {
  width: number;
}

// The showcases draw the real screens in miniature, with the app's own copy.
// Person names are sample data, the same in every language.

interface SampleRow {
  /** `null` is the user, drawn with their own name and photo. */
  name: string | null;
  amount: number;
}

/** One person on the bill: avatar, name and what they pay, with an optional
 *  line under the name and a control on the right, as Split Bill draws it. */
function PersonRow({
  row,
  first,
  under,
  trailing,
}: {
  row: SampleRow;
  first: boolean;
  under?: React.ReactNode;
  trailing: React.ReactNode;
}) {
  const me = useSelfPerson();
  const name = row.name ?? me.name;
  return (
    <View>
      {first ? null : <View className="mx-3.5 h-[1px] bg-border/15" />}
      <View className="flex-row items-center gap-2.5 px-3.5 py-2.5">
        {row.name === null ? (
          me.avatarUri ? (
            <PersonAvatar name={name} partyKey={null} size={30} imageUri={me.avatarUri} />
          ) : (
            <View className="h-[30px] w-[30px] items-center justify-center rounded-full bg-primary/15">
              <Text variant="caption" className="font-semibold text-primary">
                {Array.from(name)[0]?.toUpperCase()}
              </Text>
            </View>
          )
        ) : (
          <PersonAvatar name={name} partyKey={debtPartyKey(name)} size={30} />
        )}
        <View className="min-w-0 flex-1">
          <Text variant="body" numberOfLines={1}>
            {name}
          </Text>
          {under}
        </View>
        {trailing}
      </View>
    </View>
  );
}

/** The bar under Split Bill's rows: what the split means, in one line. */
function SettlementBar({ text }: { text: string }) {
  return (
    <View className="mt-2 items-center rounded-2xl border border-border/25 bg-card px-3 py-2">
      <Text variant="bodyStrong" className="text-center text-foreground" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const FRIEND_PAID_TOTAL = 120;
const FRIEND_PAID_PAYER = 'Aisha';
const FRIEND_PAID_ROWS: SampleRow[] = [
  { name: null, amount: 40 },
  { name: FRIEND_PAID_PAYER, amount: 40 },
  { name: 'Ben', amount: 40 },
];

/** Split Bill on a bill a friend paid: the bill total, Paid by set to the
 *  friend, their row tagged Paid, and "You owe Aisha" in the bar. */
export function SplitFriendPaidShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const amount = (value: number) => money(value, settings);
  const myShare = FRIEND_PAID_ROWS[0].amount;
  return (
    <View style={{ width }}>
      <View className="items-center pb-2">
        <Text variant="caption" tone="muted">
          {I18n.t('transactions.editor.split.bill_total_label')}
        </Text>
        <Text variant="subheading" className="mt-0.5">
          {amount(FRIEND_PAID_TOTAL)}
        </Text>
      </View>

      <View className="flex-row items-center gap-2.5 rounded-[18px] border border-border/25 bg-card px-3.5 py-2.5">
        <Text variant="body" className="flex-1">
          {I18n.t('transactions.editor.split.paid_by_label')}
        </Text>
        <PersonAvatar
          name={FRIEND_PAID_PAYER}
          partyKey={debtPartyKey(FRIEND_PAID_PAYER)}
          size={24}
        />
        <Text variant="bodyStrong" numberOfLines={1}>
          {FRIEND_PAID_PAYER}
        </Text>
        <ChevronRight size={15} color={colors.textMuted} />
      </View>

      <View className="mt-2 overflow-hidden rounded-[18px] border border-border/25 bg-card">
        {FRIEND_PAID_ROWS.map((row, index) => (
          <PersonRow
            key={row.name ?? 'me'}
            row={row}
            first={index === 0}
            trailing={
              <View className="flex-row items-center gap-2">
                {row.name === FRIEND_PAID_PAYER ? (
                  <View className="rounded-full bg-success/15 px-2 py-0.5">
                    <Text variant="caption" className="font-medium text-success">
                      {I18n.t('transactions.editor.split.payer_tag')}
                    </Text>
                  </View>
                ) : null}
                <Text variant="body">{amount(row.amount)}</Text>
              </View>
            }
          />
        ))}
      </View>

      <SettlementBar
        text={I18n.t('transactions.editor.split.you_owe_summary', {
          name: FRIEND_PAID_PAYER,
          amount: amount(myShare),
        })}
      />
    </View>
  );
}

/** The method the sample is drawn in: Shares. */
const SELECTED_METHOD = 2;

const SHARES_TOTAL = 120;
const SHARES_ROWS: (SampleRow & { shares: number })[] = [
  { name: null, shares: 2, amount: 60 },
  { name: 'Sam', shares: 1, amount: 30 },
  { name: 'Alex', shares: 1, amount: 30 },
];

/** Split Bill by Shares: the four-way control, a stepper on each person and
 *  what their shares come to under their name. */
export function SplitMethodsShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const amount = (value: number) => money(value, settings);
  // What the friends pay the user back: everyone's part but the user's own.
  const friendsOwe = SHARES_ROWS.slice(1).reduce((sum, row) => sum + row.amount, 0);
  // Split Bill's method control, labelled as the page labels it.
  const methodLabels = [
    I18n.t('transactions.editor.split.method_amount'),
    '%',
    I18n.t('transactions.editor.split.method_shares'),
    '+/−',
  ];
  return (
    <View style={{ width }}>
      <View className="items-center pb-2">
        <Text variant="caption" tone="muted">
          {I18n.t('transactions.editor.split.bill_total_label')}
        </Text>
        <Text variant="subheading" className="mt-0.5">
          {amount(SHARES_TOTAL)}
        </Text>
      </View>

      <View className="flex-row rounded-2xl bg-secondary/60 p-1">
        {methodLabels.map((label, index) => (
          <View
            key={label}
            className="flex-1 items-center rounded-xl py-1.5"
            style={
              index === SELECTED_METHOD
                ? { backgroundColor: colors.card, ...SEGMENT_SHADOW }
                : undefined
            }
          >
            <Text
              variant="caption"
              numberOfLines={1}
              className={index === SELECTED_METHOD ? 'font-semibold text-foreground' : ''}
              tone={index === SELECTED_METHOD ? undefined : 'muted'}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>

      <View className="mt-2 overflow-hidden rounded-[18px] border border-border/25 bg-card">
        {SHARES_ROWS.map((row, index) => (
          <PersonRow
            key={row.name ?? 'me'}
            row={row}
            first={index === 0}
            under={
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {amount(row.amount)}
              </Text>
            }
            trailing={
              <View className="flex-row items-center rounded-full bg-secondary/50">
                <View className="h-7 w-7 items-center justify-center">
                  <Minus size={13} color={colors.text} />
                </View>
                <Text variant="bodyStrong" className="min-w-[22px] text-center">
                  {row.shares}
                </Text>
                <View className="h-7 w-7 items-center justify-center">
                  <Plus size={13} color={colors.text} />
                </View>
              </View>
            }
          />
        ))}
      </View>

      <SettlementBar
        text={I18n.t('transactions.editor.split.get_back_hint', { amount: amount(friendsOwe) })}
      />
    </View>
  );
}

const SEGMENT_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
} as const;

/** Sample lines of a spending breakdown: two albums with their icons, and a
 *  category beside them, as Insights lists them. */
const BREAKDOWN_ROWS = [
  { nameKey: 'news.showcase.album_trip', icon: 'plane', amount: 1240, album: true },
  { nameKey: 'news.showcase.budget_food', icon: 'burger', amount: 860, album: false },
  { nameKey: 'news.showcase.album_celebration', icon: '🎂', amount: 320, album: true },
] as const;

/** An album card with its icon in the dark strip, then a spending breakdown
 *  where each album's line is marked by its icon. */
export function AlbumIconsShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const amount = (value: number) => money(value, settings);
  const [trip] = BREAKDOWN_ROWS;
  const total = BREAKDOWN_ROWS.reduce((sum, row) => sum + row.amount, 0);
  // The Albums page draws its cards 2:1; a short sheet gets a slimmer one.
  const cardHeight = Math.round(width * 0.36);
  return (
    <View className="gap-2.5" style={{ width }}>
      {/* An album card with no cover: a tint, and its icon in the strip. */}
      <View
        className="overflow-hidden rounded-3xl border border-border/40"
        style={{ height: cardHeight, backgroundColor: withColorAlpha(colors.primary, 0.15) }}
      >
        <View
          className="absolute inset-x-0 bottom-0 flex-row items-center gap-3 px-3.5 pb-2.5 pt-3"
          style={{ backgroundColor: 'rgba(0,0,0,0.52)' }}
        >
          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-white/90">
            <AlbumLineIcon album={{ name: I18n.t(trip.nameKey), icon: trip.icon }} size={26} />
          </View>
          <View className="min-w-0 flex-1">
            <Text variant="caption" numberOfLines={1} className="text-white/80">
              {I18n.t(trip.nameKey)}
            </Text>
            <View className="mt-0.5 flex-row items-baseline justify-between gap-2">
              <Text variant="bodyStrong" numberOfLines={1} className="text-white">
                {amount(trip.amount)}
              </Text>
              <Text variant="label" numberOfLines={1} className="shrink text-white/70">
                {I18n.t('news.showcase.album_trip_meta')}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* The breakdown: an album is its own line, marked by its icon. */}
      <View className="rounded-[18px] border border-border/30 bg-card px-3.5 py-1.5">
        {BREAKDOWN_ROWS.map((row, index) => {
          const share = row.amount / total;
          return (
            <View
              key={row.nameKey}
              className={`flex-row items-center gap-2.5 py-2 ${index > 0 ? 'border-t border-border/15' : ''}`}
            >
              {/* A fixed slot: an emoji glyph draws wider than a bundled icon. */}
              <View className="h-6 w-6 items-center justify-center">
                {row.album ? (
                  <AlbumLineIcon album={{ name: I18n.t(row.nameKey), icon: row.icon }} size={24} />
                ) : (
                  <CategoryEmoji icon={row.icon} size={24} />
                )}
              </View>
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center justify-between gap-2">
                  <Text variant="body" numberOfLines={1} className="shrink">
                    {I18n.t(row.nameKey)}
                  </Text>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {amount(row.amount)}
                  </Text>
                </View>
                <View className="mt-1 h-1 overflow-hidden rounded-full bg-secondary/60">
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round(share * 100)}%`,
                      backgroundColor: row.album ? colors.lavender : colors.primary,
                    }}
                  />
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** A switch drawn, not wired: the showcase is a picture of the setting. */
function DrawnSwitch({ on }: { on: boolean }) {
  const colors = useThemeColors();
  return (
    <View
      className="h-6 w-10 justify-center rounded-full px-0.5"
      style={{ backgroundColor: on ? colors.primary : withColorAlpha(colors.border, 0.5) }}
    >
      <View className={`h-5 w-5 rounded-full bg-white ${on ? 'self-end' : 'self-start'}`} />
    </View>
  );
}

/** The people who joined the sample album, after the user. */
const ALBUM_FRIENDS = ['Aisha', 'Ben', 'Chen'] as const;
/** A sample invite link, shaped as the real ones are. */
const SAMPLE_INVITE = 'album.money2time.com/join/8KQ2MX';
const SAMPLE_BILL = { emoji: '🏝️', title: 'Villa', amount: 480, payer: 'Aisha' } as const;

/** A trip album shared with friends: its people on the card, Split with
 *  friends turned on with the invite link, and a friend's bill as
 *  album.money2time.com shows it to someone without the app. */
export function SharedAlbumsShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const me = useSelfPerson();
  const amount = (value: number) => money(value, settings);
  const tripName = I18n.t('news.showcase.album_trip');
  // Everyone's even part of the sample bill, the user included.
  const share = SAMPLE_BILL.amount / (ALBUM_FRIENDS.length + 1);
  return (
    <View className="gap-1.5" style={{ width }}>
      {/* The shared album card's strip: its people at the end of the name's
          line. Only the strip, so the page fits under longer languages. */}
      <View
        className="overflow-hidden rounded-2xl border border-border/40"
        style={{ backgroundColor: withColorAlpha(colors.sky, 0.25) }}
      >
        <View
          className="flex-row items-center gap-3 px-3.5 py-2.5"
          style={{ backgroundColor: 'rgba(0,0,0,0.52)' }}
        >
          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-white/90">
            <AlbumLineIcon album={{ name: tripName, icon: 'plane' }} size={26} />
          </View>
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center gap-2">
              <Text variant="caption" numberOfLines={1} className="flex-1 text-white/80">
                {tripName}
              </Text>
              <View className="flex-row items-center">
                {[null, ...ALBUM_FRIENDS].map((name, index) => (
                  <View
                    key={name ?? 'me'}
                    style={{ marginLeft: index === 0 ? 0 : -6 }}
                    className="rounded-full border-2 border-black/40 bg-card"
                  >
                    {name === null ? (
                      me.avatarUri ? (
                        <PersonAvatar
                          name={me.name}
                          partyKey={null}
                          size={20}
                          imageUri={me.avatarUri}
                        />
                      ) : (
                        <View className="h-5 w-5 items-center justify-center rounded-full bg-primary/15">
                          <Text className="text-[10px] font-semibold text-primary">
                            {Array.from(me.name)[0]?.toUpperCase()}
                          </Text>
                        </View>
                      )
                    ) : (
                      <PersonAvatar name={name} partyKey={debtPartyKey(name)} size={20} />
                    )}
                  </View>
                ))}
              </View>
            </View>
            <Text variant="bodyStrong" numberOfLines={1} className="mt-0.5 text-white">
              {amount(SAMPLE_BILL.amount)}
            </Text>
          </View>
        </View>
      </View>

      {/* New Album's switch, turned on, and the link the People page shares. */}
      <View className="rounded-[18px] border border-border/30 bg-card px-3.5 py-2.5">
        <View className="flex-row items-center justify-between gap-2">
          <Text variant="body" numberOfLines={1} className="shrink">
            {I18n.t('albums.share.row')}
          </Text>
          <DrawnSwitch on />
        </View>
        <View className="my-2 h-px bg-border/40" />
        <View
          className="flex-row items-center gap-2"
          accessibilityLabel={I18n.t('shared_ledgers.invite_link')}
        >
          <Link2 size={14} color={colors.textMuted} />
          <Text
            variant="caption"
            numberOfLines={1}
            adjustsFontSizeToFit
            className="flex-1 text-[12px] text-foreground"
          >
            {SAMPLE_INVITE}
          </Text>
          <View className="rounded-full bg-primary/15 px-2.5 py-1">
            <Text variant="caption" className="font-medium text-primary">
              {I18n.t('common.copy')}
            </Text>
          </View>
        </View>
      </View>

      {/* The album on the website, where a friend without the app adds bills. */}
      <View className="overflow-hidden rounded-[18px] border border-border/30 bg-card">
        <View className="flex-row items-center justify-center gap-1.5 bg-secondary/50 py-1.5">
          <Globe size={12} color={colors.textMuted} />
          <Text variant="caption" tone="muted" className="text-[11px]">
            album.money2time.com
          </Text>
        </View>
        <View className="flex-row items-center gap-2.5 px-3.5 py-2">
          <View className="h-6 w-6 items-center justify-center">
            <CategoryEmoji icon={SAMPLE_BILL.emoji} size={22} />
          </View>
          <View className="min-w-0 flex-1">
            <Text variant="body" numberOfLines={1}>
              {SAMPLE_BILL.title}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {I18n.t('transactions.settleUp.person_paid', { name: SAMPLE_BILL.payer })}
            </Text>
          </View>
          <View className="items-end">
            <Text variant="bodyStrong">{amount(SAMPLE_BILL.amount)}</Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {I18n.t('transactions.editor.split.your_share_label')} {amount(share)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
