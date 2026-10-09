import { Trash2 } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import {
  FormSwitchRow,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { PaymentAlertChannel, PaymentAlertSource } from '~/types';

import { PaysFromControl } from '../components/PaysFromControl';
import { findAlertSource, withAlertSource, withoutAlertSource } from '../lib/prefs';

interface PaymentAlertSourceScreenProps {
  channel: PaymentAlertChannel;
  sourceKey: string;
  onBack: () => void;
}

export function PaymentAlertSourceScreen({
  channel,
  sourceKey,
  onBack,
}: PaymentAlertSourceScreenProps) {
  const { paymentAlertPrefs: prefs, updatePaymentAlertPrefs: updatePrefs } = useApp();
  const bottomInset = useSettingsBottomNavInset();
  const colors = useThemeColors();
  const source = findAlertSource(prefs, channel, sourceKey);
  const update = useCallback(
    (patch: Partial<PaymentAlertSource>) => {
      updatePrefs((previous) => {
        const current = findAlertSource(previous, channel, sourceKey);
        return current ? withAlertSource(previous, { ...current, ...patch }) : previous;
      });
    },
    [channel, sourceKey, updatePrefs],
  );
  const remove = () => {
    if (!source) return;
    Alert.alert(
      I18n.t('payment_alerts.source_remove_title', { app: source.label }),
      I18n.t('payment_alerts.source_remove_body_android'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.remove'),
          style: 'destructive',
          onPress: () => {
            updatePrefs((previous) => withoutAlertSource(previous, channel, sourceKey));
            onBack();
          },
        },
      ],
    );
  };
  return (
    <SettingsPageLayout>
      <ScrollView className="flex-1" contentContainerStyle={bottomInset}>
        <View className="gap-6 px-5">
          <SettingsHeader
            className="px-0 pt-5 pb-0"
            onBack={onBack}
            title={source?.label ?? I18n.t('payment_alerts.title')}
            rightAccessory={
              source ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('common.remove')}
                  hitSlop={8}
                  className="h-10 w-10 items-center justify-center rounded-full bg-destructive/10"
                  onPress={() => {
                    void triggerHaptic('selection');
                    remove();
                  }}
                >
                  <Trash2 size={18} color={colors.error} />
                </Pressable>
              ) : undefined
            }
          />
          {source ? (
            <>
              <View className="gap-3 rounded-2xl border border-border/30 bg-card p-4">
                <Text variant="caption" tone="muted">
                  {I18n.t('payment_alerts.source_enabled_hint')}
                </Text>
                <FormSwitchRow
                  label={I18n.t('payment_alerts.master_label')}
                  value={source.enabled}
                  onValueChange={(enabled) => update({ enabled })}
                />
              </View>
              <View className="gap-3 rounded-2xl border border-border/30 bg-card p-4">
                <Text variant="bodyStrong">{I18n.t('transactions.editor.account')}</Text>
                <Text variant="caption" tone="muted">
                  {I18n.t('payment_alerts.account_hint')}
                </Text>
                <PaysFromControl
                  accountId={source.accountId}
                  onChange={(accountId) => update({ accountId })}
                />
              </View>
            </>
          ) : (
            <Text tone="muted">{I18n.t('payment_alerts.source_missing')}</Text>
          )}
        </View>
      </ScrollView>
    </SettingsPageLayout>
  );
}
