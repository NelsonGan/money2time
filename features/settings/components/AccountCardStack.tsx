import { LinearGradient } from 'expo-linear-gradient';
import { Settings } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useBottomNavScrollReporter } from '~/components/navigation/BottomNavMinimize';
import { AccountLogo, Text, TimeValueInline, useSettingsBottomNavInset } from '~/components/ui';
import { CARD_FOREGROUND, type CardColorDef, resolveCardColor } from '~/constants/cardColors';
import { spacing } from '~/constants/designSystem';
import { springPresets } from '~/constants/motion';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Account, AccountGroup, UserSettings } from '~/types';
import { getNetAssetContribution } from '~/utils/accountBalances';
import { FONT } from '~/utils/fonts';
import { formatAmount, normalizeMoneyAmount } from '~/utils/formatters';
import { clampStatementDate } from '~/utils/statementPeriods';

interface CreditSummary {
  payable: number;
  outstanding: number;
}

interface GroupSection {
  id: string;
  label: string;
  accounts: Account[];
}

interface AccountCardStackProps {
  accounts: Account[];
  accountGroups: AccountGroup[];
  balanceMap: Map<string, number>;
  /** Balances converted to the reporting currency — used for group sums. */
  convertedBalanceMap: Map<string, number>;
  creditSummaryByAccountId: Map<string, CreditSummary>;
  scrollViewRef?: React.RefObject<ScrollView | null>;
  settings: UserSettings;
  trueHourlyRate: number;
  hideBalances: boolean;
  onOpenAccount: (accountId: string) => void;
  onEditAccount: (accountId: string) => void;
  onPayAccount: (accountId: string) => void;
}

// A clean card face: a brand row (logo + contactless mark) over a detail row
// (name + balance), visible even when the card is collapsed in the stack.
const CARD_TOP_PADDING = 14;
const BRAND_ROW_HEIGHT = 34;
const CARD_ROW_GAP = 4;
const DETAIL_ROW_HEIGHT = 42;
const PEEK_HEIGHT = CARD_TOP_PADDING + BRAND_ROW_HEIGHT + CARD_ROW_GAP + DETAIL_ROW_HEIGHT;
const CARD_BODY_HEIGHT = 66;
const EXPANDED_DEBIT_HEIGHT = 244;
const EXPANDED_CREDIT_HEIGHT = 322;
const CARD_BORDER_RADIUS = 20;
const MASKED_BALANCE_VALUE = '••••';
const EXCLUDED_CARD_OPACITY = 0.5;

function getExpandedHeight(account: Account) {
  return account.type === 'credit' ? EXPANDED_CREDIT_HEIGHT : EXPANDED_DEBIT_HEIGHT;
}

function isNegativeForDisplay(value: number) {
  return normalizeMoneyAmount(value) < 0;
}

const monthDayFormatterCache = new Map<string, Intl.DateTimeFormat>();
function monthDayFormatter(locale: string): Intl.DateTimeFormat {
  const cached = monthDayFormatterCache.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  monthDayFormatterCache.set(locale, formatter);
  return formatter;
}

/** The next calendar date landing on `day` (clamped for short months) on/after `from`. */
function nextDateForDay(day: number, from: Date): Date {
  const candidate = clampStatementDate(from.getFullYear(), from.getMonth(), day);
  if (candidate.getTime() >= from.getTime()) return candidate;
  return clampStatementDate(from.getFullYear(), from.getMonth() + 1, day);
}

/**
 * Credit-card billing sublabel showing the upcoming statement and due *dates*
 * (with month), e.g. "Statement Jul 25 · Due Aug 1". The due date is the first
 * occurrence of the due day after the next statement date.
 */
