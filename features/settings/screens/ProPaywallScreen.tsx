import { Check, Crown, Minus, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LoadingDots } from '~/components/feedback/LoadingDots';
import { Mascot, type MascotName } from '~/components/feedback/Mascot';
import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { Button, Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { PRO_LIMITS } from '~/constants/proLimits';
import { usePackagesByType, usePro } from '~/context/ProContext';
import { useResolvedTheme } from '~/context/ThemeContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { isRevenueCatCustomerStateActive, type RevenueCatPackage } from '~/services/revenueCat';
import { recordProPurchase } from '~/services/reviewPrompt';
import { isSpeechRecognitionAvailable } from '~/services/speechRecognition';
import { FONT } from '~/utils/fonts';

interface ProPaywallScreenProps {
  onClose: () => void;
  source?: string;
  flashMessage?: string;
}

const FLASH_MESSAGE_DURATION_MS = 3200;
const PRIVACY_POLICY_URL = 'https://www.money2time.com/privacy';
const UNLIMITED = '∞'; // ∞

interface PaywallColors {
  bg: string;
  text: string;
  textMuted: string;
  primary: string;
  primarySoft: string;
  cardBg: string;
  cardBorder: string;
  closeBg: string;
  closeIcon: string;
  surface: string;
  surfaceMuted: string;
  accent: string;
  coral: string;
  sky: string;
  isDark: boolean;
}

function usePaywallColors(): PaywallColors {
  const tc = useThemeColors();
  const isDark = useResolvedTheme() === 'dark';

  return useMemo(
    () => ({
      bg: tc.background,
      text: tc.text,
      textMuted: tc.textMuted,
      primary: tc.primary,
      primarySoft: tc.primarySoft,
      cardBg: isDark ? tc.surface : tc.card,
      cardBorder: tc.border,
      closeBg: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
      closeIcon: tc.textMuted,
      surface: tc.surface,
      surfaceMuted: tc.surfaceMuted,
      accent: tc.accent,
      coral: tc.coral,
      sky: tc.sky,
      isDark,
    }),
    [tc, isDark],
  );
}

function withAlpha(color: string, alpha: number) {
  const normalized = color.replace('#', '');
  const hex =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : normalized.slice(0, 6);

  const value = Number.parseInt(hex, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function PaywallBackdrop({ colors }: { colors: PaywallColors }) {
  return (
    <View pointerEvents="none" style={s.backdrop}>
      <View
        style={[
          s.backdropOrbTopRight,
          { backgroundColor: withAlpha(colors.primary, colors.isDark ? 0.12 : 0.07) },
        ]}
      />
      <View
        style={[
          s.backdropOrbCenterRight,
          { backgroundColor: withAlpha(colors.accent, colors.isDark ? 0.12 : 0.08) },
        ]}
      />
    </View>
  );
}

// ─── Feature comparison ──────────────────────────────────────────────

type CellValue = string | boolean;

interface CompareRow {
  label: string;
  free: CellValue;
  pro: CellValue;
}

function useCompareRows(voiceSupported: boolean): CompareRow[] {
  return useMemo<CompareRow[]>(
    () => [
      {
        label: I18n.t('pro.accounts_label'),
        free: String(PRO_LIMITS.FREE_MAX_ACCOUNTS),
        pro: UNLIMITED,
      },
      {
        label: I18n.t('pro.categories_label'),
        free: String(PRO_LIMITS.FREE_MAX_CATEGORIES),
        pro: UNLIMITED,
      },
      {
        label: I18n.t('pro.recurring_label'),
        free: String(PRO_LIMITS.FREE_MAX_RECURRING_RULES),
        pro: UNLIMITED,
      },
      {
        label: I18n.t('pro.hourly_income_label'),
        free: String(PRO_LIMITS.FREE_MAX_WAGE_ENTRIES),
        pro: UNLIMITED,
      },
      // Voice entry only appears when the device actually supports speech
      // recognition — no point advertising it otherwise.
      ...(voiceSupported
        ? [
            {
              label: I18n.t('pro.voice_label'),
              free: I18n.t('pro.compare_limited'),
              pro: UNLIMITED,
            },
          ]
        : []),
      { label: I18n.t('pro.trends_label'), free: false, pro: true },
      { label: I18n.t('pro.widgets_label'), free: '2', pro: '4' },
    ],
    [voiceSupported],
  );
}

function CompareCell({
  value,
  colors,
  isPro,
}: {
  value: CellValue;
  colors: PaywallColors;
  isPro: boolean;
}) {
  if (typeof value === 'boolean') {
    if (value) {
      return <Check size={18} color={isPro ? colors.primary : colors.text} strokeWidth={3} />;
    }
    return <Minus size={16} color={colors.textMuted} strokeWidth={2.5} />;
  }

  const isUnlimited = value === UNLIMITED;
  return (
    <Text
      style={[
        s.cellValue,
        {
          color: isPro ? colors.primary : colors.text,
          fontSize: isUnlimited ? 20 : 15,
        },
      ]}
    >
      {value}
    </Text>
  );
}

function CompareTable({
  colors,
  voiceSupported,
}: {
  colors: PaywallColors;
  voiceSupported: boolean;
}) {
  const rows = useCompareRows(voiceSupported);

  return (
    <View style={[s.table, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
      <View style={[s.tableHeader, { borderBottomColor: colors.cardBorder }]}>
        <View style={s.tableLabelCol} />
        <View style={s.tableValueCol}>
          <Text style={[s.tableHeaderText, { color: colors.textMuted }]}>
            {I18n.t('pro.free_title')}
          </Text>
        </View>
        <View style={[s.tableValueCol, s.tableProCol, { backgroundColor: colors.primarySoft }]}>
          <View style={s.tableProHeader}>
            <Crown size={12} color={colors.primary} fill={colors.primary} />
            <Text style={[s.tableHeaderText, { color: colors.primary }]}>
              {I18n.t('pro.pro_title')}
            </Text>
          </View>
        </View>
      </View>

      {rows.map((row, idx) => (
        <View
          key={row.label}
          style={[
            s.tableRow,
            idx < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth },
            { borderBottomColor: colors.cardBorder },
          ]}
        >
          <View style={s.tableLabelCol}>
            <Text style={[s.cellLabel, { color: colors.text }]} numberOfLines={1}>
              {row.label}
            </Text>
          </View>
          <View style={s.tableValueCol}>
            <CompareCell value={row.free} colors={colors} isPro={false} />
          </View>
          <View
            style={[
              s.tableValueCol,
              s.tableProCol,
              { backgroundColor: withAlpha(colors.primary, colors.isDark ? 0.1 : 0.06) },
            ]}
          >
            <CompareCell value={row.pro} colors={colors} isPro />
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Plan helpers ────────────────────────────────────────────────────

interface PlanOption {
  pkg: RevenueCatPackage;
  name: string;
  priceLabel: string;
  mascot?: MascotName;
}

function normalizePackageType(packageType: string) {
  return packageType.trim().toUpperCase();
}

function humanizePackageType(value: string) {
  const cleaned = value
    .replace(/^\$rc_/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  if (!cleaned) {
    return I18n.t('pro.upgrade');
  }

  return cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function getPlanSortOrder(pkg: RevenueCatPackage) {
  switch (normalizePackageType(pkg.packageType)) {
    case 'MONTHLY':
      return 0;
    case 'ANNUAL':
      return 1;
    case 'LIFETIME':
      return 2;
    default:
      return 3;
  }
}

// ─── Main Screen ─────────────────────────────────────────────────────

export function ProPaywallScreen({ onClose, source, flashMessage }: ProPaywallScreenProps) {
  const { isLoading, isPro, offering, purchasePackage, refresh, restorePurchases } = usePro();
  const packages = usePackagesByType(offering);
  const colors = usePaywallColors();
  const insets = useSafeAreaInsets();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [visibleFlashMessage, setVisibleFlashMessage] = useState<string | null>(
    flashMessage ?? null,
  );

  useEffect(() => {
    void trackEvent(AnalyticsEvents.PRO_PAYWALL_VIEWED, { source: source ?? 'settings' });
  }, [source]);

  useEffect(() => {
    if (!flashMessage) {
      setVisibleFlashMessage(null);
      return;
    }
    setVisibleFlashMessage(flashMessage);
    const timeoutId = setTimeout(() => setVisibleFlashMessage(null), FLASH_MESSAGE_DURATION_MS);
    return () => clearTimeout(timeoutId);
  }, [flashMessage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await isSpeechRecognitionAvailable();
      if (!cancelled) setVoiceSupported(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const planOptions = useMemo<PlanOption[]>(() => {
    const make = (
      pkg: RevenueCatPackage | null,
      name: string,
      mascot: MascotName,
    ): PlanOption | null =>
      pkg
        ? {
            pkg,
            name,
            priceLabel: pkg.localizedPriceString,
            mascot,
          }
        : null;

    const built = [
      make(packages.monthly, I18n.t('pro.monthly'), 'plan-monthly'),
      make(packages.annual, I18n.t('pro.yearly'), 'plan-annual'),
      make(packages.lifetime, I18n.t('pro.lifetime'), 'plan-lifetime'),
    ].filter((option): option is PlanOption => option !== null);

    if (built.length > 0) {
      return built;
    }

    return [...(offering?.packages ?? [])]
      .sort((left, right) => getPlanSortOrder(left) - getPlanSortOrder(right))
      .map((pkg) => ({
        pkg,
        name: humanizePackageType(pkg.packageType),
        priceLabel: pkg.localizedPriceString,
      }));
  }, [offering?.packages, packages.annual, packages.lifetime, packages.monthly]);

  useEffect(() => {
    if (planOptions.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => {
      if (prev && planOptions.some((option) => option.pkg.identifier === prev)) {
        return prev;
      }
      const annual = planOptions.find((o) => normalizePackageType(o.pkg.packageType) === 'ANNUAL');
      return (annual ?? planOptions[0]).pkg.identifier;
    });
  }, [planOptions]);

  const selectedPlan = planOptions.find((o) => o.pkg.identifier === selectedId) ?? null;

  const handlePurchase = useCallback(async () => {
    if (isPurchasing || !selectedPlan) return;
    const pkgId = selectedPlan.pkg.identifier;
    setIsPurchasing(true);
    void trackEvent(AnalyticsEvents.PRO_PURCHASE_STARTED, { package: pkgId });
    try {
      const result = await purchasePackage(pkgId);
      if (result.status === 'success') {
        void trackEvent(AnalyticsEvents.PRO_PURCHASE_COMPLETED, { package: pkgId });
        recordProPurchase();
        onClose();
      } else if (result.status === 'pending') {
        void trackEvent(AnalyticsEvents.PRO_PURCHASE_PENDING, { package: pkgId });
        Alert.alert(
          I18n.t('pro.purchase_pending_title'),
          result.message ?? I18n.t('pro.purchase_pending_message'),
        );
      } else if (result.status === 'cancelled') {
        void trackEvent(AnalyticsEvents.PRO_PURCHASE_CANCELLED, { package: pkgId });
      } else {
        void trackEvent(AnalyticsEvents.PRO_PURCHASE_FAILED, {
          package: pkgId,
          reason: result.message ?? result.status,
        });
        Alert.alert(
          I18n.t('pro.purchase_failed'),
          result.message ?? I18n.t('errors.generic_operation_failed'),
        );
      }
    } finally {
      setIsPurchasing(false);
    }
  }, [isPurchasing, onClose, purchasePackage, selectedPlan]);

  const handleRestore = useCallback(async () => {
    if (isRestoring) return;
    setIsRestoring(true);
    void trackEvent(AnalyticsEvents.PRO_RESTORE_STARTED);
    try {
      const result = await restorePurchases();
      if (result.status === 'success' && isRevenueCatCustomerStateActive(result.customerState)) {
        void trackEvent(AnalyticsEvents.PRO_RESTORE_COMPLETED, { found: true });
        Alert.alert(I18n.t('pro.restore_success'));
        onClose();
      } else if (result.status === 'success') {
        void trackEvent(AnalyticsEvents.PRO_RESTORE_COMPLETED, { found: false });
        Alert.alert(I18n.t('pro.restore_none'));
      } else {
        Alert.alert(
          I18n.t('pro.restore_failed'),
          result.message ?? I18n.t('errors.generic_operation_failed'),
        );
      }
    } finally {
      setIsRestoring(false);
    }
  }, [isRestoring, onClose, restorePurchases]);

  if (isPro) {
    return (
      <View style={[s.root, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
        <PaywallBackdrop colors={colors} />
        <View style={s.header}>
          <View style={{ width: 32 }} />
          <HeaderBrand colors={colors} />
          <CloseBtn onClose={onClose} colors={colors} />
        </View>
        <View style={s.activeContainer}>
          <Mascot size={140} name="rich" animate />
          <View style={s.activeCrownRow}>
            <Crown size={20} color={colors.primary} fill={colors.primary} />
          </View>
          <Text style={[s.activeTitle, { color: colors.text }]}>{I18n.t('pro.active')}</Text>
          <Text style={[s.activeSub, { color: colors.textMuted }]}>
            {I18n.t('pro.active_subtitle')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <PaywallBackdrop colors={colors} />
      <View style={s.header}>
        <View style={{ width: 32 }} />
        <HeaderBrand colors={colors} />
        <CloseBtn onClose={onClose} colors={colors} />
      </View>

      {visibleFlashMessage ? (
        <Animated.View
          pointerEvents="none"
          entering={FadeInUp.duration(280)}
          exiting={FadeOutUp.duration(220)}
          style={[
            s.flashBanner,
            {
              top: insets.top + 56,
              backgroundColor: colors.isDark ? colors.surface : colors.cardBg,
              borderColor: withAlpha(colors.accent, colors.isDark ? 0.42 : 0.24),
            },
          ]}
        >
          <Text style={[s.flashBannerText, { color: colors.text }]}>{visibleFlashMessage}</Text>
        </Animated.View>
      ) : null}

      <ScrollView
        style={s.bodyScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.bodyScrollContent}
      >
        <TabletContentContainer>
          <Animated.View entering={FadeIn.duration(400)}>
            <View style={s.intro}>
              <Text style={[s.introTitle, { color: colors.text }]}>
                {I18n.t('pro.compare_title')}
              </Text>
              <Text style={[s.introSubtitle, { color: colors.textMuted }]}>
                {I18n.t('pro.compare_subtitle')}
              </Text>
            </View>
            <CompareTable colors={colors} voiceSupported={voiceSupported} />
          </Animated.View>
        </TabletContentContainer>
      </ScrollView>

      <PurchaseFooter
        colors={colors}
        insetsBottom={insets.bottom}
        planOptions={planOptions}
        selectedId={selectedId}
        onSelect={setSelectedId}
        selectedPlan={selectedPlan}
        isLoading={isLoading}
        isPurchasing={isPurchasing}
        isRestoring={isRestoring}
        onPurchase={handlePurchase}
        onRestore={handleRestore}
        onRetry={() => void refresh()}
      />
    </View>
  );
}

// ─── Sticky purchase footer ──────────────────────────────────────────

function PurchaseFooter({
  colors,
  insetsBottom,
  planOptions,
  selectedId,
  onSelect,
  selectedPlan,
  isLoading,
  isPurchasing,
  isRestoring,
  onPurchase,
  onRestore,
  onRetry,
}: {
  colors: PaywallColors;
  insetsBottom: number;
  planOptions: PlanOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedPlan: PlanOption | null;
  isLoading: boolean;
  isPurchasing: boolean;
  isRestoring: boolean;
  onPurchase: () => void;
  onRestore: () => void;
  onRetry: () => void;
}) {
  return (
    <View
      style={[
        s.footer,
        {
          backgroundColor: colors.isDark ? colors.surface : colors.cardBg,
          borderTopColor: colors.cardBorder,
          paddingBottom: Math.max(insetsBottom - 10, 2),
        },
      ]}
    >
      <TabletContentContainer>
        {planOptions.length > 0 ? (
          <>
            <View style={s.planRow}>
              {planOptions.map((option) => {
                const selected = option.pkg.identifier === selectedId;
                return (
                  <Pressable
                    key={option.pkg.identifier}
                    onPress={() => onSelect(option.pkg.identifier)}
                    style={[
                      s.planOption,
                      {
                        borderColor: selected ? colors.primary : colors.cardBorder,
                        backgroundColor: selected
                          ? withAlpha(colors.primary, colors.isDark ? 0.16 : 0.08)
                          : 'transparent',
                      },
                    ]}
                  >
                    {option.mascot ? (
                      <Mascot size={44} name={option.mascot} animate={selected} />
                    ) : null}
                    <Text style={[s.planName, { color: colors.text }]} numberOfLines={1}>
                      {option.name}
                    </Text>
                    <Text style={[s.planPrice, { color: colors.text }]} numberOfLines={1}>
                      {option.priceLabel}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[s.termsText, { color: colors.textMuted }]}>
              {I18n.t('pro.terms_prefix')}{' '}
              <Text
                style={[s.termsLink, { color: colors.primary }]}
                onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
              >
                {I18n.t('pro.privacy_policy')}
              </Text>
              .
            </Text>

            <Button
              onPress={onPurchase}
              disabled={isPurchasing || !selectedPlan}
              variant="warm"
              size="default"
              className="h-[46px] w-full shadow-warm-lg"
              haptic="none"
            >
              {isPurchasing ? (
                <LoadingDots size="small" color="#fff" />
              ) : (
                <View style={s.ctaContent}>
                  <Crown size={16} color="#fff" fill="#fff" />
                  <Text style={s.ctaText}>{I18n.t('pro.upgrade')}</Text>
                </View>
              )}
            </Button>

            <Pressable
              onPress={onRestore}
              disabled={isRestoring}
              hitSlop={10}
              style={s.restoreButton}
            >
              <Text style={[s.restoreText, { color: colors.textMuted }]}>
                {isRestoring ? I18n.t('pro.restoring') : I18n.t('pro.restore')}
              </Text>
            </Pressable>
          </>
        ) : (
          <View style={s.footerEmpty}>
            <Text style={[s.footerEmptyText, { color: colors.textMuted }]}>
              {isLoading ? I18n.t('pro.loading_plans') : I18n.t('pro.plans_unavailable_title')}
            </Text>
            {!isLoading ? (
              <Button onPress={onRetry} variant="outline" size="sm" haptic="none">
                <Text>{I18n.t('pro.retry_loading_plans')}</Text>
              </Button>
            ) : null}
          </View>
        )}
      </TabletContentContainer>
    </View>
  );
}

function HeaderBrand({ colors }: { colors: PaywallColors }) {
  return (
    <View style={s.brand}>
      <Text style={[s.brandText, { color: colors.text }]}>Money2Time</Text>
      <View style={[s.proPill, { backgroundColor: colors.primary }]}>
        <Text style={s.proPillText}>PRO</Text>
      </View>
    </View>
  );
}

function CloseBtn({ onClose, colors }: { onClose: () => void; colors: PaywallColors }) {
  return (
    <Pressable
      onPress={onClose}
      hitSlop={12}
      style={[s.closeBtn, { backgroundColor: colors.closeBg }]}
    >
      <X size={18} color={colors.closeIcon} />
    </Pressable>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  bodyScroll: { flex: 1 },
  bodyScrollContent: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingBottom: spacing.lg,
  },
  backdrop: { ...StyleSheet.absoluteFillObject },
  backdropOrbTopRight: {
    position: 'absolute',
    top: 82,
    right: -26,
    width: 176,
    height: 176,
    borderRadius: 88,
  },
  backdropOrbCenterRight: {
    position: 'absolute',
    top: 210,
    right: 24,
    width: 128,
    height: 128,
    borderRadius: 64,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenHorizontal,
    paddingVertical: spacing.sm,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: { fontSize: 16, fontWeight: '700' },
  proPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  proPillText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashBanner: {
    position: 'absolute',
    left: spacing.screenHorizontal,
    right: spacing.screenHorizontal,
    zIndex: 20,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  flashBannerText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },

  // Intro
  intro: { paddingTop: spacing.sm, paddingBottom: spacing.md, gap: 4 },
  introTitle: { fontSize: 24, lineHeight: 32, fontWeight: '800', letterSpacing: -0.4 },
  introSubtitle: { fontSize: 14, lineHeight: 20 },

  // Comparison table
  table: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tableLabelCol: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tableValueCol: {
    width: 76,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableProCol: {
    alignSelf: 'stretch',
  },
  tableProHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  cellLabel: { fontSize: 14, fontWeight: '600' },
  cellValue: { fontWeight: '800', letterSpacing: -0.2 },

  // Footer
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  planRow: { flexDirection: 'row', gap: 8 },
  planOption: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 2,
  },
  planName: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  planPrice: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  termsText: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
  termsLink: { fontSize: 11, fontWeight: '700', textDecorationLine: 'underline' },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: { fontFamily: FONT.extrabold, fontWeight: '800', color: '#fff' },
  restoreButton: { alignSelf: 'center', marginTop: -6, paddingVertical: 2 },
  restoreText: { fontSize: 12, fontWeight: '500', textDecorationLine: 'underline' },
  footerEmpty: { alignItems: 'center', gap: 12, paddingVertical: spacing.sm },
  footerEmptyText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },

  // Active pro
  activeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  activeTitle: { fontSize: 24, fontWeight: '800', marginTop: 16 },
  activeSub: { fontSize: 15, marginTop: 8, textAlign: 'center' },
  activeCrownRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
