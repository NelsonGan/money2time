import { Settings } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useBottomNavScrollReporter } from '~/components/navigation/BottomNavMinimize';
import { AccountLogo, Text, useSettingsBottomNavInset } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { springPresets } from '~/constants/motion';
import { useResolvedTheme } from '~/context/ThemeContext';
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
  creditSummaryByAccountId: Map<string, CreditSummary>;
  scrollViewRef?: React.RefObject<ScrollView | null>;
  settings: UserSettings;
  trueHourlyRate: number;
  hideBalances: boolean;
  onOpenAccount: (accountId: string) => void;
  onEditAccount: (accountId: string) => void;
  onPayAccount: (accountId: string) => void;
  onRenderBalanceNode: (
    amount: number,
    options?: {
      variant?: React.ComponentProps<typeof Text>['variant'];
      tone?: React.ComponentProps<typeof Text>['tone'];
      textClassName?: string;
      iconColor?: string;
    },
  ) => React.ReactNode;
}

const PEEK_HEIGHT = 54;
const CARD_BODY_HEIGHT = 80;
const EXPANDED_DEBIT_HEIGHT = 195;
const EXPANDED_CREDIT_HEIGHT = 302;
const CARD_BORDER_RADIUS = 18;
const MASKED_BALANCE_VALUE = '••••';

function getExpandedHeight(account: Account) {
  return account.type === 'credit' ? EXPANDED_CREDIT_HEIGHT : EXPANDED_DEBIT_HEIGHT;
}

interface CardPalette {
  bg: string;
  accent: string;
  sheen: string;
  balance: string;
  meta: string;
  metaValue: string;
  divider: string;
  badge: string;
  badgeText: string;
  border: string;
  shadow: string;
  shadowOpacity: number;
}

const CARD_PALETTES_DARK: CardPalette[] = [
  {
    bg: '#142B24',
    accent: '#34C99A',
    sheen: 'rgba(52,201,154,0.06)',
    balance: '#F5F5F5',
    meta: 'rgba(255,255,255,0.35)',
    metaValue: 'rgba(255,255,255,0.7)',
    divider: 'rgba(255,255,255,0.08)',
    badge: 'rgba(255,255,255,0.07)',
    badgeText: '#5DD4A8',
    border: 'rgba(255,255,255,0.12)',
    shadow: '#000',
    shadowOpacity: 0.3,
  },
  {
    bg: '#1A2640',
    accent: '#63ABF0',
    sheen: 'rgba(99,171,240,0.06)',
    balance: '#F5F5F5',
    meta: 'rgba(255,255,255,0.35)',
    metaValue: 'rgba(255,255,255,0.7)',
    divider: 'rgba(255,255,255,0.08)',
    badge: 'rgba(255,255,255,0.07)',
    badgeText: '#8CBEF5',
    border: 'rgba(255,255,255,0.12)',
    shadow: '#000',
    shadowOpacity: 0.3,
  },
  {
    bg: '#271A38',
    accent: '#A98FE0',
    sheen: 'rgba(142,159,232,0.06)',
    balance: '#F5F5F5',
    meta: 'rgba(255,255,255,0.35)',
    metaValue: 'rgba(255,255,255,0.7)',
    divider: 'rgba(255,255,255,0.08)',
    badge: 'rgba(255,255,255,0.07)',
    badgeText: '#B8A5E8',
    border: 'rgba(255,255,255,0.12)',
    shadow: '#000',
    shadowOpacity: 0.3,
  },
  {
    bg: '#2A2218',
    accent: '#D7A86B',
    sheen: 'rgba(215,168,107,0.06)',
    balance: '#F5F5F5',
    meta: 'rgba(255,255,255,0.35)',
    metaValue: 'rgba(255,255,255,0.7)',
    divider: 'rgba(255,255,255,0.08)',
    badge: 'rgba(255,255,255,0.07)',
    badgeText: '#D7A86B',
    border: 'rgba(255,255,255,0.12)',
    shadow: '#000',
    shadowOpacity: 0.3,
  },
];

