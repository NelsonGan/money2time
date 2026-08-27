import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { ClayIcon, type ClayIconName, Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { usePressScale } from '~/hooks/usePressScale';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

import type { Tutorial } from '../content/types';

/**
 * Illustration per tutorial. Reuses the existing clay sets rather than adding
 * artwork, so a row reads as the part of the app it leads into. Kept here and
 * keyed by id rather than on the catalog itself, because the catalog is shared
 * verbatim with the website, which has no clay icons.
 */
const TUTORIAL_ICON: Record<string, ClayIconName> = {
  'getting-started': 'settings/replay',
  'see-prices-in-hours': 'settings/hourly-value',
  'find-your-way-around': 'nav/home',
  'change-how-it-looks': 'settings/display',
  'log-an-expense': 'entry/keypad',
  'the-add-button': 'entry/add-square',
  transfers: 'money-time/transfer',
  'log-by-voice': 'entry/mic',
  'scan-a-receipt': 'entry/scan-receipt',
  'find-a-transaction': 'ui/search',
  automations: 'settings/auto-log',
  accounts: 'settings/accounts',
  categories: 'settings/categories',
  recurring: 'settings/recurring',
  albums: 'settings/albums',
  items: 'settings/items',
  'multi-currency': 'settings/exchange-rates',
  'financial-month': 'ui/calendar',
  budgets: 'settings/budget',
  goals: 'status/goal-target',
  'split-a-bill': 'money-time/split-bill',
  'split-by-item': 'entry/split-notes',
  'settle-up': 'settings/settle-up',
  reimbursements: 'money-time/wallet-in',
  calendar: 'money-time/calendar-clock',
  insights: 'money-time/donut-chart',
  review: 'money-time/chart-up',
  widgets: 'entry/press-button',
  backup: 'status/cloud-upload',
  'import-data': 'settings/statement-import',
  'app-lock': 'settings/app-lock',
  'bulk-edit': 'entry/settings-sliders',
  sentiment: 'insights/mood-faces',
  'fix-a-balance': 'money-time/balance-scale',
  'credit-cards': 'money-time/card',
  loans: 'money-time/invoice',
  'simple-or-power': 'settings/quick-entry',
  notifications: 'settings/notifications',
  'update-your-pay': 'money-time/chart-up',
};

/** Used when a new tutorial lands before its icon does. */
const FALLBACK_ICON: ClayIconName = 'ui/checklist';

interface TutorialRowProps {
  tutorial: Tutorial;
  onPress: (id: string) => void;
}

/**
 * A real component rather than markup inside the list's `renderItem`, because
 * the press animation needs its own hook state per row (and because a function
 * `style` prop does not survive NativeWind's Pressable wrapper).
 */
export function TutorialRow({ tutorial, onPress }: TutorialRowProps) {
  const themeColors = useThemeColors();
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.98 });

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tutorial.title}
        onPress={() => onPress(tutorial.id)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.card,
          { backgroundColor: themeColors.card, borderColor: themeColors.border },
        ]}
      >
        <ClayIcon name={TUTORIAL_ICON[tutorial.id] ?? FALLBACK_ICON} size={34} flatSize={20} />
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text variant="body" className="flex-shrink text-foreground font-semibold">
              {tutorial.title}
            </Text>
            {tutorial.pro ? (
              <View style={[styles.badge, { backgroundColor: themeColors.primary }]}>
                <Text variant="caption" style={styles.badgeTextOnPrimary}>
                  {I18n.t('tutorials.badge_pro')}
                </Text>
              </View>
            ) : null}
            {tutorial.platform === 'ios' ? (
              <View style={[styles.badge, { backgroundColor: `${themeColors.primary}1A` }]}>
                <Text variant="caption" style={{ color: themeColors.primary, fontWeight: '600' }}>
                  {I18n.t('tutorials.badge_ios')}
                </Text>
              </View>
            ) : null}
          </View>
          <Text variant="caption" tone="muted">
            {tutorial.summary}
          </Text>
          <Text variant="caption" style={{ color: themeColors.primary }}>
            {I18n.t('tutorials.step_count', { count: tutorial.steps.length })}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeTextOnPrimary: {
    color: '#fff',
    fontWeight: '700',
  },
});
