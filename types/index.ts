export type DisplayMode = 'money' | 'time';
export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemeColor =
  | 'sage'
  | 'ocean'
  | 'terracotta'
  | 'slate'
  | 'amber'
  | 'indigo'
  | 'emerald'
  | 'rosewood';
export type WageType = 'hourly' | 'monthly' | 'yearly';
/**
 * The month cycle: the day of the month (1..28) a financial "month" starts on
 * by default, plus the months the user pinned to a different day. See
 * `utils/financialMonth` for the arithmetic and `MonthCycleScreen` for the UI.
 */
export interface MonthCycle {
  /** Day (1..28) every month starts on unless it is overridden. */
  defaultDay: number;
  /** `YYYY-MM` -> start day, for the months the user customized. */
  overrides: Readonly<Record<string, number>>;
}
/**
 * What every month-bucketing helper takes. A bare number is the plain "same day
 * every month" cycle, which is what their own defaults and the tests use.
 */
export type MonthCycleInput = number | MonthCycle;
/**
 * Which artwork the app's own chrome draws: the soft-clay illustrations in
 * `assets/clay-icons/` (default), or the flat Lucide line icons that preceded
 * them. Category icons, insight-type art and mascots are unaffected.
 */
export type IconStyle = 'clay' | 'flat';
/**
 * Home-screen icon variant. The artwork, the OS-facing alternate-icon names and
 * the picker order all live in `~/constants/appIcons`; the union is here so the
 * DB layer can validate a row without pulling the artwork in.
 */
export type AppIconId =
  | 'classic'
  | 'purse'
  | 'party'
  | 'love'
  | 'nice'
  | 'detective'
  | 'chill'
  | 'sleepy'
  | 'piggy'
  | 'cards';
export type UserMode = 'power' | 'simple';
export type BackupTarget = 'local' | 'icloud' | 'googleDrive';
export type ExchangeRateSource = 'api' | 'manual';

export interface ExchangeRate {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  /** 1 base = `rate` quote. */
  rate: number;
  /** Date the rate is valid for (YYYY-MM-DD), as reported by the source. */
  asOfDate: string;
  source: ExchangeRateSource;
  updatedAt: string;
}

/**
 * In-memory snapshot of cached exchange rates, all expressed relative to a
 * single canonical `base` currency. Held by AppContext so conversions stay
 * synchronous and usable inside memos.
 */
export interface RateTable {
  base: string;
  /** quoteCurrency -> rate (1 base = rate quote). Always includes base -> 1. */
  rates: Record<string, number>;
  /** Most recent `asOfDate` across the cached rates, or null when empty. */
  asOfDate: string | null;
}

export interface RateRefreshResult {
  ok: boolean;
  asOfDate: string | null;
  error: string | null;
}

/** 0 = Sunday, matching `Date.getDay()` and `settings.weekStartsOn`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Auto-start schedule for the live-earnings Live Activity: a Pro feature that
 * raises the card at the start of a shift without anything being tapped.
 *
 * `Activity.request()` is foreground-only, so the app itself still cannot do
 * that; what does is an APNs push-to-start sent by the live-earnings Worker
 * (iOS 17.2+). Below that, the same schedule falls back to a local reminder
 * the user taps. `features/widgets/lib/syncLiveEarningsAutoStart.ts` decides
 * which, and arms exactly one.
 */
export interface LiveEarningsSchedule {
  enabled: boolean;
  /** Weekdays the shift starts on, ascending and deduplicated. */
  days: Weekday[];
  /** Local time of day. */
  hour: number;
  minute: number;
  /**
   * Length of a session started by hand, in hours. Clamped to the iOS 1..8
   * window. Persisted so the screen reopens on the length last used.
   */
  hours: number;
  /**
   * Length of a *scheduled* shift, in hours, same 1..8 window.
   *
   * Deliberately its own field rather than sharing `hours`: an ad-hoc start
   * ("two hours of overtime this Saturday") and a recurring shift ("I work
   * nine to five") are different facts, and one control driving both meant
   * picking a short manual session silently rewrote every scheduled day.
   */
  shiftHours: number;
}