// Light mode: soft, warm backgrounds that sit naturally on the cream UI
const CARD_PALETTES_LIGHT: CardPalette[] = [
  {
    bg: '#EBF5F0',
    accent: '#1B7D5F',
    sheen: 'rgba(27,125,95,0.04)',
    balance: '#1A2E2A',
    meta: 'rgba(26,46,42,0.38)',
    metaValue: 'rgba(26,46,42,0.65)',
    divider: 'rgba(26,46,42,0.08)',
    badge: 'rgba(27,125,95,0.08)',
    badgeText: '#1B7D5F',
    border: 'rgba(27,125,95,0.15)',
    shadow: 'rgba(27,125,95,0.12)',
    shadowOpacity: 1,
  },
  {
    bg: '#E8F0F8',
    accent: '#2B6CB0',
    sheen: 'rgba(43,108,176,0.04)',
    balance: '#1A2434',
    meta: 'rgba(26,36,52,0.38)',
    metaValue: 'rgba(26,36,52,0.65)',
    divider: 'rgba(26,36,52,0.08)',
    badge: 'rgba(43,108,176,0.08)',
    badgeText: '#2B6CB0',
    border: 'rgba(43,108,176,0.14)',
    shadow: 'rgba(43,108,176,0.10)',
    shadowOpacity: 1,
  },
  {
    bg: '#EFEBF5',
    accent: '#6B58A8',
    sheen: 'rgba(107,88,168,0.04)',
    balance: '#251E34',
    meta: 'rgba(37,30,52,0.38)',
    metaValue: 'rgba(37,30,52,0.65)',
    divider: 'rgba(37,30,52,0.08)',
    badge: 'rgba(107,88,168,0.08)',
    badgeText: '#6B58A8',
    border: 'rgba(107,88,168,0.14)',
    shadow: 'rgba(107,88,168,0.10)',
    shadowOpacity: 1,
  },
  {
    bg: '#F5EFE5',
    accent: '#9A6A2C',
    sheen: 'rgba(154,106,44,0.04)',
    balance: '#2E2418',
    meta: 'rgba(46,36,24,0.38)',
    metaValue: 'rgba(46,36,24,0.65)',
    divider: 'rgba(46,36,24,0.08)',
    badge: 'rgba(154,106,44,0.08)',
    badgeText: '#9A6A2C',
    border: 'rgba(154,106,44,0.14)',
    shadow: 'rgba(154,106,44,0.10)',
    shadowOpacity: 1,
  },
];

const CREDIT_PALETTE_DARK: CardPalette = {
  bg: '#1E1E22',
  accent: '#E06B63',
  sheen: 'rgba(255,255,255,0.025)',
  balance: '#F5F5F5',
  meta: 'rgba(255,255,255,0.3)',
  metaValue: 'rgba(255,255,255,0.7)',
  divider: 'rgba(255,255,255,0.08)',
  badge: 'rgba(255,255,255,0.07)',
  badgeText: '#E06B63',
  border: 'rgba(255,255,255,0.12)',
  shadow: '#000',
  shadowOpacity: 0.3,
};

const CREDIT_PALETTE_LIGHT: CardPalette = {
  bg: '#F5E8E6',
  accent: '#B84A44',
  sheen: 'rgba(184,74,68,0.04)',
  balance: '#2E1A18',
  meta: 'rgba(46,26,24,0.38)',
  metaValue: 'rgba(46,26,24,0.65)',
  divider: 'rgba(46,26,24,0.08)',
  badge: 'rgba(184,74,68,0.08)',
  badgeText: '#B84A44',
  border: 'rgba(184,74,68,0.14)',
  shadow: 'rgba(184,74,68,0.10)',
  shadowOpacity: 1,
};

const EXCLUDED_PALETTE_DARK: CardPalette = {
  bg: '#16181C',
  accent: '#505560',
  sheen: 'rgba(255,255,255,0.01)',
  balance: 'rgba(255,255,255,0.35)',
  meta: 'rgba(255,255,255,0.15)',
  metaValue: 'rgba(255,255,255,0.3)',
  divider: 'rgba(255,255,255,0.05)',
  badge: 'rgba(255,255,255,0.04)',
  badgeText: '#505560',
  border: 'rgba(255,255,255,0.06)',
  shadow: '#000',
  shadowOpacity: 0.1,
};

const EXCLUDED_PALETTE_LIGHT: CardPalette = {
  bg: '#EDECEA',
  accent: '#8A8D92',
  sheen: 'rgba(0,0,0,0.01)',
  balance: 'rgba(0,0,0,0.4)',
  meta: 'rgba(0,0,0,0.22)',
  metaValue: 'rgba(0,0,0,0.4)',
  divider: 'rgba(0,0,0,0.06)',
  badge: 'rgba(0,0,0,0.05)',
  badgeText: '#8A8D92',
  border: 'rgba(0,0,0,0.08)',
  shadow: 'rgba(0,0,0,0.06)',
  shadowOpacity: 1,
};

function getCardPalette(account: Account, index: number, isDark: boolean): CardPalette {
  if (!account.includeInTotals) {
    return isDark ? EXCLUDED_PALETTE_DARK : EXCLUDED_PALETTE_LIGHT;
  }
  if (account.type === 'credit') {
    return isDark ? CREDIT_PALETTE_DARK : CREDIT_PALETTE_LIGHT;
  }
  const palettes = isDark ? CARD_PALETTES_DARK : CARD_PALETTES_LIGHT;
  return palettes[index % palettes.length]!;
}

