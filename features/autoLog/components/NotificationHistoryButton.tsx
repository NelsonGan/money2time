import { History } from 'lucide-react-native';
import React from 'react';
import { Pressable } from 'react-native';

import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

export function NotificationHistoryButton({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <Pressable
      className="h-11 w-11 items-center justify-center rounded-full"
      accessibilityRole="button"
      accessibilityLabel={I18n.t('payment_alerts.history')}
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
    >
      <History size={20} color={colors.primary} />
    </Pressable>
  );
}
