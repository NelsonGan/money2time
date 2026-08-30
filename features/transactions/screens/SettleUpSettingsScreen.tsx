import * as ImagePicker from 'expo-image-picker';
import { ChevronRight, ImagePlus, QrCode, Wallet } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AccountLogo,
  AccountPickerSheet,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import { deletePaymentQr, getPaymentQrUri, savePaymentQr } from '~/services/userAssets';
import { getErrorMessage } from '~/utils/errorHandling';

interface SettleUpSettingsScreenProps {
  onBack: () => void;
}

/**
 * Full-page settings for Settle Up: the default paid-to account and the payment
 * QR shared onto every receipt. Reached from the gear button on the Settle Up
 * header (and from the "add your payment QR" prompt shown when sharing a
 * receipt without a QR attached).
 */
export function SettleUpSettingsScreen({ onBack }: SettleUpSettingsScreenProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, accounts, accountGroups, getAccountById } = useApp();

  const [accountPickerVisible, setAccountPickerVisible] = useState(false);

  const qrUri = useMemo(() => getPaymentQrUri(settings.paymentQrUri), [settings.paymentQrUri]);
  // Skip a uri that failed to load natively; see CategoryEmoji for why.
  const [brokenQrUri, setBrokenQrUri] = useState<string | null>(null);
  const effectiveQrUri = qrUri !== brokenQrUri ? qrUri : null;

  // The effective default is never empty: fall back to the first account so a
  // brand-new user still gets a sensible "paid to" on their first split.
  const defaultPaybackAccountId = useMemo(
    () => settings.defaultPaybackAccountId ?? accounts[0]?.id ?? null,
    [settings.defaultPaybackAccountId, accounts],
  );
  const defaultPaybackAccount = defaultPaybackAccountId
    ? getAccountById(defaultPaybackAccountId)
    : null;

  const handlePickDefaultAccount = useCallback(
    (accountId: string) => {
      void triggerHaptic('selection');
      updateSettings({ defaultPaybackAccountId: accountId });
      setAccountPickerVisible(false);
    },
    [updateSettings],
  );

  const handlePickQr = useCallback(async () => {
    void triggerHaptic('selection');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        I18n.t('accounts.logo.permission_title'),
        I18n.t('accounts.logo.permission_message'),
      );
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const previous = settings.paymentQrUri;
      const relativePath = savePaymentQr(result.assets[0].uri);
      updateSettings({ paymentQrUri: relativePath });
      if (previous) deletePaymentQr(previous);
      trackEvent(AnalyticsEvents.SETTLE_UP_QR_SET);
    } catch (error) {
      // The picker itself can reject, not just the save step below it.
      Alert.alert(I18n.t('errors.generic_operation_failed'), getErrorMessage(error));
    }
  }, [settings.paymentQrUri, updateSettings]);

  const handleRemoveQr = useCallback(() => {
    void triggerHaptic('warning');
    const previous = settings.paymentQrUri;
    updateSettings({ paymentQrUri: null });
    if (previous) deletePaymentQr(previous);
  }, [settings.paymentQrUri, updateSettings]);

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onBack}
        title={I18n.t('transactions.settleUp.settings_title')}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {/* Default paid-to account: new splits pre-fill their payback with it */}
        <View className="mt-2 rounded-[24px] border border-border/25 bg-card/60 px-4 py-4">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/15">
              <Wallet size={20} color={themeColors.primary} />
            </View>
            <View className="flex-1">
              <Text variant="bodyStrong">
                {I18n.t('transactions.settleUp.default_account_title')}
              </Text>
              <Text variant="caption" tone="muted">
                {I18n.t('transactions.settleUp.default_account_subtitle')}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              setAccountPickerVisible(true);
            }}
            className="mt-4 flex-row items-center justify-between rounded-2xl bg-secondary/50 px-3.5 py-3 active:opacity-70"
          >
            <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
              {defaultPaybackAccount ? (
                <AccountLogo
                  logoId={defaultPaybackAccount.logoId}
                  type={defaultPaybackAccount.type}
                  goalEmoji={defaultPaybackAccount.goalEmoji}
                  size={22}
                />
              ) : null}
              <Text variant="body" numberOfLines={1}>
                {defaultPaybackAccount?.name ?? I18n.t('common.no_account')}
              </Text>
            </View>
            <ChevronRight size={16} color={themeColors.textMuted} />
          </Pressable>
        </View>

        {/* Payment QR card, attached once and shared onto every receipt */}
        <View className="mt-6 rounded-[24px] border border-border/25 bg-card/60 px-4 py-4">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/15">
              <QrCode size={20} color={themeColors.primary} />
            </View>
            <View className="flex-1">
              <Text variant="bodyStrong">{I18n.t('transactions.settleUp.qr_card_title')}</Text>
              <Text variant="caption" tone="muted">
                {I18n.t('transactions.settleUp.qr_card_subtitle')}
              </Text>
            </View>
          </View>

          {effectiveQrUri ? (
            <View className="mt-4 items-center">
              <Pressable onPress={handlePickQr} className="active:opacity-80">
                <Image
                  source={{ uri: effectiveQrUri }}
                  style={{ width: 220, height: 220, borderRadius: 18, backgroundColor: '#fff' }}
                  resizeMode="contain"
                  onError={() => setBrokenQrUri(effectiveQrUri)}
                />
              </Pressable>
              <View className="mt-3.5 flex-row items-center gap-8">
                <Pressable onPress={handlePickQr} hitSlop={8}>
                  <Text variant="body" className="text-primary font-medium">
                    {I18n.t('transactions.settleUp.qr_replace')}
                  </Text>
                </Pressable>
                <Pressable onPress={handleRemoveQr} hitSlop={8}>
                  <Text variant="body" className="text-destructive font-medium">
                    {I18n.t('common.remove')}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={handlePickQr}
              className="mt-4 flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 py-3.5 active:opacity-70"
            >
              <ImagePlus size={16} color={themeColors.primary} />
              <Text variant="body" className="text-primary font-medium">
                {I18n.t('transactions.settleUp.qr_add')}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <AccountPickerSheet
        visible={accountPickerVisible}
        onClose={() => setAccountPickerVisible(false)}
        accounts={accounts}
        accountGroups={accountGroups}
        selectedAccountId={defaultPaybackAccountId}
        onSelect={handlePickDefaultAccount}
      />
    </SettingsPageLayout>
  );
}
