import {
  ArrowUpCircle,
  Check,
  ChevronRight,
  Crown,
  Minus,
  Quote,
  Star,
  X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Ellipse, Path } from 'react-native-svg';

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
import { triggerHaptic } from '~/services/haptics';
import {
  isRevenueCatCustomerStateActive,
  isRevenueCatCustomerStateSubscriber,
  type RevenueCatPackage,
} from '~/services/revenueCat';
import { recordProPurchase } from '~/services/reviewPrompt';
import { isSpeechRecognitionAvailable } from '~/services/speechRecognition';
import { FONT } from '~/utils/fonts';
import { openStoreSubscriptions } from '~/utils/subscriptionSettings';

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

// ─── Hero: headline + social proof + testimonial ─────────────────────

// Warm gold used for the rating stars and the laurel wreath.
const GOLD = '#E8A72C';

// One laurel branch, drawn in a 26x60 viewBox and mirrored for the opposite
// side. A thin curved stem with distinct leaves fanning up-and-outward — the
// award-wreath look used on App Store rating badges. Leaves alternate on the
// outer (fanning) and inner (accent) sides of the stem so it reads as laurel
// rather than a single crescent.
const LAUREL_OUTER_LEAVES: { cx: number; cy: number; rx: number; ry: number; rot: number }[] = [
  { cx: 13, cy: 51, rx: 1.9, ry: 6.8, rot: -60 },
  { cx: 10, cy: 42, rx: 2, ry: 7.4, rot: -46 },
  { cx: 7.6, cy: 33, rx: 2.1, ry: 7.8, rot: -32 },
  { cx: 7.4, cy: 24, rx: 2, ry: 7.6, rot: -18 },
  { cx: 9.4, cy: 16, rx: 1.9, ry: 7, rot: -4 },
  { cx: 13, cy: 9, rx: 1.7, ry: 6, rot: 12 },
];
const LAUREL_INNER_LEAVES: { cx: number; cy: number; rx: number; ry: number; rot: number }[] = [
  { cx: 17.5, cy: 47, rx: 1.5, ry: 5, rot: -32 },
  { cx: 15.5, cy: 38, rx: 1.6, ry: 5.4, rot: -20 },
  { cx: 14.2, cy: 29, rx: 1.6, ry: 5.6, rot: -8 },
  { cx: 14.8, cy: 20, rx: 1.5, ry: 5.2, rot: 6 },
];

function LaurelBranch({
  color,
  height,
  mirror = false,
}: {
  color: string;
  height: number;
  mirror?: boolean;
}) {
  const width = height * 0.46;
  return (
    <View style={mirror ? s.laurelMirror : undefined}>
      <Svg width={width} height={height} viewBox="0 0 26 60">
        <Path
          d="M20 57 Q 8 43 11 22 Q 13 10 19 4"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          fill="none"
        />
        {[...LAUREL_OUTER_LEAVES, ...LAUREL_INNER_LEAVES].map((leaf, idx) => (
          <Ellipse
            key={idx}
            cx={leaf.cx}
            cy={leaf.cy}
            rx={leaf.rx}
            ry={leaf.ry}
            fill={color}
            transform={`rotate(${leaf.rot} ${leaf.cx} ${leaf.cy})`}
          />
        ))}
      </Svg>
    </View>
  );
}

function StarRow({ size, color, count = 5 }: { size: number; color: string; count?: number }) {
  return (
    <View style={s.starRow}>
      {Array.from({ length: count }).map((_, idx) => (
        <Star key={idx} size={size} color={color} fill={color} strokeWidth={0} />
      ))}
    </View>
  );
}

// A single stat wrapped in its own laurel wreath (left branch + mirrored right).
function WreathBadge({ height, children }: { height: number; children: React.ReactNode }) {
  return (
    <View style={s.wreathBadge}>
      <LaurelBranch color={GOLD} height={height} />
      <View style={s.wreathContent}>{children}</View>
      <LaurelBranch color={GOLD} height={height} mirror />
    </View>
  );
}

function SocialProof({ colors }: { colors: PaywallColors }) {
  return (
    <View style={s.socialRow}>
      <WreathBadge height={56}>
        <Text style={[s.socialValue, { color: colors.text }]}>
          {I18n.t('pro.social_downloads_value')}
        </Text>
        <Text style={[s.socialLabel, { color: colors.textMuted }]} numberOfLines={1}>
          {I18n.t('pro.social_downloads_label')}
        </Text>
      </WreathBadge>
      <WreathBadge height={56}>
        <Text style={[s.socialValue, { color: colors.text }]}>
          {I18n.t('pro.social_rating_value')}
        </Text>
        <StarRow size={9} color={GOLD} />
        <Text style={[s.socialLabel, { color: colors.textMuted }]} numberOfLines={1}>
          {I18n.t('pro.social_rating_label')}
        </Text>
      </WreathBadge>
    </View>
  );
}

interface Testimonial {
  quote: string;
  author: string;
}

