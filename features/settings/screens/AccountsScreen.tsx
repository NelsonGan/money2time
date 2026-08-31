import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  Wallet,
  X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import type { AnimatedRef } from 'react-native-reanimated';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { type Edge, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Sortable from 'react-native-sortables';

import { DatePickerModal } from '~/components/datePicker';
import { EmptyState } from '~/components/feedback/EmptyState';
import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { EdgeSwipeBackContainer } from '~/components/navigation/EdgeSwipeBackContainer';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import {
  AccountLogo,
  AccountPickerSheet,
  AddIconButton,
  Button,
  CategoryEmoji,
  type CategoryPickerOption,
  CategoryPickerSheet,
  ClayIcon,
  CurrencyPickerSheet,
  InfoTooltipButton,
  FormScrollView,
  Input,
  SelectField,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsActionBar,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  ThemeModal,
  TimeValueInline,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { getAccountLogoMeta } from '~/constants/accountLogos';
import { ACCOUNT_TYPE_OPTIONS, DEFAULT_CURRENCY } from '~/constants/appDefaults';
import { spacing } from '~/constants/designSystem';
import { useApp, useTransactions } from '~/context/AppContext';
import { useValueWhileTabVisible } from '~/context/TabVisibilityContext';
import { LoanQuoteDisclosure } from '~/features/loans/components';
import {
  computeLoanProgress,
  computeLoanQuote,
  instalmentForContract,
  isContractTrackingRule,
  isRepaymentRule,
  MAX_LOAN_TERM_MONTHS,
  overdueSince,
  rateForInstalment,
  rateForTotalRepayable,
  totalRepayableFor,
} from '~/features/loans/lib/loanMath';
import {
  AccountCardStack,
  type LoanCardSummary,
} from '~/features/settings/components/AccountCardStack';
import type { AccountLogoPickerSession } from '~/features/settings/lib/accountLogoPickerBridge';
import { ActivityTransactionList } from '~/features/transactions/components';
import {
  MONTH_PAGER_CENTER_INDEX,
  MONTH_PAGER_TOTAL_SLOTS,
} from '~/features/transactions/constants/monthPager';
import { MONTH_PAGER_LIST_CONFIG } from '~/features/transactions/constants/monthPagerList';
import { AddTransactionScreen, EditTransactionScreen } from '~/features/transactions/screens';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useIndexedScrollToTopRefs } from '~/hooks/useIndexedScrollToTopRefs';
import { useMonthPager } from '~/hooks/useMonthPager';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import {
  type Account,
  type AccountGroup,
  type AccountType,
  type RateTable,
  type TransactionWithRelations,
} from '~/types';
import { cn } from '~/utils';
import { isLiabilityAccountType } from '~/utils/accountBalances';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import { withColorAlpha } from '~/utils/color';
import { convert, currencyNameForCode, currencySymbolForCode } from '~/utils/currency';
import {
  addFinancialMonths,
  financialMonthAnchorForToday,
  financialMonthKeyForDate,
} from '~/utils/financialMonth';
import {
  dayKeyFromDateLocal,
  formatAmount,
  formatDateInput,
  formatMonthYearLabel,
  formatShortDate,
  normalizeMoneyAmount,
  toBalanceInputValue,
} from '~/utils/formatters';
import {
  bucketTransactionsByAccountPeriod,
  computeCreditCycleSummary,
  type CreditSummary,
  creditDeltaForAccountTransaction,
  DAY_IN_MS,
  formatStatementRangeSublabel,
  getCurrentStatementCycleStart,
  nextOccurrenceOfMonthDay,
  statementPeriodFromAnchor,
} from '~/utils/statementPeriods';

interface AccountGroupSection {
  id: string;
  label: string;
  accounts: Account[];
}

/**
 * Which of the loan form's three interchangeable figures the user is driving.
 * Given the amount and the term, the interest rate, the total repayable and
 * the monthly instalment each determine the other two.
 */

interface AccountEditorInput {
  name: string;
  type: AccountType;
  accountGroup: string | null;
  logoId: string | null;
  creditStatementDay: number | null;
  creditDueDay: number | null;
  includeInTotals: boolean;
  startingBalance: number;
  currency: string;
  loanOriginalPrincipal: number | null;
  loanMonthlyPayment: number | null;
  loanPaymentDay: number | null;
  loanInterestRate: number | null;
  loanTotalRepayable: number | null;
  loanTermMonths: number | null;
  loanStartDate: string | null;
  loanCountAsExpense: boolean | null;
  loanPaymentCategoryId: string | null;
  /**
   * The account repayments are collected from. Null means the borrower will
   * record each repayment by hand, and on an existing loan means whatever rule
   * pays into it should go away. Undefined means leave that rule alone: the
   * inline picker could not represent it (a cross-currency rule built in the
   * full recurring editor), so it is not this form's to reconcile.
   * Form state, not an account column.
   */
  collectFromAccountId: string | null | undefined;
  /** When the recurring rule should first fire. Form state, not a column. */
  firstInstalmentDate: string | null;
  /** The contract's final instalment, which ends the recurring rule. */
  finalInstalmentDate: string | null;
}

const ACCOUNT_EDITOR_SCROLL_CONTENT_STYLE = {
  paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
} as const;
const ACCOUNT_MANAGEMENT_LIST_CONTENT_STYLE = {
  paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  paddingBottom: SETTINGS_LIST_BOTTOM_PADDING,
} as const;
const ACCOUNT_BULK_SCROLL_CONTENT_STYLE = {
  padding: SETTINGS_HORIZONTAL_PADDING,
  paddingBottom: SETTINGS_LIST_BOTTOM_PADDING + spacing.xs,
  gap: spacing.sm,
} as const;
const FLOATING_ACTION_SIZE = 56;
const FLOATING_ACTION_GAP = 12;
const MASKED_BALANCE_VALUE = '••••';
const EMPTY_PERIOD_TRANSACTIONS: TransactionWithRelations[] = [];
const DEFAULT_CREDIT_STATEMENT_DAY = 25;
/** The seeded expense category a loan repayment is filed under by default. */
const DEFAULT_LOAN_CATEGORY_NAME = 'bills';

type AccountsSummaryRenderValue = (
  amount: number,
  options?: {
    variant?: React.ComponentProps<typeof Text>['variant'];
    tone?: React.ComponentProps<typeof Text>['tone'];
    textClassName?: string;
    iconColor?: string;
  },
) => React.ReactNode;

type AccountsSummaryThemeColors = {
  success: string;
  error: string;
  primary: string;
  text: string;
};

function AccountsSummaryBlock({
  assets,
  debt,
  net,
  themeColors,
  renderValue,
  onPressNetAssets,
}: {
  assets: number;
  debt: number;
  net: number;
  themeColors: AccountsSummaryThemeColors;
  renderValue: AccountsSummaryRenderValue;
  onPressNetAssets?: () => void;
}) {
  const netIsNegative = net < 0;
  // Positive/zero net uses the neutral foreground tone instead of the user's
  // theme accent — the net-assets readout is a factual number, not a brand
  // moment, and the foreground reads consistently across all theme colors.
  // Negative net keeps destructive red as a clear bad signal.
  const netAccent = netIsNegative ? themeColors.error : themeColors.text;
  const netLabelClass = netIsNegative ? 'text-destructive' : 'text-foreground';
  const netValueClass = netIsNegative ? 'text-destructive' : 'text-foreground';

  return (
    <View className="w-full overflow-hidden rounded-2xl border border-border/45 bg-card">
      {/* Hero: Net Assets */}
      <Pressable
        onPress={
          onPressNetAssets
            ? () => {
                void triggerHaptic('selection');
                onPressNetAssets();
              }
            : undefined
        }
        disabled={!onPressNetAssets}
        className="px-4 pt-3.5 pb-3 active:opacity-85"
        accessibilityRole={onPressNetAssets ? 'button' : undefined}
        accessibilityLabel={I18n.t('accounts.net_assets')}
      >
        <View className="flex-row items-center gap-1.5">
          <Wallet size={12} color={netAccent} strokeWidth={2.4} />
          <Text variant="label" className={cn('text-[10px]', netLabelClass)}>
            {I18n.t('accounts.net_assets')}
          </Text>
          {onPressNetAssets ? <ChevronRight size={12} color={netAccent} strokeWidth={2.4} /> : null}
        </View>
        <View className="mt-1.5">
          {renderValue(net, {
            variant: 'monoLg',
            textClassName: netValueClass,
            iconColor: netAccent,
          })}
        </View>
      </Pressable>

      {/* Divider */}
      <View className="h-px bg-border/40" />

      {/* Footer: Assets / Debt side-by-side */}
      <View className="flex-row">
        <View className="flex-1 px-4 py-2.5">
          <View className="flex-row items-center gap-1.5">
            <ArrowUpRight size={12} color={themeColors.success} strokeWidth={2.4} />
            <Text variant="label" className="text-[10px] text-success">
              {I18n.t('accounts.assets')}
            </Text>
          </View>
          <View className="mt-1">
            {renderValue(assets, {
              variant: 'mono',
              textClassName: 'text-success',
              iconColor: themeColors.success,
            })}
          </View>
        </View>
        <View className="w-px bg-border/40" />
        <View className="flex-1 px-4 py-2.5">
          <View className="flex-row items-center gap-1.5">
            <ArrowDownRight size={12} color={themeColors.error} strokeWidth={2.4} />
            <Text variant="label" className="text-[10px] text-destructive">
              {I18n.t('accounts.debt')}
            </Text>
          </View>
          <View className="mt-1">
            {renderValue(debt, {
              variant: 'mono',
              textClassName: 'text-destructive',
              iconColor: themeColors.error,
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowTypePill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowTypeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  groupCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 2,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingLeft: spacing.xs,
    paddingRight: spacing.sm,
    gap: spacing.xs,
  },
  groupChevron: {
    width: 28,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  groupNamePressable: {
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
    paddingLeft: 2,
  },
  groupName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  groupCircleButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  groupHandle: {
    width: 30,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  groupEditStack: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  groupEditActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  accountsPanel: {
    marginTop: 2,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  accountChildRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: spacing.xs,
    paddingLeft: 2,
    paddingRight: spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.xs,
  },
  accountChildHandle: {
    width: 26,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  accountChildBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 40,
  },
  accountChildTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  accountChildName: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  accountChildSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  accountsEmptyText: {
    fontSize: 12,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  staticCardsStack: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  headerContainer: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  headerSpacer: {
    height: spacing.xs,
  },
  flexContainer: {
    flex: 1,
  },
  floatingAddButtonContainer: {
    position: 'absolute',
    right: SETTINGS_HORIZONTAL_PADDING,
    zIndex: 25,
  },
  floatingButtonStack: {
    alignItems: 'center',
    gap: FLOATING_ACTION_GAP,
  },
  floatingAddButton: {
    width: FLOATING_ACTION_SIZE,
    height: FLOATING_ACTION_SIZE,
    borderRadius: FLOATING_ACTION_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    elevation: 6,
  },
});

function AccountEditorSheet({
  account,
  presetGroupName = null,
  currentBalance,
  defaultCurrencyCode: propDefaultCurrencyCode,
  accountGroups,
  onClose,
  onSave,
  onDelete,
  onArchiveLoan,
  onOpenMultiCurrency,
  onOpenLogoPicker,
}: {
  account: Account | null;
  presetGroupName?: string | null;
  currentBalance: number;
  defaultCurrencyCode: string;
  accountGroups: AccountGroup[];
  onClose: () => void;
  onSave: (input: AccountEditorInput) => void;
  onDelete?: () => void;
  onArchiveLoan?: (archived: boolean) => void;
  onOpenMultiCurrency?: () => void;
  onOpenLogoPicker: (session: AccountLogoPickerSession) => void;
}) {
  const themeColors = useThemeColors();
  const isEdit = account !== null;
  const defaultCurrencyCode = propDefaultCurrencyCode || DEFAULT_CURRENCY;

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('debit');
  const [accountGroupId, setAccountGroupId] = useState<string>('none');
  const [logoId, setLogoId] = useState<string | null>(null);
  const [includeInTotals, setIncludeInTotals] = useState(true);
  const [balanceInput, setBalanceInput] = useState('0');
  const [creditStatementDay, setCreditStatementDay] = useState('25');
  const [creditDueDay, setCreditDueDay] = useState('1');
  // The loan contract. Given the amount and the term, the rate, the total
  // repayable and the monthly instalment are three views of one number, so any
  // of them can be typed and the other two follow.
  const [loanPrincipal, setLoanPrincipal] = useState('');
  const [loanTotalRepayable, setLoanTotalRepayable] = useState('');
  const [loanInstalment, setLoanInstalment] = useState('');
  /**
   * Whether the monthly payment follows the total, or the borrower sets it.
   *
   * Lenders round the instalment up and let a smaller final payment absorb the
   * difference, so a contract repaying 64,831.90 over 108 months charges 601
   * where the total implies 600.29. Both numbers are on the agreement, so both
   * have to be enterable; the toggle says which one the app is allowed to move.
   */
  const [loanInstalmentAuto, setLoanInstalmentAuto] = useState(true);
  const [loanTermMonths, setLoanTermMonths] = useState('');
  const [loanPaidPeriods, setLoanPaidPeriods] = useState('');
  const [loanStartDate, setLoanStartDate] = useState(() => dayKeyFromDateLocal(new Date()));
  const [showLoanStartPicker, setShowLoanStartPicker] = useState(false);
  // The borrower's pick, or undefined while they have not touched the row, in
  // which case it reads whatever rule currently pays into this loan. Held as an
  // override rather than seeded into state so it cannot go stale against a rule
  // edited elsewhere, and so no effect has to depend on `recurringRules` (which
  // would re-seed the whole form on every rule write).
  const [autoRepaySourceOverride, setAutoRepaySourceOverride] = useState<string | null | undefined>(
    undefined,
  );
  const [showAutoRepaySourcePicker, setShowAutoRepaySourcePicker] = useState(false);
  // Whether repayments into this loan are counted as spending, and the
  // category they are filed under when they are. Default on: the instalment is
  // money out of the borrower's month, and a debt tracker that leaves it out of
  // the spending totals reads as under-counting.
  const [loanCountAsExpense, setLoanCountAsExpense] = useState(true);
  const [loanPaymentCategoryId, setLoanPaymentCategoryId] = useState<string | null>(null);
  const [showLoanCategoryPicker, setShowLoanCategoryPicker] = useState(false);
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  // When the user taps "Add currency" from the picker we must tear down this
  // editor modal and navigate to the multi-currency screen. Doing that in the
  // same frame as the picker's own dismissal collides two native modal
  // dismissals (plus a screen push) and freezes the UI on some iOS devices, so
  // we defer the teardown until the picker has fully dismissed.
  const [pendingMultiCurrency, setPendingMultiCurrency] = useState(false);

  const openMultiCurrency = useCallback(() => {
    onClose();
    onOpenMultiCurrency?.();
  }, [onClose, onOpenMultiCurrency]);

  const {
    settings: appSettings,
    accounts: appAccounts,
    categories: appCategories,
    currentMonthWage: appCurrentMonthWage,
    fxCurrencies,
    rateTable,
    recurringRules,
  } = useApp();
  // Account currency choices = the main currency + the user's subcurrencies
  // (added ones plus any already used by an account).
  const accountCurrencyCodes = useMemo(() => {
    const set = new Set<string>([appSettings.currencyCode, ...fxCurrencies, currency]);
    for (const a of appAccounts) {
      if (a.currency) set.add(a.currency);
    }
    return Array.from(set);
  }, [appSettings.currencyCode, appAccounts, fxCurrencies, currency]);

  // Switching the currency previews the converted balance so the user sees the
  // result before saving (the same rate is applied for real on save).
  const handleCurrencyChange = useCallback(
    (nextCurrency: string) => {
      if (nextCurrency === currency) return;
      const parsed = Number(balanceInput);
      if (Number.isFinite(parsed) && parsed !== 0) {
        const { value } = convert(parsed, currency, nextCurrency, rateTable);
        setBalanceInput(toBalanceInputValue(value));
      }
      // The loan's money fields are denominated in the account currency too,
      // so convert them in place rather than leaving stale figures behind.
      const convertMoneyField = (raw: string, set: (next: string) => void) => {
        const value = Number(raw);
        if (!Number.isFinite(value) || value === 0) return;
        set(toBalanceInputValue(convert(value, currency, nextCurrency, rateTable).value));
      };
      convertMoneyField(loanPrincipal, setLoanPrincipal);
      convertMoneyField(loanTotalRepayable, setLoanTotalRepayable);
      convertMoneyField(loanInstalment, setLoanInstalment);
      // The collect account is restricted to the loan's currency, so a
      // currency switch invalidates whatever was picked. Back to "untouched"
      // rather than an explicit clear: an explicit clear would survive a switch
      // back to the original currency and then read as "delete this loan's
      // rule" on save. Untouched instead re-reads the live rule, which shows
      // again if the currency comes back and is otherwise left alone as a rule
      // this picker cannot represent.
      setAutoRepaySourceOverride(undefined);
      setCurrency(nextCurrency);
    },
    [balanceInput, currency, loanInstalment, loanPrincipal, loanTotalRepayable, rateTable],
  );

  const accountGroupNameById = useMemo(
    () => new Map(accountGroups.map((group) => [group.id, group.name])),
    [accountGroups],
  );
  const accountGroupIdByName = useMemo(
    () => new Map(accountGroups.map((group) => [group.name, group.id])),
    [accountGroups],
  );
  const accountGroupOptions = useMemo(
    () => [
      { value: 'none', label: I18n.t('common.ungrouped') },
      ...accountGroups.map((group) => ({ value: group.id, label: group.name })),
    ],
    [accountGroups],
  );

  useEffect(() => {
    if (account) {
      setName(account.name);
      setType(account.type);
      setLogoId(account.logoId ?? null);
      const matchedGroupId = account.accountGroup
        ? (accountGroupIdByName.get(account.accountGroup) ?? 'none')
        : 'none';
      setAccountGroupId(matchedGroupId);
      setIncludeInTotals(account.includeInTotals);
      setBalanceInput(toBalanceInputValue(currentBalance));
      setCreditStatementDay(String(account.creditStatementDay ?? '25'));
      setCreditDueDay(String(account.creditDueDay ?? '1'));
      setAutoRepaySourceOverride(undefined);
      setLoanPrincipal(
        account.loanOriginalPrincipal != null
          ? toBalanceInputValue(account.loanOriginalPrincipal)
          : '',
      );
      setLoanTermMonths(account.loanTermMonths != null ? String(account.loanTermMonths) : '');
      // Seeded from the stored instalment, not re-derived from the stored
      // rate: the rate column holds two decimals, so re-deriving would move
      // the payment a few cents on every edit, including one that changes
      // nothing about the contract.
      const storedInstalment = account.loanMonthlyPayment;
      const storedTerm = account.loanTermMonths;
      setLoanInstalment(storedInstalment != null ? toBalanceInputValue(storedInstalment) : '');
      // A loan saved before the total had a column of its own falls back to
      // the instalment x term it was stored as, so it opens reading exactly as
      // it did, and only moves if its owner types the total from their paper.
      const storedTotal =
        account.loanTotalRepayable ??
        (storedInstalment != null && storedTerm != null
          ? normalizeMoneyAmount(storedInstalment * storedTerm)
          : totalRepayableFor(
              account.loanOriginalPrincipal ?? 0,
              account.loanInterestRate ?? null,
              account.loanTermMonths ?? 0,
            ));
      setLoanTotalRepayable(storedTotal == null ? '' : toBalanceInputValue(storedTotal));
      // Inferred rather than stored: a payment that still equals the level one
      // is a payment nothing has been said about, so the toggle can go on
      // following the total. Anything else was typed and must be left alone.
      setLoanInstalmentAuto(
        storedInstalment == null ||
          storedTotal == null ||
          storedTerm == null ||
          storedTerm <= 0 ||
          Math.abs(storedInstalment - normalizeMoneyAmount(storedTotal / storedTerm)) <= 0.005,
      );
      // Periods already paid is a create-time shortcut for the opening
      // balance; on an existing loan the balance is the source of truth.
      setLoanPaidPeriods('');
      setLoanStartDate(account.loanStartDate ?? dayKeyFromDateLocal(new Date()));
      // Null means the loan predates the setting. That reads as OFF, not as the
      // new-loan default: the rule this loan's repayments already run through
      // was written before the column existed and is not counted, so showing
      // "on" here would promise something only a save could deliver. Turning it
      // on and saving brings the rule along (`resyncRepaymentReporting`).
      setLoanCountAsExpense(account.loanCountAsExpense ?? false);
      setLoanPaymentCategoryId(account.loanPaymentCategoryId ?? null);
      setCurrency(account.currency || DEFAULT_CURRENCY);
    } else {
      setName('');
      setType('debit');
      setLogoId(null);
      setAccountGroupId(
        presetGroupName ? (accountGroupIdByName.get(presetGroupName) ?? 'none') : 'none',
      );
      setIncludeInTotals(true);
      setBalanceInput('0');
      setCreditStatementDay('25');
      setCreditDueDay('1');
      setAutoRepaySourceOverride(undefined);
      setLoanPrincipal('');
      setLoanTotalRepayable('');
      setLoanInstalment('');
      setLoanInstalmentAuto(true);
      setLoanTermMonths('');
      setLoanPaidPeriods('');
      setLoanStartDate(dayKeyFromDateLocal(new Date()));
      setLoanCountAsExpense(true);
      setLoanPaymentCategoryId(null);
      setCurrency(defaultCurrencyCode);
    }
  }, [account, accountGroupIdByName, currentBalance, defaultCurrencyCode, presetGroupName]);

  // Inline auto-repayment keeps v1 simple: only accounts already in the loan's
  // currency can feed it, matching the goal editor's auto-save picker.
  // Cross-currency rules stay possible through the full recurring editor.
  const autoRepaySourceAccounts = useMemo(
    // Debit only: paying a loan from a credit card or another loan is never
    // what the user means, and a goal is not a spending account.
    () => appAccounts.filter((a) => a.type === 'debit' && a.currency === currency),
    [appAccounts, currency],
  );
  // The rule that currently pays into this loan, if any. Derived rather than
  // stored on the account: a rule can be deleted, deactivated, re-priced or
  // re-pointed from Settings -> Recurring, and a mirrored column would go stale
  // on every one of those. `isRepaymentRule` is the same predicate the two
  // existing resyncs already treat as the link between a loan and its rule.
  const existingRepaymentRule = useMemo(
    () =>
      account?.type === 'loan'
        ? (recurringRules.find((rule) => isRepaymentRule(rule, account.id)) ?? null)
        : null,
    [account, recurringRules],
  );
  const autoRepaySourceId =
    autoRepaySourceOverride === undefined
      ? (existingRepaymentRule?.fromAccountId ?? null)
      : autoRepaySourceOverride;
  const autoRepaySource = autoRepaySourceAccounts.find((a) => a.id === autoRepaySourceId) ?? null;
  // A rule built in the full recurring editor can pay from an account this
  // inline picker cannot offer (a foreign-currency one). Reporting it as
  // "Manual" would be a lie, and saving would then add a *second* rule paying
  // the same loan, so the row goes read-only and says where to edit it.
  const repaymentRuleIsExternal =
    existingRepaymentRule != null && autoRepaySourceOverride === undefined && !autoRepaySource;
  // Named by its funding account where that account still exists, and by the
  // rule itself where it does not, so the row never falls back to a label that
  // would read as "there is no rule".
  const externalRepaymentLabel = !repaymentRuleIsExternal
    ? null
    : (appAccounts.find((a) => a.id === existingRepaymentRule?.fromAccountId)?.name ??
      existingRepaymentRule?.name ??
      null);

  // Every expense category, roots and their subcategories: a repayment is one
  // line in the breakdown, and which line it is belongs to the borrower. A
  // subcategory whose parent is gone has nowhere to be drawn, so it is dropped
  // rather than promoted to a root the borrower never created.
  const loanCategoryPicker = useMemo(() => {
    const parents: CategoryPickerOption[] = [];
    const childByParent = new Map<string, CategoryPickerOption[]>();
    // Icon and label as the selected row should draw them: a subcategory
    // inherits its parent's icon when it has none of its own, and is named with
    // the parent so two same-named children read apart.
    const previewById = new Map<string, { icon: string; label: string }>();
    const parentIconById = new Map<string, string>();
    appCategories.forEach((category) => {
      if (category.type !== 'expense' || category.parentId !== null) return;
      const icon = resolveCategoryIcon(category.icon);
      parents.push({ id: category.id, name: category.name, icon });
      parentIconById.set(category.id, category.icon);
      previewById.set(category.id, { icon, label: category.name });
    });
    appCategories.forEach((category) => {
      if (category.type !== 'expense' || category.parentId === null) return;
      const parentIcon = parentIconById.get(category.parentId);
      if (parentIcon === undefined) return;
      const icon = resolveCategoryIcon(category.icon, parentIcon);
      const child: CategoryPickerOption = { id: category.id, name: category.name, icon };
      const list = childByParent.get(category.parentId);
      if (list) list.push(child);
      else childByParent.set(category.parentId, [child]);
      const parentName = parents.find((parent) => parent.id === category.parentId)?.name ?? '';
      previewById.set(category.id, {
        icon,
        label: parentName ? `${parentName} / ${category.name}` : category.name,
      });
    });
    return { parents, childByParent, previewById };
  }, [appCategories]);
  // A loan being created has no category yet, and asking for one before the
  // borrower has typed the amount would be a worse form. Bills is the seeded
  // category a repayment belongs to; a renamed or deleted one falls back to the
  // first root expense category, and an account with none at all stays null (the
  // repayment still counts in the totals, it just has no slice in the pie). The
  // default is always a root: a subcategory is a choice, never a guess.
  const defaultLoanCategoryId = useMemo(() => {
    const byName = loanCategoryPicker.parents.find(
      (c) => c.name.trim().toLowerCase() === DEFAULT_LOAN_CATEGORY_NAME,
    );
    return byName?.id ?? loanCategoryPicker.parents[0]?.id ?? null;
  }, [loanCategoryPicker]);
  // What the form shows and what Save stores are the same value, so the row is
  // never a placeholder over a default the borrower cannot see — and never a
  // dangling id either: a stored category that has since been deleted falls back
  // to the default rather than being re-saved.
  const effectiveLoanCategoryId =
    (loanPaymentCategoryId && loanCategoryPicker.previewById.has(loanPaymentCategoryId)
      ? loanPaymentCategoryId
      : defaultLoanCategoryId) ?? null;
  const selectedLoanCategory = effectiveLoanCategoryId
    ? (loanCategoryPicker.previewById.get(effectiveLoanCategoryId) ?? null)
    : null;

  const parsedLoanPrincipal = Number(loanPrincipal);
  const parsedLoanTerm = Number(loanTermMonths);
  const parsedLoanTotalRepayable = Number(loanTotalRepayable);

  /**
   * The level payment the total works out to, which is what the instalment
   * field shows while it is following the total.
   */
  const derivedLoanInstalment = useMemo(() => {
    if (loanTotalRepayable.trim().length === 0) return null;
    if (!Number.isFinite(parsedLoanTotalRepayable) || parsedLoanTotalRepayable <= 0) return null;
    if (!Number.isInteger(parsedLoanTerm) || parsedLoanTerm <= 0) return null;
    return normalizeMoneyAmount(parsedLoanTotalRepayable / parsedLoanTerm);
  }, [loanTotalRepayable, parsedLoanTerm, parsedLoanTotalRepayable]);

  // What the contract actually charges. Following the total is the default
  // because most agreements only make sense that way round; a borrower whose
  // lender rounds the payment turns it off and types theirs.
  const effectiveLoanInstalment = loanInstalmentAuto
    ? derivedLoanInstalment
    : loanInstalment.trim().length > 0 && Number.isFinite(Number(loanInstalment))
      ? Number(loanInstalment)
      : null;

  /**
   * The rate the contract works out to. Shown, never typed: it is the one
   * figure lenders quote in a form this app cannot use (a rate on the full
   * amount borrowed rather than on the falling balance), and accepting it as
   * an input is what silently produced the wrong monthly payment.
   */
  const derivedLoanRate = useMemo(
    () => rateForTotalRepayable(parsedLoanPrincipal, parsedLoanTotalRepayable, parsedLoanTerm),
    [parsedLoanPrincipal, parsedLoanTerm, parsedLoanTotalRepayable],
  );
  const parsedLoanPaidPeriods = loanPaidPeriods.trim().length > 0 ? Number(loanPaidPeriods) : 0;
  const parsedBalance = Number(balanceInput);

  /**
   * Where an existing loan actually stands, read off its balance.
   *
   * The create form asks how many instalments are behind you; the edit form
   * does not, because there the balance is the source of truth. Without this
   * the contract summary on an edited loan described a contract nobody had
   * started paying: whole term left, whole total outstanding, first instalment
   * back at the beginning. Deriving the count from the balance makes every row
   * of that summary describe the loan in front of the borrower.
   */
  const loanBalanceProgress = useMemo(() => {
    if (!isEdit || account?.type !== 'loan') return null;
    if (!Number.isFinite(parsedBalance) || parsedBalance <= 0) return null;
    const instalment = effectiveLoanInstalment ?? account.loanMonthlyPayment ?? 0;
    if (instalment <= 0) return null;
    return computeLoanProgress({
      balance: parsedBalance,
      originalPrincipal: parsedLoanPrincipal,
      monthlyPayment: instalment,
      paymentDay: null,
      annualRatePercent: derivedLoanRate,
      termMonths: Number.isInteger(parsedLoanTerm) ? parsedLoanTerm : null,
      totalRepayable:
        loanTotalRepayable.trim().length > 0
          ? parsedLoanTotalRepayable
          : (account.loanTotalRepayable ?? null),
      todayIso: dayKeyFromDateLocal(new Date()),
    });
  }, [
    account,
    balanceInput,
    derivedLoanRate,
    effectiveLoanInstalment,
    isEdit,
    loanTotalRepayable,
    parsedBalance,
    parsedLoanPrincipal,
    parsedLoanTerm,
    parsedLoanTotalRepayable,
  ]);
  // The rate, payoff date and opening balance all fall out of the contract, so
  // the form derives them instead of asking for them.
  const loanQuote = useMemo(
    () =>
      computeLoanQuote({
        principal: parsedLoanPrincipal,
        annualRatePercent: null,
        termMonths: parsedLoanTerm,
        paidPeriods: isEdit
          ? Math.min(
              Math.max(0, loanBalanceProgress?.instalmentsPaid ?? 0),
              Math.max(0, parsedLoanTerm - 1),
            )
          : parsedLoanPaidPeriods,
        startDate: loanStartDate,
        totalRepayable: loanTotalRepayable.trim().length > 0 ? parsedLoanTotalRepayable : null,
        instalment: effectiveLoanInstalment,
      }),
    [
      effectiveLoanInstalment,
      isEdit,
      loanBalanceProgress,
      loanStartDate,
      loanTotalRepayable,
      parsedLoanPaidPeriods,
      parsedLoanPrincipal,
      parsedLoanTerm,
      parsedLoanTotalRepayable,
    ],
  );

  const logoMeta = getAccountLogoMeta(logoId);
  const normalizedName = name.trim();

  /**
   * What the borrower's own statement says is left, spelled out under the
   * balance field.
   *
   * This field is where a borrower reaches for their statement, and on a loan
   * whose interest is charged up front that statement's figure carries the
   * interest for the rest of the term. Typed in here it lands as principal and
   * the whole projection goes wrong, quietly. Showing the app's own version of
   * that number is the cheapest way to say "we already have this" without
   * guessing at whether what they typed was a mistake.
   */
  const loanBalanceHint = useMemo(() => {
    if (loanBalanceProgress == null) return undefined;
    return String(
      I18n.t('accounts.loan.balance_owed_hint', {
        amount: formatAmount(loanBalanceProgress.leftToPay, appSettings, {
          showSign: false,
          trueHourlyRate: appCurrentMonthWage?.trueHourlyRate ?? 0,
          currencyCode: currency,
        }),
      }),
    );
  }, [appCurrentMonthWage?.trueHourlyRate, appSettings, currency, loanBalanceProgress]);
  const hasValidBalance = balanceInput.trim().length > 0 && Number.isFinite(parsedBalance);
  // The type is fixed once an account exists, so a loan's extra fields are
  // required on both the create and the edit form.
  const editedType = isEdit ? account.type : type;
  const hasValidPrincipal = Number.isFinite(parsedLoanPrincipal) && parsedLoanPrincipal > 0;
  // A contract that yields a quote is a valid contract, so the block that
  // shows the borrower their instalment doubles as the validator. On an
  // existing loan the term is optional: one imported or restored without a
  // term must still be editable rather than stuck with Save disabled.
  const hasValidLoanFields =
    editedType !== 'loan' ||
    (isEdit
      ? hasValidPrincipal && (loanTermMonths.trim().length === 0 || loanQuote != null)
      : loanQuote != null);
  // A new loan's opening balance comes from the contract, so there is no
  // balance field to validate.
  const isNewLoan = editedType === 'loan' && !isEdit;

  // Bounded fields explain themselves only when they are wrong, so the form
  // stays clean but a rejected value never fails silently.
  const loanTermError =
    editedType === 'loan' &&
    loanTermMonths.trim().length > 0 &&
    !(
      Number.isInteger(parsedLoanTerm) &&
      parsedLoanTerm >= 1 &&
      parsedLoanTerm <= MAX_LOAN_TERM_MONTHS
    )
      ? String(I18n.t('accounts.loan.term_error', { max: MAX_LOAN_TERM_MONTHS }))
      : undefined;
  const loanPaidPeriodsError =
    editedType === 'loan' &&
    loanPaidPeriods.trim().length > 0 &&
    !(
      Number.isInteger(parsedLoanPaidPeriods) &&
      parsedLoanPaidPeriods >= 0 &&
      (!Number.isInteger(parsedLoanTerm) || parsedLoanPaidPeriods < parsedLoanTerm)
    )
      ? String(I18n.t('accounts.loan.paid_periods_error'))
      : undefined;
  // With the principal, term and periods-paid all checked above, a contract
  // that still yields no quote is one the instalment cannot support, which is
  // worth saying rather than leaving Save greyed out with no explanation. It
  // fails at both ends: too small to ever clear the principal, or so large it
  // implies a rate no loan carries (typing the total repayable here does it).
  const loanTotalRepayableError =
    editedType === 'loan' &&
    loanTotalRepayable.trim().length > 0 &&
    hasValidPrincipal &&
    !loanTermError &&
    loanTermMonths.trim().length > 0 &&
    loanQuote == null &&
    !loanPaidPeriodsError
      ? String(
          I18n.t(
            parsedLoanTotalRepayable < parsedLoanPrincipal
              ? 'accounts.loan.instalment_error_low'
              : 'accounts.loan.instalment_error_high',
          ),
        )
      : undefined;
  const canSave = normalizedName.length > 0 && (isNewLoan || hasValidBalance) && hasValidLoanFields;

  const handleSave = () => {
    if (!canSave) return;
    if (!isNewLoan && !Number.isFinite(parsedBalance)) return;
    const parsedStatementDay = Number(creditStatementDay);
    const parsedDueDay = Number(creditDueDay);
    const resolvedType = isEdit ? account.type : type;
    const isLoan = resolvedType === 'loan';
    const normalizedStatementDay =
      Number.isInteger(parsedStatementDay) && parsedStatementDay >= 1 && parsedStatementDay <= 31
        ? parsedStatementDay
        : null;
    const normalizedDueDay =
      Number.isInteger(parsedDueDay) && parsedDueDay >= 1 && parsedDueDay <= 31
        ? parsedDueDay
        : null;

    onSave({
      name: normalizedName,
      type: resolvedType,
      logoId,
      accountGroup:
        accountGroupId === 'none' ? null : (accountGroupNameById.get(accountGroupId) ?? null),
      creditStatementDay: resolvedType === 'credit' ? normalizedStatementDay : null,
      creditDueDay: resolvedType === 'credit' ? normalizedDueDay : null,
      includeInTotals,
      // A new loan opens at what the contract says is still owed after the
      // instalments already paid; an existing one keeps its edited balance.
      startingBalance: isNewLoan && loanQuote ? loanQuote.openingBalance : parsedBalance,
      currency,
      loanOriginalPrincipal: isLoan && hasValidPrincipal ? parsedLoanPrincipal : null,
      // Derived from the contract when there is one; otherwise the loan keeps
      // whatever it already had, so editing an untermed loan is not lossy.
      loanMonthlyPayment: isLoan
        ? (loanQuote?.instalment ?? account?.loanMonthlyPayment ?? null)
        : null,
      loanPaymentDay: isLoan ? (loanQuote?.paymentDay ?? account?.loanPaymentDay ?? null) : null,
      loanTermMonths: isLoan
        ? loanQuote
          ? parsedLoanTerm
          : (account?.loanTermMonths ?? null)
        : null,
      loanStartDate: isLoan ? loanStartDate : null,
      // Stored in its own right, not left to be re-derived as instalment x
      // term: the two deliberately disagree whenever the lender rounds the
      // payment, and re-deriving would lose the agreement's own figure.
      loanTotalRepayable: isLoan && loanQuote ? loanQuote.totalRepayable : null,
      loanInterestRate: isLoan && derivedLoanRate != null ? derivedLoanRate : null,
      loanCountAsExpense: isLoan ? loanCountAsExpense : null,
      // Resolved rather than raw: the borrower never had to open the picker, so
      // the default the form was showing is the one that gets stored.
      loanPaymentCategoryId: isLoan && loanCountAsExpense ? effectiveLoanCategoryId : null,
      // Undefined leaves an existing rule alone; see the field's doc comment.
      collectFromAccountId: !isLoan
        ? null
        : repaymentRuleIsExternal
          ? undefined
          : autoRepaySourceId,
      firstInstalmentDate: isLoan && loanQuote ? loanQuote.firstInstalmentDate : null,
      finalInstalmentDate: isLoan && loanQuote ? loanQuote.payoffDate : null,
    });
  };

  const handleDelete = () => {
    if (!onDelete) return;
    Alert.alert(I18n.t('accounts.delete_account'), I18n.t('accounts.delete_account_confirm'), [
      { text: I18n.t('common.cancel'), style: 'cancel' },
      {
        text: I18n.t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void triggerHaptic('warning');
          onDelete();
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1">
        <SettingsHeader
          className="px-5 pt-5 pb-3"
          title={isEdit ? I18n.t('accounts.edit_account') : I18n.t('accounts.new_account')}
          onBack={onClose}
          closeRowAccessory={
            isEdit && onDelete ? (
              <Pressable
                onPress={handleDelete}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('accounts.delete_account')}
                className="h-10 w-10 items-center justify-center rounded-full bg-destructive/10"
              >
                <Trash2 size={18} color={themeColors.error} />
              </Pressable>
            ) : undefined
          }
        />

        <FormScrollView contentContainerStyle={ACCOUNT_EDITOR_SCROLL_CONTENT_STYLE}>
          <View className="gap-4">
            <View>
              <Text variant="label" tone="muted" className="mb-2">
                {I18n.t('accounts.type')}
              </Text>
              {isEdit ? (
                <View className="flex-row flex-wrap gap-2">
                  {ACCOUNT_TYPE_OPTIONS.filter((item) => item.value === account.type).map(
                    (item) => (
                      <View
                        key={item.value}
                        className="flex-row items-center gap-1.5 px-4 py-2.5 rounded-full border bg-primary/15 border-primary/50"
                      >
                        <CategoryEmoji icon={accountTypeChipIcon(item.value)} size={16} />
                        <Text variant="caption" className="text-primary">
                          {accountTypeLabel(item.value)}
                        </Text>
                      </View>
                    ),
                  )}
                </View>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {ACCOUNT_TYPE_OPTIONS.map((item) => (
                    <Pressable
                      key={item.value}
                      onPress={() => {
                        void triggerHaptic('selection');
                        setType(item.value);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={accountTypeLabel(item.value)}
                      accessibilityState={{ selected: type === item.value }}
                      className={cn(
                        'flex-row items-center gap-1.5 px-4 py-2.5 rounded-full border',
                        type === item.value
                          ? 'bg-primary/15 border-primary/50'
                          : 'bg-card border-border/40',
                      )}
                    >
                      <CategoryEmoji icon={accountTypeChipIcon(item.value)} size={16} />
                      <Text
                        variant="caption"
                        className={cn(
                          type === item.value ? 'text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {accountTypeLabel(item.value)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            <Input
              label={I18n.t('accounts.account_name')}
              value={name}
              onChangeText={setName}
              placeholder={I18n.t('accounts.account_name_placeholder')}
            />
            <View>
              <Text variant="label" tone="muted" className="mb-2">
                {I18n.t('accounts.logo.label')}
              </Text>
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  onOpenLogoPicker({ selectedLogoId: logoId, onSelect: setLogoId });
                }}
                className="flex-row items-center gap-3 rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3"
                accessibilityRole="button"
                accessibilityLabel={I18n.t('accounts.logo.label')}
              >
                <AccountLogo logoId={logoId} type={isEdit ? account.type : type} size={36} />
                <Text
                  variant="body"
                  tone={logoMeta ? undefined : 'muted'}
                  numberOfLines={1}
                  className="flex-1"
                >
                  {logoMeta ? logoMeta.name : I18n.t('accounts.logo.add')}
                </Text>
                {logoId ? (
                  <Pressable
                    onPress={() => {
                      void triggerHaptic('selection');
                      setLogoId(null);
                    }}
                    hitSlop={10}
                    className="h-7 w-7 items-center justify-center rounded-full bg-secondary/70"
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('accounts.logo.clear')}
                  >
                    <X size={14} color={themeColors.textMuted} />
                  </Pressable>
                ) : (
                  <ChevronRight size={16} color={themeColors.textMuted} />
                )}
              </Pressable>
            </View>
            <SelectField
              label={I18n.t('accounts.account_group')}
              value={accountGroupId}
              onChange={setAccountGroupId}
              options={accountGroupOptions}
            />
            <View>
              <Text variant="label" tone="muted" className="mb-2">
                {I18n.t('accounts.currency')}
              </Text>
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  setShowCurrencyPicker(true);
                }}
                className="flex-row items-center justify-between rounded-2xl border border-border/40 bg-card px-4 py-3.5"
              >
                <Text variant="body">
                  {currency} · {currencyNameForCode(currency)}
                </Text>
                <ChevronRight size={16} color={themeColors.textMuted} />
              </Pressable>
            </View>
            {editedType === 'credit' ? (
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Input
                    label={I18n.t('accounts.statement_day')}
                    variant="numeric"
                    value={creditStatementDay}
                    onChangeText={setCreditStatementDay}
                    placeholder="25"
                  />
                </View>
                <View className="flex-1">
                  <Input
                    label={I18n.t('accounts.due_day')}
                    variant="numeric"
                    value={creditDueDay}
                    onChangeText={setCreditDueDay}
                    placeholder="1"
                  />
                </View>
              </View>
            ) : null}

            {editedType === 'loan' ? (
              <>
                <Input
                  label={I18n.t('accounts.loan.principal_label')}
                  variant="currency"
                  currencySymbol={currencySymbolForCode(currency)}
                  value={loanPrincipal}
                  onChangeText={setLoanPrincipal}
                  placeholder="0.00"
                />

                <Input
                  label={I18n.t('accounts.loan.term_label')}
                  labelAccessory={
                    <InfoTooltipButton
                      title={String(I18n.t('accounts.loan.term_label'))}
                      infoTooltip={String(
                        I18n.t('accounts.loan.term_info', { max: MAX_LOAN_TERM_MONTHS }),
                      )}
                      iconSize={14}
                    />
                  }
                  variant="numeric"
                  value={loanTermMonths}
                  onChangeText={setLoanTermMonths}
                  error={loanTermError}
                  placeholder="60"
                />

                {/* The total leads because it is what the loan costs, and
                    every other figure here is solved from it. */}
                <Input
                  label={I18n.t('accounts.loan.total_repayable_label')}
                  labelAccessory={
                    <InfoTooltipButton
                      title={String(I18n.t('accounts.loan.total_repayable_label'))}
                      infoTooltip={String(I18n.t('accounts.loan.total_repayable_info'))}
                      iconSize={14}
                    />
                  }
                  variant="currency"
                  currencySymbol={currencySymbolForCode(currency)}
                  value={loanTotalRepayable}
                  onChangeText={setLoanTotalRepayable}
                  error={loanTotalRepayableError}
                  placeholder="0.00"
                />

                {/* The payment follows the total until the borrower says it
                    does not. Lenders round it up and let a smaller final
                    payment absorb the difference, so both figures are on the
                    agreement and both have to be enterable. */}
                <View className="gap-1.5">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 flex-row items-center pr-3">
                      <Text variant="label" tone="muted">
                        {I18n.t('accounts.loan.instalment_label')}
                      </Text>
                      <View className="ml-1.5">
                        <InfoTooltipButton
                          title={String(I18n.t('accounts.loan.instalment_label'))}
                          infoTooltip={String(I18n.t('accounts.loan.instalment_info'))}
                          iconSize={14}
                        />
                      </View>
                    </View>
                    <Switch
                      value={!loanInstalmentAuto}
                      onValueChange={(manual) => {
                        setLoanInstalmentAuto(!manual);
                        // Seeded with the figure already on screen, so turning
                        // this on offers the lender's payment to round rather
                        // than an empty box.
                        if (manual && loanInstalment.trim().length === 0) {
                          setLoanInstalment(
                            derivedLoanInstalment == null
                              ? ''
                              : toBalanceInputValue(derivedLoanInstalment),
                          );
                        }
                      }}
                      trackColor={{ false: `${themeColors.border}80`, true: themeColors.primary }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                  {loanInstalmentAuto ? (
                    <View className="rounded-2xl border border-border/30 bg-secondary/20 px-4 py-3.5">
                      <Text
                        variant="body"
                        tone={derivedLoanInstalment == null ? 'muted' : 'default'}
                      >
                        {derivedLoanInstalment == null
                          ? I18n.t('accounts.loan.awaiting_contract')
                          : formatAmount(derivedLoanInstalment, appSettings, {
                              showSign: false,
                              trueHourlyRate: appCurrentMonthWage?.trueHourlyRate ?? 0,
                              currencyCode: currency,
                            })}
                      </Text>
                    </View>
                  ) : (
                    <Input
                      variant="currency"
                      currencySymbol={currencySymbolForCode(currency)}
                      value={loanInstalment}
                      onChangeText={setLoanInstalment}
                      placeholder="0.00"
                    />
                  )}
                </View>

                {/* Shown, never typed. A lender quoting a rate on the full
                    amount borrowed rather than on the falling balance is a
                    different number, and accepting it here is what silently
                    produced the wrong monthly payment. */}
                <View className="gap-1.5">
                  <View className="flex-row items-center px-1">
                    <Text variant="label" tone="muted">
                      {I18n.t('accounts.loan.interest_rate_label')}
                    </Text>
                    <View className="ml-1.5">
                      <InfoTooltipButton
                        title={String(I18n.t('accounts.loan.interest_rate_label'))}
                        infoTooltip={String(I18n.t('accounts.loan.interest_rate_info'))}
                        iconSize={14}
                      />
                    </View>
                  </View>
                  <View className="rounded-2xl border border-border/30 bg-secondary/20 px-4 py-3.5">
                    <Text variant="body" tone={derivedLoanRate == null ? 'muted' : 'default'}>
                      {derivedLoanRate == null
                        ? I18n.t('accounts.loan.awaiting_contract')
                        : `${derivedLoanRate}%`}
                    </Text>
                  </View>
                </View>

                {!isEdit ? (
                  <Input
                    label={I18n.t('accounts.loan.paid_periods_label')}
                    labelAccessory={
                      <InfoTooltipButton
                        title={String(I18n.t('accounts.loan.paid_periods_label'))}
                        infoTooltip={String(I18n.t('accounts.loan.paid_periods_info'))}
                        iconSize={14}
                      />
                    }
                    variant="numeric"
                    value={loanPaidPeriods}
                    onChangeText={setLoanPaidPeriods}
                    error={loanPaidPeriodsError}
                    placeholder="0"
                  />
                ) : null}

                {/* Offered on edit too, seeded from whatever rule currently
                    pays into this loan. Without it a borrower who deleted that
                    rule from Settings -> Recurring had no way back: the loan
                    was the one place that could rebuild it, and it never
                    offered to. */}
                <View className="gap-1.5">
                  <View className="flex-row items-center px-1">
                    <Text variant="label" tone="muted">
                      {I18n.t('accounts.loan.collect_account_label')}
                    </Text>
                    <View className="ml-1.5">
                      <InfoTooltipButton
                        title={String(I18n.t('accounts.loan.collect_account_label'))}
                        infoTooltip={String(I18n.t('accounts.loan.collect_account_info'))}
                        iconSize={14}
                      />
                    </View>
                  </View>
                  {repaymentRuleIsExternal ? (
                    <View className="gap-1.5">
                      <View className="rounded-2xl border border-border/30 bg-secondary/20 px-4 py-3.5">
                        <Text variant="body" tone="muted">
                          {externalRepaymentLabel}
                        </Text>
                      </View>
                      <Text variant="caption" tone="muted" className="px-1">
                        {I18n.t('accounts.loan.collect_account_external')}
                      </Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => {
                        void triggerHaptic('selection');
                        setShowAutoRepaySourcePicker(true);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('accounts.loan.collect_account_label')}
                      className="flex-row items-center justify-between rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3.5"
                    >
                      <Text variant="body" tone={autoRepaySource ? 'default' : 'muted'}>
                        {autoRepaySource?.name ?? I18n.t('accounts.loan.collect_account_manual')}
                      </Text>
                      <View className="flex-row items-center gap-2">
                        {autoRepaySource ? (
                          <Pressable
                            onPress={() => {
                              void triggerHaptic('selection');
                              setAutoRepaySourceOverride(null);
                            }}
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel={I18n.t('accounts.loan.collect_account_manual')}
                            className="h-7 w-7 items-center justify-center rounded-full bg-secondary/70"
                          >
                            <X size={14} color={themeColors.textMuted} />
                          </Pressable>
                        ) : null}
                        <ChevronRight size={16} color={themeColors.textMuted} />
                      </View>
                    </Pressable>
                  )}
                </View>

                {/* Unlike "Collect from", this is offered on edit too: it is a
                    property of how the loan is reported, not of the recurring
                    rule the create flow sets up. */}
                <View className="gap-1.5">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 flex-row items-center pr-3">
                      <Text variant="label" tone="muted">
                        {I18n.t('accounts.loan.count_as_expense_label')}
                      </Text>
                      <View className="ml-1.5">
                        <InfoTooltipButton
                          title={String(I18n.t('accounts.loan.count_as_expense_label'))}
                          infoTooltip={String(I18n.t('accounts.loan.count_as_expense_info'))}
                          iconSize={14}
                        />
                      </View>
                    </View>
                    <Switch
                      value={loanCountAsExpense}
                      onValueChange={(next) => {
                        void triggerHaptic('selection');
                        setLoanCountAsExpense(next);
                      }}
                      trackColor={{ false: `${themeColors.border}80`, true: themeColors.primary }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                  {loanCountAsExpense ? (
                    <Pressable
                      onPress={() => {
                        void triggerHaptic('selection');
                        setShowLoanCategoryPicker(true);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('accounts.loan.payment_category_label')}
                      className="flex-row items-center justify-between rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3.5"
                    >
                      <View className="flex-1 flex-row items-center gap-2 pr-2">
                        {selectedLoanCategory ? (
                          <CategoryEmoji icon={selectedLoanCategory.icon} size={18} />
                        ) : null}
                        <Text
                          variant="body"
                          tone={selectedLoanCategory ? 'default' : 'muted'}
                          numberOfLines={1}
                        >
                          {selectedLoanCategory?.label ??
                            I18n.t('accounts.loan.payment_category_placeholder')}
                        </Text>
                      </View>
                      <ChevronRight size={16} color={themeColors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>

                <View className="gap-1.5">
                  <View className="flex-row items-center px-1">
                    <Text variant="label" tone="muted">
                      {I18n.t('accounts.loan.start_date_label')}
                    </Text>
                    <View className="ml-1.5">
                      <InfoTooltipButton
                        title={String(I18n.t('accounts.loan.start_date_label'))}
                        infoTooltip={String(I18n.t('accounts.loan.start_date_info'))}
                        iconSize={14}
                      />
                    </View>
                  </View>
                  <Pressable
                    onPress={() => {
                      void triggerHaptic('selection');
                      setShowLoanStartPicker(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('accounts.loan.start_date_label')}
                    className="flex-row items-center justify-between rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3.5"
                  >
                    <Text variant="body">
                      {formatShortDate(`${loanStartDate}T00:00:00`, appSettings.locale)}
                    </Text>
                    <ChevronRight size={16} color={themeColors.textMuted} />
                  </Pressable>
                </View>
              </>
            ) : null}

            {/* A new loan's balance comes from the contract, so the field only
                appears on an existing one, for reconciliation. */}
            {isNewLoan ? null : (
              <Input
                label={
                  editedType === 'loan'
                    ? I18n.t('accounts.loan.balance_owed_label')
                    : isEdit
                      ? I18n.t('accounts.current_balance')
                      : I18n.t('accounts.starting_balance')
                }
                labelAccessory={
                  editedType === 'loan' ? (
                    <InfoTooltipButton
                      title={String(I18n.t('accounts.loan.balance_owed_label'))}
                      infoTooltip={String(I18n.t('accounts.loan.balance_owed_info'))}
                      iconSize={14}
                    />
                  ) : undefined
                }
                variant="currency"
                currencySymbol={currencySymbolForCode(currency)}
                value={balanceInput}
                onChangeText={setBalanceInput}
                helperText={
                  editedType === 'loan'
                    ? loanBalanceHint
                    : !isEdit
                      ? undefined
                      : I18n.t('accounts.current_balance_hint')
                }
              />
            )}

            {editedType === 'loan' ? (
              <LoanQuoteDisclosure quote={loanQuote} currency={currency} />
            ) : null}

            <View className="flex-row items-center justify-between">
              <Text variant="label" tone="muted">
                {I18n.t('accounts.include_in_totals')}
              </Text>
              <Switch
                value={includeInTotals}
                onValueChange={setIncludeInTotals}
                trackColor={{ false: `${themeColors.border}80`, true: themeColors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            {isEdit && account.type === 'loan' && onArchiveLoan ? (
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  onArchiveLoan(account.loanArchivedAt == null);
                }}
                accessibilityRole="button"
                className="rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3.5"
              >
                <Text variant="body">
                  {I18n.t(
                    account.loanArchivedAt == null
                      ? 'accounts.loan.archive_action'
                      : 'accounts.loan.unarchive_action',
                  )}
                </Text>
                <Text variant="caption" tone="muted" className="mt-0.5">
                  {I18n.t('accounts.loan.archive_hint')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </FormScrollView>
        <SettingsActionBar onCancel={onClose} onSave={handleSave} saveDisabled={!canSave} />
      </View>
      <DatePickerModal
        visible={showLoanStartPicker}
        value={loanStartDate}
        title={String(I18n.t('accounts.loan.start_date_label'))}
        onSelect={(date) => {
          setLoanStartDate(date);
          setShowLoanStartPicker(false);
        }}
        onClose={() => setShowLoanStartPicker(false)}
      />
      <AccountPickerSheet
        visible={showAutoRepaySourcePicker}
        onClose={() => setShowAutoRepaySourcePicker(false)}
        accounts={autoRepaySourceAccounts}
        accountGroups={accountGroups}
        selectedAccountId={autoRepaySourceId}
        onSelect={(id) => {
          setAutoRepaySourceOverride(id);
          setShowAutoRepaySourcePicker(false);
        }}
      />
      <CategoryPickerSheet
        allowParentSelection
        visible={showLoanCategoryPicker}
        onClose={() => setShowLoanCategoryPicker(false)}
        parents={loanCategoryPicker.parents}
        childByParent={loanCategoryPicker.childByParent}
        selectedCategoryId={effectiveLoanCategoryId}
        onSelect={(categoryId) => {
          setLoanPaymentCategoryId(categoryId);
          setShowLoanCategoryPicker(false);
        }}
      />
      <CurrencyPickerSheet
        visible={showCurrencyPicker}
        onClose={() => setShowCurrencyPicker(false)}
        onDismiss={() => {
          if (!pendingMultiCurrency) return;
          setPendingMultiCurrency(false);
          openMultiCurrency();
        }}
        onSelect={handleCurrencyChange}
        selectedCode={currency}
        restrictToCodes={accountCurrencyCodes}
        title={I18n.t('accounts.currency')}
        footer={
          onOpenMultiCurrency ? (
            <Pressable
              onPress={() => {
                // Close the picker first. On iOS, wait for its dismissal
                // (via onDismiss) before tearing down this editor + navigating
                // so two native modals never dismiss in the same frame. On
                // other platforms there's no such collision, so go directly.
                if (Platform.OS === 'ios') {
                  setPendingMultiCurrency(true);
                  setShowCurrencyPicker(false);
                } else {
                  setShowCurrencyPicker(false);
                  openMultiCurrency();
                }
              }}
              className="mt-1 flex-row items-center justify-center gap-1.5 rounded-2xl border border-primary/30 bg-primary/10 px-3 py-3 active:opacity-80"
            >
              <Plus size={16} color={themeColors.primary} />
              <Text variant="body" style={{ color: themeColors.primary }}>
                {I18n.t('exchange_rates.add_currency')}
              </Text>
            </Pressable>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

/**
 * The recurring transfer that pays a loan's instalment.
 *
 * Built in one place because two paths produce it: creating the loan with a
 * collect account, and re-arming a loan whose rule was deleted from Settings ->
 * Recurring. They have to agree on every field, and above all on `endDate`,
 * without which the transfer keeps draining the funding account past the final
 * instalment. That is exactly the guard a borrower loses when they rebuild the
 * rule by hand in the recurring editor.
 */
function buildLoanRepaymentRule({
  input,
  loanAccountId,
  fromAccountId,
  instalment,
}: {
  input: AccountEditorInput;
  loanAccountId: string;
  fromAccountId: string;
  instalment: number;
}) {
  const today = dayKeyFromDateLocal(new Date());
  return {
    name: String(I18n.t('accounts.loan.autopay_rule_name', { name: input.name })),
    type: 'transfer' as const,
    amount: instalment,
    currency: input.currency || DEFAULT_CURRENCY,
    fromAccountId,
    toAccountId: loanAccountId,
    // Carried on the rule so the engine can stamp each generated
    // repayment without reading the loan account back.
    countsAsExpense: input.loanCountAsExpense ?? false,
    categoryId: input.loanCountAsExpense ? input.loanPaymentCategoryId : null,
    recurrencePattern: 'monthly' as const,
    recurrenceInterval: 1,
    // The contract's next instalment, unless it has already passed - a rule
    // dated in the past would fire a catch-up run immediately. On a loan being
    // re-armed mid-life the first instalment is always in the past, so this is
    // what lands the rule on the coming due date instead of replaying every
    // instalment since disbursement.
    nextRunDate:
      input.firstInstalmentDate && input.firstInstalmentDate > today
        ? input.firstInstalmentDate
        : dayKeyFromDateLocal(nextOccurrenceOfMonthDay(input.loanPaymentDay ?? 1, new Date())),
    // A loan ends. Without this the rule would keep transferring past
    // the final instalment, draining the funding account and pushing
    // the balance below zero. The engine's check is inclusive, so the
    // final instalment still runs.
    endDate: input.finalInstalmentDate,
  };
}

/** Full-page create/edit account editor (native-stack screen). */
export function AccountEditorScreen({
  accountId,
  presetGroupName = null,
  onClose,
  onOpenMultiCurrency,
  onOpenLogoPicker,
}: {
  accountId?: string;
  presetGroupName?: string | null;
  onClose: () => void;
  onOpenMultiCurrency?: () => void;
  onOpenLogoPicker: (session: AccountLogoPickerSession) => void;
}) {
  const {
    accounts,
    accountGroups,
    settings,
    currentMonthWage,
    createAccount,
    updateAccount,
    deleteAccount,
    changeAccountCurrency,
    createTransaction,
    createRecurringRule,
    updateRecurringRule,
    deleteRecurringRule,
    recurringRules,
    setLoanArchived,
  } = useApp();
  const { accountBalances } = useTransactions();
  const { checkLimit } = useProGate();

  const account = accountId ? (accounts.find((a) => a.id === accountId) ?? null) : null;
  const currentBalance = account
    ? (accountBalances.find((b) => b.accountId === account.id)?.balance ?? account.startingBalance)
    : 0;

  const handleSave = useCallback(
    (input: AccountEditorInput) => {
      if (!account) {
        // Gate at save time rather than at the "add" tap, because the type is
        // chosen inside this editor and the editor is now reachable directly
        // from the accounts header as well as from a group card.
        if (input.type === 'loan') {
          const activeLoanCount = accounts.filter(
            (a) => a.type === 'loan' && a.loanArchivedAt == null,
          ).length;
          if (!checkLimit('loans', activeLoanCount)) return;
        } else {
          // Goals and loans have their own caps and must not eat this quota.
          const bankAccountCount = accounts.filter(
            (a) => a.type !== 'goal' && a.type !== 'loan',
          ).length;
          if (!checkLimit('accounts', bankAccountCount)) return;
        }
        // collectFromAccountId and firstInstalmentDate are form state, not
        // account columns, so they must not reach the insert.
        const { collectFromAccountId, firstInstalmentDate, finalInstalmentDate, ...accountInput } =
          input;
        const newAccountId = createAccount({
          ...accountInput,
          currency: input.currency || DEFAULT_CURRENCY,
        });
        // A collect account means the repayment is an ordinary recurring
        // transfer, so it shows up in Settings -> Recurring like any other rule
        // and fires the existing recurring notification. Amount and cadence
        // come from the contract. No collect account means the borrower
        // records each repayment by hand.
        if (input.type === 'loan' && collectFromAccountId && input.loanMonthlyPayment) {
          createRecurringRule(
            buildLoanRepaymentRule({
              input,
              loanAccountId: newAccountId,
              fromAccountId: collectFromAccountId,
              instalment: input.loanMonthlyPayment,
            }),
          );
        }
        // createAccount already reports ACCOUNT_CREATED with the type; this
        // only adds the loan-specific dimensions on top.
        if (input.type === 'loan') {
          void trackEvent(AnalyticsEvents.LOAN_CREATED, {
            hasRate: input.loanInterestRate != null,
            hasCollectAccount: collectFromAccountId != null,
            countsAsExpense: input.loanCountAsExpense ?? false,
            currency: input.currency || DEFAULT_CURRENCY,
          });
        }
        onClose();
        return;
      }

      const loanUpdates = {
        loanOriginalPrincipal: input.loanOriginalPrincipal,
        loanMonthlyPayment: input.loanMonthlyPayment,
        loanPaymentDay: input.loanPaymentDay,
        loanInterestRate: input.loanInterestRate,
        loanTotalRepayable: input.loanTotalRepayable,
        loanTermMonths: input.loanTermMonths,
        loanStartDate: input.loanStartDate,
        loanCountAsExpense: input.loanCountAsExpense,
        loanPaymentCategoryId: input.loanPaymentCategoryId,
      };

      // Correcting the contract changes the instalment, and an auto-repayment
      // rule set up from that contract would otherwise keep transferring the
      // old amount every month. Only rules that still match the previous
      // instalment are re-synced: a different amount means the user set their
      // own (overpaying, say), which is theirs to keep. Cross-currency rules
      // carry the loan-side figure in toAmount, so they are left to the
      // recurring editor rather than half-updated here.
      const previousInstalment = account.loanMonthlyPayment;
      const nextInstalment = input.loanMonthlyPayment;
      const resyncContractRules = () => {
        if (
          account.type !== 'loan' ||
          previousInstalment == null ||
          nextInstalment == null ||
          Math.abs(nextInstalment - previousInstalment) <= 0.005
        ) {
          return;
        }
        recurringRules.forEach((rule) => {
          if (isContractTrackingRule(rule, account.id, previousInstalment)) {
            updateRecurringRule(rule.id, { amount: nextInstalment });
          }
        });
      };

      // How a repayment is *reported* rides on the rule, which stamps it onto
      // every row it generates. Re-pointed unconditionally rather than only on
      // a change, because a loan created before this setting existed has a rule
      // that predates it: without this the toggle would look on and do nothing.
      // Unlike the instalment there is nothing here the user could have taken
      // over, so every active rule paying into this loan follows.
      const resyncRepaymentReporting = () => {
        if (account.type !== 'loan') return;
        const counted = input.loanCountAsExpense ?? false;
        const categoryId = counted ? (input.loanPaymentCategoryId ?? null) : null;
        recurringRules.forEach((rule) => {
          if (!isRepaymentRule(rule, account.id)) return;
          if (rule.countsAsExpense === counted && rule.categoryId === categoryId) return;
          updateRecurringRule(rule.id, { countsAsExpense: counted, categoryId });
        });
      };

      // "Collect from" is offered on edit, so the pick has to be reconciled
      // against whatever rule currently pays into this loan: created when there
      // is none, re-pointed when it moved, removed when the borrower cleared
      // it. This is what lets a borrower who deleted their repayment rule from
      // Settings -> Recurring put it back from the loan itself, instead of
      // rebuilding a transfer by hand and losing the contract's end date with
      // it. Nothing about the choice is stored on the loan, so a rule edited
      // elsewhere stays the single source of truth.
      const resyncCollectAccount = () => {
        if (account.type !== 'loan') return;
        // Undefined means the editor could not represent the existing rule (it
        // pays from an account this picker cannot offer), so it is not ours.
        if (input.collectFromAccountId === undefined) return;
        const existing = recurringRules.find((rule) => isRepaymentRule(rule, account.id)) ?? null;
        const nextSourceId = input.collectFromAccountId;
        if (!nextSourceId) {
          if (existing) deleteRecurringRule(existing.id);
          return;
        }
        if (existing) {
          if (existing.fromAccountId !== nextSourceId) {
            updateRecurringRule(existing.id, { fromAccountId: nextSourceId });
          }
          return;
        }
        // A loan with no instalment has no schedule to automate; the row is
        // still shown so the contract can be completed first.
        if (!input.loanMonthlyPayment) return;
        createRecurringRule(
          buildLoanRepaymentRule({
            input,
            loanAccountId: account.id,
            fromAccountId: nextSourceId,
            instalment: input.loanMonthlyPayment,
          }),
        );
      };

      const accountUpdates = {
        name: input.name,
        accountGroup: input.accountGroup,
        logoId: input.logoId,
        creditStatementDay: input.creditStatementDay,
        creditDueDay: input.creditDueDay,
        includeInTotals: input.includeInTotals,
        currency: input.currency,
        ...loanUpdates,
      };

      // Applies the account edit and everything that must move with it. Called
      // only once the user has confirmed, so cancelling a prompt leaves both
      // the account and its rules untouched.
      const applyAccountUpdates = () => {
        updateAccount(account.id, accountUpdates);
        resyncContractRules();
        resyncRepaymentReporting();
        // Last: a rule it creates is already built at the edited instalment and
        // reporting, so it must not be walked by the two resyncs above (which
        // read the render-time `recurringRules` anyway).
        resyncCollectAccount();
      };

      // Currency change on an existing account re-denominates prior entries at
      // the latest rate in a lump — warn, then run it as its own operation.
      // The rule re-sync deliberately sits this path out: a rule's amount is
      // denominated in its own `currency` column, which this does not touch,
      // so rewriting the figure alone would execute a new-currency amount as
      // the old currency. Re-pointing autopay after a redenomination belongs
      // in the recurring editor.
      if (input.currency && input.currency !== account.currency) {
        Alert.alert(
          I18n.t('accounts.currency_change_title'),
          I18n.t('accounts.currency_change_message', {
            from: account.currency,
            to: input.currency,
          }),
          [
            { text: I18n.t('common.cancel'), style: 'cancel' },
            {
              text: I18n.t('accounts.currency_change_action'),
              style: 'destructive',
              onPress: () => {
                changeAccountCurrency(account.id, input.currency, {
                  name: input.name,
                  accountGroup: input.accountGroup,
                  logoId: input.logoId,
                  creditStatementDay: input.creditStatementDay,
                  creditDueDay: input.creditDueDay,
                  includeInTotals: input.includeInTotals,
                  // Already converted in the editor, so they are saved in the
                  // new currency alongside the re-denominated history.
                  ...loanUpdates,
                });
                onClose();
              },
            },
          ],
        );
        return;
      }

      const delta = input.startingBalance - currentBalance;
      const adjustmentAmount = Math.abs(delta);
      const hasBalanceChange = adjustmentAmount > 0.000001;

      if (!hasBalanceChange) {
        applyAccountUpdates();
        onClose();
        return;
      }

      const flowType = flowTypeForBalanceDelta(account.type, delta);
      Alert.alert(
        I18n.t('accounts.balance_adjustment_prompt_title'),
        I18n.t('accounts.balance_adjustment_prompt_message', {
          amount: formatAmount(adjustmentAmount, settings, {
            showSign: false,
            trueHourlyRate: currentMonthWage?.trueHourlyRate ?? 0,
          }),
        }),
        [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          {
            text: I18n.t('accounts.record_as_difference'),
            onPress: () => {
              applyAccountUpdates();
              createTransaction({
                type: 'balance_adjustment',
                amount: delta,
                currency: input.currency || account.currency,
                date: new Date().toISOString(),
                accountId: account.id,
                fromAccountId: null,
                toAccountId: null,
                categoryId: null,
                note: String(I18n.t('accounts.balance_adjustment_transaction_note')),
              });
              onClose();
            },
          },
          {
            text:
              flowType === 'income'
                ? I18n.t('accounts.record_as_income')
                : I18n.t('accounts.record_as_expense'),
            onPress: () => {
              applyAccountUpdates();
              createTransaction({
                type: flowType,
                amount: adjustmentAmount,
                currency: input.currency || account.currency,
                date: new Date().toISOString(),
                accountId: account.id,
                note: String(I18n.t('accounts.balance_adjustment_transaction_note')),
              });
              onClose();
            },
          },
        ],
      );
    },
    [
      account,
      accounts,
      changeAccountCurrency,
      checkLimit,
      createAccount,
      createRecurringRule,
      createTransaction,
      deleteRecurringRule,
      recurringRules,
      updateRecurringRule,
      currentBalance,
      currentMonthWage?.trueHourlyRate,
      onClose,
      settings,
      updateAccount,
    ],
  );

  const handleDelete = useCallback(() => {
    if (!account) return;
    deleteAccount(account.id);
    onClose();
  }, [account, deleteAccount, onClose]);

  const handleArchiveLoan = useCallback(
    (archived: boolean) => {
      if (!account) return;
      setLoanArchived(account.id, archived);
      onClose();
    },
    [account, onClose, setLoanArchived],
  );

  return (
    <AccountEditorSheet
      account={account}
      presetGroupName={presetGroupName}
      currentBalance={currentBalance}
      defaultCurrencyCode={settings.currencyCode}
      accountGroups={accountGroups}
      onClose={onClose}
      onSave={handleSave}
      onDelete={account ? handleDelete : undefined}
      onArchiveLoan={account?.type === 'loan' ? handleArchiveLoan : undefined}
      onOpenMultiCurrency={onOpenMultiCurrency}
      onOpenLogoPicker={onOpenLogoPicker}
    />
  );
}

/** Icon shown on the account-type chips and the logo fallback. */
function accountTypeChipIcon(type: AccountType): string {
  if (type === 'credit') return 'credit-card';
  if (type === 'loan') return 'bill-calendar';
  return 'bank';
}

/**
 * Localized name of an account type. `ACCOUNT_TYPE_OPTIONS` carries English
 * labels, which is what the chips used to render; every type that reaches a
 * chip or the management list has an `accounts.type_*` string, so use it.
 */
function accountTypeLabel(type: AccountType): string {
  if (type === 'credit') return String(I18n.t('accounts.type_credit'));
  if (type === 'loan') return String(I18n.t('accounts.type_loan'));
  if (type === 'debit') return String(I18n.t('accounts.type_debit'));
  return ACCOUNT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

function flowTypeForBalanceDelta(
  accountType: AccountType,
  delta: number,
): Extract<TransactionWithRelations['type'], 'income' | 'expense'> {
  // On a liability a rising balance is more debt, so it records as spending.
  if (isLiabilityAccountType(accountType)) {
    return delta >= 0 ? 'expense' : 'income';
  }
  return delta >= 0 ? 'income' : 'expense';
}

function PayCreditCardSheet({
  onClose,
  onSubmit,
  fromAccounts,
  accountGroups,
  cardCurrency,
  rateTable,
  payableAmount = 0,
  isLoan = false,
}: {
  onClose: () => void;
  onSubmit: (input: { fromAccountId: string; amount: number; note: string | null }) => void;
  fromAccounts: Account[];
  accountGroups: AccountGroup[];
  /** The liability's own currency, which the suggested amount is denominated in. */
  cardCurrency: string;
  rateTable: RateTable;
  payableAmount?: number;
  /** Switches the copy from credit-card language to loan repayment language. */
  isLoan?: boolean;
}) {
  const [fromAccountId, setFromAccountId] = useState<string | null>(fromAccounts[0]?.id ?? null);
  const [showFromAccountPicker, setShowFromAccountPicker] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState(
    I18n.t(isLoan ? 'accounts.loan.payment_note' : 'accounts.credit_payment_note'),
  );
  const themeColors = useThemeColors();
  const numericAmount = Number(amount);
  const canSave = !!fromAccountId && amount.trim().length > 0 && Number.isFinite(numericAmount);

  // The transfer leaves the paying account, so the amount is entered in *its*
  // currency. Paying a foreign card converts the payable at the current rate.
  const fromCurrency =
    fromAccounts.find((account) => account.id === fromAccountId)?.currency ?? cardCurrency;
  const isCrossCurrency = fromCurrency !== cardCurrency;
  const defaultAmount = useMemo(() => {
    if (payableAmount <= 0) return 0;
    if (!isCrossCurrency) return payableAmount;
    return convert(payableAmount, cardCurrency, fromCurrency, rateTable).value;
  }, [cardCurrency, fromCurrency, isCrossCurrency, payableAmount, rateTable]);
  const payableLabel = useMemo(
    () =>
      formatAmount(
        payableAmount,
        { currencySymbol: currencySymbolForCode(cardCurrency), displayMode: 'money' },
        { showSign: false, trueHourlyRate: 0 },
      ),
    [cardCurrency, payableAmount],
  );

  useEffect(() => {
    if (defaultAmount > 0) setAmount(defaultAmount.toFixed(2));
  }, [defaultAmount]);

  useEffect(() => {
    if (fromAccounts.length === 0) {
      setFromAccountId(null);
      return;
    }
    if (!fromAccountId || !fromAccounts.some((account) => account.id === fromAccountId)) {
      setFromAccountId(fromAccounts[0].id);
    }
  }, [fromAccountId, fromAccounts]);

  const handleSave = () => {
    if (!canSave || !fromAccountId) return;
    onSubmit({ fromAccountId, amount: numericAmount, note: note.trim() || null });
    setAmount('');
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1">
        <SettingsHeader
          className="px-5 pt-5 pb-3"
          title={I18n.t(isLoan ? 'accounts.loan.make_payment' : 'accounts.pay_credit_card')}
          onBack={onClose}
        />
        <FormScrollView contentContainerStyle={ACCOUNT_EDITOR_SCROLL_CONTENT_STYLE}>
          <View className="gap-4">
            <View className="gap-2.5">
              <Text variant="caption" tone="muted">
                {I18n.t('accounts.pay_from')}
              </Text>
              <Pressable
                onPress={() => setShowFromAccountPicker(true)}
                className="rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3 flex-row items-center justify-between"
              >
                <Text variant="body" tone={fromAccountId ? undefined : 'muted'}>
                  {fromAccountId
                    ? (fromAccounts.find((a) => a.id === fromAccountId)?.name ??
                      I18n.t('common.none'))
                    : I18n.t('common.none')}
                </Text>
                <ChevronRight size={16} color={themeColors.textMuted} />
              </Pressable>
            </View>
            <Input
              label={I18n.t('transactions.editor.amount')}
              variant="currency"
              currencySymbol={currencySymbolForCode(fromCurrency)}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
            />
            {isCrossCurrency && payableAmount > 0 ? (
              <View className="-mt-2 flex-row items-center justify-between rounded-2xl border border-border/30 bg-secondary/20 px-4 py-2.5">
                <Text variant="caption" tone="muted">
                  {I18n.t(isLoan ? 'accounts.loan.due_amount' : 'accounts.payable')}
                </Text>
                <Text variant="caption">{payableLabel}</Text>
              </View>
            ) : null}
            <Input
              label={I18n.t('transaction_detail.note')}
              value={note}
              onChangeText={setNote}
              placeholder={I18n.t('accounts.payment_note_placeholder')}
            />
          </View>
        </FormScrollView>
        <SettingsActionBar onCancel={onClose} onSave={handleSave} saveDisabled={!canSave} />
      </View>
      <AccountPickerSheet
        visible={showFromAccountPicker}
        onClose={() => setShowFromAccountPicker(false)}
        accounts={fromAccounts}
        accountGroups={accountGroups}
        selectedAccountId={fromAccountId}
        onSelect={(accountId) => {
          setFromAccountId(accountId);
          setShowFromAccountPicker(false);
        }}
      />
    </SafeAreaView>
  );
}

/** Full-page pay-credit-card editor (native-stack screen). */
export function PayCreditCardScreen({
  accountId,
  onClose,
}: {
  accountId: string;
  onClose: () => void;
}) {
  const {
    accounts,
    accountGroups,
    settings,
    rateTable,
    getTransactionsByAccount,
    createTransaction,
  } = useApp();
  const { accountBalances } = useTransactions();

  const account = accounts.find((a) => a.id === accountId) ?? null;
  const cardCurrency = account?.currency ?? settings.currencyCode;

  const isLoan = account?.type === 'loan';
  const fromAccounts = useMemo(
    // Paying a liability from another liability is never what the user means,
    // and an archived goal/loan should not appear as a funding source.
    () =>
      accounts.filter(
        (a) =>
          a.id !== accountId &&
          !isLiabilityAccountType(a.type) &&
          a.goalArchivedAt == null &&
          a.loanArchivedAt == null,
      ),
    [accounts, accountId],
  );

  // In the liability's own currency, like every other balance on its card.
  const payableAmount = useMemo(() => {
    if (!account) return 0;
    const balance =
      accountBalances.find((b) => b.accountId === accountId)?.balance ?? account.startingBalance;
    if (account.type === 'loan') {
      // The contractual repayment, except on the final instalment where only
      // the remainder is owed.
      const remaining = Math.max(0, balance);
      const monthly = account.loanMonthlyPayment ?? 0;
      if (monthly <= 0) return remaining;
      return Math.min(monthly, remaining);
    }
    const txns = getTransactionsByAccount(accountId);
    return computeCreditCycleSummary(account, txns, balance, new Date()).payable;
  }, [account, accountId, accountBalances, getTransactionsByAccount]);

  const handleSubmit = useCallback(
    ({
      fromAccountId,
      amount,
      note,
    }: {
      fromAccountId: string;
      amount: number;
      note: string | null;
    }) => {
      const fromCurrency =
        accounts.find((a) => a.id === fromAccountId)?.currency ?? settings.currencyCode;
      const crossCurrency = fromCurrency !== cardCurrency;
      // A hand-recorded repayment is reported exactly like an automatic one, or
      // the same loan would read two different ways depending on how it was
      // paid. Null (a loan predating the setting) reads as off here for the
      // same reason it does in the editor: its recurring rule is not counted
      // either, and the two must agree.
      const countsAsExpense = isLoan && (account?.loanCountAsExpense ?? false);
      createTransaction({
        type: 'transfer',
        amount,
        currency: fromCurrency,
        // Paying a foreign card: the entered amount leaves the paying account
        // in its currency, and the card is credited in its own.
        toAmount: crossCurrency
          ? convert(amount, fromCurrency, cardCurrency, rateTable).value
          : null,
        date: new Date().toISOString(),
        fromAccountId,
        toAccountId: accountId,
        categoryId: countsAsExpense ? (account?.loanPaymentCategoryId ?? null) : null,
        note,
        countsAsExpense,
      });
      if (isLoan) {
        void trackEvent(AnalyticsEvents.LOAN_PAYMENT_RECORDED, { source: 'manual' });
      }
      onClose();
    },
    [
      account,
      accountId,
      accounts,
      cardCurrency,
      createTransaction,
      isLoan,
      onClose,
      rateTable,
      settings.currencyCode,
    ],
  );

  return (
    <PayCreditCardSheet
      onClose={onClose}
      fromAccounts={fromAccounts}
      accountGroups={accountGroups}
      cardCurrency={cardCurrency}
      rateTable={rateTable}
      payableAmount={payableAmount}
      isLoan={isLoan}
      onSubmit={handleSubmit}
    />
  );
}

/** Full-page create-account-group editor (native-stack screen). */
export function AccountGroupEditorScreen({ onClose }: { onClose: () => void }) {
  const { createAccountGroup } = useApp();
  const [name, setName] = useState('');
  const canSave = name.trim().length > 0;
  const handleSave = useCallback(() => {
    const normalized = name.trim();
    if (!normalized) return;
    createAccountGroup(normalized);
    onClose();
  }, [createAccountGroup, name, onClose]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        title={I18n.t('accounts.create_group')}
        onBack={onClose}
      />
      <ScrollView
        contentContainerStyle={ACCOUNT_EDITOR_SCROLL_CONTENT_STYLE}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Input
          label={I18n.t('accounts.group_name')}
          value={name}
          onChangeText={setName}
          placeholder={I18n.t('accounts.create_group_placeholder')}
        />
      </ScrollView>
      <SettingsActionBar onCancel={onClose} onSave={handleSave} saveDisabled={!canSave} />
    </SafeAreaView>
  );
}

// Module-level callbacks for Row — avoids hooks/closures inside renderItem
type AccountRowTheme = {
  accent: string;
  accentBorder: string;
  accentSoft: string;
  border: string;
  card: string;
  cardMuted: string;
  deleteBorder: string;
  deleteSurface: string;
  error: string;
  primary: string;
  primaryMuted: string;
  primarySoft: string;
  textMuted: string;
  textFaint: string;
  text: string;
};

// A parent row in the merged Accounts management list. Real groups are editable
// and draggable; `named` (a group name referenced by an account but with no
// matching group record) and `ungrouped` cards are static buckets.
type GroupCard =
  | { kind: 'group'; id: string; group: AccountGroup; label: string; accounts: Account[] }
  | { kind: 'named'; id: string; group: null; label: string; accounts: Account[] }
  | { kind: 'ungrouped'; id: string; group: null; label: string; accounts: Account[] };

function AccountChildRow({
  account,
  theme,
  width,
  creditLabel,
  onPress,
}: {
  account: Account;
  theme: AccountRowTheme;
  width: number;
  creditLabel: string;
  onPress: (account: Account) => void;
}) {
  const tc = theme;
  const isCredit = account.type === 'credit';
  const typeLabel = accountTypeLabel(account.type);
  const accountVisibilityLabel = account.includeInTotals
    ? I18n.t('accounts.include_option_include')
    : I18n.t('accounts.include_option_hide');

  return (
    <View
      style={[styles.accountChildRow, { width, borderColor: tc.border, backgroundColor: tc.card }]}
    >
      <Sortable.Handle>
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={`${I18n.t('common.reorder')} ${account.name}`}
          style={styles.accountChildHandle}
        >
          <GripVertical size={15} color={tc.textFaint} />
        </View>
      </Sortable.Handle>
      <Pressable
        onPress={() => onPress(account)}
        style={styles.accountChildBody}
        accessibilityRole="button"
        accessibilityLabel={account.name}
      >
        <AccountLogo
          logoId={account.logoId}
          type={account.type}
          goalEmoji={account.goalEmoji}
          size={32}
        />
        <View style={styles.accountChildTextWrap}>
          <Text style={[styles.accountChildName, { color: tc.text }]} numberOfLines={1}>
            {account.name}
          </Text>
          <Text style={[styles.accountChildSubtitle, { color: tc.textMuted }]} numberOfLines={1}>
            {accountVisibilityLabel}
          </Text>
        </View>
        <View
          style={[
            styles.rowTypePill,
            {
              backgroundColor: isCredit ? tc.accentSoft : tc.primarySoft,
              borderColor: isCredit ? tc.accentBorder : tc.primaryMuted,
            },
          ]}
        >
          <Text style={[styles.rowTypeText, { color: isCredit ? tc.accent : tc.primary }]}>
            {isCredit ? creditLabel : typeLabel}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

function GroupCollapsibleCard({
  card,
  theme,
  rowWidth,
  expanded,
  creditLabel,
  isEditing,
  editingName,
  scrollableRef,
  onToggle,
  onEditingNameChange,
  onSaveName,
  onCancelEdit,
  onStartEdit,
  onDelete,
  onAddAccount,
  onAccountPress,
  onReorderAccounts,
}: {
  card: GroupCard;
  theme: AccountRowTheme;
  rowWidth: number;
  expanded: boolean;
  creditLabel: string;
  isEditing: boolean;
  editingName: string;
  scrollableRef: AnimatedRef<Animated.ScrollView>;
  onToggle: (id: string) => void;
  onEditingNameChange: (value: string) => void;
  onSaveName: (groupId: string) => void;
  onCancelEdit: () => void;
  onStartEdit: (group: AccountGroup) => void;
  onDelete: (group: AccountGroup) => void;
  onAddAccount: (card: GroupCard) => void;
  onAccountPress: (account: Account) => void;
  onReorderAccounts: (sectionId: string, ordered: Account[]) => void;
}) {
  const tc = theme;
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;
  const editableGroup = card.kind === 'group' ? card.group : null;
  const accounts = card.accounts;
  // Child rows live inside a flex column that sizes items to content, so give
  // them an explicit width to span the card (minus the panel's side padding).
  const childWidth = Math.max(rowWidth - spacing.xs * 2, 0);

  return (
    <View
      style={[
        styles.groupCard,
        { width: rowWidth },
        {
          borderColor: expanded ? tc.primaryMuted : tc.border,
          backgroundColor: tc.card,
        },
      ]}
    >
      {isEditing && editableGroup ? (
        <View style={styles.groupEditStack}>
          <Input
            value={editingName}
            onChangeText={onEditingNameChange}
            placeholder={I18n.t('accounts.group_name')}
          />
          <View style={styles.groupEditActions}>
            <Button size="sm" className="flex-1" onPress={() => onSaveName(editableGroup.id)}>
              <Text>{I18n.t('common.save')}</Text>
            </Button>
            <Button size="sm" variant="secondary" className="flex-1" onPress={onCancelEdit}>
              <Text>{I18n.t('common.cancel')}</Text>
            </Button>
          </View>
        </View>
      ) : (
        <View style={styles.groupHeader}>
          <Pressable
            onPress={() => onToggle(card.id)}
            hitSlop={6}
            style={styles.groupChevron}
            accessibilityRole="button"
            accessibilityLabel={expanded ? I18n.t('accounts.collapse') : I18n.t('accounts.expand')}
            accessibilityState={{ expanded }}
          >
            <ChevronIcon size={18} color={expanded ? tc.primary : tc.textMuted} />
          </Pressable>
          {editableGroup ? (
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                onStartEdit(editableGroup);
              }}
              style={styles.groupNamePressable}
              accessibilityRole="button"
              accessibilityLabel={card.label}
            >
              <Text style={[styles.groupName, { color: tc.text }]} numberOfLines={1}>
                {card.label}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.groupNamePressable}>
              <Text style={[styles.groupName, { color: tc.textMuted }]} numberOfLines={1}>
                {card.label}
              </Text>
            </View>
          )}
          <Pressable
            onPress={() => onAddAccount(card)}
            hitSlop={4}
            style={[styles.groupCircleButton, { backgroundColor: tc.primarySoft }]}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('accounts.add_account_to_group')}
          >
            <Plus size={16} color={tc.primary} />
          </Pressable>
          {editableGroup ? (
            <>
              <Pressable
                onPress={() => {
                  void triggerHaptic('warning');
                  onDelete(editableGroup);
                }}
                hitSlop={4}
                style={[styles.groupCircleButton, { backgroundColor: tc.deleteSurface }]}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.delete')}
              >
                <Trash2 size={15} color={tc.error} />
              </Pressable>
              <Sortable.Handle>
                <View
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={`${I18n.t('common.reorder')} ${card.label}`}
                  style={styles.groupHandle}
                >
                  <GripVertical size={16} color={tc.textFaint} />
                </View>
              </Sortable.Handle>
            </>
          ) : null}
        </View>
      )}

      {expanded && !isEditing ? (
        <View style={[styles.accountsPanel, { backgroundColor: tc.cardMuted }]}>
          {accounts.length > 0 ? (
            <Sortable.Flex
              activeItemScale={1.02}
              activeItemShadowOpacity={0.08}
              customHandle
              dragActivationDelay={0}
              flexDirection="column"
              flexWrap="nowrap"
              gap={spacing.xs}
              inactiveItemOpacity={1}
              onDragEnd={({ fromIndex, order, toIndex }) => {
                if (fromIndex === toIndex) return;
                const ordered = order(accounts);
                onReorderAccounts(card.id, ordered);
                void triggerHaptic('selection');
              }}
              scrollableRef={scrollableRef}
              width="fill"
            >
              {accounts.map((account) => (
                <AccountChildRow
                  key={account.id}
                  account={account}
                  theme={tc}
                  width={childWidth}
                  creditLabel={creditLabel}
                  onPress={onAccountPress}
                />
              ))}
            </Sortable.Flex>
          ) : (
            <Text style={[styles.accountsEmptyText, { color: tc.textMuted }]}>
              {I18n.t('accounts.empty_group_accounts')}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

interface AccountsScreenProps {
  onBack?: () => void;
  managementOnly?: boolean;
  resetToRootToken?: number;
  scrollToTopToken?: number;
  accountId?: string | null;
  onOpenAccount?: (accountId: string) => void;
  onOpenAddTransaction?: (accountId: string) => void;
  onOpenTransaction?: (transaction: TransactionWithRelations) => void;
  onOpenTransactionSplitBadge?: (transaction: TransactionWithRelations) => void;
  onOpenSettings?: () => void;
  onOpenNetAssetsInsight?: () => void;
  onOpenAccountEditor?: (params?: { accountId?: string; presetGroupName?: string }) => void;
  onOpenPayCreditCard?: (accountId: string) => void;
  onOpenCreateGroup?: () => void;
  useNativeBackGesture?: boolean;
  safeAreaEdges?: Edge[];
  /**
   * When the host (the assets tab) owns the balance-visibility toggle, it passes
   * the state down and renders the eye button itself. Left undefined, the screen
   * keeps its own internal toggle (e.g. when pushed standalone).
   */
  hideBalances?: boolean;
  onToggleBalances?: () => void;
  /** Hides the overview title row + its inline settings/eye actions (the tab provides them). */
  hideOverviewHeader?: boolean;
}

export function AccountsScreen({
  onBack,
  managementOnly = false,
  resetToRootToken = 0,
  scrollToTopToken = 0,
  accountId = null,
  onOpenAccount,
  onOpenAddTransaction,
  onOpenTransaction,
  onOpenTransactionSplitBadge,
  onOpenSettings,
  onOpenNetAssetsInsight,
  onOpenAccountEditor,
  onOpenPayCreditCard,
  onOpenCreateGroup,
  useNativeBackGesture = false,
  safeAreaEdges = ['top'],
  hideBalances,
  onToggleBalances,
  hideOverviewHeader = false,
}: AccountsScreenProps = {}) {
  const themeColors = useThemeColors();
  const listNavInset = useSettingsBottomNavInset(SETTINGS_LIST_BOTTOM_PADDING);
  const { contentWidth: windowWidth } = useDeviceLayout();
  const accountRowThemeColors = useMemo(
    () => ({
      accent: themeColors.accent,
      accentBorder: withColorAlpha(themeColors.accent, 0.32),
      accentSoft: themeColors.accentSoft,
      border: withColorAlpha(themeColors.primary, 0.18),
      card: themeColors.card,
      cardMuted: withColorAlpha(themeColors.primary, 0.06),
      deleteBorder: withColorAlpha(themeColors.error, 0.28),
      deleteSurface: themeColors.errorSoft,
      error: themeColors.error,
      primary: themeColors.primary,
      primaryMuted: themeColors.primaryMuted,
      primarySoft: themeColors.primarySoft,
      text: themeColors.text,
      textMuted: themeColors.textMuted,
      textFaint: withColorAlpha(themeColors.textMuted, 0.55),
    }),
    [
      themeColors.accent,
      themeColors.accentSoft,
      themeColors.card,
      themeColors.error,
      themeColors.errorSoft,
      themeColors.primary,
      themeColors.primaryMuted,
      themeColors.primarySoft,
      themeColors.text,
      themeColors.textMuted,
    ],
  );
  const safeAreaInsets = useSafeAreaInsets();
  const managementRowWidth = Math.max(windowWidth - SETTINGS_HORIZONTAL_PADDING * 2, 0);
  const {
    accountGroups,
    accounts,
    settings,
    currentMonthWage,
    deleteAccountGroup,
    deleteTransactionsBulk,
    getDisplayValueForTransaction,
    getTrueHourlyRateForDate,
    getTransactionsByAccount,
    reorderAccounts,
    reorderAccountGroups,
    renameAccountGroup,
    updateTransactionsBulk,
  } = useApp();
  const { accountBalances: liveAccountBalances, transactions: liveTransactions } =
    useTransactions();
  // While the accounts tab is hidden (tabs stay mounted), hold the last-seen
  // snapshots so every transaction write doesn't recompute balances/credit
  // summaries in the background; they catch up once when re-activated.
  const accountBalances = useValueWhileTabVisible(liveAccountBalances);
  const transactions = useValueWhileTabVisible(liveTransactions);
  const { checkLimit } = useProGate();

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(accountId);
  const [internalHideBalances, setInternalHideBalances] = useState(false);
  // Controlled when the host passes `hideBalances`; otherwise self-managed.
  const hideAccountBalances = hideBalances ?? internalHideBalances;
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  // Track collapsed (not expanded) groups so cards stay expanded by default,
  // including newly created ones.
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set());
  const [addTransactionAccountId, setAddTransactionAccountId] = useState<string | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithRelations | null>(
    null,
  );
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [bulkDate, setBulkDate] = useState(() => formatDateInput(new Date()));
  const [bulkDateTouched, setBulkDateTouched] = useState(false);
  const [bulkDateModalVisible, setBulkDateModalVisible] = useState(false);
  const [bulkNote, setBulkNote] = useState('');
  const [bulkNoteTouched, setBulkNoteTouched] = useState(false);
  const accountsOverviewScrollRef = useRef<ScrollView | null>(null);
  const managementScrollRef = useAnimatedRef<React.ElementRef<typeof Animated.ScrollView>>();
  const transactionDisplaySettings = useMemo(
    () => ({
      currencySymbol: settings.currencySymbol,
      displayMode: settings.displayMode,
      workdayDisplayEnabled: settings.workdayDisplayEnabled,
      workingHoursPerDay: settings.workingHoursPerDay,
    }),
    [
      settings.currencySymbol,
      settings.displayMode,
      settings.workdayDisplayEnabled,
      settings.workingHoursPerDay,
    ],
  );
  const activeAccountId = accountId ?? selectedAccountId;
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const closeSelectedAccount = useCallback(() => {
    if (accountId && onBack) {
      onBack();
      return;
    }
    setSelectedAccountId(null);
  }, [accountId, onBack]);

  const selectedAccount = activeAccountId ? (accountById.get(activeAccountId) ?? null) : null;
  const edgeSwipeBackHandler = useCallback(() => {
    if (addTransactionAccountId) {
      setAddTransactionAccountId(null);
      return;
    }
    if (selectedTransaction) {
      setSelectedTransaction(null);
      return;
    }
    if (!managementOnly && activeAccountId && selectedAccount) {
      closeSelectedAccount();
      return;
    }
    onBack?.();
  }, [
    activeAccountId,
    addTransactionAccountId,
    closeSelectedAccount,
    managementOnly,
    onBack,
    selectedAccount,
    selectedTransaction,
  ]);
  const withBackGesture = useCallback(
    (children: React.ReactNode) => {
      if (useNativeBackGesture) return <>{children}</>;
      return (
        <EdgeSwipeBackContainer onBack={edgeSwipeBackHandler}>{children}</EdgeSwipeBackContainer>
      );
    },
    [edgeSwipeBackHandler, useNativeBackGesture],
  );
  const selectedAccountTransactions = useMemo(
    () => (activeAccountId ? getTransactionsByAccount(activeAccountId) : []),
    // getTransactionsByAccount is identity-stable; `transactions` signals the data changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeAccountId, getTransactionsByAccount, transactions],
  );
  const activeLocale = settings.locale ?? I18n.locale ?? 'en';
  const pagerPageWidth = Math.max(1, windowWidth);
  const pagerPageStyle = useMemo(() => ({ width: pagerPageWidth }), [pagerPageWidth]);
  const pagerListRef = useRef<FlatList<number> | null>(null);
  const selectedAccountStatementDay =
    selectedAccount?.type === 'credit'
      ? (selectedAccount.creditStatementDay ?? DEFAULT_CREDIT_STATEMENT_DAY)
      : null;
  const usesStatementPeriods = selectedAccountStatementDay != null;
  const pagerAnchorDate = useMemo(() => {
    const now = new Date();
    if (usesStatementPeriods && selectedAccountStatementDay != null) {
      return getCurrentStatementCycleStart(selectedAccountStatementDay, now);
    }
    return financialMonthAnchorForToday(settings.firstDayOfMonth);
  }, [selectedAccountStatementDay, usesStatementPeriods, settings.firstDayOfMonth]);
  const {
    activeIndex: pagerActiveIndex,
    activeIndexRef: pagerActiveIndexRef,
    slots: pagerSlots,
    handleMomentumEnd: handlePagerMomentumEnd,
    handleScrollEndDrag: handlePagerScrollEndDrag,
    handleScrollToIndexFailed: handlePagerScrollToIndexFailed,
    getItemLayout: getPagerItemLayout,
    keyExtractor: pagerKeyExtractor,
    scrollToRelative: scrollToRelativePage,
    setActiveIndex: setPagerActiveIndex,
  } = useMonthPager({
    listRef: pagerListRef,
    pageWidth: pagerPageWidth,
    totalSlots: MONTH_PAGER_TOTAL_SLOTS,
    initialIndex: MONTH_PAGER_CENTER_INDEX,
  });
  const getPagerScrollToTopRef = useIndexedScrollToTopRefs();
  const accountPeriodTransactionsMap = useMemo(() => {
    if (!selectedAccount) return new Map<string, TransactionWithRelations[]>();
    return bucketTransactionsByAccountPeriod(
      selectedAccountTransactions,
      selectedAccountStatementDay,
      settings.firstDayOfMonth,
    );
  }, [
    selectedAccount,
    selectedAccountStatementDay,
    selectedAccountTransactions,
    settings.firstDayOfMonth,
  ]);
  const activePagerOffset = pagerActiveIndex - MONTH_PAGER_CENTER_INDEX;
  const activePagerPeriod = useMemo(() => {
    if (usesStatementPeriods && selectedAccountStatementDay != null) {
      const period = statementPeriodFromAnchor(
        pagerAnchorDate,
        selectedAccountStatementDay,
        activePagerOffset,
      );
      const endInclusive = new Date(period.end.getTime() - DAY_IN_MS);
      return {
        key: period.key,
        label: formatStatementRangeSublabel(period.start, endInclusive, activeLocale),
      };
    }
    const monthDate = addFinancialMonths(
      pagerAnchorDate,
      activePagerOffset,
      settings.firstDayOfMonth,
    );
    return {
      key: financialMonthKeyForDate(monthDate, settings.firstDayOfMonth),
      label: formatMonthYearLabel(monthDate, activeLocale),
    };
  }, [
    activeLocale,
    activePagerOffset,
    pagerAnchorDate,
    selectedAccountStatementDay,
    settings.firstDayOfMonth,
    usesStatementPeriods,
  ]);
  const activePeriodCreditTotals = useMemo(() => {
    if (!selectedAccount || selectedAccount.type !== 'credit') return null;
    const periodTransactions = accountPeriodTransactionsMap.get(activePagerPeriod.key);
    if (!periodTransactions) return { debit: 0, credit: 0 };
    let debit = 0;
    let credit = 0;
    periodTransactions.forEach((tx) => {
      const delta = creditDeltaForAccountTransaction(tx, selectedAccount.id);
      if (delta > 0) debit += delta;
      else if (delta < 0) credit += -delta;
    });
    return { debit, credit };
  }, [accountPeriodTransactionsMap, activePagerPeriod.key, selectedAccount]);
  const isSelectionMode = selectedTransactionIds.length > 0;
  const selectedTransactionCount = selectedTransactionIds.length;
  const selectedTransactionTotal = useMemo(() => {
    if (selectedTransactionIds.length === 0) return 0;
    const selectedIdSet = new Set(selectedTransactionIds);
    let total = 0;
    selectedAccountTransactions.forEach((transaction) => {
      if (!selectedIdSet.has(transaction.id)) return;
      // Rendered with the reporting currency symbol below, and an account can
      // hold foreign-currency rows, so read the frozen reporting snapshot.
      total += transaction.reportingAmount ?? transaction.amount;
    });
    return total;
  }, [selectedAccountTransactions, selectedTransactionIds]);
  const normalizedSelectedTransactionTotal = useMemo(
    () => normalizeMoneyAmount(selectedTransactionTotal),
    [selectedTransactionTotal],
  );
  const selectedTransactionTotalLabel = useMemo(
    () =>
      formatAmount(
        Math.abs(normalizedSelectedTransactionTotal),
        {
          currencySymbol: settings.currencySymbol,
          displayMode: 'money',
        },
        { showSign: false, trueHourlyRate: 0 },
      ),
    [normalizedSelectedTransactionTotal, settings.currencySymbol],
  );
  const hasBulkChanges = bulkDateTouched || bulkNoteTouched;
  const trueHourlyRate = currentMonthWage?.trueHourlyRate ?? 0;
  const balanceToggleLabel = hideAccountBalances
    ? I18n.t('accounts.show_balances')
    : I18n.t('accounts.hide_balances');

  const handleToggleAccountBalances = useCallback(() => {
    if (onToggleBalances) {
      onToggleBalances();
      return;
    }
    setInternalHideBalances((previous) => !previous);
  }, [onToggleBalances]);

  const formatVisibleBalance = useCallback(
    (amount: number, currencyCode?: string) => {
      if (hideAccountBalances) return MASKED_BALANCE_VALUE;
      return formatAmount(normalizeMoneyAmount(amount), settings, {
        showSign: false,
        trueHourlyRate,
        currencyCode,
      });
    },
    [hideAccountBalances, settings, trueHourlyRate],
  );
  const renderVisibleBalanceNode = useCallback(
    (
      amount: number,
      options: {
        variant?: React.ComponentProps<typeof Text>['variant'];
        tone?: React.ComponentProps<typeof Text>['tone'];
        textClassName?: string;
        iconColor?: string;
        currencyCode?: string;
      } = {},
    ) => {
      const {
        variant = 'caption',
        tone = 'default',
        textClassName,
        iconColor,
        currencyCode,
      } = options;
      const label = formatVisibleBalance(amount, currencyCode);
      if (hideAccountBalances || settings.displayMode !== 'time') {
        return (
          <Text variant={variant} tone={tone} className={textClassName}>
            {label}
          </Text>
        );
      }
      return (
        <TimeValueInline
          value={label}
          variant={variant}
          tone={tone}
          textClassName={textClassName}
          iconColor={iconColor}
        />
      );
    },
    [formatVisibleBalance, hideAccountBalances, settings.displayMode],
  );

  const renderBalanceToggleButton = useCallback(
    () => (
      <Button
        size="icon"
        variant="secondary"
        className="h-10 w-10 rounded-full"
        accessibilityLabel={balanceToggleLabel}
        onPress={handleToggleAccountBalances}
      >
        {hideAccountBalances ? (
          <ClayIcon name="ui/eye-off" size={24} flatSize={18} />
        ) : (
          <ClayIcon name="ui/eye" size={24} flatSize={18} />
        )}
      </Button>
    ),
    [balanceToggleLabel, handleToggleAccountBalances, hideAccountBalances, themeColors.textMuted],
  );

  const handleToggleGroup = useCallback((cardId: string) => {
    void triggerHaptic('selection');
    setCollapsedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (accountId !== null) {
      setSelectedAccountId(accountId);
    }
  }, [accountId]);

  useEffect(() => {
    if (activeAccountId && !selectedAccount) {
      if (accountId && onBack) {
        onBack();
        return;
      }
      setSelectedAccountId(null);
    }
  }, [accountId, activeAccountId, onBack, selectedAccount]);

  useEffect(() => {
    setSelectedTransaction(null);
    setSelectedTransactionIds([]);
    setShowBulkUpdate(false);
  }, [activeAccountId]);

  useEffect(() => {
    if (!activeAccountId) return;
    if (pagerActiveIndexRef.current === MONTH_PAGER_CENTER_INDEX) return;
    setPagerActiveIndex(MONTH_PAGER_CENTER_INDEX);
    const frame = requestAnimationFrame(() => {
      pagerListRef.current?.scrollToIndex({
        index: MONTH_PAGER_CENTER_INDEX,
        animated: false,
      });
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId]);

  useEffect(() => {
    if (managementOnly || !activeAccountId || selectedTransactionIds.length === 0) return;
    const availableIds = new Set(selectedAccountTransactions.map((transaction) => transaction.id));
    setSelectedTransactionIds((previous) => {
      const next = previous.filter((id) => availableIds.has(id));
      return next.length === previous.length ? previous : next;
    });
  }, [activeAccountId, managementOnly, selectedAccountTransactions, selectedTransactionIds.length]);

  useEffect(() => {
    if (isSelectionMode) {
      setSelectedTransaction(null);
      return;
    }
    setShowBulkUpdate(false);
  }, [isSelectionMode]);

  useEffect(() => {
    if (resetToRootToken <= 0) return;
    setSelectedAccountId(accountId ?? null);
    setEditingGroupId(null);
    setEditingGroupName('');
  }, [accountId, resetToRootToken]);

  useEffect(() => {
    if (scrollToTopToken <= 0) return;
    const frame = requestAnimationFrame(() => {
      if (!managementOnly && activeAccountId && selectedAccount) {
        const currentIndex = pagerActiveIndexRef.current;
        pagerListRef.current?.scrollToIndex({ index: currentIndex, animated: false });
        getPagerScrollToTopRef(currentIndex).current?.();
        return;
      }
      if (managementOnly) {
        managementScrollRef.current?.scrollTo({ y: 0, animated: false });
        return;
      }
      accountsOverviewScrollRef.current?.scrollTo({ y: 0, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    getPagerScrollToTopRef,
    managementScrollRef,
    managementOnly,
    pagerActiveIndexRef,
    pagerListRef,
    scrollToTopToken,
    activeAccountId,
    selectedAccount,
  ]);

  const balanceMap = useMemo(() => {
    return new Map(accountBalances.map((item) => [item.accountId, item.balance]));
  }, [accountBalances]);

  // Balances converted to the reporting currency, for cross-currency totals.
  // Falls back to the native balance when no rate is available.
  const convertedBalanceMap = useMemo(() => {
    return new Map(
      accountBalances.map((item) => [item.accountId, item.convertedBalance ?? item.balance]),
    );
  }, [accountBalances]);

  const loanSummaryByAccountId = useMemo(() => {
    if (managementOnly) return new Map<string, LoanCardSummary>();
    const loanAccounts = accounts.filter((account) => account.type === 'loan');
    if (loanAccounts.length === 0) return new Map<string, LoanCardSummary>();

    const now = new Date();
    const todayIso = dayKeyFromDateLocal(now);
    const next = new Map<string, LoanCardSummary>();
    loanAccounts.forEach((account) => {
      const balance = balanceMap.get(account.id) ?? account.startingBalance;
      const progress = computeLoanProgress({
        balance,
        originalPrincipal: account.loanOriginalPrincipal ?? account.startingBalance,
        monthlyPayment: account.loanMonthlyPayment ?? 0,
        paymentDay: account.loanPaymentDay ?? null,
        annualRatePercent: account.loanInterestRate ?? null,
        termMonths: account.loanTermMonths ?? null,
        // A loan saved before the total had a column falls back to the
        // instalment x term it was stored as, which is what the editor shows
        // for it too, so the card and the form never disagree.
        totalRepayable:
          account.loanTotalRepayable ??
          (account.loanMonthlyPayment != null && account.loanTermMonths != null
            ? account.loanMonthlyPayment * account.loanTermMonths
            : null),
        todayIso,
      });
      next.set(account.id, {
        progress,
        overdueSince: progress.isPaidOff
          ? null
          : overdueSince(account, getTransactionsByAccount(account.id), now),
      });
    });
    return next;
    // getTransactionsByAccount is identity-stable; `transactions` signals the data changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, balanceMap, getTransactionsByAccount, managementOnly, transactions]);

  /**
   * What a loan reads as on this page: everything still to hand over, interest
   * included, rather than the principal outstanding.
   *
   * Scoped to this page on purpose. A borrower checks the accounts list against
   * a statement, and every figure on a statement is gross, so the headline, the
   * group subtotal and the debt readout here all have to be the same kind of
   * number as the card's own "Left to pay" tile. Net worth elsewhere (insights,
   * asset history, the widgets) keeps the principal, because interest that has
   * not been charged yet is not money owed today.
   */
  const pageBalanceMap = useMemo(() => {
    if (loanSummaryByAccountId.size === 0) return balanceMap;
    const next = new Map(balanceMap);
    loanSummaryByAccountId.forEach((summary, accountId) => {
      next.set(accountId, summary.progress.leftToPay);
    });
    return next;
  }, [balanceMap, loanSummaryByAccountId]);

  const pageConvertedBalanceMap = useMemo(() => {
    if (loanSummaryByAccountId.size === 0) return convertedBalanceMap;
    const next = new Map(convertedBalanceMap);
    loanSummaryByAccountId.forEach((summary, accountId) => {
      const native = balanceMap.get(accountId);
      const converted = convertedBalanceMap.get(accountId);
      // Carried across at whatever rate the balance itself was converted at, so
      // a foreign-currency loan lands in the reporting currency like the rest.
      // A settled loan has nothing to scale and nothing to convert.
      const rate = native != null && native !== 0 && converted != null ? converted / native : 1;
      next.set(accountId, summary.progress.leftToPay * rate);
    });
    return next;
  }, [balanceMap, convertedBalanceMap, loanSummaryByAccountId]);

  const { total, assetsTotal, debtTotal } = useMemo(() => {
    if (managementOnly) return { total: 0, assetsTotal: 0, debtTotal: 0 };
    let assets = 0;
    let debt = 0;
    for (const account of accounts) {
      if (!account.includeInTotals) continue;
      const balance = pageConvertedBalanceMap.get(account.id) ?? account.startingBalance;
      if (isLiabilityAccountType(account.type)) {
        debt += balance;
      } else {
        assets += balance;
      }
    }
    return {
      total: normalizeMoneyAmount(assets - debt),
      assetsTotal: normalizeMoneyAmount(assets),
      debtTotal: normalizeMoneyAmount(debt),
    };
  }, [accounts, managementOnly, pageConvertedBalanceMap]);
  const creditSummaryByAccountId = useMemo(() => {
    if (managementOnly) return new Map<string, CreditSummary>();
    const creditAccounts = accounts.filter((account) => account.type === 'credit');
    if (creditAccounts.length === 0) return new Map<string, CreditSummary>();

    const now = new Date();
    const next = new Map<string, CreditSummary>();
    creditAccounts.forEach((account) => {
      const accountTxns = getTransactionsByAccount(account.id);
      const balance = balanceMap.get(account.id) ?? account.startingBalance;
      next.set(account.id, computeCreditCycleSummary(account, accountTxns, balance, now));
    });
    return next;
    // getTransactionsByAccount is identity-stable; `transactions` signals the data changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, balanceMap, getTransactionsByAccount, managementOnly, transactions]);
  // The stack shows live accounts; archived loans sit behind its own
  // "show archived" toggle so a settled loan stops taking up room without
  // becoming unreachable.
  const { stackAccounts, archivedAccounts } = useMemo(() => {
    const live: Account[] = [];
    const archived: Account[] = [];
    for (const account of accounts) {
      if (account.type === 'goal') continue;
      if (account.type === 'loan' && account.loanArchivedAt != null) archived.push(account);
      else live.push(account);
    }
    return { stackAccounts: live, archivedAccounts: archived };
  }, [accounts]);

  const { accountGroupSections, groupCards, staticCards } = useMemo(() => {
    const knownNames = new Set<string>();
    accountGroups.forEach((group) => {
      knownNames.add(group.name);
    });

    const buckets = new Map<string, Account[]>();
    // Savings goals live on their own rail, never inside the bank-card groups.
    // Archived loans DO belong here: this list feeds the management screen,
    // which is where a loan is brought back out of the archive.
    accounts.forEach((account) => {
      if (account.type === 'goal') return;
      const groupName = account.accountGroup?.trim() ?? '';
      const bucketKey = groupName || '__ungrouped__';
      const bucket = buckets.get(bucketKey);
      if (bucket) {
        bucket.push(account);
      } else {
        buckets.set(bucketKey, [account]);
      }
    });
    const ungrouped = buckets.get('__ungrouped__');

    // Sections drive global account reordering (non-empty only, in display order).
    const sections: AccountGroupSection[] = [];
    for (const group of accountGroups) {
      const list = buckets.get(group.name);
      if (list && list.length > 0) {
        sections.push({ id: group.id, label: group.name, accounts: list });
      }
    }
    for (const [key, list] of buckets) {
      if (key === '__ungrouped__' || knownNames.has(key)) continue;
      sections.push({ id: `group-${key}`, label: key, accounts: list });
    }
    if (ungrouped && ungrouped.length > 0) {
      sections.push({
        id: 'group-ungrouped',
        label: String(I18n.t('common.ungrouped')),
        accounts: ungrouped,
      });
    }

    // Parent cards for the collapsible UI. Real groups (draggable/editable) are
    // shown first — including empty ones — then unknown-name and ungrouped
    // buckets as static cards.
    const groups: GroupCard[] = accountGroups.map((group) => ({
      kind: 'group',
      id: group.id,
      group,
      label: group.name,
      accounts: buckets.get(group.name) ?? [],
    }));
    const statics: GroupCard[] = [];
    for (const [key, list] of buckets) {
      if (key === '__ungrouped__' || knownNames.has(key)) continue;
      statics.push({ kind: 'named', id: `group-${key}`, group: null, label: key, accounts: list });
    }
    if (ungrouped && ungrouped.length > 0) {
      statics.push({
        kind: 'ungrouped',
        id: 'group-ungrouped',
        group: null,
        label: String(I18n.t('common.ungrouped')),
        accounts: ungrouped,
      });
    }

    return { accountGroupSections: sections, groupCards: groups, staticCards: statics };
  }, [accounts, accountGroups]);
  const buildReorderedAccountIds = useCallback(
    (sectionId: string, orderedAccounts: Account[]) => {
      const nextIds: string[] = [];
      accountGroupSections.forEach((section) => {
        const sectionAccounts = section.id === sectionId ? orderedAccounts : section.accounts;
        sectionAccounts.forEach((account) => {
          nextIds.push(account.id);
        });
      });
      return nextIds;
    },
    [accountGroupSections],
  );
  const handleReorderAccountsInSection = useCallback(
    (sectionId: string, orderedAccounts: Account[]) => {
      reorderAccounts(buildReorderedAccountIds(sectionId, orderedAccounts));
    },
    [buildReorderedAccountIds, reorderAccounts],
  );

  const startCreateGroup = useCallback(() => {
    setEditingGroupId(null);
    setEditingGroupName('');
    onOpenCreateGroup?.();
  }, [onOpenCreateGroup]);
  const startEditGroup = useCallback((group: AccountGroup) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  }, []);
  const cancelEditGroup = useCallback(() => {
    setEditingGroupId(null);
    setEditingGroupName('');
  }, []);
  const saveEditedGroup = useCallback(
    (groupId: string) => {
      const normalized = editingGroupName.trim();
      if (!normalized) return;
      renameAccountGroup(groupId, normalized);
      setEditingGroupId(null);
      setEditingGroupName('');
    },
    [editingGroupName, renameAccountGroup],
  );
  const handleDeleteGroup = useCallback(
    (group: AccountGroup) => {
      Alert.alert(I18n.t('accounts.delete_group_title'), I18n.t('accounts.delete_group_message'), [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.delete'),
          style: 'destructive',
          onPress: () => deleteAccountGroup(group.id),
        },
      ]);
    },
    [deleteAccountGroup],
  );
  const clearSelection = useCallback(() => {
    setSelectedTransactionIds([]);
  }, []);
  const toggleTransactionSelection = useCallback((transactionId: string) => {
    setSelectedTransactionIds((previous) => {
      const index = previous.indexOf(transactionId);
      if (index === -1) return [...previous, transactionId];
      if (previous.length === 1) return [];
      const next = [...previous];
      next.splice(index, 1);
      return next;
    });
  }, []);
  const handleTransactionPress = useCallback(
    (transaction: TransactionWithRelations) => {
      if (isSelectionMode) {
        toggleTransactionSelection(transaction.id);
        return;
      }
      if (onOpenTransaction) {
        onOpenTransaction(transaction);
        return;
      }
      setSelectedTransaction(transaction);
    },
    [isSelectionMode, onOpenTransaction, toggleTransactionSelection],
  );
  const handleTransactionSplitBadgePress = useCallback(
    (transaction: TransactionWithRelations) => {
      if (isSelectionMode) {
        toggleTransactionSelection(transaction.id);
        return;
      }
      if (onOpenTransactionSplitBadge) {
        onOpenTransactionSplitBadge(transaction);
        return;
      }
      setSelectedTransaction(transaction);
    },
    [isSelectionMode, onOpenTransactionSplitBadge, toggleTransactionSelection],
  );
  const handleTransactionLongPress = useCallback(
    (transaction: TransactionWithRelations) => {
      if (isSelectionMode) {
        toggleTransactionSelection(transaction.id);
        return;
      }
      setSelectedTransactionIds([transaction.id]);
    },
    [isSelectionMode, toggleTransactionSelection],
  );
  const handleOpenBulkUpdate = useCallback(() => {
    if (selectedTransactionCount === 0) return;
    setBulkDate(formatDateInput(new Date()));
    setBulkDateTouched(false);
    setBulkNote('');
    setBulkNoteTouched(false);
    setShowBulkUpdate(true);
  }, [selectedTransactionCount]);
  const handleCloseBulkUpdate = useCallback(() => {
    setShowBulkUpdate(false);
  }, []);
  const handleApplyBulkUpdate = useCallback(() => {
    if (selectedTransactionIds.length === 0) return;
    if (!hasBulkChanges) return;

    const updates: { date?: string; note?: string | null } = {};
    if (bulkDateTouched) updates.date = bulkDate;
    if (bulkNoteTouched) {
      const normalizedNote = bulkNote.trim();
      updates.note = normalizedNote.length > 0 ? normalizedNote : null;
    }
    if (Object.keys(updates).length === 0) return;

    updateTransactionsBulk(
      selectedTransactionIds.map((transactionId) => ({ id: transactionId, input: updates })),
    );
    setShowBulkUpdate(false);
    setSelectedTransactionIds([]);
  }, [
    bulkDate,
    bulkDateTouched,
    bulkNote,
    bulkNoteTouched,
    hasBulkChanges,
    selectedTransactionIds,
    updateTransactionsBulk,
  ]);
  const handleDeleteSelectedTransactions = useCallback(() => {
    if (selectedTransactionIds.length === 0) return;
    const idsToDelete = [...selectedTransactionIds];
    Alert.alert(
      I18n.t('transactions.selection.delete_title'),
      I18n.t('transactions.selection.delete_message', { count: idsToDelete.length }),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteTransactionsBulk(idsToDelete);
            setShowBulkUpdate(false);
            setSelectedTransactionIds([]);
          },
        },
      ],
    );
  }, [deleteTransactionsBulk, selectedTransactionIds]);
  const handleAccountManagementPress = useCallback(
    (account: Account) => {
      void triggerHaptic('selection');
      onOpenAccountEditor?.({ accountId: account.id });
    },
    [onOpenAccountEditor],
  );
  const handleAddAccountToGroup = useCallback(
    (card: GroupCard) => {
      // Goals and loans have their own Pro caps; they must not eat the free
      // accounts quota (nor vice versa).
      const bankAccountCount = accounts.filter(
        (a) => a.type !== 'goal' && a.type !== 'loan',
      ).length;
      if (!checkLimit('accounts', bankAccountCount)) return;
      void triggerHaptic('selection');
      onOpenAccountEditor?.({
        presetGroupName: card.kind === 'ungrouped' ? undefined : card.label,
      });
    },
    [accounts, checkLimit, onOpenAccountEditor],
  );
  const handleAddTransactionForAccount = useCallback(
    (targetAccountId: string) => {
      if (onOpenAddTransaction) {
        onOpenAddTransaction(targetAccountId);
        return;
      }
      setAddTransactionAccountId(targetAccountId);
    },
    [onOpenAddTransaction],
  );
  const creditLabel = String(I18n.t('accounts.credit'));

  const selectedAccountIsCredit = selectedAccount?.type === 'credit';
  const selectedLoanSummary =
    selectedAccount?.type === 'loan'
      ? (loanSummaryByAccountId.get(selectedAccount.id) ?? null)
      : null;
  // A settled loan drops its pay button, so it drops the extra clearance too.
  const showsPayAction =
    selectedAccountIsCredit ||
    (selectedLoanSummary != null && !selectedLoanSummary.progress.isPaidOff);
  const detailListBottomPadding =
    SETTINGS_FORM_BOTTOM_PADDING +
    safeAreaInsets.bottom +
    spacing.sm +
    FLOATING_ACTION_SIZE +
    (showsPayAction ? FLOATING_ACTION_SIZE + FLOATING_ACTION_GAP : 0);
  const selectedAccountIdForPager = selectedAccount?.id ?? '';
  const renderPagerPage = useCallback(
    ({ item }: { item: number }) => {
      const offset = item - MONTH_PAGER_CENTER_INDEX;
      const periodKey =
        usesStatementPeriods && selectedAccountStatementDay != null
          ? statementPeriodFromAnchor(pagerAnchorDate, selectedAccountStatementDay, offset).key
          : financialMonthKeyForDate(
              addFinancialMonths(pagerAnchorDate, offset, settings.firstDayOfMonth),
              settings.firstDayOfMonth,
            );
      const pageTransactions =
        accountPeriodTransactionsMap.get(periodKey) ?? EMPTY_PERIOD_TRANSACTIONS;
      return (
        <View style={pagerPageStyle} className="flex-1 bg-background">
          <ActivityTransactionList
            transactions={pageTransactions}
            locale={activeLocale}
            displaySettings={transactionDisplaySettings}
            subtotalCurrencyCode={selectedAccount?.currency ?? null}
            subtotalAccountId={selectedAccount?.id ?? null}
            getDisplayValueForTransaction={getDisplayValueForTransaction}
            getTrueHourlyRateForDate={getTrueHourlyRateForDate}
            onTransactionPress={handleTransactionPress}
            onTransactionLongPress={handleTransactionLongPress}
            onTransactionSplitBadgePress={handleTransactionSplitBadgePress}
            selectedTransactionIds={selectedTransactionIds}
            selectionMode={isSelectionMode}
            emptyTitle={I18n.t(
              usesStatementPeriods
                ? 'accounts.empty_statement_title'
                : 'accounts.empty_period_title',
            )}
            emptyMessage={I18n.t(
              usesStatementPeriods
                ? 'accounts.empty_statement_message'
                : 'accounts.empty_period_message',
            )}
            contentPaddingBottom={detailListBottomPadding}
            contentPaddingHorizontal={SETTINGS_HORIZONTAL_PADDING}
            contentPaddingTop={0}
            disableItemAnimations
            compactItems
            listKey={`${selectedAccountIdForPager}-${periodKey}`}
            scrollToTopRef={getPagerScrollToTopRef(item)}
          />
        </View>
      );
    },
    [
      accountPeriodTransactionsMap,
      activeLocale,
      detailListBottomPadding,
      getDisplayValueForTransaction,
      getPagerScrollToTopRef,
      getTrueHourlyRateForDate,
      handleTransactionLongPress,
      handleTransactionPress,
      handleTransactionSplitBadgePress,
      isSelectionMode,
      pagerAnchorDate,
      pagerPageStyle,
      selectedAccount?.currency,
      selectedAccount?.id,
      selectedAccountIdForPager,
      selectedAccountStatementDay,
      selectedTransactionIds,
      settings.firstDayOfMonth,
      transactionDisplaySettings,
      usesStatementPeriods,
    ],
  );

  if (addTransactionAccountId) {
    return withBackGesture(
      <AddTransactionScreen
        onClose={() => setAddTransactionAccountId(null)}
        initialAccountId={addTransactionAccountId}
      />,
    );
  }

  if (selectedTransaction) {
    return withBackGesture(
      <EditTransactionScreen
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
      />,
    );
  }

  if (!managementOnly && activeAccountId && selectedAccount) {
    const account = selectedAccount;

    const isCredit = account.type === 'credit';
    const loanSummaryNode = selectedLoanSummary ? (
      <>
        <View className="flex-1 rounded-[18px] border border-border/40 bg-secondary/25 px-3 py-2.5">
          <Text variant="label" className="text-[10px]" tone="muted">
            {I18n.t('accounts.loan.left_to_pay_label')}
          </Text>
          <View className="mt-1">
            {/* Everything still to hand over, interest included; the balance
                owed on its own is what the account's own balance already says. */}
            {renderVisibleBalanceNode(selectedLoanSummary.progress.leftToPay, {
              variant: 'mono',
              currencyCode: account.currency,
            })}
          </View>
        </View>
        <View className="flex-1 rounded-[18px] border border-success/20 bg-success/8 px-3 py-2.5">
          <Text variant="label" className="text-[10px] text-success">
            {I18n.t('accounts.loan.paid_so_far_label')}
          </Text>
          <View className="mt-1">
            {/* Cash handed over, to pair with the figure beside it. Both are
                what the borrower's statement counts, so they add up to what
                the loan costs; the principal repaid would not. */}
            {renderVisibleBalanceNode(
              selectedLoanSummary.progress.paidSoFar ?? selectedLoanSummary.progress.paid,
              {
                variant: 'mono',
                currencyCode: account.currency,
              },
            )}
          </View>
        </View>
      </>
    ) : undefined;
    const creditTotalsSummaryNode = activePeriodCreditTotals ? (
      <>
        <View className="flex-1 rounded-[18px] border border-destructive/15 bg-destructive/6 px-3 py-2.5">
          <View className="flex-row items-center gap-1.5">
            <View className="h-1.5 w-1.5 rounded-full bg-destructive" />
            <Text variant="label" className="text-[10px] text-destructive">
              {I18n.t('accounts.type_debit')}
            </Text>
          </View>
          <View className="mt-1">
            {renderVisibleBalanceNode(activePeriodCreditTotals.debit, {
              variant: 'mono',
              // Statement totals are the card's own money, like its balance.
              currencyCode: account.currency,
            })}
          </View>
        </View>
        <View className="flex-1 rounded-[18px] border border-success/20 bg-success/8 px-3 py-2.5">
          <View className="flex-row items-center gap-1.5">
            <View className="h-1.5 w-1.5 rounded-full bg-success" />
            <Text variant="label" className="text-[10px] text-success">
              {I18n.t('accounts.type_credit')}
            </Text>
          </View>
          <View className="mt-1">
            {renderVisibleBalanceNode(activePeriodCreditTotals.credit, {
              variant: 'mono',
              currencyCode: account.currency,
            })}
          </View>
        </View>
      </>
    ) : undefined;
    const detailSummaryNode = loanSummaryNode ?? creditTotalsSummaryNode;
    return withBackGesture(
      <SettingsPageLayout edges={safeAreaEdges}>
        <View className="flex-1">
          <View style={styles.headerContainer}>
            <SettingsHeader
              className="px-0 pt-5 pb-3"
              onBack={isSelectionMode ? clearSelection : closeSelectedAccount}
              title={account.name}
              rightAccessory={
                // Goals reached via "View all activity" edit from GoalDetail's
                // own pencil, not the bank account editor.
                !isSelectionMode && account.type !== 'goal' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 px-3"
                    onPress={() => {
                      onOpenAccountEditor?.({ accountId: account.id });
                    }}
                  >
                    <Text>{I18n.t('accounts.edit_account')}</Text>
                  </Button>
                ) : null
              }
            />
          </View>
          {isSelectionMode ? (
            <View className="bg-background pb-1.5 pt-1">
              <TabletContentContainer>
                <View className="px-5 pt-1.5 gap-2.5">
                  <View className="rounded-pill bg-secondary/40 px-1.5 py-1.5 flex-row items-center justify-between gap-1.5">
                    <Pressable
                      onPress={() => {
                        void triggerHaptic('selection');
                        clearSelection();
                      }}
                      className="h-9 px-3 rounded-full bg-card shadow-soft active:scale-95 items-center justify-center"
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('common.cancel')}
                    >
                      <Text variant="caption" tone="muted">
                        {I18n.t('common.cancel')}
                      </Text>
                    </Pressable>

                    <View className="flex-1 items-center px-1">
                      <View className="flex-row flex-wrap items-center justify-center gap-1.5">
                        <Text variant="caption" className="text-foreground">
                          {I18n.t('transactions.selection.selected_count', {
                            count: selectedTransactionCount,
                          })}
                        </Text>
                        <View className="rounded-full border border-border/35 bg-card px-2 py-[3px]">
                          <Text variant="label" className="text-foreground">
                            {selectedTransactionTotalLabel}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View className="flex-row items-center gap-1.5">
                      <Pressable
                        onPress={handleOpenBulkUpdate}
                        className="h-9 w-9 rounded-full bg-card shadow-soft active:scale-95 items-center justify-center"
                        accessibilityRole="button"
                        accessibilityLabel={I18n.t('transactions.selection.update')}
                        hitSlop={8}
                      >
                        <Pencil size={14} color={themeColors.primary} />
                      </Pressable>
                      <Pressable
                        onPress={handleDeleteSelectedTransactions}
                        className="h-9 w-9 rounded-full bg-card shadow-soft active:scale-95 items-center justify-center"
                        accessibilityRole="button"
                        accessibilityLabel={I18n.t('common.delete')}
                        hitSlop={8}
                      >
                        <Trash2 size={14} color={themeColors.coral} />
                      </Pressable>
                    </View>
                  </View>
                  {detailSummaryNode ? (
                    <View className="flex-row flex-wrap gap-2">{detailSummaryNode}</View>
                  ) : null}
                </View>
              </TabletContentContainer>
            </View>
          ) : (
            <MonthControlsHeader
              monthLabel={activePagerPeriod.label}
              onPrevMonth={() => scrollToRelativePage(-1)}
              onNextMonth={() => scrollToRelativePage(1)}
              hideTitleRow
              summary={detailSummaryNode}
            />
          )}
          <View className="flex-1 overflow-hidden bg-background">
            <FlatList
              ref={pagerListRef}
              data={pagerSlots}
              keyExtractor={pagerKeyExtractor}
              style={styles.flexContainer}
              {...MONTH_PAGER_LIST_CONFIG}
              renderItem={renderPagerPage}
              initialScrollIndex={MONTH_PAGER_CENTER_INDEX}
              getItemLayout={getPagerItemLayout}
              onScrollEndDrag={handlePagerScrollEndDrag}
              onMomentumScrollEnd={handlePagerMomentumEnd}
              onScrollToIndexFailed={handlePagerScrollToIndexFailed}
            />
          </View>
          {!isSelectionMode ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.floatingAddButtonContainer,
                { bottom: safeAreaInsets.bottom + spacing.sm },
              ]}
            >
              <View style={styles.floatingButtonStack}>
                {showsPayAction ? (
                  <Pressable
                    onPress={() => {
                      void triggerHaptic('medium');
                      onOpenPayCreditCard?.(account.id);
                    }}
                    style={[styles.floatingAddButton, { backgroundColor: themeColors.accent }]}
                    accessibilityRole="button"
                    accessibilityLabel={String(
                      I18n.t(isCredit ? 'accounts.pay_this_card' : 'accounts.loan.make_payment'),
                    )}
                  >
                    <Text variant="bodyStrong" style={{ color: '#fff', fontSize: 14 }}>
                      {I18n.t('accounts.pay')}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    void triggerHaptic('medium');
                    handleAddTransactionForAccount(account.id);
                  }}
                  style={[styles.floatingAddButton, { backgroundColor: themeColors.primary }]}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('onboarding.bootstrap.add_transaction')}
                >
                  <Plus size={24} color="#fff" />
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
        <ThemeModal
          visible={showBulkUpdate}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={handleCloseBulkUpdate}
        >
          <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <View className="px-5 pt-8 pb-4 flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text variant="subheading">
                  {I18n.t('transactions.selection.update_title', {
                    count: selectedTransactionCount,
                  })}
                </Text>
                <Text variant="friendly" tone="muted">
                  {I18n.t('transactions.selection.update_subtitle')}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={handleCloseBulkUpdate}
                  className="px-3 py-2 rounded-full bg-secondary/70"
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('common.cancel')}
                >
                  <Text variant="caption" tone="muted">
                    {I18n.t('common.cancel')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleApplyBulkUpdate}
                  disabled={!hasBulkChanges}
                  className={cn(
                    'px-3 py-2 rounded-full',
                    hasBulkChanges ? 'bg-primary' : 'bg-secondary/70',
                  )}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('common.save')}
                  accessibilityState={{ disabled: !hasBulkChanges }}
                >
                  <Text
                    variant="caption"
                    className={cn(hasBulkChanges ? 'text-white' : 'text-muted-foreground')}
                  >
                    {I18n.t('common.save')}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Inside a pageSheet modal — no nav bar behind it, so no glass inset. */}
            <ScrollView
              className="flex-1"
              contentContainerStyle={ACCOUNT_BULK_SCROLL_CONTENT_STYLE}
            >
              <View className="gap-2.5">
                <Text variant="caption" tone="muted">
                  {I18n.t('transactions.editor.date')}
                </Text>
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    setBulkDateModalVisible(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('transactions.editor.date')}
                  className="rounded-2xl border border-border/30 bg-card px-3.5 py-3.5"
                >
                  <Text variant="caption">{bulkDate}</Text>
                </Pressable>
              </View>

              <View className="gap-2.5">
                <Input
                  label={I18n.t('transaction_detail.note')}
                  placeholder={I18n.t('transactions.editor.optional')}
                  value={bulkNote}
                  onChangeText={(value) => {
                    setBulkNote(value);
                    setBulkNoteTouched(true);
                  }}
                />
              </View>
            </ScrollView>
            <DatePickerModal
              visible={bulkDateModalVisible}
              value={bulkDate}
              overlay
              onSelect={(value) => {
                setBulkDate(value);
                setBulkDateTouched(true);
                setBulkDateModalVisible(false);
              }}
              onClose={() => setBulkDateModalVisible(false)}
            />
          </SafeAreaView>
        </ThemeModal>
      </SettingsPageLayout>,
    );
  }

  // Shared between the draggable group cards and the static (ungrouped/unknown)
  // cards. `isEditing` only ever matches a real group id, so static cards
  // naturally render in display mode.
  const renderGroupCard = (card: GroupCard) => (
    <GroupCollapsibleCard
      key={card.id}
      card={card}
      theme={accountRowThemeColors}
      rowWidth={managementRowWidth}
      expanded={!collapsedGroupIds.has(card.id)}
      creditLabel={creditLabel}
      isEditing={editingGroupId === card.id}
      editingName={editingGroupName}
      scrollableRef={managementScrollRef}
      onToggle={handleToggleGroup}
      onEditingNameChange={setEditingGroupName}
      onSaveName={saveEditedGroup}
      onCancelEdit={cancelEditGroup}
      onStartEdit={startEditGroup}
      onDelete={handleDeleteGroup}
      onAddAccount={handleAddAccountToGroup}
      onAccountPress={handleAccountManagementPress}
      onReorderAccounts={handleReorderAccountsInSection}
    />
  );

  return withBackGesture(
    <SettingsPageLayout edges={safeAreaEdges}>
      {managementOnly ? (
        <View style={styles.headerContainer}>
          <SettingsHeader
            className="px-0 pt-5 pb-3"
            onBack={onBack}
            title={I18n.t('accounts.title')}
            rightAccessory={
              <AddIconButton
                onPress={startCreateGroup}
                accessibilityLabel={I18n.t('accounts.create_group')}
              />
            }
          />
          <View style={styles.headerSpacer} />
        </View>
      ) : null}

      {managementOnly ? (
        groupCards.length === 0 && staticCards.length === 0 ? (
          <EmptyState
            title={I18n.t('accounts.empty_groups_title')}
            message={I18n.t('accounts.empty_groups_message')}
            mascotMood="curious"
          />
        ) : (
          <Animated.ScrollView
            ref={managementScrollRef}
            style={styles.flexContainer}
            contentContainerStyle={[ACCOUNT_MANAGEMENT_LIST_CONTENT_STYLE, listNavInset]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Sortable.Flex
              activeItemScale={1.02}
              activeItemShadowOpacity={0.08}
              customHandle
              dragActivationDelay={0}
              flexDirection="column"
              flexWrap="nowrap"
              gap={spacing.xs}
              inactiveItemOpacity={1}
              onDragEnd={({ fromIndex, order, toIndex }) => {
                if (fromIndex === toIndex) return;
                const orderedIds = order(groupCards)
                  .map((card) => (card.kind === 'group' ? card.group.id : null))
                  .filter((id): id is string => id !== null);
                reorderAccountGroups(orderedIds);
                void triggerHaptic('selection');
              }}
              scrollableRef={managementScrollRef}
              sortEnabled={editingGroupId === null}
              width="fill"
            >
              {groupCards.map(renderGroupCard)}
            </Sortable.Flex>
            {staticCards.length > 0 ? (
              <View style={styles.staticCardsStack}>{staticCards.map(renderGroupCard)}</View>
            ) : null}
          </Animated.ScrollView>
        )
      ) : (
        <>
          <MonthControlsHeader
            title={I18n.t('accounts.title')}
            monthLabel=""
            onPrevMonth={() => {}}
            onNextMonth={() => {}}
            hideNavigation
            hideTitleRow={hideOverviewHeader}
            showAccent={false}
            actions={
              hideOverviewHeader ? undefined : (
                <>
                  {onOpenSettings ? (
                    <Button
                      size="icon"
                      variant="secondary"
                      haptic="selection"
                      className="h-10 w-10 rounded-full"
                      onPress={onOpenSettings}
                    >
                      <ClayIcon name="ui/settings" size={24} flatSize={18} />
                    </Button>
                  ) : null}
                  {renderBalanceToggleButton()}
                </>
              )
            }
          >
            <AccountsSummaryBlock
              assets={assetsTotal}
              debt={debtTotal}
              net={total}
              themeColors={themeColors}
              renderValue={renderVisibleBalanceNode}
              onPressNetAssets={onOpenNetAssetsInsight}
            />
          </MonthControlsHeader>
          <AccountCardStack
            accounts={stackAccounts}
            archivedAccounts={archivedAccounts}
            accountGroups={accountGroups}
            balanceMap={pageBalanceMap}
            convertedBalanceMap={pageConvertedBalanceMap}
            creditSummaryByAccountId={creditSummaryByAccountId}
            loanSummaryByAccountId={loanSummaryByAccountId}
            scrollViewRef={accountsOverviewScrollRef}
            settings={settings}
            trueHourlyRate={trueHourlyRate}
            hideBalances={hideAccountBalances}
            onOpenAccount={(id) => {
              void triggerHaptic('selection');
              if (onOpenAccount) {
                onOpenAccount(id);
                return;
              }
              setSelectedAccountId(id);
            }}
            onEditAccount={(id) => {
              void triggerHaptic('selection');
              onOpenAccountEditor?.({ accountId: id });
            }}
            onPayAccount={(id) => {
              void triggerHaptic('medium');
              onOpenPayCreditCard?.(id);
            }}
            onRenderBalanceNode={renderVisibleBalanceNode}
          />
        </>
      )}
    </SettingsPageLayout>,
  );
}