function isNegativeForDisplay(value: number) {
  return normalizeMoneyAmount(value) < 0;
}

// ── StackCard ──────────────────────────────────────────────

interface StackCardProps {
  account: Account;
  balance: number;
  creditSummary: CreditSummary | null;
  palette: CardPalette;
  isExpanded: boolean;
  targetTop: number;
  cardIndex: number;
  totalCards: number;
  onToggle: () => void;
  onViewTransactions: () => void;
  onEditAccount: () => void;
  onPayAccount: () => void;
  onRenderBalanceNode: AccountCardStackProps['onRenderBalanceNode'];
  hideBalances: boolean;
  settings: UserSettings;
  trueHourlyRate: number;
  accountGroupLabel: string;
}

function StackCard({
  account,
  balance,
  creditSummary,
  palette,
  isExpanded,
  targetTop,
  cardIndex,
  totalCards,
  onToggle,
  onViewTransactions,
  onEditAccount,
  onPayAccount,
  onRenderBalanceNode,
  hideBalances,
  settings,
  trueHourlyRate,
  accountGroupLabel,
}: StackCardProps) {
  const themeColors = useThemeColors();
  const normalizedBalance = normalizeMoneyAmount(balance);
  const isCredit = account.type === 'credit';
  const expandedHeight = getExpandedHeight(account);
  const collapsedHeight = PEEK_HEIGHT + CARD_BODY_HEIGHT;
  const targetHeight = isExpanded ? expandedHeight : collapsedHeight;

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

  const formatBalance = useCallback(
    (amount: number) => {
      if (hideBalances) return MASKED_BALANCE_VALUE;
      return formatAmount(normalizeMoneyAmount(amount), settings, {
        showSign: false,
        trueHourlyRate,
        // Show each account's balance in its own (native) currency.
        currencyCode: account.currency,
      });
    },
    [account.currency, hideBalances, settings, trueHourlyRate],
  );

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          zIndex: isExpanded ? totalCards + 1 : cardIndex,
          shadowColor: palette.shadow,
          shadowOpacity: isExpanded ? palette.shadowOpacity * 1.5 : palette.shadowOpacity,
        },
        animatedStyle,
      ]}
    >
      <View style={[styles.sheen, { backgroundColor: palette.sheen }]} />

      <Pressable
        onPress={handleToggle}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.cardPressable}
      >
        {/* Peek row */}
        <View style={styles.peekRow}>
          <View style={styles.iconBadge}>
            <AccountLogo logoId={account.logoId} type={account.type} size={34} />
          </View>
          <View style={styles.peekNameCol}>
            <Text
              variant="bodyStrong"
              style={{ color: palette.balance, fontSize: 14, letterSpacing: -0.3 }}
              numberOfLines={1}
            >
              {account.name}
            </Text>
          </View>
          <View style={styles.peekBalanceCol}>
            {isCredit && creditSummary ? (
              <Text
                variant="bodyStrong"
                style={{ color: palette.balance, fontSize: 16, letterSpacing: -0.5 }}
              >
                {formatBalance(creditSummary.payable + creditSummary.outstanding)}
              </Text>
            ) : (
              <Text
                variant="bodyStrong"
                style={{
                  color: isNegativeForDisplay(normalizedBalance)
                    ? themeColors.error
                    : palette.balance,
                  fontSize: 16,
                  letterSpacing: -0.5,
                }}
              >
                {formatBalance(normalizedBalance)}
              </Text>
            )}
          </View>
        </View>

        {/* Expanded content */}
        {isExpanded ? (
          <Animated.View entering={FadeIn.duration(220).delay(60)}>
            <View style={[styles.divider, { backgroundColor: palette.divider }]} />

            <View style={styles.expandedBody}>
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Text style={[styles.metaLabel, { color: palette.meta }]}>
                    {I18n.t('accounts.account_group')}
                  </Text>
                  <Text variant="caption" style={{ color: palette.metaValue }} numberOfLines={1}>
                    {accountGroupLabel}
                  </Text>
                </View>
                <View style={[styles.metaItem, { alignItems: 'flex-end' }]}>
                  <Text style={[styles.metaLabel, { color: palette.meta }]}>
                    {I18n.t('accounts.type')}
                  </Text>
                  <View style={[styles.typeBadge, { backgroundColor: palette.badge }]}>
                    <Text
                      variant="label"
                      style={{
                        color: palette.badgeText,
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
                <>
                  <View style={styles.creditRow}>
                    <View style={[styles.creditBox, { borderColor: `${themeColors.error}30` }]}>
                      <Text style={[styles.creditLabel, { color: palette.meta }]}>
                        {I18n.t('accounts.payable')}
                      </Text>
                      {onRenderBalanceNode(creditSummary.payable, {
                        variant: 'caption',
                        textClassName: 'text-destructive',
                        iconColor: themeColors.error,
                      })}
                    </View>
                    <View style={[styles.creditBox, { borderColor: `${themeColors.error}30` }]}>
                      <Text style={[styles.creditLabel, { color: palette.meta }]}>
                        {I18n.t('accounts.outstanding')}
                      </Text>
                      {onRenderBalanceNode(creditSummary.outstanding, {
                        variant: 'caption',
                        textClassName: 'text-destructive',
                        iconColor: themeColors.error,
                      })}
                    </View>
                  </View>
                </>
              ) : null}

              <View style={[styles.ctaRow, isCredit && styles.ctaRowCredit]}>
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    onViewTransactions();
                  }}
                  style={[
                    styles.ctaButton,
                    {
                      flex: 1,
                      backgroundColor: `${palette.accent}18`,
                      borderColor: `${palette.accent}30`,
                    },
                  ]}
                >
                  <Text variant="bodyStrong" style={{ color: palette.accent, fontSize: 13 }}>
                    {I18n.t('accounts.view_transactions')}
                  </Text>
                </Pressable>
                {isCredit ? (
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      onPayAccount();
                    }}
                    style={[
                      styles.payButton,
                      {
                        backgroundColor: `${themeColors.accent}20`,
                        borderColor: `${themeColors.accent}40`,
                      },
                    ]}
                  >
                    <Text variant="bodyStrong" style={{ color: themeColors.accent, fontSize: 13 }}>
                      {I18n.t('accounts.pay')}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    onEditAccount();
                  }}
                  style={[
                    styles.editButton,
                    {
                      backgroundColor: `${palette.accent}12`,
                      borderColor: `${palette.accent}25`,
                    },
                  ]}
                >
                  <Settings size={15} color={palette.accent} />
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
  onRenderBalanceNode: AccountCardStackProps['onRenderBalanceNode'];
  balanceMap: Map<string, number>;
  creditSummaryByAccountId: Map<string, CreditSummary>;
  hideBalances: boolean;
  settings: UserSettings;
  trueHourlyRate: number;
  isDark: boolean;
}

