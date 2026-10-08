import { History } from 'lucide-react-native';
import React from 'react';
import { Pressable } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

export function NotificationHistoryButton({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <Pressable
      className="min-h-11 flex-row items-center justify-center gap-2 px-3"
      accessibilityRole="button"
      accessibilityLabel={I18n.t('payment_alerts.history')}
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
    >
      <History size={18} color={colors.primary} />
      <Text variant="caption" tone="primary">
        {I18n.t('payment_alerts.history')}
      </Text>
    </Pressable>
  );
}
