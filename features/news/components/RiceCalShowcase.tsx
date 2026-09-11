import React from 'react';
import { Image, View } from 'react-native';

import { Text } from '~/components/ui';
import { SavingsRateRing } from '~/features/insights/components/SavingsRateRing';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

const RICECAL_ICON = require('~/assets/brands/ricecal-app-icon.png');
const RICECAL_MASCOT = require('~/assets/brands/ricecal-mascot.png');
const NASI_LEMAK = require('~/assets/brands/ricecal-nasi-lemak.png');

const MACROS = [
  { key: 'ricecal_carbs', progress: 58, tone: 'accent' },
  { key: 'ricecal_protein', progress: 72, tone: 'error' },
  { key: 'ricecal_fat', progress: 44, tone: 'coral' },
] as const;

interface RiceCalShowcaseProps {
  width: number;
}

/**
 * A compact reconstruction of RiceCal's Today screen: its calorie ring, macro
 * bars, and a local-food diary row. The real app artwork keeps the preview
 * recognizable while Money2Time's theme tokens keep the panel legible in every
 * palette and in dark mode.
 */
export function RiceCalShowcase({ width }: RiceCalShowcaseProps) {
  const colors = useThemeColors();
  const previewWidth = Math.min(width, 318);
  const ringTrack = withColorAlpha(colors.text, 0.1);

  return (
    <View
      className="overflow-hidden rounded-[28px] border border-border/30 bg-background p-3 shadow-soft"
      style={{ width: previewWidth }}
    >
      <View className="flex-row items-center gap-2.5 px-1 pr-9 pb-2.5">
        <Image
          accessible={false}
          className="h-10 w-10 rounded-xl"
          resizeMode="cover"
          source={RICECAL_ICON}
        />
        <View className="min-w-0 flex-1">
          <Text variant="bodyStrong" numberOfLines={1}>
            {I18n.t('news.ricecal.title')}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {I18n.t('news.showcase.ricecal_today')}
          </Text>
        </View>
        <Image
          accessible={false}
          className="h-[52px] w-[52px]"
          resizeMode="contain"
          source={RICECAL_MASCOT}
        />
      </View>

      <View className="flex-row items-center gap-3 rounded-[22px] border border-border/30 bg-card p-3">
        <SavingsRateRing
          size={82}
          strokeWidth={9}
          progress={0.39}
          color={colors.success}
          trackColor={ringTrack}
        >
          <View className="items-center">
            <Text variant="mono" style={{ fontSize: 16, lineHeight: 19 }}>
              {(1280).toLocaleString()}
            </Text>
            <Text
              variant="label"
              tone="muted"
              numberOfLines={1}
              style={{ fontSize: 7, lineHeight: 10 }}
            >
              {I18n.t('news.showcase.ricecal_kcal_left')}
            </Text>
          </View>
        </SavingsRateRing>

        <View className="min-w-0 flex-1 gap-2">
          {MACROS.map((macro) => {
            const color = colors[macro.tone];
            return (
              <View key={macro.key}>
                <View className="mb-1 flex-row items-center gap-2">
                  <Text variant="caption" numberOfLines={1} className="min-w-0 flex-1">
                    {I18n.t('news.showcase.' + macro.key)}
                  </Text>
                </View>
                <View
                  className="h-1.5 overflow-hidden rounded-full"
                  style={{ backgroundColor: withColorAlpha(colors.text, 0.08) }}
                >
                  <View
                    className="h-full rounded-full"
                    style={{ width: `${macro.progress}%`, backgroundColor: color }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View className="mt-2.5 flex-row items-center gap-3 rounded-[20px] border border-border/30 bg-card px-3 py-2.5">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-secondary/60">
          <Image
            accessible={false}
            className="h-11 w-11"
            resizeMode="contain"
            source={NASI_LEMAK}
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text variant="caption" numberOfLines={1}>
            {I18n.t('news.showcase.ricecal_nasi_lemak')}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {I18n.t('news.showcase.ricecal_one_plate')}
          </Text>
        </View>
        <View className="items-end">
          <Text variant="mono">{620}</Text>
          <Text variant="label" tone="muted">
            {I18n.t('news.showcase.ricecal_kcal')}
          </Text>
        </View>
      </View>
    </View>
  );
}
