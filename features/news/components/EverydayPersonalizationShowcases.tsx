import { Image } from 'expo-image';
import { Camera, Eye, EyeOff, GripVertical } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { CategoryEmoji, ItemIcon, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { formatAmount } from '~/utils/formatters';

interface ShowcaseProps {
  width: number;
}

const SAMPLE_TRANSACTIONS = [
  { key: 'news.showcase.budget_food', icon: '🍽️', amount: 28, selected: false },
  { key: 'news.showcase.budget_transport', icon: '🚕', amount: 14, selected: true },
  { key: 'news.showcase.autolog_merchant', icon: '☕', amount: 6, selected: false },
] as const;

const ITEM_ICON_EXAMPLES = [
  '3d-printer',
  'air-fryer',
  'drone',
  'electric-scooter',
  'robot-vacuum',
  'running-shoes',
] as const;

export function TransactionReorderShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const money = { ...settings, displayMode: 'money' as const };

  return (
    <View className="gap-2" style={{ width }}>
      {SAMPLE_TRANSACTIONS.map((transaction) => (
        <View
          key={transaction.key}
          className={
            transaction.selected
              ? 'flex-row items-center gap-3 rounded-[18px] border border-primary/40 bg-card px-3 py-3 shadow-float'
              : 'flex-row items-center gap-3 rounded-[18px] border border-border/30 bg-card px-3 py-3'
          }
          style={transaction.selected ? { transform: [{ translateX: -5 }] } : undefined}
        >
          <View className="h-8 w-8 items-center justify-center rounded-xl bg-secondary/50">
            <CategoryEmoji icon={transaction.icon} style={{ fontSize: 18 }} />
          </View>
          <Text variant="bodyStrong" numberOfLines={1} className="min-w-0 flex-1">
            {I18n.t(transaction.key)}
          </Text>
          <Text variant="mono" numberOfLines={1}>
            {formatAmount(transaction.amount, money, { showSign: false })}
          </Text>
          <GripVertical
            size={17}
            color={transaction.selected ? colors.primary : colors.textMuted}
          />
        </View>
      ))}
    </View>
  );
}

export function HomeCardsShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const money = { ...settings, displayMode: 'money' as const };

  return (
    <View className="flex-row gap-2" style={{ width }}>
      <View className="min-w-0 flex-1 gap-2">
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {I18n.t('settings.home_summary_left')}
        </Text>
        <View className="rounded-[18px] border border-success/20 bg-success/8 px-3 py-3">
          <View className="flex-row items-center gap-1">
            <Text variant="label" tone="success" numberOfLines={1}>
              {I18n.t('nav.income')}
            </Text>
            <Eye size={11} color={colors.textMuted} />
          </View>
          <Text variant="mono" numberOfLines={1} className="mt-2">
            {formatAmount(320, money, { showSign: false })}
          </Text>
        </View>
      </View>
      <View className="min-w-0 flex-1 gap-2">
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {I18n.t('settings.home_summary_right')}
        </Text>
        <View className="rounded-[18px] border border-primary/20 bg-primary/8 px-3 py-3">
          <View className="flex-row items-center gap-1">
            <Text variant="label" tone="primary" numberOfLines={1}>
              {I18n.t('nav.balance')}
            </Text>
            <EyeOff size={11} color={colors.textMuted} />
          </View>
          <Text variant="mono" className="mt-2">
            ••••••
          </Text>
        </View>
      </View>
    </View>
  );
}

export function ItemIconsShowcase({ width }: ShowcaseProps) {
  return (
    <View className="flex-row flex-wrap justify-center gap-3" style={{ width }}>
      {ITEM_ICON_EXAMPLES.map((iconId) => (
        <View
          key={iconId}
          className="h-[88px] w-[88px] items-center justify-center rounded-[22px] border border-border/30 bg-card shadow-soft"
        >
          <ItemIcon iconId={iconId} size={56} />
        </View>
      ))}
    </View>
  );
}

export function GoalCoversShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const money = { ...settings, displayMode: 'money' as const };

  return (
    <View
      className="overflow-hidden rounded-[22px] border border-border/30 bg-card shadow-soft"
      style={{ width }}
    >
      <View className="relative" style={{ width, aspectRatio: 2 }}>
        <Image
          source={require('../../../assets/news/goal-cover-japan.png')}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
        />
        <View className="absolute bottom-3 right-3 h-8 w-8 items-center justify-center rounded-full bg-black/45">
          <Camera size={16} color="#fff" />
        </View>
      </View>
      <View className="gap-3 px-4 py-3">
        <View className="flex-row items-center justify-between gap-2">
          <Text variant="bodyStrong" numberOfLines={1} className="min-w-0 flex-1">
            {I18n.t('news.showcase.goal_trip')}
          </Text>
          <Text variant="mono" style={{ color: colors.primary }}>
            68%
          </Text>
        </View>
        <View className="h-2 overflow-hidden rounded-full bg-secondary/60">
          <View className="h-2 w-[68%] rounded-full bg-primary" />
        </View>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {I18n.t('goals.saved_of_target', {
            saved: formatAmount(3400, money, { showSign: false }),
            target: formatAmount(5000, money, { showSign: false }),
          })}
        </Text>
      </View>
    </View>
  );
}
