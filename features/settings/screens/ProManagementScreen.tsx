import { Crown, ExternalLink } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import {
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { usePro } from '~/context/ProContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { FONT } from '~/utils/fonts';

interface ProManagementScreenProps {
  onBack: () => void;
  onOpenPaywall: () => void;
}

function formatDate(isoDate: string, locale: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getPlanLabel(productIdentifier: string | null): string {
  if (!productIdentifier) return '—';
  const id = productIdentifier.toLowerCase();
  if (id.includes('lifetime')) return I18n.t('pro.plan_lifetime');
  if (id.includes('annual') || id.includes('year')) return I18n.t('pro.plan_annual');
  if (id.includes('month')) return I18n.t('pro.plan_monthly');
  return productIdentifier;
}

function openSubscriptionSettings() {
  if (Platform.OS === 'ios') {
    void Linking.openURL('https://apps.apple.com/account/subscriptions');
  } else {
    void Linking.openURL('https://play.google.com/store/account/subscriptions');
  }
}

export function ProManagementScreen({ onBack, onOpenPaywall }: ProManagementScreenProps) {
  const { isPro, customerState } = usePro();
  const themeColors = useThemeColors();
  const activeLocale = I18n.locale ?? I18n.defaultLocale ?? 'en';

  const isLifetime = useMemo(() => {
    if (!customerState?.activeProductIdentifier) return false;
    return customerState.expirationDate === null;
  }, [customerState]);

  if (!isPro) {
    return (
      <SettingsPageLayout>
        <View style={styles.headerWrap}>
          <SettingsHeader
            className="px-0 pt-5 pb-3"
            onBack={onBack}
            title={I18n.t('pro.manage_subscription')}
          />
        </View>
        <View style={styles.centeredContainer}>
          <Crown size={40} color={themeColors.textMuted} />
          <Text
            variant="subheading"
            className="mt-4 text-center"
            style={{ fontFamily: FONT.extrabold, fontWeight: '800' }}
          >
            {I18n.t('pro.upgrade')}
          </Text>
          <Text variant="friendly" tone="muted" className="mt-1 text-center text-sm">
            {I18n.t('pro.upgrade_subtitle')}
          </Text>
          <Pressable
            onPress={onOpenPaywall}
            className="mt-6 rounded-xl px-6 py-3"
            style={{ backgroundColor: themeColors.primary }}
          >
            <Text
              className="font-bold"
              style={{ color: '#fff', fontFamily: FONT.extrabold, fontWeight: '800' }}
            >
              {I18n.t('pro.upgrade')}
            </Text>
          </Pressable>
        </View>
      </SettingsPageLayout>
    );
  }

  return (
    <SettingsPageLayout>
      <View style={styles.headerWrap}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('pro.manage_subscription')}
        />
      </View>

      <View style={styles.content}>
        <View className="items-center py-6">
          <View
            className="rounded-full items-center justify-center"
            style={{
              width: 64,
              height: 64,
              backgroundColor: `${themeColors.primary}18`,
            }}
          >
            <Crown size={32} color={themeColors.primary} fill={themeColors.primary} />
          </View>
          <View className="flex-row items-center gap-1.5 mt-3">
            <Text variant="subheading" className="text-lg">
              Money2Time
            </Text>
            <View
              className="rounded-md px-1.5 py-0.5"
              style={{ backgroundColor: themeColors.primary }}
            >
              <Text className="text-[10px] font-extrabold tracking-wide" style={{ color: '#fff' }}>
                PRO
              </Text>
            </View>
          </View>
          <Text variant="friendly" tone="muted" className="mt-1 text-sm">
            {I18n.t('pro.active_subtitle')}
          </Text>
        </View>

        <View
          className="rounded-2xl border border-border/40 bg-surface overflow-hidden"
          style={styles.detailCard}
        >
          <View style={styles.detailRow}>
            <Text variant="friendly" tone="muted" className="text-sm">
              {I18n.t('pro.plan_label')}
            </Text>
            <Text variant="subheading" className="text-sm">
              {getPlanLabel(customerState?.activeProductIdentifier ?? null)}
            </Text>
          </View>

          {customerState?.activatedAt ? (
            <View
              style={[
                styles.detailRow,
                styles.detailRowBorder,
                { borderColor: themeColors.border },
              ]}
            >
              <Text variant="friendly" tone="muted" className="text-sm">
                {I18n.t('pro.member_since')}
              </Text>
              <Text className="text-sm">{formatDate(customerState.activatedAt, activeLocale)}</Text>
            </View>
          ) : null}

          {!isLifetime && customerState?.expirationDate ? (
            <View
              style={[
                styles.detailRow,
                styles.detailRowBorder,
                { borderColor: themeColors.border },
              ]}
            >
              <Text variant="friendly" tone="muted" className="text-sm">
                {I18n.t('pro.expires_on')}
              </Text>
              <Text className="text-sm">
                {formatDate(customerState.expirationDate, activeLocale)}
              </Text>
            </View>
          ) : null}
        </View>

        {isLifetime ? (
          <View className="mt-4 px-2">
            <Text variant="friendly" tone="muted" className="text-center text-sm">
              {I18n.t('pro.lifetime_access')}
            </Text>
          </View>
        ) : (
          <View className="mt-6 gap-3">
            <Pressable
              onPress={openSubscriptionSettings}
              className="flex-row items-center justify-center gap-2 rounded-xl border border-border/40 bg-surface px-4 py-3.5"
            >
              <ExternalLink size={16} color={themeColors.text} />
              <Text className="text-sm font-semibold">{I18n.t('pro.cancel_subscription')}</Text>
            </Pressable>
            <Text variant="friendly" tone="muted" className="text-center text-xs px-4">
              {I18n.t('pro.cancel_subscription_note')}
            </Text>
          </View>
        )}
      </View>
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  content: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingBottom: spacing.xl,
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: 80,
  },
  detailCard: {
    marginTop: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  detailRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