// Real App Store reviews, lightly edited for grammar/clarity. Usernames are kept
// exactly as the reviewers wrote them.
const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'I love this money tracker! My favourite feature is that it shows how much "life energy" a purchase costs, which makes budgeting feel meaningful and reflective. The UI is super cute and pleasant to use. Highly recommended!',
    author: 'jamesgan99',
  },
  {
    quote:
      'I love the UI design! It is user friendly, simple, and clear, so I can see everything at a glance. You can even add bank logos to every account, so cute! I will definitely subscribe and share the app. Keep it up!',
    author: 'runningsoya',
  },
  {
    quote:
      'An excellent money tracking app. It is simple, user friendly, and helps me track my expenses and savings effortlessly. I especially love the recurring transactions feature.',
    author: 'Ytrytry',
  },
  {
    quote:
      'The app is comprehensive and very customisable. I used to track my expenses in Excel! Now recording an expense is one tap from the widget, so I can do it easily even when I am out.',
    author: 'joncms95',
  },
  {
    quote:
      'It really makes me pause and think twice before buying anything, and the UI design is so clean and clear.',
    author: 'minghui2103',
  },
  {
    quote:
      'This app has every feature I need to track expenses easily. I especially love the voice note feature!',
    author: 'Yxchong',
  },
  {
    quote:
      'Really good, with an easy to use interface and lots of functionality. I am currently using another money tracker, but I think this one will replace it.',
    author: 'liquisity',
  },
  {
    quote:
      'Simple, clean, and easy to navigate. Moving over from Money Manager, this makes tracking my expenses much easier.',
    author: 'cr hakahsh',
  },
];

