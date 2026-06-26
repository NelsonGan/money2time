import { CalendarDays } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getBottomNavReservedInset } from '~/components/navigation/BottomNav';
import { Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

interface TodayJumpFabProps {
  onPress: () => void;
}

const FAB_BOTTOM_GAP = 12;

/**
 * Floating "Today" pill, anchored bottom-left. Rendered at the shell root next
 * to the Add button (which sits bottom-right) so it shares the exact same
 * full-height positioning context — anchoring it inside CalendarScreen left it
 * floating too high on Android, because that nested view didn't resolve to the
 * full screen height. Mirrors AddFab's container so both align along the bottom.
 */
export function TodayJumpFab({ onPress }: TodayJumpFabProps) {
  const themeColors = useThemeColors();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const { isTablet } = useDeviceLayout();

  const handlePress = useCallback(() => {
    void triggerHaptic('selection');
    onPress();
  }, [onPress]);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.anchor, { bottom: getBottomNavReservedInset(safeBottom) + FAB_BOTTOM_GAP }]}
    >
      <View pointerEvents="box-none" style={[styles.inner, isTablet && styles.innerTablet]}>
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('common.today')}
          className="flex-row items-center gap-1.5 rounded-full bg-card border border-border/40 px-3.5 py-2.5 active:opacity-85"
          style={styles.pill}
        >
          <CalendarDays size={15} color={themeColors.primary} />
          <Text variant="caption" style={{ color: themeColors.primary }}>
            {I18n.t('common.today')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  inner: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingLeft: spacing.lg,
  },
  innerTablet: {
    width: '100%',
    maxWidth: TABLET_CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  pill: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
});
