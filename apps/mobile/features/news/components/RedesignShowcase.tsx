import { Clock, Repeat, SlidersHorizontal } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

interface RedesignShowcaseProps {
  width: number;
}

const ITEMS = [
  { icon: SlidersHorizontal, labelKey: 'settings.title' },
  { icon: Clock, labelKey: 'settings.hourly_value' },
  { icon: Repeat, labelKey: 'settings.recurring' },
] as const;

export function RedesignShowcase({ width }: RedesignShowcaseProps) {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, { width }]}>
      {ITEMS.map(({ icon: Icon, labelKey }) => (
        <View
          key={labelKey}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.08) },
          ]}
        >
          <View
            style={[styles.iconBubble, { backgroundColor: withColorAlpha(colors.lavender, 0.16) }]}
          >
            <Icon size={22} color={colors.lavender} strokeWidth={2.2} />
          </View>
          <Text variant="caption" numberOfLines={2} style={[styles.label, { color: colors.text }]}>
            {I18n.t(labelKey)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  card: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 18,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    textAlign: 'center',
    fontWeight: '600',
  },
});