function SectionStack({
  section,
  expandedAccountId,
  onToggleAccount,
  onOpenAccount,
  onEditAccount,
  onPayAccount,
  onRenderBalanceNode,
  balanceMap,
  creditSummaryByAccountId,
  hideBalances,
  settings,
  trueHourlyRate,
  isDark,
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
        const palette = getCardPalette(account, index, isDark);
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
            palette={palette}
            isExpanded={expandedAccountId === account.id}
            targetTop={positions[index]!}
            cardIndex={index}
            totalCards={section.accounts.length}
            onToggle={() => onToggleAccount(account.id)}
            onViewTransactions={() => onOpenAccount(account.id)}
            onEditAccount={() => onEditAccount(account.id)}
            onPayAccount={() => onPayAccount(account.id)}
            onRenderBalanceNode={onRenderBalanceNode}
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
  creditSummaryByAccountId,
  scrollViewRef,
  settings,
  trueHourlyRate,
  hideBalances,
  onOpenAccount,
  onEditAccount,
  onPayAccount,
  onRenderBalanceNode,
}: AccountCardStackProps) {
  const resolvedTheme = useResolvedTheme();
  const isDark = resolvedTheme === 'dark';
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
            const bal = balanceMap.get(a.id) ?? a.startingBalance;
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
              onRenderBalanceNode={onRenderBalanceNode}
              balanceMap={balanceMap}
              creditSummaryByAccountId={creditSummaryByAccountId}
              hideBalances={hideBalances}
              settings={settings}
              trueHourlyRate={trueHourlyRate}
              isDark={isDark}
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
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  cardPressable: {
    flex: 1,
    paddingHorizontal: 18,
  },
  sheen: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  peekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: PEEK_HEIGHT,
    gap: 10,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peekNameCol: {
    flex: 1,
  },
  peekBalanceCol: {
    alignItems: 'flex-end',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -18,
    paddingHorizontal: 18,
    marginTop: 2,
  },
  expandedBody: {
    paddingTop: 14,
    paddingBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
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
  },
  typeBadge: {
    alignSelf: 'flex-end',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  creditRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  creditBox: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(224,107,99,0.06)',
  },
  creditLabel: {
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
    fontFamily: FONT.semibold,
    fontWeight: '600',
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
    borderWidth: 1,
  },
  editButton: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
  },
  payButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
});
