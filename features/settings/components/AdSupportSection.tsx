import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, CardContent, SettingsSection, Text, ThemeModal } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { RevenueCatAvailabilityReason } from '~/services/revenueCat';

function formatPurchaseDate(value: string | null) {
  if (!value) {
    return null;
  }

  const nextDate = new Date(value);

  if (Number.isNaN(nextDate.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(I18n.locale ?? undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(nextDate);
}

function getNotAvailableMessageKey(reason: RevenueCatAvailabilityReason | null) {
  if (reason === 'expo_go') {
    return 'settings.ad_support_unavailable_expo_go';
  }

  if (reason === 'unsupported') {
    return 'settings.ad_support_unavailable_platform';
  }

  return 'settings.ad_support_unavailable_unconfigured';
}

const TIP_ROW_COLORS = ['#E53935', '#FB8C00', '#FDD835', '#43A047', '#00897B', '#00ACC1'];
const CREATOR_HOURLY_RATE = 10;

function getCreatorTimeParts(amount: number) {
  const totalMinutes = Math.round((amount / CREATOR_HOURLY_RATE) * 60);

  if (totalMinutes < 60) {
    return {
      prefix: I18n.t('settings.ad_support_time_prefix'),
      value: I18n.t('settings.ad_support_time_minutes_value', {
        minutes: totalMinutes,
      }),
      suffix: I18n.t('settings.ad_support_time_suffix'),
    };
  }

  const hours = totalMinutes / 60;

  return {
    prefix: I18n.t('settings.ad_support_time_prefix'),
    value:
      hours === 1
        ? I18n.t('settings.ad_support_time_hours_one_value', { hours })
        : I18n.t('settings.ad_support_time_hours_other_value', { hours }),
    suffix: I18n.t('settings.ad_support_time_suffix'),
  };
}

export function AdSupportSection() {
  const {
    adRemovalState,
    purchaseAdRemovalTip,
    resetAdRemovalTestCustomer,
    restoreAdRemovalPurchases,
  } = useApp();
  const themeColors = useThemeColors();
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [purchasingProductId, setPurchasingProductId] = useState<string | null>(null);
  const [isResettingTestCustomer, setIsResettingTestCustomer] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const purchasedAtLabel = useMemo(
    () => formatPurchaseDate(adRemovalState.activatedAt ?? adRemovalState.latestPurchaseDate),
    [adRemovalState.activatedAt, adRemovalState.latestPurchaseDate],
  );
  const isPurchasing = purchasingProductId !== null;

  const handlePurchase = useCallback(
    async (optionProductIdentifier: string) => {
      const purchaseOption = adRemovalState.tipOptions.find(
        (option) => option.productIdentifier === optionProductIdentifier,
      );

      if (!purchaseOption || isPurchasing) {
        return;
      }

      setPurchasingProductId(optionProductIdentifier);

      try {
        const result = await purchaseAdRemovalTip(purchaseOption);

        switch (result.status) {
          case 'success':
            if (result.customerState?.hasAdFreeEntitlement) {
              setIsPurchaseModalOpen(false);
              Alert.alert(
                I18n.t('settings.ad_support_purchase_success_title'),
                I18n.t('settings.ad_support_purchase_success_message'),
              );
              return;
            }

            Alert.alert(
              I18n.t('settings.ad_support_purchase_pending_title'),
              result.message ?? I18n.t('settings.ad_support_purchase_pending_message'),
            );
            return;
          case 'cancelled':
            return;
          case 'not_available':
            Alert.alert(
              I18n.t('settings.ad_support_unavailable_title'),
              I18n.t(getNotAvailableMessageKey(adRemovalState.reason)),
            );
            return;
          case 'not_found':
            Alert.alert(
              I18n.t('settings.ad_support_purchase_missing_title'),
              I18n.t('settings.ad_support_purchase_missing_message'),
            );
            return;
          case 'error':
            Alert.alert(
              I18n.t('settings.ad_support_purchase_error_title'),
              result.message ?? I18n.t('settings.ad_support_purchase_error_message'),
            );
            return;
        }
      } finally {
        setPurchasingProductId(null);
      }
    },
    [adRemovalState.reason, adRemovalState.tipOptions, isPurchasing, purchaseAdRemovalTip],
  );

  const handleRestore = useCallback(async () => {
    if (isRestoring) {
      return;
    }

    setIsRestoring(true);

    try {
      const result = await restoreAdRemovalPurchases();

      switch (result.status) {
        case 'success':
          if (result.customerState?.hasAdFreeEntitlement) {
            setIsPurchaseModalOpen(false);
            Alert.alert(
              I18n.t('settings.ad_support_restore_success_title'),
              I18n.t('settings.ad_support_restore_success_message'),
            );
            return;
          }

          Alert.alert(
            I18n.t('settings.ad_support_restore_none_title'),
            I18n.t('settings.ad_support_restore_none_message'),
          );
          return;
        case 'not_available':
          Alert.alert(
            I18n.t('settings.ad_support_unavailable_title'),
            I18n.t(getNotAvailableMessageKey(adRemovalState.reason)),
          );
          return;
        case 'error':
          Alert.alert(
            I18n.t('settings.ad_support_restore_error_title'),
            result.message ?? I18n.t('settings.ad_support_restore_error_message'),
          );
          return;
        default:
          return;
      }
    } finally {
      setIsRestoring(false);
    }
  }, [adRemovalState.reason, isRestoring, restoreAdRemovalPurchases]);

  const handleResetTestPurchase = useCallback(() => {
    Alert.alert(
      I18n.t('settings.ad_support_test_reset_title'),
      I18n.t('settings.ad_support_test_reset_message'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('settings.ad_support_test_reset_confirm'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setIsResettingTestCustomer(true);

              try {
                await resetAdRemovalTestCustomer();
                Alert.alert(
                  I18n.t('settings.ad_support_test_reset_success_title'),
                  I18n.t('settings.ad_support_test_reset_success_message'),
                );
              } catch (error) {
                Alert.alert(
                  I18n.t('settings.ad_support_test_reset_error_title'),
                  error instanceof Error
                    ? error.message
                    : I18n.t('settings.ad_support_test_reset_error_message'),
                );
              } finally {
                setIsResettingTestCustomer(false);
              }
            })();
          },
        },
      ],
    );
  }, [resetAdRemovalTestCustomer]);

  const shouldShowRestoreButton =
    adRemovalState.canMakePurchases && !adRemovalState.hasAdFreeEntitlement;
  const shouldShowTestResetButton =
    __DEV__ &&
    adRemovalState.isTestStore &&
    adRemovalState.canMakePurchases &&
    adRemovalState.hasAdFreeEntitlement;
  const unavailableMessageKey = !adRemovalState.canMakePurchases
    ? adRemovalState.reason === 'expo_go'
      ? 'settings.ad_support_unavailable_expo_go'
      : adRemovalState.reason === 'unsupported'
        ? 'settings.ad_support_unavailable_platform'
        : 'settings.ad_support_unavailable_unconfigured'
    : adRemovalState.catalogStatus === 'offering_not_found'
      ? 'settings.ad_support_unavailable_offering_missing'
      : 'settings.ad_support_unavailable_no_products';

  return (
    <SettingsSection title={I18n.t('settings.advertisement')} className="mt-5 gap-3">
      {adRemovalState.hasAdFreeEntitlement ? (
        <Card variant="soft">
          <CardContent className="gap-2">
            <Text variant="subheading" tone="success">
              {I18n.t('settings.ad_support_active_title')}
            </Text>
            <Text variant="body" tone="muted">
              {I18n.t('settings.ad_support_active_body')}
            </Text>
            {purchasedAtLabel ? (
              <Text variant="caption" tone="muted">
                {I18n.t('settings.ad_support_active_date', { date: purchasedAtLabel })}
              </Text>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {adRemovalState.isLoading ? (
        <Card>
          <CardContent className="flex-row items-center gap-3">
            <ActivityIndicator color={themeColors.primary} />
            <View className="flex-1">
              <Text variant="subheading">{I18n.t('settings.ad_support_loading_title')}</Text>
              <Text variant="caption" tone="muted" className="mt-1">
                {I18n.t('settings.ad_support_loading_body')}
              </Text>
            </View>
          </CardContent>
        </Card>
      ) : !adRemovalState.hasAdFreeEntitlement ? (
        adRemovalState.canMakePurchases && adRemovalState.tipOptions.length > 0 ? (
          <Button
            disabled={
              adRemovalState.isLoading || isPurchasing || isResettingTestCustomer || isRestoring
            }
            onPress={() => setIsPurchaseModalOpen(true)}
          >
            <Text>{I18n.t('settings.ad_support_open_modal_button')}</Text>
          </Button>
        ) : (
          <View className="gap-2 rounded-[22px] border border-border/45 bg-secondary/35 px-4 py-4">
            <Text variant="subheading">{I18n.t('settings.ad_support_unavailable_title')}</Text>
            <Text variant="body" tone="muted">
              {I18n.t(unavailableMessageKey, {
                offeringId:
                  adRemovalState.offeringIdentifier ??
                  I18n.t('settings.ad_support_offering_unknown'),
              })}
            </Text>
          </View>
        )
      ) : null}

      {shouldShowTestResetButton ? (
        <Button
          variant="destructive"
          disabled={
            adRemovalState.isLoading || isPurchasing || isResettingTestCustomer || isRestoring
          }
          onPress={handleResetTestPurchase}
        >
          <Text>{I18n.t('settings.ad_support_test_reset_button')}</Text>
        </Button>
      ) : null}

      <ThemeModal
        visible={isPurchaseModalOpen && !adRemovalState.hasAdFreeEntitlement}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsPurchaseModalOpen(false)}
      >
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetTitleRow}>
              <Text variant="subheading" className="flex-1 pr-3">
                {I18n.t('settings.ad_support_modal_title')}
              </Text>
              <Pressable
                className="rounded-full bg-secondary px-3 py-2"
                onPress={() => setIsPurchaseModalOpen(false)}
              >
                <Text variant="caption" tone="muted">
                  {I18n.t('common.close')}
                </Text>
              </Pressable>
            </View>
            <Text
              variant="caption"
              tone="muted"
              className="mt-2"
              android_hyphenationFrequency="full"
              lineBreakStrategyIOS="standard"
              textBreakStrategy="highQuality"
            >
              {I18n.t('settings.ad_support_modal_body')}
            </Text>
          </View>

          <ScrollView
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
          >
            {adRemovalState.tipOptions.map((option, index) => {
              const isOptionPurchasing = purchasingProductId === option.productIdentifier;
              const accentColor = TIP_ROW_COLORS[index % TIP_ROW_COLORS.length];
              const creatorTimeParts = getCreatorTimeParts(option.amount);

              return (
                <Pressable
                  key={option.productIdentifier}
                  accessibilityRole="button"
                  disabled={
                    adRemovalState.isLoading ||
                    isPurchasing ||
                    isResettingTestCustomer ||
                    isRestoring
                  }
                  className="rounded-[22px] border border-border/45 bg-card px-4 py-4"
                  onPress={() => void handlePurchase(option.productIdentifier)}
                >
                  <View className="flex-row items-center gap-3">
                    <View style={[styles.rowColorDot, { backgroundColor: accentColor }]} />
                    <View className="flex-1">
                      <Text
                        variant="bodyStrong"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.85}
                        style={{ color: accentColor }}
                      >
                        {option.priceString}
                      </Text>
                      <Text variant="caption" tone="muted" className="mt-1">
                        {creatorTimeParts.prefix}
                        <Text variant="caption" style={{ color: accentColor }}>
                          {creatorTimeParts.value}
                        </Text>
                        {creatorTimeParts.suffix}
                      </Text>
                    </View>
                    {isOptionPurchasing ? <ActivityIndicator color={accentColor} /> : null}
                  </View>
                </Pressable>
              );
            })}

            {shouldShowRestoreButton ? (
              <Button
                variant="ghost"
                disabled={
                  adRemovalState.isLoading || isPurchasing || isResettingTestCustomer || isRestoring
                }
                onPress={() => void handleRestore()}
              >
                <Text>{I18n.t('settings.ad_support_restore_button')}</Text>
              </Button>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </ThemeModal>
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  rowColorDot: {
    borderRadius: 999,
    height: 12,
    width: 12,
  },
  sheetHeader: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  sheetTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sheetContent: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