function statementDueLabel(account: Account, locale: string): string | null {
  if (account.type !== 'credit') return null;
  const statementDay = account.creditStatementDay;
  const dueDay = account.creditDueDay;
  if (statementDay == null || dueDay == null) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextStatement = nextDateForDay(statementDay, today);
  const afterStatement = new Date(nextStatement);
  afterStatement.setDate(afterStatement.getDate() + 1);
  const nextDue = nextDateForDay(dueDay, afterStatement);

  const fmt = monthDayFormatter(locale);
  return String(
    I18n.t('accounts.statement_due', {
      statementDay: fmt.format(nextStatement),
      dueDay: fmt.format(nextDue),
    }),
  );
}

/** The contactless-payment waves (three concentric arcs opening right). */
function ContactlessMark() {
  const stroke = CARD_FOREGROUND.soft;
  return (
    <Svg width={16} height={20} viewBox="0 0 16 20">
      <Path
        d="M3 4 a 8 8 0 0 1 0 12"
        stroke={stroke}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M6.5 6 a 4.8 4.8 0 0 1 0 8"
        stroke={stroke}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M10 8 a 2 2 0 0 1 0 4"
        stroke={stroke}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ── StackCard ──────────────────────────────────────────────

interface StackCardProps {
  account: Account;
  balance: number;
  creditSummary: CreditSummary | null;
  color: CardColorDef;
  isExpanded: boolean;
  targetTop: number;
  cardIndex: number;
  totalCards: number;
  onToggle: () => void;
  onViewTransactions: () => void;
  onEditAccount: () => void;
  onPayAccount: () => void;
  hideBalances: boolean;
  settings: UserSettings;
  trueHourlyRate: number;
  accountGroupLabel: string;
}

function StackCard({
  account,
  balance,
  creditSummary,
  color,
  isExpanded,
  targetTop,
  cardIndex,
  totalCards,
  onToggle,
  onViewTransactions,
  onEditAccount,
  onPayAccount,
  hideBalances,
  settings,
  trueHourlyRate,
  accountGroupLabel,
}: StackCardProps) {
  const themeColors = useThemeColors();
  const normalizedBalance = normalizeMoneyAmount(balance);
  const isCredit = account.type === 'credit';
  const isExcluded = !account.includeInTotals;
  const expandedHeight = getExpandedHeight(account);
  const collapsedHeight = PEEK_HEIGHT + CARD_BODY_HEIGHT;
  const targetHeight = isExpanded ? expandedHeight : collapsedHeight;
  const billingLabel = statementDueLabel(account, settings.locale);

  const topAnim = useSharedValue(targetTop);
  const heightAnim = useSharedValue(targetHeight);
  const scaleAnim = useSharedValue(1);

  useEffect(() => {
    topAnim.value = withSpring(targetTop, springPresets.gentle);
  }, [targetTop, topAnim]);

  useEffect(() => {
    heightAnim.value = withSpring(targetHeight, springPresets.gentle);
  }, [targetHeight, heightAnim]);

  // Position via translateY (a GPU transform) rather than the `top` layout prop,
  // so shifting the stack on expand/collapse never triggers a per-frame layout
  // pass — the main source of jank when several cards animate at once.
  const animatedStyle = useAnimatedStyle(() => ({
    height: heightAnim.value,
    transform: [{ translateY: topAnim.value }, { scale: scaleAnim.value }],
  }));

  const handleToggle = useCallback(() => {
    void triggerHaptic('selection');
    onToggle();
  }, [onToggle]);

  const handlePressIn = useCallback(() => {
    scaleAnim.value = withSpring(0.98, springPresets.pressIn);
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    scaleAnim.value = withSpring(1, springPresets.pressOut);
  }, [scaleAnim]);

  // Render a money/time figure directly in a card-appropriate light tone. Keeps
  // the money-as-time clock in time mode while controlling color on the dark art.
  const renderFigure = useCallback(
    (amount: number, opts: { color?: string; fontSize?: number; negativeAware?: boolean } = {}) => {
      const baseColor = opts.color ?? CARD_FOREGROUND.strong;
      const fontSize = opts.fontSize ?? 16;
      if (hideBalances) {
        return (
          <Text variant="bodyStrong" style={{ color: baseColor, fontSize, letterSpacing: -0.5 }}>
            {MASKED_BALANCE_VALUE}
          </Text>
        );
      }
      const norm = normalizeMoneyAmount(amount);
      const finalColor = opts.negativeAware && norm < 0 ? CARD_FOREGROUND.negative : baseColor;
      const label = formatAmount(norm, settings, {
        showSign: false,
        trueHourlyRate,
        // Show each account's balance in its own (native) currency.
        currencyCode: account.currency,
      });
      if (settings.displayMode === 'time') {
        return (
          <TimeValueInline
            value={label}
            variant="bodyStrong"
            iconColor={finalColor}
            iconSize={Math.round(fontSize * 0.82)}
            style={{ color: finalColor, fontSize, letterSpacing: -0.5 }}
          />
        );
      }
      return (
        <Text variant="bodyStrong" style={{ color: finalColor, fontSize, letterSpacing: -0.5 }}>
          {label}
        </Text>
      );
    },
    [account.currency, hideBalances, settings, trueHourlyRate],
  );

  const peekBalanceColor =
    !isCredit && isNegativeForDisplay(normalizedBalance)
      ? CARD_FOREGROUND.negative
      : CARD_FOREGROUND.strong;

  return (
    <Animated.View
      style={[
        styles.card,
        {
          borderColor: CARD_FOREGROUND.hairline,
          zIndex: isExpanded ? totalCards + 1 : cardIndex,
          opacity: isExcluded ? EXCLUDED_CARD_OPACITY : 1,
        },
        animatedStyle,
      ]}
    >
      <LinearGradient
        colors={color.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Fine diagonal gloss lines read like light glancing off a real card. */}
      <View style={styles.glossLine1} pointerEvents="none" />
      <View style={styles.glossLine2} pointerEvents="none" />

      <Pressable
        onPress={handleToggle}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.cardPressable}
      >
        {/* Brand row — bank/account logo, with a subtle contactless mark */}
        <View style={styles.brandRow}>
          <View style={styles.logoTile}>
            <AccountLogo logoId={account.logoId} type={account.type} size={26} />
          </View>
          <ContactlessMark />
        </View>
        {/* Detail row — name + subtitle on the left, balance on the right */}
        <View style={styles.detailRow}>
          <View style={styles.detailNameCol}>
            <Text
              variant="bodyStrong"
              style={{ color: CARD_FOREGROUND.strong, fontSize: 16, letterSpacing: -0.3 }}
              numberOfLines={1}
            >
              {account.name}
            </Text>
            <Text
              style={{ color: CARD_FOREGROUND.faint, fontSize: 11, letterSpacing: 0.2 }}
              numberOfLines={1}
            >
              {billingLabel ??
                (account.accountGroup?.trim() ||
                  (isCredit
                    ? String(I18n.t('accounts.type_credit'))
                    : String(I18n.t('accounts.type_debit'))))}
            </Text>
          </View>
          <View style={styles.detailBalanceCol}>
            {isCredit && creditSummary
              ? renderFigure(creditSummary.payable + creditSummary.outstanding, {
                  fontSize: 18,
                  color: CARD_FOREGROUND.strong,
                })
              : renderFigure(normalizedBalance, { fontSize: 18, color: peekBalanceColor })}
          </View>
        </View>

        {/* Expanded content */}
        {isExpanded ? (
          <Animated.View entering={FadeIn.duration(220).delay(60)}>
            <View style={styles.divider} />

            <View style={styles.expandedBody}>
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>{I18n.t('accounts.account_group')}</Text>
                  <Text variant="caption" style={{ color: CARD_FOREGROUND.soft }} numberOfLines={1}>
                    {accountGroupLabel}
                  </Text>
                </View>
                <View style={[styles.metaItem, { alignItems: 'flex-end' }]}>
                  <Text style={styles.metaLabel}>{I18n.t('accounts.type')}</Text>
                  <View style={styles.typeBadge}>
                    <Text
                      variant="label"
                      style={{
                        color: CARD_FOREGROUND.strong,
                        fontSize: 9,
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                      }}
                    >
                      {isCredit ? I18n.t('accounts.type_credit') : I18n.t('accounts.type_debit')}
                    </Text>
                  </View>
                </View>
              </View>

              {isCredit && creditSummary ? (
                <View style={styles.creditRow}>
                  <View style={styles.creditBox}>
                    <Text style={styles.creditLabel}>{I18n.t('accounts.payable')}</Text>
                    {renderFigure(creditSummary.payable, {
                      fontSize: 14,
                      color: CARD_FOREGROUND.negative,
                    })}
                  </View>
                  <View style={styles.creditBox}>
                    <Text style={styles.creditLabel}>{I18n.t('accounts.outstanding')}</Text>
                    {renderFigure(creditSummary.outstanding, {
                      fontSize: 14,
                      color: CARD_FOREGROUND.soft,
                    })}
                  </View>
                </View>
              ) : null}

              <View style={[styles.ctaRow, isCredit && styles.ctaRowCredit]}>
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    onViewTransactions();
                  }}
                  style={[styles.ctaButton, { flex: 1 }]}
                >
                  <Text
                    variant="bodyStrong"
                    style={{ color: CARD_FOREGROUND.strong, fontSize: 13 }}
                  >
                    {I18n.t('accounts.view_transactions')}
                  </Text>
                </Pressable>
                {isCredit ? (
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      onPayAccount();
                    }}
                    style={styles.payButton}
                  >
                    <Text
                      variant="bodyStrong"
                      style={{ color: CARD_FOREGROUND.strong, fontSize: 13 }}
                    >
                      {I18n.t('accounts.pay')}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    onEditAccount();
                  }}
                  style={styles.editButton}
                >
                  <Settings size={15} color={CARD_FOREGROUND.strong} />
                </Pressable>
              </View>
            </View>
          </Animated.View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

// ── SectionStack — one group's card stack ──────────────────

interface SectionStackProps {
  section: GroupSection;
  expandedAccountId: string | null;
  onToggleAccount: (accountId: string) => void;
  onOpenAccount: (accountId: string) => void;
  onEditAccount: (accountId: string) => void;
  onPayAccount: (accountId: string) => void;
  balanceMap: Map<string, number>;
  creditSummaryByAccountId: Map<string, CreditSummary>;
  hideBalances: boolean;
  settings: UserSettings;
  trueHourlyRate: number;
}

function SectionStack({
  section,
  expandedAccountId,
  onToggleAccount,
  onOpenAccount,
  onEditAccount,
  onPayAccount,
  balanceMap,
  creditSummaryByAccountId,
  hideBalances,
  settings,
  trueHourlyRate,
}: SectionStackProps) {
  const expandedLocalIndex = section.accounts.findIndex((a) => a.id === expandedAccountId);

  const { positions, containerHeight } = useMemo(() => {
    const pos: number[] = [];
    let y = 0;
    for (let i = 0; i < section.accounts.length; i++) {
      pos.push(y);
      if (expandedLocalIndex === i) {
        y += getExpandedHeight(section.accounts[i]!);
      } else {
        y += PEEK_HEIGHT;
      }
    }
    const lastIsExpanded = expandedLocalIndex === section.accounts.length - 1;
    if (!lastIsExpanded) {
      y += CARD_BODY_HEIGHT;
    }
    return { positions: pos, containerHeight: y };
  }, [section.accounts, expandedLocalIndex]);

  return (
    <AnimatedContainer targetHeight={containerHeight}>
      {section.accounts.map((account, index) => {
        const color = resolveCardColor(account);
        const bal = balanceMap.get(account.id) ?? account.startingBalance;
        const creditSummary =
          account.type === 'credit' ? (creditSummaryByAccountId.get(account.id) ?? null) : null;
        const groupLabel = account.accountGroup?.trim() || String(I18n.t('common.ungrouped'));

        return (
          <StackCard
            key={account.id}
            account={account}
            balance={bal}
            creditSummary={creditSummary}
            color={color}
            isExpanded={expandedAccountId === account.id}
            targetTop={positions[index]!}
            cardIndex={index}
            totalCards={section.accounts.length}
            onToggle={() => onToggleAccount(account.id)}
            onViewTransactions={() => onOpenAccount(account.id)}
            onEditAccount={() => onEditAccount(account.id)}
            onPayAccount={() => onPayAccount(account.id)}
            hideBalances={hideBalances}
            settings={settings}
            trueHourlyRate={trueHourlyRate}
            accountGroupLabel={groupLabel}
          />
        );
      })}
    </AnimatedContainer>
  );
}

// ── AccountCardStack ───────────────────────────────────────

export function AccountCardStack({
  accounts,
  accountGroups,
  balanceMap,
  convertedBalanceMap,
  creditSummaryByAccountId,
  scrollViewRef,
  settings,
  trueHourlyRate,
  hideBalances,
  onOpenAccount,
  onEditAccount,
  onPayAccount,
}: AccountCardStackProps) {
  const themeColors = useThemeColors();
  // Base spacing.lg, not the full 100px flow-mode clearance — the glass inset
  // already covers the bar, so stacking both over-pads the scroll end.
  const bottomNavInset = useSettingsBottomNavInset(spacing.lg);
  const reportBottomNavScroll = useBottomNavScrollReporter();
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);

  const handleToggle = useCallback((accountId: string) => {
    setExpandedAccountId((current) => (current === accountId ? null : accountId));
  }, []);

  const sections = useMemo(() => {
    const groupNames = new Set(accountGroups.map((g) => g.name));
    const buckets = new Map<string, Account[]>();

    for (const account of accounts) {
      const key = account.accountGroup?.trim() || '__ungrouped__';
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(account);
      } else {
        buckets.set(key, [account]);
      }
    }

    const result: GroupSection[] = [];

    for (const group of accountGroups) {
      const list = buckets.get(group.name);
      if (list && list.length > 0) {
        result.push({ id: group.id, label: group.name, accounts: list });
      }
    }

    for (const [key, list] of buckets) {
      if (key === '__ungrouped__' || groupNames.has(key)) continue;
      result.push({ id: `group-${key}`, label: key, accounts: list });
    }

    const ungrouped = buckets.get('__ungrouped__');
    if (ungrouped && ungrouped.length > 0) {
      result.push({
        id: 'group-ungrouped',
        label: String(I18n.t('common.ungrouped')),
        accounts: ungrouped,
      });
    }

    return result;
  }, [accounts, accountGroups]);

  return (
    <ScrollView
      ref={scrollViewRef}
      contentContainerStyle={[styles.scrollContent, bottomNavInset]}
      showsVerticalScrollIndicator={false}
      onScroll={reportBottomNavScroll}
      scrollEventThrottle={32}
    >
      {sections.map((section, sectionIndex) => {
        const sectionTotal = normalizeMoneyAmount(
          section.accounts.reduce((sum, a) => {
            if (!a.includeInTotals) return sum;
            // Convert each account to the reporting currency before summing so
            // a group mixing currencies totals correctly.
            const bal = convertedBalanceMap.get(a.id) ?? balanceMap.get(a.id) ?? a.startingBalance;
            return sum + getNetAssetContribution(a.type, bal);
          }, 0),
        );
        const sectionTotalLabel = hideBalances
          ? MASKED_BALANCE_VALUE
          : formatAmount(sectionTotal, settings, { showSign: false, trueHourlyRate });

        return (
          <View key={section.id} style={sectionIndex > 0 ? styles.sectionGap : undefined}>
            <View style={styles.sectionHeader}>
              <Text variant="label" tone="muted" style={styles.sectionLabel}>
                {section.label}
              </Text>
              <Text
                variant="label"
                tone="muted"
                style={[
                  styles.sectionLabel,
                  {
                    color: isNegativeForDisplay(sectionTotal)
                      ? themeColors.error
                      : themeColors.success,
                  },
                ]}
              >
                {sectionTotalLabel}
              </Text>
            </View>
            <SectionStack
              section={section}
              expandedAccountId={expandedAccountId}
              onToggleAccount={handleToggle}
              onOpenAccount={onOpenAccount}
              onEditAccount={onEditAccount}
              onPayAccount={onPayAccount}
              balanceMap={balanceMap}
              creditSummaryByAccountId={creditSummaryByAccountId}
              hideBalances={hideBalances}
              settings={settings}
              trueHourlyRate={trueHourlyRate}
            />
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── Animated container ─────────────────────────────────────

function AnimatedContainer({
  targetHeight,
  children,
}: {
  targetHeight: number;
  children: React.ReactNode;
}) {
  const heightAnim = useSharedValue(targetHeight);

  useEffect(() => {
    heightAnim.value = withSpring(targetHeight, springPresets.gentle);
  }, [targetHeight, heightAnim]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: heightAnim.value,
  }));

  return <Animated.View style={[styles.stackContainer, animatedStyle]}>{children}</Animated.View>;
}

const SCROLL_CONTENT_BOTTOM_PADDING = 100;

// ── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: SCROLL_CONTENT_BOTTOM_PADDING,
  },
  sectionGap: {
    marginTop: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxs,
    paddingBottom: spacing.xs,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  stackContainer: {
    position: 'relative',
  },
  card: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderRadius: CARD_BORDER_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    // overflow:hidden + borderRadius already masks to bounds (which suppresses any
    // iOS layer shadow), so no shadow props here — they'd only add compositing cost.
    overflow: 'hidden',
  },
  cardPressable: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: CARD_TOP_PADDING,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: BRAND_ROW_HEIGHT,
    marginBottom: CARD_ROW_GAP,
  },
  glossLine1: {
    position: 'absolute',
    top: 52,
    right: -80,
    width: 320,
    height: 1.5,
    backgroundColor: CARD_FOREGROUND.sheen,
    transform: [{ rotate: '-24deg' }],
  },
  glossLine2: {
    position: 'absolute',
    top: 68,
    right: -80,
    width: 320,
    height: 1.5,
    backgroundColor: CARD_FOREGROUND.sheenSoft,
    transform: [{ rotate: '-24deg' }],
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: DETAIL_ROW_HEIGHT,
    gap: 12,
  },
  logoTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD_FOREGROUND.frost,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_FOREGROUND.hairline,
  },
  detailNameCol: {
    flex: 1,
    gap: 2,
  },
  detailBalanceCol: {
    alignItems: 'flex-end',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -18,
    marginTop: 2,
    backgroundColor: CARD_FOREGROUND.hairline,
  },
  expandedBody: {
    paddingTop: 14,
    paddingBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 14,
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
    fontFamily: FONT.semibold,
    fontWeight: '600',
    color: CARD_FOREGROUND.faint,
  },
  typeBadge: {
    alignSelf: 'flex-end',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: CARD_FOREGROUND.frost,
  },
  creditRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  creditBox: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_FOREGROUND.hairline,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: CARD_FOREGROUND.frost,
  },
  creditLabel: {
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
    fontFamily: FONT.semibold,
    fontWeight: '600',
    color: CARD_FOREGROUND.faint,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  ctaRowCredit: {
    marginBottom: 12,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_FOREGROUND.hairline,
    backgroundColor: CARD_FOREGROUND.frostStrong,
  },
  editButton: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_FOREGROUND.hairline,
    backgroundColor: CARD_FOREGROUND.frost,
  },
  payButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_FOREGROUND.hairline,
    backgroundColor: CARD_FOREGROUND.frostStrong,
  },
});
