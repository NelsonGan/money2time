import React from 'react';
import { Image, View } from 'react-native';

import { Text } from '~/components/ui';
import { SavingsRateRing } from '~/features/insights/components/SavingsRateRing';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

const RICECAL_ICON = require('~/assets/brands/ricecal-app-icon.png');
const NASI_LEMAK = require('~/assets/brands/ricecal-nasi-lemak.png');
const CHAR_KUEY_TEOW = require('~/assets/brands/ricecal-char-kuey-teow.png');
const CHICKEN_RICE = require('~/assets/brands/ricecal-chicken-rice.png');

const MACROS = [
  { key: 'ricecal_carbs', progress: 58, tone: 'accent' },
  { key: 'ricecal_protein', progress: 72, tone: 'error' },
  { key: 'ricecal_fat', progress: 44, tone: 'coral' },
] as const;

const FOODS = [
  { key: 'ricecal_nasi_lemak', image: NASI_LEMAK, kcal: 740 },
  { key: 'ricecal_char_kuey_teow', image: CHAR_KUEY_TEOW, kcal: 745 },
  { key: 'ricecal_chicken_rice', image: CHICKEN_RICE, kcal: 600 },
] as const;

interface RiceCalShowcaseProps {
  width: number;
}

/**
 * A compact reconstruction of RiceCal's Today screen: its calorie ring, macro
 * bars, and local-food diary rows. The real app artwork keeps the preview
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
        <Text variant="bodyStrong" numberOfLines={1} className="min-w-0 flex-1">
          {I18n.t('news.ricecal.title')}
        </Text>
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

      <View className="mt-2.5 overflow-hidden rounded-[20px] border border-border/30 bg-card">
        {FOODS.map((food, index) => (
          <View
            key={food.key}
            className="flex-row items-center gap-2.5 px-3 py-2"
            style={index > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}
          >
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-secondary/60">
              <Image
                accessible={false}
                className="h-9 w-9"
                resizeMode="contain"
                source={food.image}
              />
            </View>
            <View className="min-w-0 flex-1">
              <Text variant="caption" numberOfLines={1}>
                {I18n.t('news.showcase.' + food.key)}
              </Text>
              <Text variant="label" tone="muted" numberOfLines={1}>
                {I18n.t('news.showcase.ricecal_one_plate')}
              </Text>
            </View>
            <View className="items-end">
              <Text variant="mono">{food.kcal}</Text>
              <Text variant="label" tone="muted">
                {I18n.t('news.showcase.ricecal_kcal')}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
