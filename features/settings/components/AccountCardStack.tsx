import { LinearGradient } from 'expo-linear-gradient';
import { CalendarClock, Settings } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

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

const PEEK_HEIGHT = 66;
const CARD_BODY_HEIGHT = 78;
const EXPANDED_DEBIT_HEIGHT = 214;
const EXPANDED_CREDIT_HEIGHT = 338;
const CARD_BORDER_RADIUS = 20;
const MASKED_BALANCE_VALUE = '••••';
const EXCLUDED_CARD_OPACITY = 0.5;

function getExpandedHeight(account: Account) {
  return account.type === 'credit' ? EXPANDED_CREDIT_HEIGHT : EXPANDED_DEBIT_HEIGHT;
}

function isNegativeForDisplay(value: number) {
  return normalizeMoneyAmount(value) < 0;
}

/** Compact statement/due sublabel for a credit card. */
function statementDueLabel(account: Account): string | null {
  if (account.type !== 'credit') return null;
  const statementDay = account.creditStatementDay;
  const dueDay = account.creditDueDay;
  if (statementDay == null || dueDay == null) return null;
  return String(I18n.t('accounts.statement_due', { statementDay, dueDay }));
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
  const billingLabel = statementDueLabel(account);

  const topAnim = useSharedValue(targetTop);
  const heightAnim = useSharedValue(targetHeight);
  const scaleAnim = useSharedValue(1);

  useEffect(() => {
    topAnim.value = withSpring(targetTop, springPresets.gentle);
  }, [targetTop, topAnim]);

  useEffect(() => {
    heightAnim.value = withSpring(targetHeight, springPresets.gentle);
  }, [targetHeight, heightAnim]);

  const animatedStyle = useAnimatedStyle(() => ({
    top: topAnim.value,
    height: heightAnim.value,
    transform: [{ scale: scaleAnim.value }],
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
          shadowOpacity: isExpanded ? 0.28 : 0.16,
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
      <View style={styles.glossLine3} pointerEvents="none" />

      <Pressable
        onPress={handleToggle}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.cardPressable}
      >
        {/* Peek row — always visible top strip of the card */}
        <View style={styles.peekRow}>
          <View style={styles.logoTile}>
            <AccountLogo logoId={account.logoId} type={account.type} size={30} />
          </View>
          <View style={styles.peekNameCol}>
            <Text
              variant="bodyStrong"
              style={{ color: CARD_FOREGROUND.strong, fontSize: 15, letterSpacing: -0.3 }}
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
          <View style={styles.peekBalanceCol}>
            {isCredit && creditSummary
              ? renderFigure(creditSummary.payable + creditSummary.outstanding, {
                  fontSize: 17,
                  color: CARD_FOREGROUND.strong,
                })
              : renderFigure(normalizedBalance, { fontSize: 17, color: peekBalanceColor })}
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

              {isCredit && billingLabel ? (
                <View style={styles.billingRow}>
                  <CalendarClock size={14} color={CARD_FOREGROUND.soft} />
                  <Text variant="caption" style={{ color: CARD_FOREGROUND.soft }} numberOfLines={1}>
                    {billingLabel}
                  </Text>
                </View>
              ) : null}

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
    left: 0,
    right: 0,
    borderRadius: CARD_BORDER_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  cardPressable: {
    flex: 1,
    paddingHorizontal: 18,
  },
  glossLine1: {
    position: 'absolute',
    top: -20,
    right: -80,
    width: 320,
    height: 1.5,
    backgroundColor: CARD_FOREGROUND.sheen,
    transform: [{ rotate: '-24deg' }],
  },
  glossLine2: {
    position: 'absolute',
    top: 0,
    right: -80,
    width: 320,
    height: 1.5,
    backgroundColor: CARD_FOREGROUND.sheenSoft,
    transform: [{ rotate: '-24deg' }],
  },
  glossLine3: {
    position: 'absolute',
    top: 16,
    right: -80,
    width: 320,
    height: 1.5,
    backgroundColor: CARD_FOREGROUND.sheenSoft,
    transform: [{ rotate: '-24deg' }],
  },
  peekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: PEEK_HEIGHT,
    gap: 12,
  },
  logoTile: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD_FOREGROUND.frost,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_FOREGROUND.hairline,
  },
  peekNameCol: {
    flex: 1,
    gap: 2,
  },
  peekBalanceCol: {
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
  billingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
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
