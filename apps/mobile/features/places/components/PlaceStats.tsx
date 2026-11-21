import type { LucideIcon } from 'lucide-react-native';
import { Fragment } from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui/text';
import { useThemeColors } from '~/hooks/useThemeColors';

export interface PlaceStat {
  key: string;
  value: string;
  label: string;
  icon?: LucideIcon;
  tone?: 'default' | 'primary' | 'success';
}

/**
 * The figures of a place on the spending map (visits, spent, hours of work) as
 * one strip of columns, the money first in weight.
 */
export function PlaceStats({ stats }: { stats: readonly PlaceStat[] }) {
  const themeColors = useThemeColors();
  return (
    <View className="flex-row items-stretch rounded-2xl border border-border/30 bg-secondary/30 py-2.5">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Fragment key={stat.key}>
            {index > 0 ? <View className="my-1 w-px bg-border/50" /> : null}
            <View className="min-w-0 flex-1 flex-row items-center justify-center gap-2 px-2">
              {Icon ? <Icon size={17} color={themeColors.textMuted} /> : null}
              <View className="min-w-0 shrink items-center">
                <Text
                  variant={stat.tone && stat.tone !== 'default' ? 'subheading' : 'bodyStrong'}
                  tone={stat.tone ?? 'default'}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {stat.value}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {stat.label}
                </Text>
              </View>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}
