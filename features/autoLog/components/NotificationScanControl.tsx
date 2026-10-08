import React from 'react';
import { View } from 'react-native';

import { FormSwitchRow } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';

/** Shared notification scanning toggle on Android and iOS. */
export function NotificationScanControl() {
  const { paymentAlertPrefs, updatePaymentAlertPrefs } = useApp();
  return (
    <View className="p-4">
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
