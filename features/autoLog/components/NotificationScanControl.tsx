import React from 'react';
import { View } from 'react-native';

import { FormSwitchRow, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';

/** The same explicit text-upload disclosure on Android and iOS. */
export function NotificationScanControl() {
  const { paymentAlertPrefs, updatePaymentAlertPrefs } = useApp();
  return (
    <View className="gap-3 p-4">
      <Text variant="caption" tone="muted">
        {I18n.t('payment_alerts.scan_disclosure')}
      </Text>
      <FormSwitchRow
        label={I18n.t('payment_alerts.scan_enabled')}
        value={paymentAlertPrefs.notificationScanningEnabled}
        onValueChange={(enabled) => {
          updatePaymentAlertPrefs((previous) => ({
            ...previous,
            notificationScanningEnabled: enabled,
          }));
        }}
      />
    </View>
  );
}