function TestimonialCard({
  testimonial,
  colors,
}: {
  testimonial: Testimonial;
  colors: PaywallColors;
}) {
  return (
    <View
      style={[s.testimonial, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
    >
      <View style={s.testimonialQuoteMark} pointerEvents="none">
        <Quote
          size={22}
          color={withAlpha(colors.primary, 0.22)}
          fill={withAlpha(colors.primary, 0.22)}
        />
      </View>
      <Text style={[s.testimonialQuote, { color: colors.text }]}>{testimonial.quote}</Text>
      <View style={s.testimonialBottomRow}>
        <Text style={[s.testimonialAuthor, { color: colors.textMuted }]}>{testimonial.author}</Text>
        <StarRow size={13} color={GOLD} />
      </View>
    </View>
  );
}

// How much of the neighbouring cards peeks in on each side, and the gap between
// cards — together they give the "live" carousel look.
const CAROUSEL_PEEK = 30;
const CAROUSEL_GAP = 12;

function TestimonialCarousel({ colors }: { colors: PaywallColors }) {
  // The carousel is full-bleed, so it starts at the window width and renders
  // fully-formed on first paint (no empty-then-populated flash); onLayout only
  // corrects it on tablets, where the content column is narrower.
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(windowWidth);
  const scrollRef = useRef<ScrollView>(null);
  const data = TESTIMONIALS;
  const n = data.length;
  // Triple the reviews so there's always a copy to the left and right; the active
  // card lives in the middle copy and we silently recenter to keep the loop
  // infinite in both directions.
  const loop = useMemo(() => [...data, ...data, ...data], [data]);
  const indexRef = useRef(n);
  const didInitRef = useRef(false);
  const recenterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const itemWidth = Math.max(0, width - CAROUSEL_PEEK * 2);
  const interval = itemWidth + CAROUSEL_GAP;

  const clearRecenter = useCallback(() => {
    if (recenterTimeoutRef.current) {
      clearTimeout(recenterTimeoutRef.current);
      recenterTimeoutRef.current = null;
    }
  }, []);

  const goTo = useCallback(
    (index: number, animated: boolean) => {
      scrollRef.current?.scrollTo({ x: index * interval, animated });
    },
    [interval],
  );

  // Keep the active card inside the middle copy so a neighbour always peeks in.
  const recenter = useCallback(
    (idx: number) => {
      let centered = idx;
      if (centered < n) centered += n;
      else if (centered >= 2 * n) centered -= n;
      if (centered !== idx) goTo(centered, false);
      indexRef.current = centered;
    },
    [goTo, n],
  );

  // Auto-advance forever, snapping back into the middle copy after crossing out.
  useEffect(() => {
    if (width === 0 || n < 2) return;
    const id = setInterval(() => {
      clearRecenter();
      const next = indexRef.current + 1;
      indexRef.current = next;
      goTo(next, true);
      if (next >= 2 * n) {
        recenterTimeoutRef.current = setTimeout(() => recenter(next), 450);
      }
    }, 4000);
    return () => {
      clearInterval(id);
      clearRecenter();
    };
  }, [width, interval, n, goTo, recenter, clearRecenter]);

  return (
    <View style={s.carousel} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={interval}
          disableIntervalMomentum
          contentOffset={{ x: n * interval, y: 0 }}
          contentContainerStyle={{ paddingHorizontal: CAROUSEL_PEEK - CAROUSEL_GAP / 2 }}
          onContentSizeChange={() => {
            // `contentOffset` centers the first paint on iOS; do it here too for
            // platforms that ignore that prop (Android).
            if (!didInitRef.current) {
              didInitRef.current = true;
              indexRef.current = n;
              goTo(n, false);
            }
          }}
          onScrollBeginDrag={clearRecenter}
          onMomentumScrollEnd={(e) => {
            clearRecenter();
            recenter(Math.round(e.nativeEvent.contentOffset.x / interval));
          }}
        >
          {loop.map((testimonial, i) => (
            <View key={i} style={{ width: itemWidth, marginHorizontal: CAROUSEL_GAP / 2 }}>
              <TestimonialCard testimonial={testimonial} colors={colors} />
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function Hero({ colors }: { colors: PaywallColors }) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={s.hero}>
      <Text style={[s.heroTitle, { color: colors.text }]}>{I18n.t('pro.hero_title')}</Text>
      <SocialProof colors={colors} />
      <TestimonialCarousel colors={colors} />
    </Animated.View>
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
      {
        label: I18n.t('pro.custom_logos_label'),
        free: String(PRO_LIMITS.FREE_MAX_CUSTOM_LOGOS),
        pro: UNLIMITED,
      },
      {
        label: I18n.t('pro.custom_item_images_label'),
        free: String(PRO_LIMITS.FREE_MAX_CUSTOM_LOGOS),
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
      {
        label: I18n.t('pro.currencies_label'),
        free: String(PRO_LIMITS.FREE_MAX_SUBCURRENCIES + 1),
        pro: UNLIMITED,
      },
      {
        label: I18n.t('pro.albums_label'),
        free: String(PRO_LIMITS.FREE_MAX_ALBUMS),
        pro: UNLIMITED,
      },
      {
        label: I18n.t('pro.items_label'),
        free: String(PRO_LIMITS.FREE_MAX_ITEMS),
        pro: UNLIMITED,
      },
      {
        label: I18n.t('pro.budget_templates_label'),
        free: String(PRO_LIMITS.FREE_MAX_BUDGET_TEMPLATES),
        pro: UNLIMITED,
      },
      {
        label: I18n.t('pro.receipts_label'),
        free: String(PRO_LIMITS.FREE_MAX_RECEIPTS),
        pro: UNLIMITED,
      },
      {
        // Free scans are a lifetime total (like voice); Pro is advertised as
        // unlimited (the server-side fair-use cap stays out of the paywall).
        label: I18n.t('pro.receipt_scans_label'),
        free: I18n.t('pro.compare_limited'),
        pro: UNLIMITED,
      },
      // The auto-log automations run through iOS Shortcuts, so they only exist
      // on iOS — no point advertising them on Android.
      ...(Platform.OS === 'ios'
        ? [
            {
              label: I18n.t('pro.apple_pay_automation_label'),
              free: I18n.t('pro.compare_limited'),
              pro: UNLIMITED,
            },
            {
              label: I18n.t('pro.screenshot_automation_label'),
              free: I18n.t('pro.compare_limited'),
              pro: UNLIMITED,
            },
          ]
        : []),
      {
        label: I18n.t('pro.split_bills_label'),
        free: String(PRO_LIMITS.FREE_MAX_UNSETTLED_SPLIT_BILLS),
        pro: UNLIMITED,
      },
      { label: I18n.t('pro.biometric_label'), free: false, pro: true },
      { label: I18n.t('pro.trends_label'), free: false, pro: true },
      { label: I18n.t('pro.widgets_label'), free: '2', pro: '8' },
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
      // Pro "yes" reads as a filled badge; Free "yes" stays a plain tick.
      return isPro ? (
        <View style={[s.checkCircle, { backgroundColor: colors.primary }]}>
          <Check size={12} color="#fff" strokeWidth={3.5} />
        </View>
      ) : (
        <Check size={16} color={colors.text} strokeWidth={3} />
      );
    }
    return <Minus size={15} color={colors.textMuted} strokeWidth={2.5} />;
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
        <View
          style={[
            s.tableValueCol,
            s.tableProCol,
            s.tableProHeaderCell,
            { backgroundColor: colors.primary },
          ]}
        >
          <View style={s.tableProHeader}>
            <Crown size={12} color="#fff" fill="#fff" />
            <Text style={[s.tableHeaderText, { color: '#fff' }]}>{I18n.t('pro.pro_title')}</Text>
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

type PlanKind = 'monthly' | 'annual' | 'lifetime';

interface PlanOption {
  /** Stable selection id — the package identifier, or a placeholder slot id before offerings load. */
  id: string;
  kind: PlanKind;
  /** Null until RevenueCat offerings load. The card renders regardless; only the price waits on this. */
  pkg: RevenueCatPackage | null;
  name: string;
  subtitle: string;
  /** Null until offerings load. */
  priceLabel: string | null;
  /** Per-month equivalent line (annual only). */
  perMonthLabel?: string | null;
  /** Discount vs the monthly plan, in whole percent (annual only). */
  percentOff?: number | null;
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
  const { isLoading, isPro, customerState, offering, purchasePackage, refresh, restorePurchases } =
    usePro();
  const packages = usePackagesByType(offering);
  const isSubscriber = isRevenueCatCustomerStateSubscriber(customerState);
  // A subscriber can still move to Lifetime — but only if the offering exposes it.
  const lifetimePackage = packages.lifetime;
  const canOfferLifetimeUpgrade = isSubscriber && !!lifetimePackage;
  const colors = usePaywallColors();
  const insets = useSafeAreaInsets();
  const bodyScrollRef = useRef<ScrollView>(null);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [exitOfferVisible, setExitOfferVisible] = useState(false);
  const [exitOfferShown, setExitOfferShown] = useState(false);
  const [visibleFlashMessage, setVisibleFlashMessage] = useState<string | null>(
    flashMessage ?? null,
  );

  useEffect(() => {
    void trackEvent(AnalyticsEvents.PRO_PAYWALL_VIEWED, { source: source ?? 'settings' });
  }, [source]);

  useEffect(() => {
    if (canOfferLifetimeUpgrade) {
      void trackEvent(AnalyticsEvents.PRO_LIFETIME_UPGRADE_VIEWED, {
        source: source ?? 'settings',
      });
    }
  }, [canOfferLifetimeUpgrade, source]);

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

  // Discount of the annual plan vs 12x the monthly plan — drives the "Save X%"
  // badge and only shows when both plans and a positive saving exist.
  const annualPercentOff = useMemo(() => {
    const monthlyPrice = packages.monthly?.price ?? 0;
    const annualPrice = packages.annual?.price ?? 0;
    if (monthlyPrice <= 0 || annualPrice <= 0) return 0;
    const pct = Math.round((1 - annualPrice / 12 / monthlyPrice) * 100);
    return pct > 0 ? pct : 0;
  }, [packages.annual?.price, packages.monthly?.price]);

  // The plan cards are structural — they always render (monthly, annual,
  // lifetime). Only the price waits on RevenueCat: before offerings load, or
  // when purchases aren't configured (e.g. the simulator), `pkg`/`priceLabel`
  // stay null and the card simply shows no price. Once the offering loads we
  // trust it for which plans actually exist.
  const planOptions = useMemo<PlanOption[]>(() => {
    const offeringLoaded = !!offering;
    const byKind: Record<PlanKind, RevenueCatPackage | null> = {
      monthly: packages.monthly,
      annual: packages.annual,
      lifetime: packages.lifetime,
    };
    const canonical: { kind: PlanKind; name: string; subtitle: string; mascot: MascotName }[] = [
      {
        kind: 'monthly',
        name: I18n.t('pro.monthly'),
        subtitle: I18n.t('pro.monthly_subtitle'),
        mascot: 'plan-monthly',
      },
      {
        kind: 'annual',
        name: I18n.t('pro.yearly'),
        subtitle: I18n.t('pro.yearly_subtitle'),
        mascot: 'plan-annual',
      },
      {
        kind: 'lifetime',
        name: I18n.t('pro.lifetime'),
        subtitle: I18n.t('pro.lifetime_subtitle'),
        mascot: 'plan-lifetime',
      },
    ];

    const slots = canonical
      // Once the offering is loaded, only advertise a plan it actually includes.
      // Before then, show all three as placeholders so the layout never collapses.
      .filter((c) => !offeringLoaded || byKind[c.kind])
      .map<PlanOption>((c) => {
        const pkg = byKind[c.kind];
        return {
          id: pkg?.identifier ?? `slot-${c.kind}`,
          kind: c.kind,
          pkg: pkg ?? null,
          name: c.name,
          subtitle: c.subtitle,
          priceLabel: pkg?.localizedPriceString ?? null,
          perMonthLabel: c.kind === 'annual' ? (pkg?.localizedPricePerMonthString ?? null) : null,
          percentOff: c.kind === 'annual' ? annualPercentOff || null : null,
          mascot: c.mascot,
        };
      });

    if (slots.length > 0) {
      return slots;
    }

    // Loaded offering with only non-standard package types: list them as-is.
    return [...(offering?.packages ?? [])]
      .sort((left, right) => getPlanSortOrder(left) - getPlanSortOrder(right))
      .map<PlanOption>((pkg) => ({
        id: pkg.identifier,
        kind: (normalizePackageType(pkg.packageType).toLowerCase() as PlanKind) ?? 'monthly',
        pkg,
        name: humanizePackageType(pkg.packageType),
        subtitle: '',
        priceLabel: pkg.localizedPriceString,
      }));
  }, [annualPercentOff, offering, packages.annual, packages.lifetime, packages.monthly]);

  const handlePurchasePackage = useCallback(
    async (pkg: RevenueCatPackage) => {
      if (isPurchasing) return;
      const pkgId = pkg.identifier;
      // Capture upgrade context before the purchase mutates customer state, so
      // we know whether to prompt the user to cancel their now-redundant sub.
      const wasSubscriber = isRevenueCatCustomerStateSubscriber(customerState);
      const boughtLifetime = normalizePackageType(pkg.packageType) === 'LIFETIME';
      setIsPurchasing(true);
      void trackEvent(AnalyticsEvents.PRO_PURCHASE_STARTED, { package: pkgId });
      try {
        const result = await purchasePackage(pkgId);
        if (result.status === 'success') {
          void trackEvent(AnalyticsEvents.PRO_PURCHASE_COMPLETED, { package: pkgId });
          recordProPurchase();
          setExitOfferVisible(false);
          onClose();
          if (wasSubscriber && boughtLifetime) {
            // A subscriber converting to Lifetime — the key conversion for this flow.
            void trackEvent(AnalyticsEvents.PRO_LIFETIME_UPGRADE_COMPLETED, { package: pkgId });
            // Lifetime is a separate one-time product; the old subscription keeps
            // renewing until cancelled. Nudge the user to stop the double charge.
            void trackEvent(AnalyticsEvents.PRO_CANCEL_SUB_PROMPT_VIEWED, { package: pkgId });
            Alert.alert(
              I18n.t('pro.lifetime_purchased_title'),
              I18n.t('pro.lifetime_purchased_body'),
              [
                {
                  text: I18n.t('pro.cancel_subscription'),
                  onPress: () => {
                    void trackEvent(AnalyticsEvents.PRO_CANCEL_SUB_PROMPT_ACTIONED, {
                      choice: 'cancel',
                    });
                    openStoreSubscriptions();
                  },
                },
                {
                  text: I18n.t('pro.not_now'),
                  style: 'cancel',
                  onPress: () =>
                    void trackEvent(AnalyticsEvents.PRO_CANCEL_SUB_PROMPT_ACTIONED, {
                      choice: 'not_now',
                    }),
                },
              ],
            );
          }
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
    [customerState, isPurchasing, onClose, purchasePackage],
  );

  // Tapping a plan card buys it straight away — no separate select + confirm step.
  const handleBuyPlan = useCallback(
    (option: PlanOption) => {
      if (isPurchasing) return;
      // Price not loaded yet (offering still fetching / not configured): retry the
      // fetch instead of dead-ending, so the tap always does something useful.
      if (!option.pkg) {
        void refresh();
        return;
      }
      setPurchasingId(option.id);
      void handlePurchasePackage(option.pkg).finally(() => setPurchasingId(null));
    },
    [handlePurchasePackage, isPurchasing, refresh],
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

  // Closing the paywall: show the last-chance exit offer the first time. After
  // that, close for real. The subscriber→Lifetime and active states close
  // immediately. The offer uses the monthly/annual plan slots (which exist even
  // before prices load), so it shows regardless of RevenueCat readiness.
  const monthlySlot = planOptions.find((o) => o.kind === 'monthly') ?? null;
  const annualSlot = planOptions.find((o) => o.kind === 'annual') ?? null;
  const canShowExitOffer = !!(monthlySlot || annualSlot);

  const handleRequestClose = useCallback(() => {
    if (!exitOfferShown && canShowExitOffer) {
      // Opening the exit sheet doesn't navigate, so it gets no back-haptic of its
      // own — add one here. The close path (below) already gets the navigation
      // back-haptic, so we must NOT add another there or it double-taps.
      void triggerHaptic('medium');
      setExitOfferShown(true);
      setExitOfferVisible(true);
      void trackEvent(AnalyticsEvents.PRO_EXIT_OFFER_VIEWED, { source: source ?? 'settings' });
      return;
    }
    onClose();
  }, [canShowExitOffer, exitOfferShown, onClose, source]);

  const handleExitDismiss = useCallback(() => {
    setExitOfferVisible(false);
    void trackEvent(AnalyticsEvents.PRO_EXIT_OFFER_DISMISSED);
    onClose();
  }, [onClose]);

  const handleExitSeeAllPlans = useCallback(() => {
    setExitOfferVisible(false);
    void trackEvent(AnalyticsEvents.PRO_EXIT_OFFER_ALL_PLANS_TAPPED);
    // Reveal the full plan list (incl. Lifetime) by scrolling to the bottom once
    // the sheet begins to close.
    setTimeout(() => bodyScrollRef.current?.scrollToEnd({ animated: true }), 220);
  }, []);

  // Active subscribers can still own Pro forever — surface a focused Lifetime
  // upgrade instead of the "you're all set" wall (which would otherwise force
  // them to cancel and wait for expiry before they could ever buy Lifetime).
  if (isPro && canOfferLifetimeUpgrade && lifetimePackage) {
    return (
      <View style={[s.root, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
        <PaywallBackdrop colors={colors} />
        <View style={s.header}>
          <View style={{ width: 32 }} />
          <HeaderBrand colors={colors} />
          <CloseBtn onClose={onClose} colors={colors} />
        </View>

        <ScrollView
          style={s.bodyScroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.upsellScrollContent}
        >
          <TabletContentContainer>
            <Animated.View entering={FadeIn.duration(400)} style={s.upsellHero}>
              <Mascot size={132} name="plan-lifetime" animate />
              <Text style={[s.upsellTitle, { color: colors.text }]}>
                {I18n.t('pro.upgrade_to_lifetime')}
              </Text>
              <Text style={[s.upsellSubtitle, { color: colors.textMuted }]}>
                {I18n.t('pro.lifetime_upsell_subtitle')}
              </Text>
            </Animated.View>

            <View
              style={[
                s.upsellCard,
                { backgroundColor: colors.cardBg, borderColor: colors.primary },
              ]}
            >
              <View style={s.upsellCardRow}>
                <Text style={[s.upsellPlanName, { color: colors.text }]}>
                  {I18n.t('pro.lifetime')}
                </Text>
                <Text style={[s.upsellPrice, { color: colors.primary }]}>
                  {lifetimePackage.localizedPriceString}
                </Text>
              </View>
              <Text style={[s.upsellPlanDesc, { color: colors.textMuted }]}>
                {I18n.t('pro.lifetime_desc')}
              </Text>
            </View>
          </TabletContentContainer>
        </ScrollView>

        <View
          style={[
            s.footer,
            {
              backgroundColor: colors.isDark ? colors.surface : colors.cardBg,
              borderTopColor: colors.cardBorder,
              paddingBottom: Math.max(insets.bottom - 10, 2),
            },
          ]}
        >
          <TabletContentContainer>
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
              onPress={() => void handlePurchasePackage(lifetimePackage)}
              disabled={isPurchasing}
              variant="warm"
              size="default"
              className="h-[46px] w-full shadow-warm-lg"
              haptic="none"
            >
              {isPurchasing ? (
                <LoadingDots size="small" color="#fff" />
              ) : (
                <View style={s.ctaContent}>
                  <ArrowUpCircle size={16} color="#fff" />
                  <Text style={s.ctaText}>{I18n.t('pro.upgrade_to_lifetime')}</Text>
                </View>
              )}
            </Button>

            <Pressable
              onPress={handleRestore}
              disabled={isRestoring}
              hitSlop={10}
              style={s.restoreButton}
            >
              <Text style={[s.restoreText, { color: colors.textMuted }]}>
                {isRestoring ? I18n.t('pro.restoring') : I18n.t('pro.restore')}
              </Text>
            </Pressable>
          </TabletContentContainer>
        </View>
      </View>
    );
  }

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
        <CloseBtn onClose={handleRequestClose} colors={colors} />
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
        ref={bodyScrollRef}
        style={s.bodyScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.bodyScrollContent, { paddingBottom: spacing.xl + insets.bottom }]}
      >
        <TabletContentContainer>
          <Hero colors={colors} />

          <View style={s.compareSection}>
            <Text style={[s.sectionHeading, { color: colors.text }]}>
              {I18n.t('pro.compare_title')}
            </Text>
            <Text style={[s.sectionSubheading, { color: colors.textMuted }]}>
              {I18n.t('pro.compare_subtitle')}
            </Text>
            <CompareTable colors={colors} voiceSupported={voiceSupported} />
          </View>

          <View style={s.plansSection}>
            <View>
              <Text style={[s.sectionHeading, { color: colors.text }]}>
                {I18n.t('pro.plans_heading')}
              </Text>
              <Text style={[s.sectionSubheading, { color: colors.textMuted }]}>
                {I18n.t('pro.no_commitment')}
              </Text>
            </View>
            {planOptions.length > 0 ? (
              <View style={s.planList}>
                {planOptions.map((option) => (
                  <PlanRow
                    key={option.id}
                    option={option}
                    onBuy={handleBuyPlan}
                    purchasing={purchasingId === option.id}
                    disabled={isPurchasing}
                    colors={colors}
                  />
                ))}
              </View>
            ) : (
              <View style={s.footerEmpty}>
                <Text style={[s.footerEmptyText, { color: colors.textMuted }]}>
                  {isLoading ? I18n.t('pro.loading_plans') : I18n.t('pro.plans_unavailable_title')}
                </Text>
                {!isLoading ? (
                  <Button onPress={() => void refresh()} variant="outline" size="sm" haptic="none">
                    <Text>{I18n.t('pro.retry_loading_plans')}</Text>
                  </Button>
                ) : null}
              </View>
            )}

            <View style={s.planLinksRow}>
              <Text
                style={[s.planLink, { color: colors.textMuted }]}
                onPress={isRestoring ? undefined : handleRestore}
              >
                {isRestoring ? I18n.t('pro.restoring') : I18n.t('pro.restore')}
              </Text>
              <Text style={[s.planLinkSep, { color: colors.textMuted }]}>·</Text>
              <Text
                style={[s.planLink, { color: colors.textMuted }]}
                onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
              >
                {I18n.t('pro.privacy_policy')}
              </Text>
            </View>
          </View>
        </TabletContentContainer>
      </ScrollView>

      <ExitOfferModal
        visible={exitOfferVisible}
        colors={colors}
        monthly={monthlySlot}
        annual={annualSlot}
        isPurchasing={isPurchasing}
        onBuy={(slot) => {
          if (slot.pkg) void handlePurchasePackage(slot.pkg);
          else void refresh();
        }}
        onSeeAllPlans={handleExitSeeAllPlans}
        onDismiss={handleExitDismiss}
      />
    </View>
  );
}

// ─── Plan row (stacked, full width) ──────────────────────────────────

function PlanRow({
  option,
  onBuy,
  purchasing,
  disabled,
  colors,
}: {
  option: PlanOption;
  onBuy: (option: PlanOption) => void;
  purchasing: boolean;
  disabled: boolean;
  colors: PaywallColors;
}) {
  const highlight = option.kind === 'annual';
  return (
    <Pressable
      onPress={() => onBuy(option)}
      disabled={disabled}
      style={[
        s.planRow,
        {
          borderColor: highlight ? withAlpha(colors.primary, 0.55) : colors.cardBorder,
          borderWidth: highlight ? 2 : 1.5,
          backgroundColor: highlight
            ? withAlpha(colors.primary, colors.isDark ? 0.09 : 0.04)
            : colors.cardBg,
          opacity: disabled && !purchasing ? 0.6 : 1,
        },
      ]}
    >
      {highlight ? (
        <View style={[s.planTopBanner, { backgroundColor: colors.primary }]}>
          <Star size={11} color="#fff" fill="#fff" strokeWidth={0} />
          <Text style={s.planTopBannerText}>
            {I18n.t('pro.best_value')}
            {option.percentOff
              ? ` · ${I18n.t('pro.save_percent', { percent: option.percentOff })}`
              : ''}
          </Text>
        </View>
      ) : null}

      <View style={s.planRowMain}>
        {option.mascot ? <Mascot size={40} name={option.mascot} animate={highlight} /> : null}

        <View style={s.planRowText}>
          <Text style={[s.planName, { color: colors.text }]} numberOfLines={1}>
            {option.name}
          </Text>
          <Text style={[s.planSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
            {option.subtitle}
          </Text>
        </View>

        {option.priceLabel ? (
          <View style={s.planRowPrice}>
            <Text style={[s.planPrice, { color: colors.text }]} numberOfLines={1}>
              {option.priceLabel}
            </Text>
            {option.perMonthLabel ? (
              <Text style={[s.planPerMonth, { color: colors.textMuted }]} numberOfLines={1}>
                {option.perMonthLabel}
                {I18n.t('pro.per_month_short')}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* The circle keeps its size across both states, so swapping the chevron
            for the spinner never nudges the row's layout. `tiny` dots are the
            widest variant that fits inside it. */}
        <View
          style={[
            s.planArrow,
            {
              backgroundColor: withAlpha(colors.primary, purchasing ? 0.18 : 0.12),
            },
          ]}
        >
          {purchasing ? (
            <LoadingDots size="tiny" color={colors.primary} />
          ) : (
            <ChevronRight size={20} color={colors.primary} strokeWidth={2.6} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ─── Exit-offer modal (last chance) ──────────────────────────────────

function MiniPlan({
  slot,
  subtitle,
  bannerText,
  selected,
  onSelect,
  colors,
}: {
  slot: PlanOption;
  subtitle: string;
  /** Full-width top banner (e.g. "BEST VALUE") — also gives the card standing emphasis. */
  bannerText?: string | null;
  selected: boolean;
  onSelect: () => void;
  colors: PaywallColors;
}) {
  const highlight = !!bannerText;
  return (
    <Pressable
      onPress={onSelect}
      style={[
        s.miniPlan,
        {
          borderColor: selected
            ? colors.primary
            : highlight
              ? withAlpha(colors.primary, 0.55)
              : colors.cardBorder,
          borderWidth: selected || highlight ? 2 : 1.5,
          backgroundColor: selected
            ? withAlpha(colors.primary, colors.isDark ? 0.18 : 0.09)
            : highlight
              ? withAlpha(colors.primary, colors.isDark ? 0.09 : 0.04)
              : colors.cardBg,
        },
      ]}
    >
      {bannerText ? (
        <View style={[s.planTopBanner, { backgroundColor: colors.primary }]}>
          <Star size={10} color="#fff" fill="#fff" strokeWidth={0} />
          <Text style={s.planTopBannerText} numberOfLines={1}>
            {bannerText}
          </Text>
        </View>
      ) : null}
      <View style={s.miniPlanBody}>
        <Text style={[s.miniPlanName, { color: colors.text }]}>{slot.name}</Text>
        {slot.priceLabel ? (
          <Text style={[s.miniPlanPrice, { color: colors.primary }]}>{slot.priceLabel}</Text>
        ) : null}
        <Text style={[s.miniPlanSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

function ExitOfferModal({
  visible,
  colors,
  monthly,
  annual,
  isPurchasing,
  onBuy,
  onSeeAllPlans,
  onDismiss,
}: {
  visible: boolean;
  colors: PaywallColors;
  monthly: PlanOption | null;
  annual: PlanOption | null;
  isPurchasing: boolean;
  onBuy: (slot: PlanOption) => void;
  onSeeAllPlans: () => void;
  onDismiss: () => void;
}) {
  const [selected, setSelected] = useState<'monthly' | 'annual'>('annual');
  // Default the selection to whichever plan actually exists (annual preferred).
  useEffect(() => {
    if (!visible) return;
    setSelected(annual ? 'annual' : 'monthly');
  }, [visible, annual]);

  const chosen = selected === 'annual' ? annual : monthly;
  const annualPercentOff = annual?.percentOff ?? 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={s.modalOverlay}>
        <Pressable style={s.modalScrim} onPress={onDismiss} />
        <View style={[s.modalSheet, { backgroundColor: colors.bg }]}>
          <View style={s.modalHandleRow}>
            <View style={[s.modalHandle, { backgroundColor: colors.cardBorder }]} />
          </View>
          <Pressable
            onPress={onDismiss}
            hitSlop={12}
            style={[s.modalClose, { backgroundColor: colors.closeBg }]}
          >
            <X size={17} color={colors.closeIcon} />
          </Pressable>

          <View style={s.modalHeaderRow}>
            <Mascot size={48} name="love" animate />
            <Text style={[s.modalTitle, { color: colors.text }]}>{I18n.t('pro.exit_title')}</Text>
          </View>

          <View style={s.miniPlanRow}>
            {monthly ? (
              <MiniPlan
                slot={monthly}
                subtitle={I18n.t('pro.monthly_subtitle')}
                selected={selected === 'monthly'}
                onSelect={() => setSelected('monthly')}
                colors={colors}
              />
            ) : null}
            {annual ? (
              <MiniPlan
                slot={annual}
                subtitle={
                  annual.perMonthLabel
                    ? `${annual.perMonthLabel}${I18n.t('pro.per_month_short')}`
                    : I18n.t('pro.yearly_subtitle')
                }
                bannerText={
                  annualPercentOff > 0
                    ? I18n.t('pro.save_percent', { percent: annualPercentOff })
                    : I18n.t('pro.best_value')
                }
                selected={selected === 'annual'}
                onSelect={() => setSelected('annual')}
                colors={colors}
              />
            ) : null}
          </View>

          <Button
            onPress={() => chosen && onBuy(chosen)}
            disabled={isPurchasing || !chosen}
            variant="warm"
            size="default"
            className="h-[50px] w-full shadow-warm-lg"
            haptic="none"
          >
            {isPurchasing ? (
              <LoadingDots size="small" color="#fff" />
            ) : (
              <View style={s.ctaContent}>
                <Crown size={16} color="#fff" fill="#fff" />
                <Text style={s.ctaText}>{I18n.t('pro.exit_cta')}</Text>
              </View>
            )}
          </Button>
          <Text style={[s.reassureText, { color: colors.textMuted }]}>
            {I18n.t('pro.no_commitment')}
          </Text>

          <Pressable onPress={onSeeAllPlans} hitSlop={8} style={s.modalAllPlans}>
            <Text style={[s.modalAllPlansText, { color: colors.primary }]}>
              {I18n.t('pro.exit_all_plans')}
            </Text>
            <ChevronRight size={15} color={colors.primary} />
          </Pressable>
        </View>
      </View>
    </Modal>
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
    paddingBottom: spacing.xl,
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

  // Hero
  hero: { paddingTop: spacing.md, alignItems: 'center' },
  heroTitle: {
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  starRow: { flexDirection: 'row', gap: 2 },
  laurelMirror: { transform: [{ scaleX: -1 }] },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginTop: 20,
  },
  wreathBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  wreathContent: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  socialValue: { fontSize: 19, fontWeight: '800', letterSpacing: -0.4 },
  socialLabel: { fontSize: 10.5, fontWeight: '600', letterSpacing: 0.2 },
  // Full-bleed to the screen edges (cancel the scroll view's horizontal padding)
  // so the peeking neighbour cards reach the edges instead of being clipped.
  carousel: {
    alignSelf: 'stretch',
    marginTop: spacing.xl,
    marginHorizontal: -spacing.screenHorizontal,
  },
  testimonial: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    minHeight: 148,
    justifyContent: 'space-between',
    gap: 14,
  },
  testimonialQuoteMark: {
    position: 'absolute',
    top: 12,
    right: 14,
  },
  // Right padding keeps the first line clear of the top-right quote glyph.
  testimonialQuote: { fontSize: 15, lineHeight: 22, fontWeight: '600', paddingRight: 24 },
  testimonialBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  testimonialAuthor: { flexShrink: 1, fontSize: 13, fontWeight: '700' },

  // Section headings
  sectionHeading: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionSubheading: { fontSize: 14, lineHeight: 20, marginTop: 3 },

  // Compare section
  compareSection: { marginTop: spacing.xl, gap: 4 },

  // Comparison table
  table: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tableLabelCol: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  tableValueCol: {
    width: 72,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableProCol: {
    alignSelf: 'stretch',
  },
  tableProHeaderCell: {
    paddingVertical: 11,
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
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Plans section
  plansSection: { marginTop: spacing['3xl'], gap: spacing.sm },
  planList: { gap: 10, marginTop: 4 },
  planRow: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  planTopBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 5,
  },
  planTopBannerText: {
    color: '#fff',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  planRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  planRowText: { flex: 1, gap: 2 },
  planName: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  planSubtitle: { fontSize: 12, fontWeight: '500' },
  planRowPrice: { alignItems: 'flex-end', gap: 1 },
  planPrice: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  planPerMonth: { fontSize: 11, fontWeight: '600' },
  planArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Footer / CTA
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  termsText: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 4 },
  termsLink: { fontSize: 11, fontWeight: '700', textDecorationLine: 'underline' },
  planLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 6,
  },
  planLink: {
    fontSize: 12.5,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  planLinkSep: { fontSize: 12, fontWeight: '600' },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: { fontFamily: FONT.extrabold, fontWeight: '800', color: '#fff', fontSize: 16 },
  reassureText: {
    fontSize: 11.5,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
    letterSpacing: 0.1,
  },
  restoreButton: { alignSelf: 'center', marginTop: 4, paddingVertical: 2 },
  restoreText: { fontSize: 12, fontWeight: '500', textDecorationLine: 'underline' },
  footerEmpty: { alignItems: 'center', gap: 12, paddingVertical: spacing.sm },
  footerEmptyText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },

  // Exit-offer modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
    alignItems: 'center',
  },
  modalHandleRow: { alignItems: 'center', paddingBottom: 8 },
  modalHandle: { width: 40, height: 5, borderRadius: 3 },
  modalClose: {
    position: 'absolute',
    top: 14,
    right: 16,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'center',
    marginTop: 2,
  },
  modalTitle: {
    flexShrink: 1,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  miniPlanRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    alignSelf: 'stretch',
    marginTop: 16,
    marginBottom: 14,
  },
  miniPlan: {
    flex: 1,
    minHeight: 96,
    borderRadius: 16,
    overflow: 'hidden',
  },
  miniPlanBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  miniPlanName: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  miniPlanPrice: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  miniPlanSubtitle: { fontSize: 11, fontWeight: '600' },
  modalAllPlans: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 12,
    paddingVertical: 4,
  },
  modalAllPlansText: { fontSize: 14, fontWeight: '700' },

  // Subscriber → Lifetime upsell
  upsellScrollContent: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingBottom: spacing.lg,
  },
  upsellHero: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: 4,
  },
  upsellTitle: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginTop: 12,
  },
  upsellSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  upsellCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 18,
    gap: 6,
    marginTop: spacing.sm,
  },
  upsellCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  upsellPlanName: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  upsellPrice: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  upsellPlanDesc: { fontSize: 14, lineHeight: 20 },

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