export interface NotificationPreferences {
  dailyCheckin: {
    enabled: boolean;
    hour: number;
    minute: number;
  };
  recurringAlert: {
    enabled: boolean;
  };
  /**
   * Recap of the week that just closed. Fires on the first day of the week
   * (`settings.weekStartsOn`), so the period it reports on is always complete;
   * only the time of day is configurable here.
   */
  weeklyReview: {
    enabled: boolean;
    hour: number;
    minute: number;
  };
  /**
   * The same, one zoom out: fires on the first day of the financial month
   * (`settings.firstDayOfMonth`) for the month that just closed.
   */
  monthlyReview: {
    enabled: boolean;
    hour: number;
    minute: number;
  };
  /**
   * Auto-start schedule for the live-earnings Live Activity: the card comes
   * up on the chosen weekdays at the chosen time, with nothing tapped.
   *
   * It still lives here, alongside the notification preferences, because the
   * fallback for a device that cannot be pushed to (iOS below 17.2) IS a
   * notification on exactly this schedule - and because moving it now would
   * strand the blob every install has already written. What owns its lifecycle
   * is `syncLiveEarningsAutoStart`, not `syncScheduledNotifications`.
   */
  liveEarningsStart: LiveEarningsSchedule;
}

export interface ProcessedRecurringRule {
  name: string;
  type: string;
  amount: number;
  currency: string;
}

export type AccountType = 'debit' | 'credit' | 'goal' | 'loan';
export type TransactionType = 'expense' | 'income' | 'transfer' | 'balance_adjustment';
export type RecurringTransactionType = Exclude<TransactionType, 'balance_adjustment'>;
export type RecurrencePattern = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type CategoryType = 'expense' | 'income';
export type TransactionSentiment = 'happy' | 'neutral' | 'sad';

export interface WageConfig {
  wageType: WageType;
  wageAmount: number;
  hoursWorkedPerWeek: number;
  workdaysPerWeek: number;
  commuteMinutesPerWorkday: number;
}

