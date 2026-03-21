import { Crown, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInUp, SlideInLeft, SlideOutRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { PRO_LIMITS } from '~/constants/proLimits';
import { usePackagesByType, usePro } from '~/context/ProContext';
import { useResolvedTheme } from '~/context/ThemeContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { isRevenueCatCustomerStateActive, type RevenueCatPackage } from '~/services/revenueCat';

interface ProPaywallScreenProps {
  onClose: () => void;
  source?: string;
}

const CARD_GAP = 12;
const CARD_PEEK = 32;
const SHOWCASE_INTERVAL = 4000;

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
  const locale = I18n.locale;
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
    [locale],
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

function PlanCard({
  data,
  width,
  colors,
  isPurchasing,
  onContinue,
}: {
  data: PlanCardData;
  width: number;
  colors: PaywallColors;
  isPurchasing: boolean;
  onContinue: () => void;
}) {
  return (
    <View style={{ width, marginRight: CARD_GAP }}>
      <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
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
          <View style={s.cardPriceRow}>
            <Text style={[s.cardPrice, { color: colors.text }]}>
              {data.pkg.localizedPriceString}
            </Text>
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

export function ProPaywallScreen({ onClose, source }: ProPaywallScreenProps) {
  const { isPro, offering, purchasePackage, restorePurchases } = usePro();
  const packages = usePackagesByType(offering);
  const colors = usePaywallColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const cardWidth = screenWidth - CARD_PEEK * 2;
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

  const planCards: PlanCardData[] = [];
  if (packages.monthly) {
    planCards.push({
      pkg: packages.monthly,
      name: I18n.t('pro.monthly'),
      description: I18n.t('pro.monthly_desc'),
      badge: I18n.t('pro.flexible'),
    });
  }
  if (packages.annual) {
    planCards.push({
      pkg: packages.annual,
      name: I18n.t('pro.yearly'),
      description: I18n.t('pro.yearly_desc'),
      badge: I18n.t('pro.best_value'),
    });
  }
  if (packages.lifetime) {
    planCards.push({
      pkg: packages.lifetime,
      name: I18n.t('pro.lifetime'),
      description: I18n.t('pro.lifetime_desc'),
      badge: I18n.t('pro.forever'),
    });
  }

  const defaultIdx = planCards.findIndex((card) => card.pkg.packageType === 'ANNUAL');
  const startIdx = defaultIdx >= 0 ? defaultIdx : 0;

  useEffect(() => {
    if (planCards.length === 0 || startIdx <= 0) {
      return;
    }

    const timeout = setTimeout(() => {
      scrollRef.current?.scrollTo({
        x: (cardWidth + CARD_GAP) * startIdx,
        animated: false,
      });
    }, 50);
    setActiveIndex(startIdx);

    return () => clearTimeout(timeout);
  }, [cardWidth, planCards.length, startIdx]);

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
        } else if (result.status === 'cancelled') {
          void trackEvent(AnalyticsEvents.PRO_PURCHASE_CANCELLED, { package: pkgId });
        } else {
          void trackEvent(AnalyticsEvents.PRO_PURCHASE_FAILED, {
            package: pkgId,
            reason: result.message ?? result.status,
          });
          if (result.message) Alert.alert(I18n.t('pro.purchase_failed'), result.message);
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
      } else if (result.message) {
        Alert.alert(I18n.t('pro.restore_failed'), result.message);
      }
    } finally {
      setIsRestoring(false);
    }
  }, [isRestoring, restorePurchases, onClose]);

  const onCardScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const snap = cardWidth + CARD_GAP;
      const idx = Math.round(e.nativeEvent.contentOffset.x / snap);
      setActiveIndex(Math.max(0, Math.min(idx, planCards.length - 1)));
    },
    [cardWidth, planCards.length],
  );

  if (isPro) {
    return (
      <View
        style={[
          s.root,
          { backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
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
    <View
      style={[
        s.root,
        { backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <PaywallBackdrop colors={colors} />
      <View style={s.header}>
        <View style={{ width: 32 }} />
        <HeaderBrand colors={colors} />
        <CloseBtn onClose={onClose} colors={colors} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, spacing.md) }}
      >
        <Animated.View entering={FadeIn.duration(400)}>
          <FeatureShowcase colors={colors} height={showcaseHeight} />
        </Animated.View>

        {planCards.length > 0 ? (
          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={cardWidth + CARD_GAP}
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: CARD_PEEK }}
              onMomentumScrollEnd={onCardScroll}
            >
              {planCards.map((card) => (
                <PlanCard
                  key={card.pkg.identifier}
                  data={card}
                  width={cardWidth}
                  colors={colors}
                  isPurchasing={isPurchasing}
                  onContinue={() => handlePurchase(card.pkg.identifier)}
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
                        backgroundColor: i === activeIndex ? colors.dotActive : colors.dotInactive,
                        width: i === activeIndex ? 20 : 7,
                      },
                    ]}
                  />
                ))}
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        <View style={s.footer}>
          <Pressable onPress={handleRestore} disabled={isRestoring} hitSlop={12}>
            <Text style={[s.footerLink, { color: colors.textMuted }]}>
              {isRestoring ? I18n.t('pro.restoring') : I18n.t('pro.restore')}
            </Text>
          </Pressable>
          <Text style={[s.footerDot, { color: colors.dotInactive }]}>·</Text>
          <Pressable
            onPress={() => void Linking.openURL('https://money2time.app/privacy')}
            hitSlop={12}
          >
            <Text style={[s.footerLink, { color: colors.textMuted }]}>
              {I18n.t('pro.privacy_policy')}
            </Text>
          </Pressable>
        </View>
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
    minHeight: 272,
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
    minHeight: 58,
  },
  cardFooter: {
    marginTop: 'auto',
  },
  cardPriceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: 8,
  },
  cardTitle: { fontSize: 24, lineHeight: 32, fontWeight: '800', letterSpacing: -0.3 },
  cardDesc: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  cardPrice: { fontSize: 22, fontWeight: '800' },
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

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing['2xl'],
    gap: 8,
  },
  footerLink: { fontSize: 13, fontWeight: '500' },
  footerDot: { fontSize: 16, fontWeight: '700' },

  // Active pro
  activeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  activeTitle: { fontSize: 24, fontWeight: '800', marginTop: 16 },
  activeSub: { fontSize: 15, marginTop: 8, textAlign: 'center' },
});
