import { AlertCircle, Crown, ExternalLink, FileText, Mail, Shield, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOutUp,
  SlideInLeft,
  SlideOutRight,
} from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_ICON_SVG } from '~/assets/money2time-icon';
import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { Button, Text } from '~/components/ui';
import { getThemeWordmarkPalette, spacing } from '~/constants/designSystem';
import { PRO_LIMITS } from '~/constants/proLimits';
import { usePackagesByType, usePro } from '~/context/ProContext';
import { useResolvedTheme, useThemeColor } from '~/context/ThemeContext';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { isRevenueCatCustomerStateActive, type RevenueCatPackage } from '~/services/revenueCat';

interface ProPaywallScreenProps {
  onClose: () => void;
  source?: string;
  flashMessage?: string;
}

const CARD_GAP = 12;
const CARD_PEEK = 32;
const PLAN_CARD_MIN_HEIGHT = 288;
const SHOWCASE_INTERVAL = 4000;
const FLASH_MESSAGE_DURATION_MS = 3200;
const PRIVACY_POLICY_URL = 'https://www.money2time.com/privacy';
const APPLE_STANDARD_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const CONTACT_URL = 'https://www.money2time.com/contact';

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
  dotActive: string;
  dotInactive: string;
  surface: string;
  surfaceMuted: string;
  accent: string;
  accentSoft: string;
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
      dotActive: tc.primary,
      dotInactive: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)',
      surface: tc.surface,
      surfaceMuted: tc.surfaceMuted,
      accent: tc.accent,
      accentSoft: tc.accentSoft,
      coral: tc.coral,
      sky: tc.sky,
      isDark,
    }),
    [tc, isDark],
  );
}

// ─── Feature Showcase ────────────────────────────────────────────────

interface FeatureTab {
  label: string;
  description: string;
  freeValue: string;
  proValue: string;
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
      <View
        style={[
          s.backdropOrbLowerLeft,
          { backgroundColor: withAlpha(colors.coral, colors.isDark ? 0.08 : 0.05) },
        ]}
      />
    </View>
  );
}

