import { History } from 'lucide-react-native';
import React from 'react';
import { Pressable } from 'react-native';

import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

/**
 * Sits inline with a caption-sized section title, so the visible box is only
 * as tall as the icon (a 44pt box made the header taller than its neighbours).
 * The hit slop keeps the tap target at about 44pt.
 */
export function NotificationHistoryButton({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <Pressable
      className="items-center justify-center px-1"
      hitSlop={{ top: 15, bottom: 15, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={I18n.t('payment_alerts.history')}
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
    >
      <History size={14} color={colors.primary} />
    </Pressable>
  );
}