export interface MonthlyWageSettings {
  id: string;
  month: string; // YYYY-MM
  wageType: WageType;
  wageAmount: number;
  hoursWorkedPerWeek: number;
  workdaysPerWeek: number;
  commuteMinutesPerWorkday: number;
  baseHourlyRate: number;
  trueHourlyRate: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * Day index used by `Date.getDay()` — 0 = Sunday, 1 = Monday, …, 6 = Saturday.
 * We only expose Sunday or Monday in the UI today; other values are reserved.
 */
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface UserSettings {
  id: string;
  appUserId: string;
  locale: string;
  currencyCode: string;
  currencySymbol: string;
  displayMode: DisplayMode;
  /** Render time equivalents as configured working days instead of total hours. */
  workdayDisplayEnabled: boolean;
  /** Number of working hours represented by one displayed working day. */
  workingHoursPerDay: number;
  hapticsEnabled: boolean;
  themeMode: ThemeMode;
  themeColor: ThemeColor;
  /** Clay illustrations (default) or the flat line icons, for the app's chrome. */
  iconStyle: IconStyle;
  /** Home-screen icon variant the user picked (Pro-only beyond 'classic'). */
  appIcon: AppIconId;
  /** Persisted country filter for the account-logo picker (country slug), or null. */
  accountLogoCountry: string | null;
  subscriptionLogoCountry: string | null;
  /** User-chosen display name, or null when unset. */
  profileName: string | null;
  /** Relative path of the user's avatar within the user-assets store, or null. */
  profileAvatarUri: string | null;
  onboardingCompleted: boolean;
  userMode: UserMode;
  weekStartsOn: WeekStartsOn;
  /**
   * Day of the month (1..28) that a financial "month" starts on by default.
   * Defaults to 1 (plain calendar months). When higher, Insights, Budgets, the
   * Calendar tab and monthly wages group by the shifted period, labelled by the
   * month it starts in (see `utils/financialMonth`).
   *
   * Read this only where the scalar default is genuinely what is wanted (the
   * monthly-review notification trigger and its copy). Everything that buckets
   * or ranges by month reads `monthCycleOf(settings)`, which also honours the
   * per-month exceptions below.
   */
  firstDayOfMonth: number;
  /**
   * Per-month exceptions to `firstDayOfMonth`, as raw JSON keyed `YYYY-MM`.
   * Stored form only: read it through `monthCycleOf(settings)`, which parses it
   * together with the default day into the `MonthCycle` every month-bucketing
   * helper takes.
   */
  firstDayOverridesJson: string | null;
  /** When true (Pro-only), the app requires biometric/device auth to open. */
  biometricLockEnabled: boolean;
  /**
   * Grace period in seconds before the app re-locks after going to the
   * background. `0` means lock immediately. Only relevant when
   * `biometricLockEnabled` is true.
   */
  biometricLockDelaySeconds: number;
  autoBackupEnabled: boolean;
  autoBackupTarget: BackupTarget;
  lastAutoBackupAt: string | null;
  lastAutoBackupError: string | null;
  /** When true, exchange rates auto-refresh once per day. */
  autoFxRefreshEnabled: boolean;
  /** ISO timestamp of the last successful FX rate refresh, or null. */
  lastRateFetchAt: string | null;
  lastRateFetchError: string | null;
  /** JSON array of currency codes the user has added on the Multi currency page. */
  fxCurrenciesJson: string | null;
  /**
   * ISO timestamp of the user's first app open. Set to `now` on a fresh install;
   * for upgrading users it is backfilled to their earliest transaction date
   * (floored at 2026-03-01) on first load. Null only until that backfill runs.
   */
  firstAppOpen: string | null;
  /**
   * Relative path (within the user-assets store) of the user's own payment QR
   * image (PayNow / PromptPay / UPI / PayPal.me / etc.), or null when unset.
   * Resolve to a file uri with `getPaymentQrUri`. Shared onto split-bill
   * payback receipts so friends can pay the user back directly.
   */
  paymentQrUri: string | null;
  /**
   * Account new split-bill payback rows default to (the "paid to" account on
   * the Settle Up screen). Null until the user picks one; consumers fall back
   * to the first account so the effective default is never empty.
   */
  defaultPaybackAccountId: string | null;
  /** Whether a reimbursable expense still counts as spending. */
  reimbursementsCountAsExpense: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface QuickEntryPrefs {
  /** Override which user category to use for each keyword bucket. */
  categoryMap: Partial<Record<string, string>>;
  /** Fallback category id used when no keyword/history match. */
  defaultExpenseCategoryId: string | null;
  defaultIncomeCategoryId: string | null;
  /**
   * Account to use as the default for new quick-entry transactions (both
   * voice and text). Falls back to the user's last-used / first account
   * when null.
   */
  defaultAccountId: string | null;
  /**
   * Currency new quick-entry transactions are recorded in. When null, falls
   * back to the entry account's own currency. Lets the user enter a foreign
   * currency (e.g. spend EUR from an MYR account) and have it persist.
   */
  defaultCurrency: string | null;
  /** When true, voice entries are saved immediately without a confirmation sheet. */
  voiceSkipConfirmation: boolean;
  /** Total lifetime number of voice sessions the user has started. Free-tier limit. */
  voiceUsageCount: number;
  /**
   * Total lifetime number of transactions logged by the iOS auto-log App Intent.
   * Free-tier limit. Lives here rather than in its own prefs blob so it needs no
   * DB migration, alongside `voiceUsageCount` which is metered the same way.
   */
  autoLogUsageCount: number;
  /**
   * When true, the full transaction editor stays open after Save in create
   * mode: the transaction is created, note/amount reset, and focus returns to
   * the amount numpad so multiple transactions can be added back-to-back.
   */
  bulkCreateEnabled: boolean;
  /**
   * When true, tapping the + button opens the add-options sheet (Quick / Full /
   * Scan / Voice). When false, the + button runs `addPrimaryAction` on tap and
   * `addSecondaryAction` on hold.
   */
  addUseActionSheet: boolean;
  /** Action for a tap on the + button when the options sheet is disabled. */
  addPrimaryAction: AddButtonAction;
  /** Action for a press-and-hold on the + button when the sheet is disabled. */
  addSecondaryAction: AddButtonAction | 'none';
  /**
   * Entry flow the New Transaction intent opens. Shares `AddButtonAction` with
   * the + button so both are configured through the same AddActionSheet. Named
   * for Back Tap because that was its only trigger at the time; any shortcut or
   * automation can run the intent. iOS-only; ignored elsewhere.
   */
  backTapAction: AddButtonAction;
  /**
   * When true, the Log Card Payment intent's Category picker offers
   * subcategories as well as roots. Off by default: Shortcuts renders the
   * picker as one flat list with no hierarchy, so subcategories bury the roots
   * most taps actually want. iOS-only; ignored elsewhere.
   */
  autoLogIncludeSubcategories: boolean;
  /**
   * When true, a receipt scanned to log a transaction or to split a bill keeps
   * its image attached. Off by default: the scan still reads the amount and
   * merchant, but the photo is discarded rather than stored.
   */
  saveScannedReceipts: boolean;
  /**
   * When true, the Log Screenshot automation keeps the captured screenshot as
   * the transaction's receipt image. Off by default: the screenshot is read for
   * its amount and merchant, then discarded. iOS-only; ignored elsewhere.
   */
  autoLogSaveScreenshot: boolean;
  /**
   * When true (the default), an auto-logged card payment with no category
   * preset in its automation is categorized from the merchant name, using the
   * same keyword → category mapping as quick entry (`categoryMap`). The intent
   * then skips the on-pay category prompt entirely. Turn off to fall back to
   * the automation's own "Ask Each Time" prompt. iOS-only; ignored elsewhere.
   */
  autoLogAutoCategorize: boolean;
}

/**
 * An action the + button can trigger (tap or hold).
 * - `quick`: compact quick-add sheet
 * - `full`: full transaction editor
 * - `scan`: scan a receipt
 * - `voice`: voice quick-add
 * - `split`: open a new expense straight into the split-bill editor
 * - `splitScan`: scan a receipt straight into the Split-by-Item editor
 */
export const ADD_BUTTON_ACTIONS = ['quick', 'full', 'scan', 'voice', 'split', 'splitScan'] as const;
export type AddButtonAction = (typeof ADD_BUTTON_ACTIONS)[number];

export const DEFAULT_QUICK_ENTRY_PREFS: QuickEntryPrefs = {
  categoryMap: {},
  defaultExpenseCategoryId: null,
  defaultIncomeCategoryId: null,
  defaultAccountId: null,
  defaultCurrency: null,
  voiceSkipConfirmation: false,
  voiceUsageCount: 0,
  autoLogUsageCount: 0,
  bulkCreateEnabled: false,
  addUseActionSheet: true,
  addPrimaryAction: 'quick',
  addSecondaryAction: 'none',
  backTapAction: 'quick',
  autoLogIncludeSubcategories: false,
  saveScannedReceipts: false,
  autoLogSaveScreenshot: false,
  autoLogAutoCategorize: true,
};

export interface Account {
  id: string;
  name: string;
  sortOrder?: number;
  type: AccountType;
  accountGroup: string | null;
  /** Bundled bank/institution logo id (`<countrySlug>/<brandSlug>`), or null. */
  logoId?: string | null;
  creditStatementDay: number | null;
  creditDueDay: number | null;
  currency: string;
  startingBalance: number;
  includeInTotals: boolean;
  /** Savings-goal target amount in the account currency; > 0 when type is 'goal', else null. */
  goalTargetAmount?: number | null;
  /** Optional goal deadline (YYYY-MM-DD); must be in the future when set. */
  goalTargetDate?: string | null;
  /** Goal display emoji; display sites fall back to 🎯 when null. */
  goalEmoji?: string | null;
  /** High-water achievement stamp (ISO); set once when balance first reaches the target. */
  goalAchievedAt?: string | null;
  /** Null = active goal. Set to hide the goal from the rail and pickers. */
  goalArchivedAt?: string | null;
  /** Amount originally borrowed, in the account currency; > 0 when type is 'loan', else null. */
  loanOriginalPrincipal?: number | null;
  /** Contractual monthly repayment in the account currency; > 0 when type is 'loan'. */
  loanMonthlyPayment?: number | null;
  /** Day of month (1-28) the repayment is due. */
  loanPaymentDay?: number | null;
  /** Effective annual interest rate as a percentage (e.g. 4.5). Null when interest-free. */
  loanInterestRate?: number | null;
  /** Contract length in months; the monthly instalment is derived from it. */
  loanTermMonths?: number | null;
  /** What the loan costs in total, when the agreement states it. */
  loanTotalRepayable?: number | null;
  /** Contract start date (YYYY-MM-DD). */
  loanStartDate?: string | null;
  /** Gate for the one-shot payoff celebration; cleared if the loan is drawn down again. */
  loanPaidOffAt?: string | null;
  /** Null = active loan. Set to hide the loan from the stack and pickers. */
  loanArchivedAt?: string | null;
  /**
   * Whether a repayment into this loan is counted as spending. Null on a loan
   * created before the setting existed, which reads as **off** — its recurring
   * rule predates the column and is not counted either, and the two must agree.
   */
  loanCountAsExpense?: boolean | null;
  /** The category a counted repayment is filed under. */
  loanPaymentCategoryId?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Pace of a goal against its target date. Null when no target date is set. */
export type GoalPace = 'onTrack' | 'behind' | 'achieved';

/** Derived progress numbers for one savings goal, in the goal's own currency. */
export interface GoalProgress {
  /** Current balance (may be negative after over-withdrawal). */
  saved: number;
  target: number;
  /** saved / target, clamped at 0 below; may exceed 1 when over-saved. */
  ratio: number;
  /** Pace against the target date; null when no target date is set and not achieved. */
  pace: GoalPace | null;
  /** Monthly-equivalent auto-save contribution rate, or null when no active rule targets the goal. */
  monthlyRate: number | null;
  /** Projected completion (YYYY-MM-DD) at monthlyRate, or null (no rate, or already achieved). */
  projectedDate: string | null;
  /** Amount per month needed to hit the target date, or null (no date, or achieved). */
  requiredMonthly: number | null;
}

/** An account of type 'goal' together with its derived progress. */
export interface GoalWithProgress {
  account: Account;
  progress: GoalProgress;
}

/** Derived progress numbers for one loan, in the loan's own currency. */
export interface LoanProgress {
  /** Amount still owed, floored at 0 (an overpayment reads as fully repaid). */
  remaining: number;
  /** Amount borrowed, as entered. */
  principal: number;
  /** principal - remaining, floored at 0. */
  paid: number;
  /** paid / principal, clamped to [0, 1]. 1 when the principal is unusable. */
  paidRatio: number;
  /**
   * How full the progress bar reads. Counted in instalments once the term is
   * known, because "31 of 108 paid" is what a borrower checks; it falls back
   * to {@link paidRatio} on a loan with no term (an import, say).
   */
  progressRatio: number;
  /** Instalments in the whole contract; null when no term is recorded. */
  instalmentsTotal: number | null;
  /**
   * Instalments the balance says are behind them, as a whole number. Null
   * without both a term and a finite projection. Overpaying moves this faster
   * than the calendar does, which is the honest reading: it is how many
   * instalments' worth of debt is gone, not how many months have passed.
   */
  instalmentsPaid: number | null;
  /**
   * Cash handed over so far: {@link instalmentsPaid} at the contractual
   * instalment. This is the figure a statement shows, interest included, and
   * so the one that pairs with {@link remainingWithInterest}. Null whenever
   * {@link instalmentsPaid} is, or there is no instalment to multiply by.
   */
  paidSoFar: number | null;
  /**
   * What is still to hand over. With the agreement's total this is exact
   * (total less {@link paidSoFar}, so the two pair to the cent); without one it
   * falls back to {@link remainingWithInterest}, then to {@link remaining}.
   */
  leftToPay: number;
  /** True once the balance has reached zero, or the payoff stamp is set. */
  isPaidOff: boolean;
  /** Next repayment due date (YYYY-MM-DD), or null when no payment day is set. */
  nextDueDate: string | null;
  /** Whole repayments left at the current amount and rate; null when it never amortizes. */
  paymentsRemaining: number | null;
  /** Projected final payment (YYYY-MM-DD), or null when there is no finite projection. */
  projectedPayoffDate: string | null;
  /** Estimated interest still to pay; null without a rate or a finite projection. */
  estimatedInterestRemaining: number | null;
  /**
   * Everything still to hand over: `remaining` plus `estimatedInterestRemaining`.
   * Null whenever that estimate is, where `remaining` is already the full figure.
   */
  remainingWithInterest: number | null;
  /** False when the repayment is smaller than one month's interest (the balance grows). */
  paymentCoversInterest: boolean;
}

export interface AccountGroup {
  id: string;
  name: string;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Category {
  id: string;
  name: string;
  sortOrder?: number;
  type: CategoryType;
  parentId: string | null;
  icon: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Album {
  id: string;
  name: string;
  coverPhotoUri: string | null;
  isActive: boolean;
  /** Manual start-date override (YYYY-MM-DD); null falls back to first transaction. */
  startDate: string | null;
  /** Manual end-date override (YYYY-MM-DD); null falls back to last transaction. */
  endDate: string | null;
  /** Real-world location; all null when the album has no place set. */
  latitude: number | null;
  longitude: number | null;
  /** GeoNames id of the resolved place, kept so it can be re-resolved later. */
  placeId: string | null;
  /** Display place name, e.g. "Tokyo". */
  placeName: string | null;
  /** admin1 region, e.g. "Tokyo" / "California"; nullable. */
  placeAdmin: string | null;
  /** ISO 3166-1 alpha-2 country code, e.g. "JP". */
  countryCode: string | null;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** The location fields of an album, written together as a unit. */
export interface AlbumLocation {
  latitude: number;
  longitude: number;
  placeId: string | null;
  placeName: string;
  placeAdmin: string | null;
  countryCode: string | null;
}

/** An album that has a real-world location (latitude/longitude non-null). */
export type LocatedAlbum = Album & { latitude: number; longitude: number };

export function isLocatedAlbum(album: Album): album is LocatedAlbum {
  return album.latitude != null && album.longitude != null;
}

/** A city row from the offline GeoNames place database. */
export interface City {
  id: string;
  name: string;
  admin: string | null;
  countryCode: string;
  countryName: string;
  latitude: number;
  longitude: number;
  population: number;
}

export interface AlbumStats {
  /** Sum of expense transactions in the album, in the reporting currency. */
  totalSpent: number;
  transactionCount: number;
  /** Effective start date (manual override, else first transaction), or null. */
  startDate: string | null;
  /** Effective end date (manual override, else last transaction), or null. */
  endDate: string | null;
}

export interface AlbumWithStats extends Album, AlbumStats {}

/**
 * A tracked possession whose effective daily cost (price ÷ days owned) shrinks
 * the longer it is kept. Standalone — items never create transactions.
 */
export interface Item {
  id: string;
  name: string;
  /** Item-icon library id or a `custom:` uploaded-image id; null = package fallback. */
  iconId: string | null;
  /** What was paid for it, in `currency`. */
  purchasePrice: number;
  currency: string;
  /** Acquisition date (YYYY-MM-DD). */
  purchaseDate: string;
  /** Retire/sell date (YYYY-MM-DD); null = still owned (active). Day-counting stops here. */
  endDate: string | null;
  /** Optional resale value; net cost = purchasePrice − salePrice. */
  salePrice: number | null;
  note: string | null;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ItemStats {
  /** Whether the item is still being counted (no end date). */
  isActive: boolean;
  /** Whole days owned (clamped to ≥ 1). For inactive items this freezes at the end date. */
  daysOwned: number;
  /** purchasePrice − (salePrice ?? 0). What it has cost net of any resale. */
  netCost: number;
  /** netCost ÷ daysOwned, in the item's currency. */
  dailyCost: number;
  /** Work-time per day implied by dailyCost, in hours; null when no wage is set. */
  dailyWorkHours: number | null;
}

export interface ItemWithStats extends Item, ItemStats {}

/** One category's share of a budget template's total. */
export interface BudgetTemplateAllocation {
  id: string;
  /** Root (top-level) expense category id. */
  categoryId: string;
  amount: number;
  sortOrder: number;
}

/**
 * A reusable monthly budget definition: a total amount fully allocated across
 * root expense categories. Monthly budgets are frozen copies of a template
 * taken at creation time — editing a template never rewrites created months.
 */
export interface BudgetTemplate {
  id: string;
  name: string;
  /** Optional emoji shown next to the template name. */
  emoji: string | null;
  totalAmount: number;
  /** Exactly one live template is the default while any template exists. */
  isDefault: boolean;
  /** Whether spend in categories without a budget line counts toward the total. */
  countUnbudgeted: boolean;
  sortOrder: number;
  allocations: BudgetTemplateAllocation[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** One category line of a month's frozen budget. */
export interface MonthlyBudgetLine {
  id: string;
  categoryId: string;
  amount: number;
  sortOrder: number;
}

/** A single month's budget — a frozen copy of a template at creation time. */
export interface MonthlyBudget {
  id: string;
  /** 'YYYY-MM' month key. */
  month: string;
  /** Provenance only; the template may have been renamed or deleted since. */
  templateId: string | null;
  templateName: string | null;
  templateEmoji: string | null;
  totalAmount: number;
  /** Frozen from the template: whether unbudgeted spend counts toward the total. */
  countUnbudgeted: boolean;
  lines: MonthlyBudgetLine[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Depletion of one budget line for a month (subcategory spend rolled up). */
export interface BudgetCategoryProgress {
  categoryId: string;
  budgeted: number;
  spent: number;
  /** budgeted − spent; negative when over. */
  remaining: number;
  /** spent / budgeted; 0 when budgeted is 0. */
  usageRatio: number;
  isOver: boolean;
  /**
   * Optional per-subcategory lines nested under a root line. Child spend is
   * that category's own (no roll-up); the parent still rolls everything up.
   */
  children: BudgetCategoryProgress[];
}

/** Expense spend in a category with no budget line (null = uncategorized). */
export interface UnbudgetedCategorySpend {
  categoryId: string | null;
  spent: number;
}

/** Everything the budget month page / widgets need, computed in one pass. */
export interface BudgetMonthSummary {
  month: string;
  totalBudget: number;
  /**
   * Spend counted against the budget: budgeted + unbudgeted when the budget
   * counts unbudgeted spend, budgeted only otherwise.
   */
  totalSpent: number;
  budgetedSpent: number;
  unbudgetedSpent: number;
  /** Frozen from the template: whether unbudgetedSpent is part of totalSpent. */
  countUnbudgeted: boolean;
  /** totalBudget − totalSpent; negative when the month is over budget. */
  remaining: number;
  /** max(0, −remaining). */
  exceededBy: number;
  /** totalSpent / totalBudget; 0 when there is no budget total. */
  usageRatio: number;
  categories: BudgetCategoryProgress[];
  unbudgeted: UnbudgetedCategorySpend[];
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  /**
   * Frozen reporting-currency snapshot, captured at write time. Null for
   * transfers and legacy rows. `reportingAmount = amount * fxRate`.
   */
  reportingCurrency: string | null;
  reportingAmount: number | null;
  fxRate: number | null;
  /** Credited amount in the to-account's currency for cross-currency transfers. */
  toAmount: number | null;
  /**
   * Frozen value in the owning account's currency, set when `currency` differs
   * from the account currency (e.g. an EUR expense in an MYR account). Null when
   * they match — use `amount` directly for account-currency math.
   */
  accountAmount: number | null;
  date: string;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  note: string | null;
  /**
   * Relative path (within the user-assets store) of an optional receipt image,
   * e.g. `receipts/9f3c.jpg`. Resolve to a file uri with `getReceiptUri`. Null
   * when no receipt is attached.
   */
  receiptUri: string | null;
  recurrencePattern: RecurrencePattern;
  recurrenceInterval: number;
  recurrenceEndDate: string | null;
  recurrenceParentId: string | null;
  sentiment: TransactionSentiment;
  /** The "to be reimbursed" tick. Only ever set on an expense. */
  reimbursable: boolean;
  /** Set when the money came back; null while the reimbursement is pending. */
  reimbursedAt: string | null;
  /** Account the refund landed in. */
  reimbursementAccountId: string | null;
  /** The income row written for the refund, so unmarking can remove it. */
  reimbursementTransactionId: string | null;
  /**
   * On a refund row, the expense it pays back. This is what
   * `countsTowardSpending` reads to drop a refund out of the totals alongside
   * its expense, so income is never left inflated against expense.
   */
  reimbursementOfId: string | null;
  /**
   * A transfer the user asked to be counted as spending — today only a loan
   * repayment made while the loan's "count instalment as expense" toggle is
   * on. Stamped at write time, never derived, so flipping the toggle later
   * cannot rewrite totals the user has already read.
   *
   * Analytics only. Account balances, statement periods and asset history
   * always treat the row as the transfer it is. See `utils/spending.ts`.
   */
  countsAsExpense: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TransactionWithRelations extends Transaction {
  accountName?: string | null;
  fromAccountName?: string | null;
  toAccountName?: string | null;
  categoryName?: string | null;
  categoryParentId?: string | null;
  categoryParentName?: string | null;
  categoryIcon?: string | null;
  splits?: TransactionSplit[];
  splitsSummary?: TransactionSplitsSummary;
}

export interface TransactionSplit {
  id: string;
  transactionId: string;
  personName: string | null;
  amount: number;
  isSelf: boolean;
  paybackAccountId: string | null;
  paidAt: string | null;
  paidTransactionId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TransactionSplitsSummary {
  count: number;
  paidCount: number;
  unpaidAmount: number;
  totalOwed: number;
}

/** Where a receipt split's itemized detail originated. */
export type ReceiptSplitSource = 'scan' | 'manual';

/** One person's portion of a single receipt line item. */
export interface ReceiptSplitItemShare {
  id: string;
  itemId: string;
  personName: string;
  isSelf: boolean;
  /** Integer portion weight; equal shares are weight 1 each. */
  weight: number;
}

/** One line item on an itemized receipt split (amount is tax-inclusive). */
export interface ReceiptSplitItem {
  id: string;
  name: string;
  quantity: number;
  lineTotal: number;
  sortOrder: number;
  shares: ReceiptSplitItemShare[];
}

/**
 * The itemized detail behind a split-by-item transaction. The computed
 * per-person totals live on ordinary `TransactionSplit` bridge rows; this
 * record is the item/assignment source of truth. Item amounts are in
 * `currency` (the parent transaction's currency) and already include any
 * applied tax/service — the receipt total is just their sum.
 */
export interface ReceiptSplit {
  id: string;
  transactionId: string;
  currency: string;
  merchant: string | null;
  receiptDate: string | null;
  source: ReceiptSplitSource;
  receiptImageUri: string | null;
  items: ReceiptSplitItem[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** One unpaid split a person owes, tied back to its parent transaction. */
export interface PersonDebtBill {
  splitId: string;
  transactionId: string;
  /** Parent transaction date (ISO / YYYY-MM-DD). */
  date: string;
  /** The split amount, in the parent transaction's own entered currency. */
  amount: number;
  currency: string;
  /** `amount` converted to the reporting currency (frozen fxRate when available). */
  reportingAmount: number;
  /** Denormalized parent fields for display. */
  note: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  /** Account the payback lands in (split's own, falling back to the parent's). */
  paybackAccountId: string | null;
}

/** Everything one person owes the user, rolled up across every transaction. */
export interface PersonDebt {
  /** Grouping key: trimmed + case-folded name, or the unnamed sentinel. */
  key: string;
  /** Display name (from the most recent bill), or null when the split was unnamed. */
  name: string | null;
  /** Total owed in the reporting currency. */
  totalReporting: number;
  /** Native per-currency subtotals, for tabs that span currencies. */
  byCurrency: { currency: string; amount: number }[];
  bills: PersonDebtBill[];
  /** Oldest unpaid bill date. */
  oldestDate: string;
  billCount: number;
}

/** The whole "who owes you" roll-up across unpaid splits. */
export interface SettleUpSummary {
  people: PersonDebt[];
  /** Grand total owed across everyone, in the reporting currency. */
  totalReporting: number;
  personCount: number;
  billCount: number;
  reportingCurrency: string;
}

/** One person's unpaid share of a single transaction (by-transaction view). */
export interface TransactionDebtSplit {
  splitId: string;
  /** Person who owes, or null when the split was never named. */
  personName: string | null;
  /** The split amount, in the parent transaction's own entered currency. */
  amount: number;
  currency: string;
  /** `amount` converted to the reporting currency (frozen fxRate when available). */
  reportingAmount: number;
  /** Account the payback lands in (split's own, falling back to the parent's). */
  paybackAccountId: string | null;
}

/** A single transaction that still has unpaid, non-self splits owed to the user. */
export interface TransactionDebt {
  transactionId: string;
  /** Transaction date (ISO / YYYY-MM-DD). */
  date: string;
  note: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  currency: string;
  /** Total still owed on this bill, in the reporting currency. */
  totalReporting: number;
  /** Total still owed on this bill, in the transaction's own currency. */
  totalNative: number;
  splits: TransactionDebtSplit[];
  splitCount: number;
}

/** The "who owes you" roll-up grouped by transaction instead of by person. */
export interface SettleUpByTransactionSummary {
  transactions: TransactionDebt[];
  /** Grand total owed across every bill, in the reporting currency. */
  totalReporting: number;
  transactionCount: number;
  splitCount: number;
  reportingCurrency: string;
}

export interface RecurringTransactionRule {
  id: string;
  name: string;
  type: RecurringTransactionType;
  amount: number;
  currency: string;
  /** Credited amount in the to-account's currency for cross-currency transfer rules. */
  toAmount: number | null;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  note: string | null;
  /** Subscription logo id: `<country>/<brand>` from the bundled catalog, or a `custom:` upload. */
  logoId: string | null;
  recurrencePattern: Exclude<RecurrencePattern, 'none'>;
  recurrenceInterval: number;
  nextRunDate: string;
  endDate: string | null;
  isActive: boolean;
  /**
   * Stamped onto every transfer this rule generates, so a loan's auto-repayment
   * counts as spending without the engine reading the account back.
   */
  countsAsExpense: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface TransactionFilters {
  search: string;
  dateRange: DateRange | null;
  accountId: string | null;
  excludedAccountIds: string[];
  type: TransactionType | 'all';
  incomeCategoryId: string | null;
  expenseCategoryId: string | null;
  excludedIncomeCategoryIds: string[];
  excludedExpenseCategoryIds: string[];
  categoryId: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  sortBy: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
}

export interface BreakdownItem {
  id: string;
  label: string;
  parentLabel?: string;
  amount: number;
}

export interface CashflowSummary {
  income: number;
  expense: number;
}

export interface AccountBalance {
  accountId: string;
  balance: number;
  income: number;
  expense: number;
  transfersIn: number;
  transfersOut: number;
  /** The account's native currency (the currency `balance` is denominated in). */
  currency: string;
  /**
   * `balance` converted to the reporting currency at the latest cached rate, or
   * null when no rate is available for this currency.
   */
  convertedBalance: number | null;
}

export interface AppState {
  isLoading: boolean;
  settings: UserSettings;
  currentMonthWage: MonthlyWageSettings | null;
  accountGroups: AccountGroup[];
  recurringRules: RecurringTransactionRule[];
  accounts: Account[];
  categories: Category[];
  transactions: TransactionWithRelations[];
  activeAccountFilter: string | null;
}
