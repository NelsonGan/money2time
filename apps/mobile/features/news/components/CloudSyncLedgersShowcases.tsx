import { Check, Cloud, Users } from 'lucide-react-native';
import React from 'react';
import { Image, View } from 'react-native';

import { CategoryEmoji, Text } from '~/components/ui';
import { CLOUD_SYNC_ART } from '~/features/cloudSync/components/art';
import { SHARED_LEDGER_ART } from '~/features/sharedLedgers/components/art';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

interface ShowcaseProps {
  width: number;
}

/** Two phones and the cloud between them, with the synced status. */
export function CloudSyncShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  return (
    <View className="items-center gap-3" style={{ width }}>
      <Image
        source={CLOUD_SYNC_ART}
        style={{ width: width * 0.86, height: width * 0.43 }}
        resizeMode="contain"
        accessible={false}
      />
      <View className="w-full flex-row items-center gap-3 rounded-[18px] border border-border/30 bg-card px-3 py-3">
        <View
          className="h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.success }}
        >
          <Check size={18} color={colors.card} strokeWidth={3} />
        </View>
        <View className="min-w-0 flex-1">
          <Text variant="bodyStrong" numberOfLines={1}>
            {I18n.t('cloud_sync.status_on')}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {I18n.t('news.showcase.synced_devices')}
          </Text>
        </View>
        <Cloud size={20} color={colors.primary} />
      </View>
    </View>
  );
}

const LEDGER_ROWS = [
  { icon: 'emoji:🏠', name: 'news.showcase.ledger_personal', currency: 'MYR', open: true },
  { icon: 'emoji:💼', name: 'news.showcase.ledger_work', currency: 'USD', open: false },
  { icon: 'emoji:✈️', name: 'news.showcase.ledger_travel', currency: 'JPY', open: false },
] as const;

/** A switcher of separate books, each in its own currency. */
export function LedgersShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  return (
    <View className="gap-2" style={{ width }}>
      {LEDGER_ROWS.map((row) => (
        <View
          key={row.name}
          className="flex-row items-center gap-3 rounded-[18px] border px-3 py-2.5"
          style={{
            backgroundColor: row.open ? withColorAlpha(colors.primary, 0.1) : colors.card,
            borderColor: row.open
              ? withColorAlpha(colors.primary, 0.3)
              : withColorAlpha(colors.text, 0.08),
          }}
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary/60">
            <CategoryEmoji icon={row.icon} size={22} />
          </View>
          <View className="min-w-0 flex-1">
            <Text variant="bodyStrong" numberOfLines={1}>
              {I18n.t(row.name)}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {row.currency}
            </Text>
          </View>
          {row.open ? (
            <View className="h-6 w-6 items-center justify-center rounded-full bg-primary">
              <Check size={14} color="#fff" strokeWidth={3} />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const PEOPLE = ['A', 'S', 'M'] as const;

/** One ledger, several people. */
export function SharedLedgersShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  return (
    <View className="items-center gap-3" style={{ width }}>
      <Image
        source={SHARED_LEDGER_ART}
        style={{ width: width * 0.8, height: width * 0.4 }}
        resizeMode="contain"
        accessible={false}
      />
      <View className="w-full flex-row items-center gap-3 rounded-[18px] border border-border/30 bg-card px-3 py-3">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary/60">
          <CategoryEmoji icon="emoji:🏡" size={22} />
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text variant="bodyStrong" numberOfLines={1} className="shrink">
              {I18n.t('news.showcase.ledger_family')}
            </Text>
            <Users size={14} color={colors.primary} />
          </View>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {I18n.t('shared_ledgers.status_with_other', { count: PEOPLE.length - 1 })}
          </Text>
        </View>
        <View className="flex-row">
          {PEOPLE.map((initial, index) => (
            <View
              key={initial}
              className="h-8 w-8 items-center justify-center rounded-full border-2"
              style={{
                marginLeft: index === 0 ? 0 : -8,
                borderColor: colors.card,
                backgroundColor: withColorAlpha(colors.primary, 0.12 + index * 0.08),
              }}
            >
              <Text variant="label" tone="primary">
                {initial}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