function FeatureShowcase({ colors, height }: { colors: PaywallColors; height: number }) {
  const featureTabs = useMemo<FeatureTab[]>(
    () => [
      {
        label: I18n.t('pro.accounts_label'),
        description: I18n.t('pro.accounts_description'),
        freeValue: I18n.t('pro.feature_accounts', { count: PRO_LIMITS.FREE_MAX_ACCOUNTS }),
        proValue: I18n.t('pro.feature_unlimited_accounts'),
      },
      {
        label: I18n.t('pro.categories_label'),
        description: I18n.t('pro.categories_description'),
        freeValue: I18n.t('pro.feature_categories', { count: PRO_LIMITS.FREE_MAX_CATEGORIES }),
        proValue: I18n.t('pro.feature_unlimited_categories'),
      },
      {
        label: I18n.t('pro.recurring_label'),
        description: I18n.t('pro.recurring_description'),
        freeValue: I18n.t('pro.feature_recurring', { count: PRO_LIMITS.FREE_MAX_RECURRING_RULES }),
        proValue: I18n.t('pro.feature_unlimited_recurring'),
      },
      {
        label: I18n.t('pro.hourly_income_label'),
        description: I18n.t('pro.hourly_income_description'),
        freeValue: I18n.t('pro.feature_wage_entries', { count: PRO_LIMITS.FREE_MAX_WAGE_ENTRIES }),
        proValue: I18n.t('pro.feature_unlimited_wage_entries'),
      },
    ],
    [],
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % featureTabs.length);
    }, SHOWCASE_INTERVAL);
  }, [featureTabs.length]);

  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [resetTimer]);

  const handleAdvance = useCallback(() => {
    setActiveIdx((prev) => (prev + 1) % featureTabs.length);
    resetTimer();
  }, [featureTabs.length, resetTimer]);

  const featureTones = useMemo(
    () => [
      { strong: colors.primary, soft: colors.primarySoft },
      { strong: colors.accent, soft: colors.accentSoft },
      { strong: colors.coral, soft: withAlpha(colors.coral, colors.isDark ? 0.18 : 0.12) },
      { strong: colors.sky, soft: withAlpha(colors.sky, colors.isDark ? 0.2 : 0.12) },
    ],
    [
      colors.accent,
      colors.accentSoft,
      colors.coral,
      colors.isDark,
      colors.primary,
      colors.primarySoft,
      colors.sky,
    ],
  );

  const activeFeature = featureTabs[activeIdx];
  const activeTone = featureTones[activeIdx];

  return (
    <View style={s.showcase}>
      <Pressable
        onPress={handleAdvance}
        accessibilityRole="button"
        accessibilityLabel={I18n.t('pro.show_next_feature')}
        style={({ pressed }) => [
          s.showcaseShell,
          {
            backgroundColor: colors.isDark ? colors.surfaceMuted : colors.surface,
            borderColor: colors.cardBorder,
            height,
          },
          pressed && { opacity: 0.96 },
        ]}
      >
        <View style={s.showcaseContent}>
          <Animated.View
            key={activeIdx}
            entering={SlideInLeft.duration(360)}
            exiting={SlideOutRight.duration(360)}
            style={s.featurePage}
          >
            <View style={s.featureIntro}>
              <Text style={[s.featureTitle, { color: activeTone.strong }]}>
                {activeFeature.label}
              </Text>
              <Text style={[s.featureDescription, { color: colors.textMuted }]}>
                {activeFeature.description}
              </Text>
            </View>

            <View style={s.compareStack}>
              <View
                style={[
                  s.compareCard,
                  {
                    backgroundColor: colors.isDark ? withAlpha(colors.text, 0.06) : colors.cardBg,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <Text style={[s.compareLabel, { color: colors.textMuted }]}>
                  {I18n.t('pro.free_title')}
                </Text>
                <Text style={[s.compareValue, { color: colors.text }]}>
                  {activeFeature.freeValue}
                </Text>
              </View>

              <View
                style={[
                  s.compareCard,
                  {
                    backgroundColor: withAlpha(activeTone.strong, colors.isDark ? 0.16 : 0.1),
                    borderColor: withAlpha(activeTone.strong, colors.isDark ? 0.3 : 0.16),
                  },
                ]}
              >
                <Text style={[s.compareLabel, { color: activeTone.strong }]}>
                  {I18n.t('pro.pro_title')}
                </Text>
                <Text style={[s.compareValue, { color: colors.text }]}>
                  {activeFeature.proValue}
                </Text>
              </View>
            </View>
          </Animated.View>
        </View>
      </Pressable>
    </View>
  );
}

// ─── Plan Card ───────────────────────────────────────────────────────

interface PlanCardData {
  pkg: RevenueCatPackage;
  name: string;
  description: string;
  badge?: string;
}

interface SupportLinkItem {
  icon: typeof Shield;
  key: string;
  title: string;
  iconColor: string;
  url: string;
}

interface PlanPricePresentation {
  billingLabel: string | null;
  primaryAmount: string;
  primarySuffix: string | null;
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

function getFallbackPlanName(pkg: RevenueCatPackage) {
  const normalizedType = normalizePackageType(pkg.packageType);

  if (normalizedType !== 'CUSTOM' && normalizedType !== 'UNKNOWN') {
    return humanizePackageType(normalizedType);
  }

  return humanizePackageType(pkg.identifier);
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

function getPlanPricePresentation(pkg: RevenueCatPackage): PlanPricePresentation {
  switch (normalizePackageType(pkg.packageType)) {
    case 'ANNUAL':
      return {
        billingLabel: I18n.t('pro.yearly_subtitle'),
        primaryAmount: pkg.localizedPriceString,
        primarySuffix: I18n.t('pro.per_year_suffix'),
      };
    case 'MONTHLY':
      return {
        billingLabel: I18n.t('pro.monthly_subtitle'),
        primaryAmount: pkg.localizedPriceString,
        primarySuffix: I18n.t('pro.per_month_suffix'),
      };
    case 'LIFETIME':
      return {
        billingLabel: I18n.t('pro.lifetime_subtitle'),
        primaryAmount: pkg.localizedPriceString,
        primarySuffix: null,
      };
    default:
      return {
        billingLabel: null,
        primaryAmount: pkg.localizedPriceString,
        primarySuffix: null,
      };
  }
}

function PlanCard({
  data,
  width,
  height,
  colors,
  isPurchasing,
  onContinue,
  onMeasureHeight,
}: {
  data: PlanCardData;
  width: number;
  height: number | null;
  colors: PaywallColors;
  isPurchasing: boolean;
  onContinue: () => void;
  onMeasureHeight: (cardId: string, height: number) => void;
}) {
  const pricePresentation = getPlanPricePresentation(data.pkg);

  return (
    <View style={{ width, marginRight: CARD_GAP }}>
      <View
        onLayout={(event) => {
          onMeasureHeight(data.pkg.identifier, event.nativeEvent.layout.height);
        }}
        style={[
          s.card,
          height ? { height } : null,
          { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
        ]}
      >
        {data.badge ? (
          <View style={[s.badge, { backgroundColor: colors.primarySoft }]}>
            <Text style={[s.badgeText, { color: colors.primary }]}>{data.badge}</Text>
          </View>
        ) : (
          <View style={s.badgeSpacer} />
        )}

        <View style={s.cardBody}>
          <Text style={[s.cardTitle, { color: colors.text }]}>{data.name}</Text>
          <Text style={[s.cardDesc, { color: colors.textMuted }]}>{data.description}</Text>
        </View>

        <View style={s.cardFooter}>
          <View style={s.cardPriceStack}>
            <View style={s.cardPriceRow}>
              <Text style={[s.cardPrice, { color: colors.text }]}>
                {pricePresentation.primaryAmount}
                {pricePresentation.primarySuffix ? (
                  <Text style={s.cardPriceSuffix}>{pricePresentation.primarySuffix}</Text>
                ) : null}
              </Text>
            </View>
            {pricePresentation.billingLabel ? (
              <Text style={[s.cardPriceMeta, { color: colors.textMuted }]}>
                {pricePresentation.billingLabel}
              </Text>
            ) : null}
          </View>
          <Button
            onPress={onContinue}
            disabled={isPurchasing}
            variant="warm"
            size="lg"
            className="mt-4 w-full shadow-warm-lg"
            haptic="none"
          >
            {isPurchasing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <View style={s.ctaContent}>
                <Crown size={16} color="#fff" fill="#fff" />
                <Text>{I18n.t('pro.upgrade')}</Text>
              </View>
            )}
          </Button>
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────

export function ProPaywallScreen({ onClose, source, flashMessage }: ProPaywallScreenProps) {
  const { isLoading, isPro, offering, purchasePackage, refresh, restorePurchases } = usePro();
  const packages = usePackagesByType(offering);
  const colors = usePaywallColors();
  const resolvedTheme = useResolvedTheme();
  const themeColor = useThemeColor();
  const wordmarkPalette = useMemo(
    () => getThemeWordmarkPalette(themeColor, resolvedTheme),
    [resolvedTheme, themeColor],
  );
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const { contentWidth } = useDeviceLayout();
  const activeIndexRef = useRef(0);
  const measuredPlanCardHeightsRef = useRef<Record<string, number>>({});
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [planCardHeight, setPlanCardHeight] = useState<number | null>(null);
  const [visibleFlashMessage, setVisibleFlashMessage] = useState<string | null>(
    flashMessage ?? null,
  );

  const cardWidth = contentWidth - CARD_PEEK * 2;
  const estimatedHeaderHeight = 32 + spacing.sm * 2;
  const reservedContentHeight = estimatedHeaderHeight + spacing.lg + 36;
  const usableContentHeight = Math.max(
    280,
    screenHeight - insets.top - insets.bottom - reservedContentHeight,
  );
  const showcaseHeight = Math.round(usableContentHeight * 0.5);

  useEffect(() => {
    void trackEvent(AnalyticsEvents.PRO_PAYWALL_VIEWED, { source: source ?? 'settings' });
  }, [source]);

  useEffect(() => {
    if (!flashMessage) {
      setVisibleFlashMessage(null);
      return;
    }

    setVisibleFlashMessage(flashMessage);

    const timeoutId = setTimeout(() => {
      setVisibleFlashMessage(null);
    }, FLASH_MESSAGE_DURATION_MS);

    return () => clearTimeout(timeoutId);
  }, [flashMessage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const planCards = useMemo<PlanCardData[]>(() => {
    const cards: PlanCardData[] = [];
    if (packages.monthly) {
      cards.push({
        pkg: packages.monthly,
        name: I18n.t('pro.monthly'),
        description: I18n.t('pro.monthly_desc'),
        badge: I18n.t('pro.flexible'),
      });
    }
    if (packages.annual) {
      cards.push({
        pkg: packages.annual,
        name: I18n.t('pro.yearly'),
        description: I18n.t('pro.yearly_desc'),
        badge: I18n.t('pro.best_value'),
      });
    }
    if (packages.lifetime) {
      cards.push({
        pkg: packages.lifetime,
        name: I18n.t('pro.lifetime'),
        description: I18n.t('pro.lifetime_desc'),
        badge: I18n.t('pro.forever'),
      });
    }

    if (cards.length === 0 && offering?.packages.length) {
      return [...offering.packages]
        .sort((left, right) => getPlanSortOrder(left) - getPlanSortOrder(right))
        .map((pkg) => ({
          pkg,
          name: getFallbackPlanName(pkg),
          description: I18n.t('pro.custom_plan_desc'),
        }));
    }

    return cards;
  }, [offering?.packages, packages.annual, packages.lifetime, packages.monthly]);

  const defaultIdx = planCards.findIndex(
    (card) => normalizePackageType(card.pkg.packageType) === 'MONTHLY',
  );
  const startIdx = defaultIdx >= 0 ? defaultIdx : 0;
  const initialPlanContentOffset = useMemo(
    () => ({ x: (cardWidth + CARD_GAP) * startIdx, y: 0 }),
    [cardWidth, startIdx],
  );
  const planCardIds = useMemo(() => planCards.map((card) => card.pkg.identifier), [planCards]);

  useEffect(() => {
    activeIndexRef.current = startIdx;
    setActiveIndex(planCards.length > 0 ? startIdx : null);

    if (planCards.length === 0) {
      return;
    }
  }, [cardWidth, planCards.length, startIdx]);

  useEffect(() => {
    measuredPlanCardHeightsRef.current = {};
    setPlanCardHeight(null);
  }, [cardWidth, planCardIds]);

  const supportLinks = useMemo<SupportLinkItem[]>(
    () => [
      {
        key: 'privacy',
        title: I18n.t('pro.privacy_policy'),
        url: PRIVACY_POLICY_URL,
        icon: Shield,
        iconColor: colors.primary,
      },
      {
        key: 'eula',
        title: I18n.t('pro.apple_standard_eula'),
        url: APPLE_STANDARD_EULA_URL,
        icon: FileText,
        iconColor: colors.accent,
      },
      {
        key: 'contact',
        title: I18n.t('pro.contact'),
        url: CONTACT_URL,
        icon: Mail,
        iconColor: colors.coral,
      },
    ],
    [colors.accent, colors.coral, colors.primary],
  );

  const syncActiveIndex = useCallback(
    (offsetX: number) => {
      const snap = cardWidth + CARD_GAP;
      const idx = Math.max(0, Math.min(Math.round(offsetX / snap), planCards.length - 1));

      if (idx !== activeIndexRef.current) {
        activeIndexRef.current = idx;
        setActiveIndex(idx);
      }
    },
    [cardWidth, planCards.length],
  );

  const handlePlanCardMeasure = useCallback(
    (cardId: string, height: number) => {
      if (planCardHeight !== null) {
        return;
      }

      const nextHeight = Math.max(Math.ceil(height), PLAN_CARD_MIN_HEIGHT);
      if (measuredPlanCardHeightsRef.current[cardId] === nextHeight) {
        return;
      }

      measuredPlanCardHeightsRef.current[cardId] = nextHeight;

      if (planCardIds.some((id) => measuredPlanCardHeightsRef.current[id] == null)) {
        return;
      }

      const tallestCard = Math.max(
        PLAN_CARD_MIN_HEIGHT,
        ...planCardIds.map((id) => measuredPlanCardHeightsRef.current[id] ?? PLAN_CARD_MIN_HEIGHT),
      );
      setPlanCardHeight(tallestCard);
    },
    [planCardHeight, planCardIds],
  );

  const handlePurchase = useCallback(
    async (pkgId: string) => {
      if (isPurchasing) return;
      setIsPurchasing(true);
      void trackEvent(AnalyticsEvents.PRO_PURCHASE_STARTED, { package: pkgId });
      try {
        const result = await purchasePackage(pkgId);
        if (result.status === 'success') {
          void trackEvent(AnalyticsEvents.PRO_PURCHASE_COMPLETED, { package: pkgId });
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
    },
    [isPurchasing, purchasePackage, onClose],
  );

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

  const onCardScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncActiveIndex(event.nativeEvent.contentOffset.x);
    },
    [syncActiveIndex],
  );

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
          <Crown size={48} color={colors.primary} fill={colors.primary} />
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
              backgroundColor: colors.isDark ? withAlpha(colors.accent, 0.16) : colors.accentSoft,
              borderColor: withAlpha(colors.accent, colors.isDark ? 0.38 : 0.18),
            },
          ]}
        >
          <AlertCircle size={16} color={colors.accent} />
          <Text style={[s.flashBannerText, { color: colors.text }]}>{visibleFlashMessage}</Text>
        </Animated.View>
      ) : null}

      <ScrollView
        style={s.bodyScroll}
        showsVerticalScrollIndicator={false}
        contentInset={{ bottom: insets.bottom }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        contentContainerStyle={s.bodyScrollContent}
      >
        <TabletContentContainer>
          <Animated.View entering={FadeIn.duration(400)}>
            <FeatureShowcase colors={colors} height={showcaseHeight} />
          </Animated.View>
        </TabletContentContainer>

        {planCards.length > 0 ? (
          <TabletContentContainer>
            <Animated.View entering={FadeInUp.delay(200).duration(400)}>
              <ScrollView
                key={`${planCardIds.join('|')}:${cardWidth}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={cardWidth + CARD_GAP}
                decelerationRate="fast"
                scrollEventThrottle={16}
                contentOffset={initialPlanContentOffset}
                contentContainerStyle={{ paddingHorizontal: CARD_PEEK }}
                onScroll={onCardScroll}
                onMomentumScrollEnd={onCardScroll}
              >
                {planCards.map((card) => (
                  <PlanCard
                    key={card.pkg.identifier}
                    data={card}
                    width={cardWidth}
                    height={planCardHeight}
                    colors={colors}
                    isPurchasing={isPurchasing}
                    onContinue={() => handlePurchase(card.pkg.identifier)}
                    onMeasureHeight={handlePlanCardMeasure}
                  />
                ))}
              </ScrollView>

              {planCards.length > 1 ? (
                <View style={s.planDots}>
                  {planCards.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        s.planDot,
                        {
                          backgroundColor:
                            i === (activeIndex ?? startIdx) ? colors.dotActive : colors.dotInactive,
                          width: i === (activeIndex ?? startIdx) ? 20 : 7,
                        },
                      ]}
                    />
                  ))}
                </View>
              ) : null}
            </Animated.View>
          </TabletContentContainer>
        ) : (
          <TabletContentContainer>
            <Animated.View entering={FadeInUp.delay(200).duration(400)}>
              <View
                style={[
                  s.emptyState,
                  {
                    backgroundColor: colors.cardBg,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <Text style={[s.emptyStateTitle, { color: colors.text }]}>
                  {isLoading ? I18n.t('pro.loading_plans') : I18n.t('pro.plans_unavailable_title')}
                </Text>
                <Text style={[s.emptyStateBody, { color: colors.textMuted }]}>
                  {isLoading
                    ? I18n.t('pro.loading_plans_body')
                    : I18n.t('pro.plans_unavailable_body')}
                </Text>
                {!isLoading ? (
                  <Button
                    onPress={() => void refresh()}
                    variant="outline"
                    size="sm"
                    className="mt-5 self-center"
                    haptic="none"
                  >
                    <Text>{I18n.t('pro.retry_loading_plans')}</Text>
                  </Button>
                ) : null}
              </View>
            </Animated.View>
          </TabletContentContainer>
        )}

        <TabletContentContainer>
          <View style={s.footer}>
            <Pressable
              onPress={handleRestore}
              disabled={isRestoring}
              hitSlop={12}
              accessibilityRole="button"
              style={s.footerRestoreButton}
            >
              <Text style={[s.footerRestoreText, { color: colors.textMuted }]}>
                {isRestoring ? I18n.t('pro.restoring') : I18n.t('pro.restore')}
              </Text>
            </Pressable>

            <View
              style={[
                s.supportSection,
                {
                  backgroundColor: colors.cardBg,
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              <View style={s.supportHeaderRow}>
                <View style={s.supportBrandRow}>
                  <SvgXml xml={APP_ICON_SVG} width={36} height={36} />
                  <View style={s.supportBrandWordmarkRow}>
                    <Text style={[s.supportBrandMoney, { color: wordmarkPalette.money }]}>
                      Money
                    </Text>
                    <Text style={[s.supportBrandTwo, { color: wordmarkPalette.two }]}>2</Text>
                    <Text style={[s.supportBrandTime, { color: wordmarkPalette.time }]}>Time</Text>
                  </View>
                </View>
              </View>

              <View style={s.supportLinksStack}>
                {supportLinks.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => void Linking.openURL(item.url)}
                      hitSlop={12}
                      accessibilityRole="link"
                      style={({ pressed }) => [
                        s.supportLinkRow,
                        {
                          backgroundColor: colors.isDark
                            ? colors.surfaceMuted
                            : withAlpha(colors.primary, 0.055),
                          borderColor: colors.cardBorder,
                        },
                        pressed && { opacity: 0.92 },
                      ]}
                    >
                      <View style={s.supportLinkContentRow}>
                        <Icon size={18} color={item.iconColor} />
                        <Text
                          style={[s.supportLinkTitle, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {item.title}
                        </Text>
                        <ExternalLink size={16} color={colors.textMuted} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </TabletContentContainer>
      </ScrollView>
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
  bodyScroll: {
    flex: 1,
  },
  bodyScrollContent: {
    paddingBottom: spacing.md,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
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
  backdropOrbLowerLeft: {
    position: 'absolute',
    top: 340,
    left: -34,
    width: 164,
    height: 164,
    borderRadius: 82,
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
  flashBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },

  // Feature Showcase
  showcase: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.screenHorizontal,
  },
  showcaseShell: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  showcaseContent: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  featurePage: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
  },
  featureIntro: {
    alignSelf: 'flex-start',
    gap: 6,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  featureDescription: {
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 260,
  },
  compareStack: {
    width: '100%',
    gap: 10,
  },
  compareCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  compareLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  compareValue: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
  },

  // Plan cards
  card: {
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    minHeight: PLAN_CARD_MIN_HEIGHT,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 14,
  },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  badgeSpacer: { height: 26 },
  cardBody: {
    minHeight: 82,
  },
  cardFooter: {
    marginTop: 'auto',
  },
  cardPriceStack: {
    minHeight: 72,
    gap: 4,
    justifyContent: 'flex-end',
  },
  cardPriceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  cardTitle: { fontSize: 24, lineHeight: 32, fontWeight: '800', letterSpacing: -0.3 },
  cardDesc: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  cardPrice: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.6 },
  cardPriceSuffix: { fontSize: 14, fontWeight: '700' },
  cardPriceMeta: { fontSize: 12, lineHeight: 18 },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  // Plan dots
  planDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  planDot: { height: 7, borderRadius: 4 },
  emptyState: {
    marginHorizontal: CARD_PEEK,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyStateBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },

  // Footer
  footer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing['2xl'],
    paddingHorizontal: spacing.screenHorizontal,
    gap: 14,
  },
  footerRestoreButton: {
    paddingVertical: 6,
  },
  footerRestoreText: { fontSize: 13, fontWeight: '500' },
  supportSection: {
    width: '100%',
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  supportHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  supportBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    flexShrink: 1,
  },
  supportBrandWordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 30,
  },
  supportBrandMoney: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: -0.9,
  },
  supportBrandTwo: {
    fontSize: 13,
    lineHeight: 14,
    fontWeight: '900',
    marginLeft: 1,
    transform: [{ translateY: 6 }],
  },
  supportBrandTime: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: -0.9,
    marginLeft: -1,
  },
  supportLinksStack: {
    gap: 14,
  },
  supportLinkRow: {
    borderWidth: 1,
    borderRadius: 16,
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  supportLinkContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 12,
  },
  supportLinkTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },

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
});
