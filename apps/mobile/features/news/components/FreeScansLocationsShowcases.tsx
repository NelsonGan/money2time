import { MapPin } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { CategoryEmoji } from '~/components/ui/CategoryEmoji';
import { ClayIcon } from '~/components/ui/ClayIcon';
import { PRO_LIMITS } from '~/constants/proLimits';
import { useApp } from '~/context/AppContext';
import { money } from '~/features/budget/lib/format';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { cn } from '~/utils';
import { withColorAlpha } from '~/utils/color';

interface ShowcaseProps {
  width: number;
}

// The showcases draw the real screens in miniature, with the app's own copy.
// Merchant and place names are sample data, the same in every language.

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

const SAMPLE_SCANNED_ROWS = [
  { emoji: 'coffee', merchant: 'Kopi Kita', amount: 18.5 },
  { emoji: 'grocery-basket', merchant: 'FreshMart', amount: 64.2 },
] as const;

/** Free plan monthly scan allowance (from PRO_LIMITS) above two sample scanned
 *  expenses, mirroring the receipt scan result rows. */
export function FreeScansShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const amount = (value: number) => money(value, settings);

  return (
    <View className="gap-2.5" style={{ width }}>
      <View className="flex-row items-center justify-between gap-3 rounded-[20px] border border-border/30 bg-card px-4 py-3.5 shadow-soft">
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <View className="rounded-full bg-success/15 px-2.5 py-0.5">
              <Text variant="label" tone="success" numberOfLines={1}>
                {I18n.t('pro.free_title')}
              </Text>
            </View>
            <Text variant="caption" tone="muted" numberOfLines={1} className="shrink">
              {I18n.t('pro.receipt_scans_label')}
            </Text>
          </View>
          <View className="mt-1.5 flex-row items-baseline gap-1">
            <Text variant="display" tone="success">
              {PRO_LIMITS.FREE_MAX_RECEIPT_SCANS}
            </Text>
            <Text variant="bodyStrong" tone="muted" numberOfLines={1}>
              {I18n.t('pro.per_month_short')}
            </Text>
          </View>
        </View>
        <View
          className="h-14 w-14 items-center justify-center rounded-2xl border"
          style={{
            backgroundColor: withColorAlpha(colors.success, 0.1),
            borderColor: withColorAlpha(colors.success, 0.2),
          }}
        >
          <ClayIcon name="money-time/receipt" size={34} flatSize={22} />
        </View>
      </View>

      <View className="rounded-[18px] border border-border/30 bg-card px-3.5 py-1.5">
        {SAMPLE_SCANNED_ROWS.map((row, index) => (
          <View
            key={row.merchant}
            className={`flex-row items-center gap-2.5 py-2 ${index > 0 ? 'border-t border-border/15' : ''}`}
          >
            <ClayIcon name="status/success" size={18} flatSize={14} />
            <CategoryEmoji icon={row.emoji} size={18} />
            <Text variant="body" className="flex-1 text-foreground" numberOfLines={1}>
              {row.merchant}
            </Text>
            <Text variant="bodyStrong" className="text-foreground" numberOfLines={1}>
              {amount(row.amount)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** A miniature Spending map price pin, styled after PlacePricePin. */
function MiniPricePin({ label, selected }: { label: string; selected?: boolean }) {
  const colors = useThemeColors();
  return (
    <View className="items-center">
      <View
        className={cn(
          'rounded-full border-2 px-2.5 py-0.5',
          selected ? 'border-primary bg-primary' : 'border-primary/70 bg-card',
        )}
      >
        <Text
          numberOfLines={1}
          className={cn(
            'text-[12px] font-extrabold leading-4',
            selected ? 'text-primary-foreground' : 'text-primary',
          )}
        >
          {label}
        </Text>
      </View>
      <View
        style={{
          width: 0,
          height: 0,
          marginTop: -1,
          borderLeftWidth: 5,
          borderRightWidth: 5,
          borderTopWidth: 6,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: colors.primary,
        }}
      />
      <View className="mt-0.5 h-1.5 w-1.5 rounded-full border border-card bg-primary" />
    </View>
  );
}

/** A stylized Spending map preview with price pins above a location-tagged
 *  transaction row and the Auto-tag switch from Personalize settings. */
export function LocationTaggingShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const amount = (value: number) => money(value, settings);
  const roadColor = withColorAlpha(colors.border, 0.45);

  return (
    <View className="gap-2.5" style={{ width }}>
      {/* Stylized Spending map card with price pins (no native MapView in the modal). */}
      <View
        className="h-[132px] overflow-hidden rounded-[20px] border border-border/30 bg-card"
        style={{ backgroundColor: withColorAlpha(colors.primary, 0.05) }}
      >
        {/* Soft park and water patches */}
        <View
          className="absolute -right-6 -top-4 h-24 w-28 rounded-full"
          style={{ backgroundColor: withColorAlpha(colors.sky, 0.14) }}
        />
        <View
          className="absolute -bottom-6 -left-4 h-20 w-28 rounded-full"
          style={{ backgroundColor: withColorAlpha(colors.success, 0.14) }}
        />

        {/* Subtle road grid */}
        <View
          className="absolute inset-x-0 top-[46px] h-[2px]"
          style={{ backgroundColor: roadColor }}
        />
        <View
          className="absolute inset-x-0 top-[96px] h-[1.5px]"
          style={{ backgroundColor: roadColor }}
        />
        <View
          className="absolute inset-y-0 left-[94px] w-[2px]"
          style={{ backgroundColor: roadColor }}
        />
        <View
          className="absolute inset-y-0 right-[86px] w-[1.5px]"
          style={{ backgroundColor: roadColor }}
        />

        {/* Spending map badge */}
        <View className="absolute left-3 top-2.5 flex-row items-center gap-1 rounded-full border border-border/30 bg-card/95 px-2.5 py-1">
          <MapPin size={12} color={colors.primary} />
          <Text variant="caption" className="font-semibold text-foreground" numberOfLines={1}>
            {I18n.t('locations.map_title')}
          </Text>
        </View>

        {/* Price pins placed across the map */}
        <View className="absolute bottom-3 left-5">
          <MiniPricePin label={amount(18.5)} />
        </View>
        <View className="absolute left-[40%] top-[44px]">
          <MiniPricePin label={amount(42)} selected />
        </View>
        <View className="absolute right-4 top-6">
          <MiniPricePin label={amount(86)} />
        </View>
      </View>

      {/* Tagged expense row + Auto-tag toggle */}
      <View className="rounded-[18px] border border-border/30 bg-card px-3.5 py-2.5">
        <View className="flex-row items-center gap-2.5">
          <View className="h-9 w-9 items-center justify-center rounded-xl bg-secondary/50">
            <CategoryEmoji icon="coffee" size={20} />
          </View>
          <View className="min-w-0 flex-1">
            <Text variant="bodyStrong" numberOfLines={1}>
              Kopi Kita
            </Text>
            <View className="mt-0.5 flex-row items-center gap-1">
              <MapPin size={11} color={colors.primary} />
              <Text variant="caption" tone="muted" numberOfLines={1} className="shrink">
                Mid Valley
              </Text>
            </View>
          </View>
          <Text variant="bodyStrong" numberOfLines={1}>
            {amount(18.5)}
          </Text>
        </View>
        <View className="my-2 h-px bg-border/40" />
        <View className="flex-row items-center justify-between gap-2">
          <Text variant="caption" className="flex-1 text-foreground" numberOfLines={1}>
            {I18n.t('locations.auto_tag')}
          </Text>
          <DrawnSwitch on />
        </View>
      </View>
    </View>
  );
}
