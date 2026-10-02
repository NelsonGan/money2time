import { ArrowRight, Check, Image, Search, Share2, Wallet } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { CategoryEmoji, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { formatAmount } from '~/utils/formatters';

interface ShowcaseProps {
  width: number;
}

function SampleTransaction({ amount, account }: { amount: number; account?: boolean }) {
  const colors = useThemeColors();
  const { settings } = useApp();

  return (
    <View className="flex-row items-center gap-3 rounded-[18px] border border-border/30 bg-card px-3 py-3">
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-secondary/50">
        <CategoryEmoji icon="coffee" style={{ fontSize: 22 }} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="bodyStrong" numberOfLines={1}>
          {I18n.t('news.showcase.autolog_merchant')}
        </Text>
        {account ? (
          <View className="flex-row items-center gap-1">
            <Wallet size={12} color={colors.textMuted} />
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {I18n.t('accounts.account_name_placeholder')}
            </Text>
          </View>
        ) : null}
      </View>
      <Text variant="mono" tone="error" numberOfLines={1}>
        {formatAmount(-amount, { ...settings, displayMode: 'money' }, { showSign: true })}
      </Text>
    </View>
  );
}

export function AndroidScreenshotShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const tileSize = Math.min(64, Math.floor((width - 84) / 3));
  const tileStyle = { width: tileSize, height: tileSize };

  return (
    <View className="gap-4" style={{ width }}>
      <View className="flex-row items-center justify-center gap-3">
        <View
          className="items-center justify-center rounded-[20px] border border-border/30 bg-card"
          style={tileStyle}
        >
          <Image size={28} color={colors.sky} />
        </View>
        <ArrowRight size={18} color={colors.textMuted} />
        <View
          className="items-center justify-center rounded-[20px] bg-primary/10"
          style={tileStyle}
        >
          <Share2 size={28} color={colors.primary} />
        </View>
        <ArrowRight size={18} color={colors.textMuted} />
        <View
          className="items-center justify-center rounded-[20px] bg-success/10"
          style={tileStyle}
        >
          <Check size={28} color={colors.success} />
        </View>
      </View>
      <Text variant="label" tone="primary" className="text-center">
        {I18n.t('settings.auto_log.share_screenshot_title')}
      </Text>
      <SampleTransaction amount={4.5} />
      <Text variant="caption" tone="muted" className="text-center">
        {I18n.t('news.showcase.autolog_logged')}
      </Text>
    </View>
  );
}

export function TransactionAccountsShowcase({ width }: ShowcaseProps) {
  return (
    <View className="gap-3" style={{ width }}>
      <SampleTransaction amount={4.5} account />
      <View className="flex-row items-center gap-3 rounded-[18px] border border-border/30 bg-card px-3 py-3">
        <Text variant="caption" className="min-w-0 flex-1">
          {I18n.t('settings.show_transaction_account')}
        </Text>
        <View className="h-6 w-10 items-end justify-center rounded-full bg-primary px-1">
          <View className="h-4 w-4 rounded-full bg-primary-foreground" />
        </View>
      </View>
    </View>
  );
}

export function AmountSearchShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();

  return (
    <View className="gap-3" style={{ width }}>
      <View className="flex-row items-center gap-3 rounded-[18px] border border-lavender/30 bg-card px-4 py-3">
        <Search size={19} color={colors.lavender} />
        <Text variant="mono">
          {formatAmount(4.5, { ...settings, displayMode: 'money' }, { showSign: false })}
        </Text>
      </View>
      <SampleTransaction amount={4.5} account />
    </View>
  );
}
