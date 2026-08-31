const fs = require('fs');
const path = require('path');

const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require('@expo/config-plugins');

const APP_GROUP = 'group.com.nelsongan.money2time.widgets';
const SNAPSHOT_PREFS = 'money2time_widget_snapshot';
const SNAPSHOT_KEY = 'snapshot';
// The live-earnings widget's precomputed timeline, written on its own key
// rather than inside the big snapshot: the snapshot is rebuilt from app data
// on a cadence of its own, and a rebuild must never wipe out a running
// session. Written by 'services/liveEarningsWidget.ts'.
const LIVE_EARNINGS_KEY = 'live_earnings';
// The live-earnings widget's WidgetKit kind. Shared because it is written in
// two places that must agree - the widget declares it, the app reloads it by
// name - and a drift between them fails silently: the timeline simply stops
// being refreshed, with a '.never' policy meaning iOS never asks either.
const LIVE_EARNINGS_WIDGET_KIND = 'Money2TimeLiveEarningsTicker';
const IOS_APP_TARGET_NAME = 'Money2Time';
const IOS_WIDGET_TARGET_NAME = 'Money2TimeWidget';
const IOS_WIDGET_BUNDLE_ID = 'com.nelsongan.money2time.Money2TimeWidget';
// Artwork baked into the native widget targets at prebuild time. These paths
// are only resolved during `expo prebuild`, so a rename here is invisible to
// typecheck/lint/tests and only breaks at build time. `__tests__/constants/
// widgetPluginAssets.test.ts` asserts both files exist so CI fails first.
const BANNER_ASSET = 'assets/banner.png';
const MASCOT_ASSET = 'assets/mascots/thumbs-up.png';

// The ActivityKit attributes for the live-earnings activity. Compiled into
// both the app target and the widget extension (ActivityKit pairs them by
// type name), so it lives here as one string rather than two files that can
// drift apart.
const LIVE_ACTIVITY_ATTRIBUTES_SWIFT = `/// Live "salary ticking up" activity.
///
/// This declaration is compiled into BOTH the app target (which starts,
/// updates and ends the activity) and the widget extension (which draws it).
/// ActivityKit pairs the two by type name, so the two copies must stay byte
/// identical - they are emitted from one template in
/// 'plugins/withMoney2TimeWidgets.js', never hand-edited in 'ios/'.
///
/// Everything the extension renders as text is resolved in JS and passed
/// through, the same way the home-screen widget snapshot carries preformatted
/// labels: the extension has no access to the app's i18n catalog or its
/// currency settings.
struct Money2TimeEarningsAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// Money earned since 'startedAt', formatted by the app (e.g. "$42.31").
    var earnedText: String
    /// The same figure unformatted. Only 'contentTransition(.numericText)'
    /// reads it: the digit-roll animation needs a number to interpolate, and
    /// it cannot get one out of the localized string above.
    var earned: Double
    /// When the figures above were computed, in epoch milliseconds. Never
    /// drawn - it is here so two consecutive updates are never equal, since
    /// ContentState is Hashable and an update carrying an identical state can
    /// be coalesced away.
    ///
    /// A Double rather than a Date, and that is load-bearing for the push path:
    /// a pushed 'content-state' is decoded by a JSONDecoder with **default**
    /// strategies, and the default for Date is 'deferredToDate' - seconds since
    /// the 2001 reference date, not the Unix epoch every server on earth sends.
    /// A number would decode without complaint and land 31 years out. Epoch
    /// millis as a plain Double has no such ambiguity in either direction.
    var asOfMillis: Double
  }

  /// Session start, in epoch **milliseconds**, and session end likewise.
  ///
  /// Millis rather than 'Date' for exactly the reason spelled out on
  /// 'asOfMillis' above, and here it is not a nicety: a scheduled shift is
  /// started by an APNs **push-to-start**, whose 'attributes' dictionary is
  /// decoded by a JSONDecoder with default strategies. The default for a Swift
  /// 'Date' is seconds since the 2001 reference date, so a Unix timestamp would
  /// decode without complaint and put the shift 31 years out. A plain number
  /// reads the same whether the activity was raised by the app or by a push.
  ///
  /// The two dates below are computed, so they are neither encoded nor decoded
  /// and every view keeps reading 'attributes.startedAt' as before. The elapsed
  /// clock and the progress bar run from them, and those two ARE live:
  /// 'Text(timerInterval:)' and 'ProgressView(timerInterval:)' are repainted by
  /// the system itself.
  var startedAtMillis: Double
  /// iOS also force-ends any Live Activity 8 hours after it starts.
  var endsAtMillis: Double

  var startedAt: Date { Date(timeIntervalSince1970: startedAtMillis / 1000) }
  var endsAt: Date { Date(timeIntervalSince1970: endsAtMillis / 1000) }
  /// The true hourly rate this session accrues at. Never drawn: it is carried
  /// so the app can rebuild the session after a relaunch and keep counting
  /// from the rate the user actually started with, even if their wage
  /// settings changed in between.
  var hourlyRate: Double
  /// The activity's headline, the lead-in above the amount.
  var titleText: String
  /// "$18.00/hr" - the true hourly rate this session accrues at.
  var rateText: String
  /// "Ends 5:00 PM".
  var endsText: String
  /// "$180.00" - what the whole session is worth if it runs to the end. The
  /// bar fills between zero and this, so the live element reads as money
  /// rather than as an abstract proportion.
  var totalText: String
  /// Accessibility label for the refresh button. Localized in JS like the
  /// rest of the copy; the intent's own title never reaches the user.
  var refreshText: String
  /// The user's theme colour, as 0xRRGGBB, in its light and dark variants.
  /// The extension cannot read the app's theme, so the app hands both over and
  /// the card picks per appearance - a Live Activity is supposed to look like
  /// it came from the app it belongs to.
  var accentLightHex: UInt32
  var accentDarkHex: UInt32
}
`;

// Shared by the widget extension (which reads the timeline) and the app (whose
// process runs the card's refresh button), so it is emitted from one template
// into both, like the attributes above.
const LIVE_EARNINGS_FEED_SWIFT = `/// The live-earnings feed: every figure a session will ever show, precomputed.
///
/// A widget is the one iOS surface with a *timeline* - you hand the system
/// future entries and it renders each at its date with no app process, no
/// network and no push - and money accruing at a fixed rate is entirely
/// predictable. So nothing here computes money; it only looks up the frame in
/// force at a given instant. The app writes this (see
/// 'services/liveEarningsWidget.ts'), which is also what keeps currency
/// formatting where the user's settings are.
struct Money2TimeEarningsTick: Decodable {
  /// Epoch milliseconds, the same wire format the rest of the bridge uses.
  let at: Double
  let label: String
  let value: Double
  let progress: Double

  var date: Date { Date(timeIntervalSince1970: at / 1000) }
}

struct Money2TimeEarningsFeed: Decodable {
  /// False when no session is running; the widget then shows 'idleText'.
  let active: Bool
  let startedAt: Double
  let endsAt: Double
  let rateText: String
  let totalText: String
  let endsText: String
  let idleText: String
  let openUrl: String
  let accentLightHex: UInt32
  let accentDarkHex: UInt32
  let ticks: [Money2TimeEarningsTick]

  /// The frame in force at 'date': the last tick that has already begun.
  /// Ticks are written in ascending order, so this stops at the first one that
  /// is still in the future.
  func tick(at date: Date) -> Money2TimeEarningsTick? {
    var current: Money2TimeEarningsTick?
    for tick in ticks {
      if tick.date <= date {
        current = tick
      } else {
        break
      }
    }
    return current ?? ticks.first
  }
}

/// One place to trace the refresh button from, since the intent can be run in
/// more than one process and only the app's can actually reach ActivityKit.
enum Money2TimeEarningsLog {
  static func refresh(_ message: String) {
    os_log("live-earnings refresh: %{public}@", log: .default, type: .info, message)
  }
}

enum Money2TimeEarningsFeedStore {
  static func load() -> Money2TimeEarningsFeed? {
    guard
      let defaults = UserDefaults(suiteName: "${APP_GROUP}"),
      let json = defaults.string(forKey: "${LIVE_EARNINGS_KEY}"),
      let data = json.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(Money2TimeEarningsFeed.self, from: data)
  }
}

/// Brings the card's amount up to date from the Lock Screen, without opening
/// the app.
///
/// The whole point of 'LiveActivityIntent' is that the system runs it in the
/// *app's* process, which is what lets it call ActivityKit at all; a plain
/// 'AppIntent' would run in the extension, where 'Activity.update' is not
/// available. With 'openAppWhenRun' false on the button, tapping it never
/// leaves the Lock Screen.
///
/// It reads the figure out of the feed rather than recomputing it, so the
/// amount the button shows and the amount the widget shows come from the same
/// precomputed table and can never disagree.
@available(iOS 17.0, *)
struct Money2TimeRefreshEarningsIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Refresh earnings"
  /// Tapping it must not leave the Lock Screen.
  static let openAppWhenRun: Bool = false

  // Deliberately NOT 'isDiscoverable = false', tempting as it looks for an
  // action that only makes sense on the card it sits on: that keeps the app's
  // copy out of the AppIntents metadata index, and the system then has nothing
  // to route to but the widget extension's copy - where 'Activity.activities'
  // is always empty, so the button silently does nothing.

  init() {}

  func perform() async throws -> some IntentResult {
    guard let feed = Money2TimeEarningsFeedStore.load() else {
      Money2TimeEarningsLog.refresh("no feed")
      return .result()
    }
    guard let activity = Activity<Money2TimeEarningsAttributes>.activities.first else {
      // Reached when the intent runs anywhere but the app's own process: an
      // extension has no view of the app's activities.
      Money2TimeEarningsLog.refresh("no activity in this process")
      return .result()
    }

    let now = Date()
    guard let tick = feed.tick(at: now) else {
      Money2TimeEarningsLog.refresh("no tick")
      return .result()
    }

    await activity.update(
      ActivityContent(
        state: Money2TimeEarningsAttributes.ContentState(
          earnedText: tick.label,
          earned: tick.value,
          asOfMillis: now.timeIntervalSince1970 * 1000),
        staleDate: nil))
    Money2TimeEarningsLog.refresh("updated to " + tick.label)
    return .result()
  }
}
`;

// Illustrative snapshot baked in at prebuild time. Native widgets render this
// whenever no real snapshot has been written yet (gallery preview / first run)
// so they never show an empty "set up" state. The app overwrites it on launch.
function buildSampleSnapshotJson() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayNum = now.getDate();
  const weekStartsOn = 1; // Monday
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 Sun .. 6 Sat
  const leadingSpacers = (firstWeekday - weekStartsOn + 7) % 7;
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthShortLabel = now.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  const weekdayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  const shortNum = (value) =>
    value >= 1000 ? `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K` : String(Math.round(value));

  const incomeByDay = { 3: 1200, 10: 60, 17: 30, 24: 2400 };
  const expenseByDay = { 2: 24, 5: 88, 6: 132, 12: 9, 15: 210, 18: 64, 22: 77, 25: 53, 27: 119 };

  let maxAbsNet = 0;
  for (let d = 1; d <= daysInMonth; d += 1) {
    const net = Math.abs((incomeByDay[d] || 0) - (expenseByDay[d] || 0));
    if (net > maxAbsNet) maxAbsNet = net;
  }

  const days = [];
  let totalIncome = 0;
  let totalExpense = 0;
  for (let d = 1; d <= daysInMonth; d += 1) {
    const income = incomeByDay[d] || 0;
    const expense = expenseByDay[d] || 0;
    totalIncome += income;
    totalExpense += expense;
    const hasActivity = income > 0 || expense > 0;
    const intensity =
      hasActivity && maxAbsNet > 0
        ? Math.max(0.18, Math.min(0.85, Math.abs(income - expense) / maxAbsNet))
        : 0;
    days.push({
      dayKey: `${monthKey}-${String(d).padStart(2, '0')}`,
      dayNumber: d,
      income,
      expense,
      incomeLabel: income > 0 ? shortNum(income) : '',
      expenseLabel: expense > 0 ? shortNum(expense) : '',
      hasActivity,
      incomeStronger: income > expense,
      intensity,
      isToday: d === todayNum,
      isFuture: d > todayNum,
    });
  }

  const barAmounts = [42, 18, 67, 9, 88, 124, 53];
  const weeklyDays = barAmounts.map((amount, index) => ({
    dayKey: `sample-${index}`,
    weekdayLabel: weekdayLabels[index],
    amount,
    barLabel: shortNum(amount),
    isToday: index === 6,
  }));
  const weeklyTotal = barAmounts.reduce((sum, value) => sum + value, 0);

  // Savings rate over the sample month (income vs all expenses, incl. the bars).
  const savingsIncome = totalIncome;
  const savingsExpense = totalExpense + weeklyTotal;
  const saved = savingsIncome - savingsExpense;
  const savingsRate = savingsIncome > 0 ? saved / savingsIncome : 0;
  const savedHours = Math.abs(saved) / 15;
  const savedWholeHours = Math.floor(savedHours);
  const savedMinutes = Math.round((savedHours - savedWholeHours) * 60);

  // Multi-month savings history (most recent first), including one overspent month.
  const historySource = [
    { income: savingsIncome, expense: savingsExpense },
    { income: 3200, expense: 2100 },
    { income: 3000, expense: 2750 },
    { income: 3000, expense: 3900 },
    { income: 2900, expense: 1450 },
    { income: 3100, expense: 2480 },
  ];
  let historyTotalSaved = 0;
  let historyRateSum = 0;
  let historyRateCount = 0;
  const historyMonths = historySource.map((m, i) => {
    const d = new Date(year, month - i, 1);
    const monthSaved = m.income - m.expense;
    historyTotalSaved += monthSaved;
    const monthHasIncome = m.income > 0;
    const monthHasActivity = m.income > 0 || m.expense > 0;
    const monthRate = monthHasIncome ? monthSaved / m.income : 0;
    if (monthHasIncome) {
      historyRateSum += monthRate;
      historyRateCount += 1;
    }
    return {
      monthKey: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      monthLabel: d.toLocaleDateString('en-US', { month: 'short' }),
      income: m.income,
      expense: m.expense,
      saved: monthSaved,
      savingsRate: monthRate,
      rateLabel: monthHasIncome ? `${Math.abs(Math.round(monthRate * 100))}%` : '—',
      savedLabel: monthHasActivity ? `$${shortNum(Math.abs(monthSaved))}` : '—',
      isPositive: monthSaved >= 0,
      hasIncome: monthHasIncome,
      hasActivity: monthHasActivity,
    };
  });
  const historyAvgRate =
    historyRateCount > 0
      ? `${historyRateSum / historyRateCount < 0 ? '−' : ''}${Math.abs(Math.round((historyRateSum / historyRateCount) * 100))}%`
      : '—';

  // Budget sample: a plausible mid-month plan (~78% used, one category over).
  const budgetTotal = 1200;
  const budgetSpent = 942;
  const budgetRemaining = budgetTotal - budgetSpent;
  const budgetPace = todayNum / daysInMonth;

  return JSON.stringify({
    schemaVersion: 2,
    generatedAt: now.toISOString(),
    isPro: true,
    locale: 'en',
    currencySymbol: '$',
    widgets: [],
    monthlyExpenseQuickLog: {
      widgetId: 'monthly_expense_quick_log',
      title: 'Monthly Spend',
      monthKey,
      expenseAmount: 1284,
      expenseLabel: '$1,284',
      timeEquivalentLabel: '85h 36m of work',
      hasHourlyRate: true,
      incomeUrl: 'money2time://quick-add?type=income',
      expenseUrl: 'money2time://quick-add?type=expense',
    },
    quickAddSmall: {
      widgetId: 'quick_add_small',
      title: 'Quick Add',
      monthKey,
      expenseAmount: 1284,
      expenseLabel: '$1,284',
      timeEquivalentLabel: '85h 36m of work',
      hasHourlyRate: true,
      incomeUrl: 'money2time://quick-add?type=income',
      expenseUrl: 'money2time://quick-add?type=expense',
    },
    weeklyExpense: {
      widgetId: 'weekly_expense',
      title: 'Past 7 Days',
      days: weeklyDays,
      totalAmount: weeklyTotal,
      totalLabel: `$${shortNum(weeklyTotal)}`,
      maxAmount: Math.max(...barAmounts),
    },
    calendarMonth: {
      widgetId: 'calendar_month',
      title: 'Calendar',
      monthKey,
      monthLabel,
      weekdayLabels,
      leadingSpacers,
      days,
      totalIncome,
      totalExpense,
      incomeLabel: `$${shortNum(totalIncome)}`,
      expenseLabel: `$${shortNum(totalExpense)}`,
    },
    savingsRate: {
      widgetId: 'savings_rate',
      title: 'Savings Rate',
      monthKey,
      monthLabel,
      income: savingsIncome,
      expense: savingsExpense,
      saved,
      savingsRate,
      rateLabel: `${savingsRate < 0 ? '−' : ''}${Math.abs(Math.round(savingsRate * 100))}%`,
      incomeLabel: `$${shortNum(savingsIncome)}`,
      expenseLabel: `$${shortNum(savingsExpense)}`,
      savedLabel: `$${shortNum(Math.abs(saved))}`,
      savedCaption: saved >= 0 ? 'Saved' : 'Overspent',
      isPositive: saved >= 0,
      hasIncome: savingsIncome > 0,
      timeEquivalentLabel: `≈ ${savedWholeHours}h ${savedMinutes}m of work ${saved >= 0 ? 'kept' : 'behind'}`,
    },
    savingsHistory: {
      widgetId: 'savings_history',
      title: 'Savings History',
      months: historyMonths,
      averageRateLabel: historyAvgRate,
      totalSaved: historyTotalSaved,
      totalSavedLabel: `$${shortNum(Math.abs(historyTotalSaved))}`,
      totalIsPositive: historyTotalSaved >= 0,
    },
    budgetRing: {
      widgetId: 'budget_ring',
      title: 'Budget',
      monthKey,
      monthLabel,
      monthShortLabel,
      hasBudget: true,
      usageRatio: budgetSpent / budgetTotal,
      isOver: false,
      remainingLabel: `$${shortNum(budgetRemaining)}`,
      captionLabel: `left of $${shortNum(budgetTotal)}`,
      paceRatio: budgetPace,
      daysLeftLabel: `${daysInMonth - todayNum} days left`,
      setupLabel: 'Set a monthly budget',
      budgetUrl: 'money2time://budget',
    },
    budgetBreakdown: {
      widgetId: 'budget_breakdown',
      title: 'Budget Breakdown',
      monthKey,
      monthLabel,
      hasBudget: true,
      totalSpentLabel: `$${shortNum(budgetSpent)}`,
      totalBudgetLabel: `$${shortNum(budgetTotal)}`,
      usageRatio: budgetSpent / budgetTotal,
      isOver: false,
      remainingLabel: `$${shortNum(budgetRemaining)} left`,
      paceRatio: budgetPace,
      categories: [
        // Over-budget line floats to the top, matching the JS snapshot builder.
        {
          categoryId: 'fun',
          name: 'Fun',
          emoji: '🎬',
          usageRatio: 1.18,
          isOver: true,
          spentLabel: '$236',
          budgetedLabel: '$200',
        },
        {
          categoryId: 'food',
          name: 'Food',
          emoji: '🍜',
          usageRatio: 0.71,
          isOver: false,
          spentLabel: '$320',
          budgetedLabel: '$450',
        },
        {
          categoryId: 'shopping',
          name: 'Shopping',
          emoji: '🛍️',
          usageRatio: 0.48,
          isOver: false,
          spentLabel: '$143',
          budgetedLabel: '$300',
        },
        {
          categoryId: 'transport',
          name: 'Transport',
          emoji: '🚌',
          usageRatio: 0.38,
          isOver: false,
          spentLabel: '$96',
          budgetedLabel: '$250',
        },
      ],
      moreLabel: '',
      unbudgetedLabel: '+$147 unbudgeted',
      setupLabel: 'Set a monthly budget',
      budgetUrl: 'money2time://budget',
    },
    proUnlockUrlByWidgetId: {
      weekly_expense: 'money2time://pro?source=widget_weekly_expense',
      calendar_month: 'money2time://pro?source=widget_calendar_month',
      savings_rate: 'money2time://pro?source=widget_savings_rate',
      savings_history: 'money2time://pro?source=widget_savings_history',
      budget_ring: 'money2time://pro?source=widget_budget_ring',
      budget_breakdown: 'money2time://pro?source=widget_budget_breakdown',
    },
  });
}

// Escaped for embedding inside a double-quoted Swift / Java string literal.
const SAMPLE_SNAPSHOT_JSON_LITERAL = buildSampleSnapshotJson()
  .replace(/\\/g, '\\\\')
  .replace(/"/g, '\\"');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFileIfChanged(filePath, contents) {
  ensureDir(path.dirname(filePath));
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === contents) return;
  fs.writeFileSync(filePath, contents);
}

function copyFileIfChanged(sourcePath, destinationPath) {
  if (!fs.existsSync(sourcePath)) {
    // A bare ENOENT from copyFileSync buries the cause in a stack of config
    // plugin frames. Name the missing asset so the next rename is obvious.
    throw new Error(
      `withMoney2TimeWidgets: missing asset "${sourcePath}". ` +
        'A widget asset was renamed or deleted without updating this plugin.',
    );
  }
  ensureDir(path.dirname(destinationPath));
  if (
    fs.existsSync(destinationPath) &&
    fs.readFileSync(sourcePath).equals(fs.readFileSync(destinationPath))
  ) {
    return;
  }
  fs.copyFileSync(sourcePath, destinationPath);
}

function patchMainApplication(androidRoot) {
  const candidates = [
    path.join(androidRoot, 'app/src/main/java/com/nelsongan/money2time/MainApplication.kt'),
    path.join(androidRoot, 'app/src/main/java/com/nelsongan/money2time/MainApplication.java'),
  ];
  const filePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!filePath) return;

  let source = fs.readFileSync(filePath, 'utf8');
  if (source.includes('Money2TimeWidgetPackage')) return;

  if (filePath.endsWith('.kt')) {
    source = source.replace(
      /package com\.nelsongan\.money2time\n/,
      'package com.nelsongan.money2time\n\nimport com.nelsongan.money2time.widgets.Money2TimeWidgetPackage\n',
    );
    source = source.replace(
      /(PackageList\(this\)\.packages\s*)/,
      '$1\n          .also { packages -> packages.add(Money2TimeWidgetPackage()) }',
    );
  } else {
    source = source.replace(
      /package com\.nelsongan\.money2time;\n/,
      'package com.nelsongan.money2time;\n\nimport com.nelsongan.money2time.widgets.Money2TimeWidgetPackage;\n',
    );
    source = source.replace(
      /(List<ReactPackage> packages = new PackageList\(this\)\.getPackages\(\);)/,
      '$1\n          packages.add(new Money2TimeWidgetPackage());',
    );
  }

  fs.writeFileSync(filePath, source);
}

const ANDROID_WIDGET_RECEIVERS = [
  {
    name: '.widgets.Money2TimeWidgetProvider',
    resource: '@xml/money2time_monthly_expense_widget',
  },
  {
    name: '.widgets.Money2TimeQuickAddWidgetProvider',
    resource: '@xml/money2time_quick_add_widget',
  },
  {
    name: '.widgets.Money2TimeWeeklyExpenseWidgetProvider',
    resource: '@xml/money2time_weekly_expense_widget',
  },
  {
    name: '.widgets.Money2TimeCalendarWidgetProvider',
    resource: '@xml/money2time_calendar_widget',
  },
  {
    name: '.widgets.Money2TimeSavingsRateWidgetProvider',
    resource: '@xml/money2time_savings_rate_widget',
  },
  {
    name: '.widgets.Money2TimeSavingsHistoryWidgetProvider',
    resource: '@xml/money2time_savings_history_widget',
  },
  {
    name: '.widgets.Money2TimeBudgetRingWidgetProvider',
    resource: '@xml/money2time_budget_ring_widget',
  },
  {
    name: '.widgets.Money2TimeBudgetBreakdownWidgetProvider',
    resource: '@xml/money2time_budget_breakdown_widget',
  },
];

function addAndroidWidgetReceiver(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.receiver = app.receiver ?? [];

    ANDROID_WIDGET_RECEIVERS.forEach(({ name, resource }) => {
      const existing = app.receiver.find((receiver) => receiver.$?.['android:name'] === name);
      if (existing) {
        // Keep the provider-info resource in sync if it changed.
        existing['meta-data'] = [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': resource,
            },
          },
        ];
        return;
      }
      app.receiver.push({
        $: {
          'android:name': name,
          'android:exported': 'true',
          'android:label': 'Money2Time',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': resource,
            },
          },
        ],
      });
    });

    return cfg;
  });
}

function addAndroidWidgetFiles(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const androidRoot = path.join(projectRoot, 'android');
      const packagePath = 'com/nelsongan/money2time';
      const sourceRoot = path.join(androidRoot, 'app/src/main/java', packagePath);
      const widgetRoot = path.join(sourceRoot, 'widgets');
      const resRoot = path.join(androidRoot, 'app/src/main/res');
      const bannerAssetPath = path.join(projectRoot, BANNER_ASSET);
      const mascotAssetPath = path.join(projectRoot, MASCOT_ASSET);

      copyFileIfChanged(bannerAssetPath, path.join(resRoot, 'drawable-nodpi/banner.png'));
      copyFileIfChanged(mascotAssetPath, path.join(resRoot, 'drawable-nodpi/widget_mascot.png'));

      // --- Generated repetitive markup / id arrays -------------------------
      // Sample data baked into the static layout so the widget picker (which
      // does NOT run the provider) shows a populated chart instead of flat bars.
      const SAMPLE_BARS = [42, 18, 67, 9, 88, 124, 53];
      const SAMPLE_BAR_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
      const SAMPLE_BAR_MAX = 124;
      const SAMPLE_BAR_MAX_HEIGHT = 54;
      const barColumns = Array.from({ length: 7 }, (_, i) => {
        const amount = SAMPLE_BARS[i];
        const heightDp = Math.max(6, Math.round((amount / SAMPLE_BAR_MAX) * SAMPLE_BAR_MAX_HEIGHT));
        const isPeak = amount >= SAMPLE_BAR_MAX;
        const barBg = isPeak ? '@drawable/money2time_bar_peak' : '@drawable/money2time_bar';
        return `      <LinearLayout
        android:layout_width="0dp"
        android:layout_height="match_parent"
        android:layout_weight="1"
        android:orientation="vertical"
        android:gravity="center_horizontal|bottom">
        <TextView android:id="@+id/bar_val_${i}" android:layout_width="wrap_content" android:layout_height="wrap_content" android:textSize="8sp" android:textStyle="bold" android:textColor="#D45F57" android:text="${amount}" />
        <FrameLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" android:layout_marginTop="4dp" android:layout_marginBottom="4dp">
          <FrameLayout android:id="@+id/bar_${i}" android:layout_width="match_parent" android:layout_height="${heightDp}dp" android:layout_gravity="bottom" android:background="${barBg}" />
        </FrameLayout>
        <TextView android:id="@+id/bar_day_${i}" android:layout_width="wrap_content" android:layout_height="wrap_content" android:textSize="9sp" android:textStyle="bold" android:textColor="#94A39F" android:text="${SAMPLE_BAR_DAYS[i]}" />
      </LinearLayout>`;
      }).join('\n');

      const calWeekdays = Array.from(
        { length: 7 },
        (_, i) =>
          `      <TextView android:id="@+id/cal_wd_${i}" android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:gravity="center" android:textSize="9sp" android:textStyle="bold" android:textColor="#94A39F" android:text="${SAMPLE_BAR_DAYS[i]}" />`,
      ).join('\n');

      // Sample month baked into the static grid so the picker shows a populated
      // calendar (provider overrides every cell with real data on placement).
      const calNow = new Date();
      const calDaysInMonth = new Date(calNow.getFullYear(), calNow.getMonth() + 1, 0).getDate();
      const calTodayNum = calNow.getDate();
      const calFirstWeekday = new Date(calNow.getFullYear(), calNow.getMonth(), 1).getDay();
      const calLeading = (calFirstWeekday - 1 + 7) % 7; // Monday-first
      const SAMPLE_INCOME_DAYS = { 3: 1200, 10: 60, 17: 30, 24: 2400 };
      const SAMPLE_EXPENSE_DAYS = {
        2: 24,
        5: 88,
        6: 132,
        12: 9,
        15: 210,
        18: 64,
        22: 77,
        25: 53,
        27: 119,
      };
      const shortNum = (v) =>
        v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}K` : String(Math.round(v));

      const calCell = (i) => {
        const dayIndex = i - calLeading;
        const isSpacer = i < calLeading || dayIndex >= calDaysInMonth;
        const dayNum = dayIndex + 1;
        const inc = isSpacer ? 0 : SAMPLE_INCOME_DAYS[dayNum] || 0;
        const exp = isSpacer ? 0 : SAMPLE_EXPENSE_DAYS[dayNum] || 0;
        const isToday = !isSpacer && dayNum === calTodayNum;
        const hasActivity = inc > 0 || exp > 0;
        const dayColor = isToday
          ? '#1F8A6F'
          : hasActivity
            ? inc > exp
              ? '#1E9468'
              : '#D45F57'
            : '#94A39F';
        const cellBg = isToday
          ? '@drawable/money2time_cal_cell_today'
          : '@drawable/money2time_cal_cell';
        const incText = inc > 0 ? shortNum(inc) : '';
        const expText = exp > 0 ? shortNum(exp) : !hasActivity && !isSpacer ? '\\u2013' : '';
        const expColor = hasActivity ? '#D45F57' : '#C2CBC7';
        return `        <LinearLayout
          android:id="@+id/cal_cell_${i}"
          android:layout_width="0dp"
          android:layout_height="match_parent"
          android:layout_weight="1"
          android:layout_margin="2dp"
          android:orientation="vertical"
          android:gravity="center_horizontal"
          android:paddingTop="3dp"
          android:paddingBottom="3dp"
          android:background="${cellBg}"
          android:visibility="${isSpacer ? 'invisible' : 'visible'}">
          <TextView android:id="@+id/cal_day_${i}" android:layout_width="wrap_content" android:layout_height="wrap_content" android:textSize="10sp" android:textStyle="bold" android:textColor="${dayColor}" android:text="${isSpacer ? '' : dayNum}" />
          <LinearLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" android:orientation="vertical" android:gravity="center">
            <TextView android:id="@+id/cal_inc_${i}" android:layout_width="wrap_content" android:layout_height="wrap_content" android:textSize="8sp" android:textStyle="bold" android:textColor="#1E9468" android:maxLines="1" android:text="${incText}" />
            <TextView android:id="@+id/cal_exp_${i}" android:layout_width="wrap_content" android:layout_height="wrap_content" android:textSize="8sp" android:textStyle="bold" android:textColor="${expColor}" android:maxLines="1" android:text="${expText}" />
          </LinearLayout>
        </LinearLayout>`;
      };

      // Weighted rows fill the (taller-than-iOS) Android widget height so the
      // grid spreads evenly. The provider collapses fully-empty trailing rows
      // (GONE) so months needing <6 rows still fill the height, no blank band.
      const calRows = Array.from(
        { length: 6 },
        (_, r) =>
          `      <LinearLayout android:id="@+id/cal_row_${r}" android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" android:orientation="horizontal">\n${Array.from(
            { length: 7 },
            (__, c) => calCell(r * 7 + c),
          ).join('\n')}\n      </LinearLayout>`,
      ).join('\n');

      const joinIds = (prefix, count) =>
        Array.from({ length: count }, (_, i) => `R.id.${prefix}${i}`).join(', ');
      const barIds = joinIds('bar_', 7);
      const barValIds = joinIds('bar_val_', 7);
      const barDayIds = joinIds('bar_day_', 7);
      const calCellIds = joinIds('cal_cell_', 42);
      const calDayIds = joinIds('cal_day_', 42);
      const calIncIds = joinIds('cal_inc_', 42);
      const calExpIds = joinIds('cal_exp_', 42);
      const calWdIds = joinIds('cal_wd_', 7);
      const calRowIds = joinIds('cal_row_', 6);

      // --- Savings history rows (6 months) ---------------------------------
      const HIST_MONTHS = 6;
      const histMonthIds = joinIds('hist_month_', HIST_MONTHS);
      const histBarPosIds = joinIds('hist_bar_pos_', HIST_MONTHS);
      const histBarNegIds = joinIds('hist_bar_neg_', HIST_MONTHS);
      const histRateIds = joinIds('hist_rate_', HIST_MONTHS);
      const histSavedIds = joinIds('hist_saved_', HIST_MONTHS);

      // Sample rows baked into the static layout so the widget picker shows a
      // populated trend (provider overrides every row with real data on placement).
      const HIST_SAMPLE = [
        { rate: 68, saved: '$2.5K', positive: true },
        { rate: 34, saved: '$1.1K', positive: true },
        { rate: 8, saved: '$250', positive: true },
        { rate: 30, saved: '$900', positive: false },
        { rate: 50, saved: '$1.5K', positive: true },
        { rate: 20, saved: '$620', positive: true },
      ];
      const histNow = new Date();
      const historyRows = HIST_SAMPLE.map((row, i) => {
        const d = new Date(histNow.getFullYear(), histNow.getMonth() - i, 1);
        const label = d.toLocaleDateString('en-US', { month: 'short' });
        const color = row.positive ? '#1E9468' : '#D45F57';
        return `      <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1"
        android:gravity="center_vertical"
        android:orientation="horizontal">
        <TextView android:id="@+id/hist_month_${i}" android:layout_width="34dp" android:layout_height="wrap_content" android:textSize="12sp" android:textStyle="bold" android:textColor="#6B7A77" android:text="${label}" />
        <FrameLayout android:layout_width="0dp" android:layout_height="12dp" android:layout_weight="1" android:layout_marginStart="10dp" android:layout_marginEnd="10dp">
          <ProgressBar android:id="@+id/hist_bar_pos_${i}" style="@android:style/Widget.ProgressBar.Horizontal" android:layout_width="match_parent" android:layout_height="12dp" android:max="100" android:progress="${row.rate}" android:progressDrawable="@drawable/money2time_savings_progress" android:visibility="${row.positive ? 'visible' : 'gone'}" />
          <ProgressBar android:id="@+id/hist_bar_neg_${i}" style="@android:style/Widget.ProgressBar.Horizontal" android:layout_width="match_parent" android:layout_height="12dp" android:max="100" android:progress="${row.rate}" android:progressDrawable="@drawable/money2time_savings_progress_neg" android:visibility="${row.positive ? 'gone' : 'visible'}" />
        </FrameLayout>
        <LinearLayout android:layout_width="64dp" android:layout_height="wrap_content" android:orientation="vertical" android:gravity="end">
          <TextView android:id="@+id/hist_rate_${i}" android:layout_width="wrap_content" android:layout_height="wrap_content" android:textSize="15sp" android:textStyle="bold" android:textColor="${color}" android:text="${row.rate}%" />
          <TextView android:id="@+id/hist_saved_${i}" android:layout_width="wrap_content" android:layout_height="wrap_content" android:textSize="10sp" android:textStyle="bold" android:textColor="#94A39F" android:text="${row.saved}" />
        </LinearLayout>
      </LinearLayout>`;
      }).join('\n');

      // --- Monthly spend provider (free) -----------------------------------
      writeFileIfChanged(
        path.join(widgetRoot, 'Money2TimeWidgetProvider.java'),
        `package com.nelsongan.money2time.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import com.nelsongan.money2time.R;

import org.json.JSONObject;

public class Money2TimeWidgetProvider extends AppWidgetProvider {
  static final String PREFS_NAME = "${SNAPSHOT_PREFS}";
  static final String SNAPSHOT_KEY = "${SNAPSHOT_KEY}";

  @Override
  public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
    for (int appWidgetId : appWidgetIds) {
      updateWidget(context, manager, appWidgetId);
    }
  }

  static void updateAll(Context context) {
    AppWidgetManager manager = AppWidgetManager.getInstance(context);
    android.content.ComponentName provider = new android.content.ComponentName(context, Money2TimeWidgetProvider.class);
    int[] ids = manager.getAppWidgetIds(provider);
    for (int id : ids) {
      updateWidget(context, manager, id);
    }
  }

  private static PendingIntent deepLinkIntent(Context context, String url, int requestCode) {
    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
    intent.setPackage(context.getPackageName());
    return PendingIntent.getActivity(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );
  }

  private static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.money2time_monthly_expense_widget);
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    String json = prefs.getString(SNAPSHOT_KEY, null);
    if (json == null) json = Money2TimeWidgetSampleData.JSON;

    String amount = "$0";
    String time = "Set hourly value in app";
    try {
      JSONObject root = new JSONObject(json);
      JSONObject widget = root.getJSONObject("monthlyExpenseQuickLog");
      amount = widget.optString("expenseLabel", amount);
      time = widget.optString("timeEquivalentLabel", time);
    } catch (Exception ignored) {}

    views.setTextViewText(R.id.money2time_widget_amount, amount);
    views.setTextViewText(R.id.money2time_widget_time, time);
    views.setViewVisibility(R.id.money2time_widget_locked, View.GONE);
    views.setTextColor(R.id.money2time_widget_amount, Color.parseColor("#D45F57"));
    views.setOnClickPendingIntent(
      R.id.money2time_widget_income,
      deepLinkIntent(context, "money2time://quick-add?type=income", 101)
    );
    views.setOnClickPendingIntent(
      R.id.money2time_widget_expense,
      deepLinkIntent(context, "money2time://quick-add?type=expense", 102)
    );

    manager.updateAppWidget(appWidgetId, views);
  }
}
`,
      );

      // --- Quick add provider (free, small) --------------------------------
      writeFileIfChanged(
        path.join(widgetRoot, 'Money2TimeQuickAddWidgetProvider.java'),
        `package com.nelsongan.money2time.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.widget.RemoteViews;

import com.nelsongan.money2time.R;

import org.json.JSONObject;

public class Money2TimeQuickAddWidgetProvider extends AppWidgetProvider {
  static final String PREFS_NAME = "${SNAPSHOT_PREFS}";
  static final String SNAPSHOT_KEY = "${SNAPSHOT_KEY}";

  @Override
  public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
    for (int appWidgetId : appWidgetIds) {
      updateWidget(context, manager, appWidgetId);
    }
  }

  static void updateAll(Context context) {
    AppWidgetManager manager = AppWidgetManager.getInstance(context);
    ComponentName provider = new ComponentName(context, Money2TimeQuickAddWidgetProvider.class);
    int[] ids = manager.getAppWidgetIds(provider);
    for (int id : ids) {
      updateWidget(context, manager, id);
    }
  }

  private static PendingIntent linkIntent(Context context, String url, int code) {
    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
    intent.setPackage(context.getPackageName());
    return PendingIntent.getActivity(
      context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.money2time_quick_add_widget);
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    String json = prefs.getString(SNAPSHOT_KEY, null);

    String amount = "$0";
    String time = "Set hourly value in app";
    String incomeUrl = "money2time://quick-add?type=income";
    String expenseUrl = "money2time://quick-add?type=expense";
    try {
      if (json == null) json = Money2TimeWidgetSampleData.JSON;
      JSONObject root = new JSONObject(json);
      JSONObject widget = root.getJSONObject("quickAddSmall");
      amount = widget.optString("expenseLabel", amount);
      time = widget.optString("timeEquivalentLabel", time);
      incomeUrl = widget.optString("incomeUrl", incomeUrl);
      expenseUrl = widget.optString("expenseUrl", expenseUrl);
    } catch (Exception ignored) {}

    views.setTextViewText(R.id.quickadd_amount, amount);
    views.setTextColor(R.id.quickadd_amount, Color.parseColor("#D45F57"));
    views.setTextViewText(R.id.quickadd_time, time);
    views.setOnClickPendingIntent(R.id.quickadd_income, linkIntent(context, incomeUrl, 201));
    views.setOnClickPendingIntent(R.id.quickadd_expense, linkIntent(context, expenseUrl, 202));

    manager.updateAppWidget(appWidgetId, views);
  }
}
`,
      );

      // --- Past 7 days provider (pro) --------------------------------------
      writeFileIfChanged(
        path.join(widgetRoot, 'Money2TimeWeeklyExpenseWidgetProvider.java'),
        `package com.nelsongan.money2time.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import com.nelsongan.money2time.R;

import org.json.JSONArray;
import org.json.JSONObject;

public class Money2TimeWeeklyExpenseWidgetProvider extends AppWidgetProvider {
  static final String PREFS_NAME = "${SNAPSHOT_PREFS}";
  static final String SNAPSHOT_KEY = "${SNAPSHOT_KEY}";

  private static final int[] BAR_IDS = { ${barIds} };
  private static final int[] BAR_VAL_IDS = { ${barValIds} };
  private static final int[] BAR_DAY_IDS = { ${barDayIds} };

  @Override
  public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
    for (int appWidgetId : appWidgetIds) {
      updateWidget(context, manager, appWidgetId);
    }
  }

  static void updateAll(Context context) {
    AppWidgetManager manager = AppWidgetManager.getInstance(context);
    ComponentName provider = new ComponentName(context, Money2TimeWeeklyExpenseWidgetProvider.class);
    int[] ids = manager.getAppWidgetIds(provider);
    for (int id : ids) {
      updateWidget(context, manager, id);
    }
  }

  private static PendingIntent linkIntent(Context context, String url, int code) {
    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
    intent.setPackage(context.getPackageName());
    return PendingIntent.getActivity(
      context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.money2time_weekly_expense_widget);
    // The PRO badge is only for the widget picker preview; hide it on the placed widget.
    views.setViewVisibility(R.id.weekly_pro_badge, View.GONE);
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    String json = prefs.getString(SNAPSHOT_KEY, null);

    try {
      if (json == null) json = Money2TimeWidgetSampleData.JSON;
      JSONObject root = new JSONObject(json);
      boolean isPro = root.optBoolean("isPro", false);

      if (!isPro) {
        views.setViewVisibility(R.id.weekly_content, View.GONE);
        views.setViewVisibility(R.id.weekly_locked, View.VISIBLE);
        views.setTextViewText(R.id.weekly_locked_text, "Available with Money2Time Pro");
        String url = "money2time://pro";
        JSONObject unlock = root.optJSONObject("proUnlockUrlByWidgetId");
        if (unlock != null) url = unlock.optString("weekly_expense", url);
        views.setOnClickPendingIntent(R.id.weekly_root, linkIntent(context, url, 301));
      } else {
        views.setViewVisibility(R.id.weekly_locked, View.GONE);
        views.setViewVisibility(R.id.weekly_content, View.VISIBLE);
        views.setOnClickPendingIntent(R.id.weekly_root, linkIntent(context, "money2time://insights?focus=expense_breakdown", 302));
        JSONObject weekly = root.getJSONObject("weeklyExpense");
        views.setTextViewText(R.id.weekly_total, weekly.optString("totalLabel", "$0"));
        double max = weekly.optDouble("maxAmount", 0);
        JSONArray days = weekly.getJSONArray("days");
        for (int i = 0; i < BAR_IDS.length && i < days.length(); i++) {
          JSONObject day = days.getJSONObject(i);
          double amount = day.optDouble("amount", 0);
          boolean isToday = day.optBoolean("isToday", false);
          boolean isZero = amount <= 0;
          views.setTextViewText(BAR_VAL_IDS[i], isZero ? "\\u2013" : day.optString("barLabel", ""));
          views.setTextColor(
            BAR_VAL_IDS[i],
            isZero ? Color.parseColor("#B6BFBC") : Color.parseColor("#D45F57"));
          views.setTextViewText(BAR_DAY_IDS[i], day.optString("weekdayLabel", ""));
          views.setTextColor(BAR_DAY_IDS[i], isToday ? Color.parseColor("#1F8A6F") : Color.parseColor("#94A39F"));

          int heightDp;
          if (isZero) {
            views.setInt(BAR_IDS[i], "setBackgroundResource", R.drawable.money2time_bar_zero);
            heightDp = 5;
          } else {
            boolean isPeak = amount >= max;
            views.setInt(
              BAR_IDS[i],
              "setBackgroundResource",
              isPeak ? R.drawable.money2time_bar_peak : R.drawable.money2time_bar);
            double frac = Math.max(0.08, Math.min(1.0, amount / Math.max(1.0, max)));
            heightDp = (int) Math.round(Math.max(6.0, frac * 64.0));
          }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            views.setViewLayoutHeight(BAR_IDS[i], (float) heightDp, TypedValue.COMPLEX_UNIT_DIP);
          }
        }
      }
    } catch (Exception e) {
      views.setViewVisibility(R.id.weekly_content, View.GONE);
      views.setViewVisibility(R.id.weekly_locked, View.VISIBLE);
      views.setTextViewText(R.id.weekly_locked_text, "Open Money2Time to get started.");
    }

    manager.updateAppWidget(appWidgetId, views);
  }
}
`,
      );

      // --- Calendar provider (pro) -----------------------------------------
      writeFileIfChanged(
        path.join(widgetRoot, 'Money2TimeCalendarWidgetProvider.java'),
        `package com.nelsongan.money2time.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import com.nelsongan.money2time.R;

import org.json.JSONArray;
import org.json.JSONObject;

public class Money2TimeCalendarWidgetProvider extends AppWidgetProvider {
  static final String PREFS_NAME = "${SNAPSHOT_PREFS}";
  static final String SNAPSHOT_KEY = "${SNAPSHOT_KEY}";

  private static final int[] CELL_IDS = { ${calCellIds} };
  private static final int[] DAY_IDS = { ${calDayIds} };
  private static final int[] INC_IDS = { ${calIncIds} };
  private static final int[] EXP_IDS = { ${calExpIds} };
  private static final int[] WD_IDS = { ${calWdIds} };
  private static final int[] ROW_IDS = { ${calRowIds} };

  @Override
  public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
    for (int appWidgetId : appWidgetIds) {
      updateWidget(context, manager, appWidgetId);
    }
  }

  static void updateAll(Context context) {
    AppWidgetManager manager = AppWidgetManager.getInstance(context);
    ComponentName provider = new ComponentName(context, Money2TimeCalendarWidgetProvider.class);
    int[] ids = manager.getAppWidgetIds(provider);
    for (int id : ids) {
      updateWidget(context, manager, id);
    }
  }

  private static PendingIntent linkIntent(Context context, String url, int code) {
    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
    intent.setPackage(context.getPackageName());
    return PendingIntent.getActivity(
      context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.money2time_calendar_widget);
    // The PRO badge is only for the widget picker preview; hide it on the placed widget.
    views.setViewVisibility(R.id.calendar_pro_badge, View.GONE);
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    String json = prefs.getString(SNAPSHOT_KEY, null);

    try {
      if (json == null) json = Money2TimeWidgetSampleData.JSON;
      JSONObject root = new JSONObject(json);
      boolean isPro = root.optBoolean("isPro", false);

      if (!isPro) {
        views.setViewVisibility(R.id.calendar_content, View.GONE);
        views.setViewVisibility(R.id.calendar_locked, View.VISIBLE);
        views.setTextViewText(R.id.calendar_locked_text, "Available with Money2Time Pro");
        String url = "money2time://pro";
        JSONObject unlock = root.optJSONObject("proUnlockUrlByWidgetId");
        if (unlock != null) url = unlock.optString("calendar_month", url);
        views.setOnClickPendingIntent(R.id.calendar_root, linkIntent(context, url, 401));
        manager.updateAppWidget(appWidgetId, views);
        return;
      }

      views.setViewVisibility(R.id.calendar_locked, View.GONE);
      views.setViewVisibility(R.id.calendar_content, View.VISIBLE);
      views.setOnClickPendingIntent(R.id.calendar_root, linkIntent(context, "money2time://calendar", 402));

      JSONObject calendar = root.getJSONObject("calendarMonth");
      views.setTextViewText(R.id.cal_month, calendar.optString("monthLabel", ""));
      views.setTextViewText(R.id.cal_in, "\\u2193 " + calendar.optString("incomeLabel", "$0"));
      views.setTextViewText(R.id.cal_out, "\\u2191 " + calendar.optString("expenseLabel", "$0"));

      JSONArray weekdayLabels = calendar.optJSONArray("weekdayLabels");
      if (weekdayLabels != null) {
        for (int i = 0; i < WD_IDS.length && i < weekdayLabels.length(); i++) {
          views.setTextViewText(WD_IDS[i], weekdayLabels.optString(i, ""));
        }
      }

      int leading = calendar.optInt("leadingSpacers", 0);
      JSONArray days = calendar.getJSONArray("days");

      // Collapse fully-empty trailing rows so the used rows fill the height.
      int rowsUsed = (int) Math.ceil((leading + days.length()) / 7.0);
      for (int r = 0; r < ROW_IDS.length; r++) {
        views.setViewVisibility(ROW_IDS[r], r < rowsUsed ? View.VISIBLE : View.GONE);
      }

      for (int i = 0; i < CELL_IDS.length; i++) {
        int dayIndex = i - leading;
        if (i < leading || dayIndex >= days.length()) {
          views.setViewVisibility(CELL_IDS[i], View.INVISIBLE);
          continue;
        }

        JSONObject day = days.getJSONObject(dayIndex);
        boolean isToday = day.optBoolean("isToday", false);
        boolean hasActivity = day.optBoolean("hasActivity", false);
        boolean incomeStronger = day.optBoolean("incomeStronger", false);
        String incomeLabel = day.optString("incomeLabel", "");
        String expenseLabel = day.optString("expenseLabel", "");

        views.setViewVisibility(CELL_IDS[i], View.VISIBLE);
        views.setInt(
          CELL_IDS[i],
          "setBackgroundResource",
          isToday ? R.drawable.money2time_cal_cell_today : R.drawable.money2time_cal_cell);

        views.setTextViewText(DAY_IDS[i], String.valueOf(day.optInt("dayNumber", 0)));
        int dayColor =
          isToday
            ? Color.parseColor("#1F8A6F")
            : (hasActivity
              ? (incomeStronger ? Color.parseColor("#1E9468") : Color.parseColor("#D45F57"))
              : Color.parseColor("#94A39F"));
        views.setTextColor(DAY_IDS[i], dayColor);

        if (hasActivity) {
          if (!incomeLabel.isEmpty()) {
            views.setViewVisibility(INC_IDS[i], View.VISIBLE);
            views.setTextViewText(INC_IDS[i], incomeLabel);
          } else {
            views.setViewVisibility(INC_IDS[i], View.GONE);
          }
          if (!expenseLabel.isEmpty()) {
            views.setViewVisibility(EXP_IDS[i], View.VISIBLE);
            views.setTextViewText(EXP_IDS[i], expenseLabel);
            views.setTextColor(EXP_IDS[i], Color.parseColor("#D45F57"));
          } else {
            views.setViewVisibility(EXP_IDS[i], View.GONE);
          }
        } else {
          views.setViewVisibility(INC_IDS[i], View.GONE);
          views.setViewVisibility(EXP_IDS[i], View.VISIBLE);
          views.setTextViewText(EXP_IDS[i], "\\u2013");
          views.setTextColor(EXP_IDS[i], Color.parseColor("#C2CBC7"));
        }
      }
    } catch (Exception e) {
      views.setViewVisibility(R.id.calendar_content, View.GONE);
      views.setViewVisibility(R.id.calendar_locked, View.VISIBLE);
      views.setTextViewText(R.id.calendar_locked_text, "Open Money2Time to get started.");
    }

    manager.updateAppWidget(appWidgetId, views);
  }
}
`,
      );

      // --- Savings rate provider (pro) -------------------------------------
      writeFileIfChanged(
        path.join(widgetRoot, 'Money2TimeSavingsRateWidgetProvider.java'),
        `package com.nelsongan.money2time.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import com.nelsongan.money2time.R;

import org.json.JSONObject;

public class Money2TimeSavingsRateWidgetProvider extends AppWidgetProvider {
  static final String PREFS_NAME = "${SNAPSHOT_PREFS}";
  static final String SNAPSHOT_KEY = "${SNAPSHOT_KEY}";

  @Override
  public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
    for (int appWidgetId : appWidgetIds) {
      updateWidget(context, manager, appWidgetId);
    }
  }

  static void updateAll(Context context) {
    AppWidgetManager manager = AppWidgetManager.getInstance(context);
    ComponentName provider = new ComponentName(context, Money2TimeSavingsRateWidgetProvider.class);
    int[] ids = manager.getAppWidgetIds(provider);
    for (int id : ids) {
      updateWidget(context, manager, id);
    }
  }

  private static PendingIntent linkIntent(Context context, String url, int code) {
    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
    intent.setPackage(context.getPackageName());
    return PendingIntent.getActivity(
      context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.money2time_savings_rate_widget);
    views.setViewVisibility(R.id.savings_pro_badge, View.GONE);
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    String json = prefs.getString(SNAPSHOT_KEY, null);

    try {
      if (json == null) json = Money2TimeWidgetSampleData.JSON;
      JSONObject root = new JSONObject(json);
      boolean isPro = root.optBoolean("isPro", false);

      if (!isPro) {
        views.setViewVisibility(R.id.savings_content, View.GONE);
        views.setViewVisibility(R.id.savings_locked, View.VISIBLE);
        views.setTextViewText(R.id.savings_locked_text, "Available with Money2Time Pro");
        String url = "money2time://pro";
        JSONObject unlock = root.optJSONObject("proUnlockUrlByWidgetId");
        if (unlock != null) url = unlock.optString("savings_rate", url);
        views.setOnClickPendingIntent(R.id.savings_root, linkIntent(context, url, 501));
      } else {
        views.setViewVisibility(R.id.savings_locked, View.GONE);
        views.setViewVisibility(R.id.savings_content, View.VISIBLE);
        views.setOnClickPendingIntent(
          R.id.savings_root,
          linkIntent(context, "money2time://insights?focus=savings_rate", 502));

        JSONObject sr = root.getJSONObject("savingsRate");
        boolean hasIncome = sr.optBoolean("hasIncome", false);
        boolean isPositive = sr.optBoolean("isPositive", true);
        double rate = sr.optDouble("savingsRate", 0);

        int heroColor = !hasIncome
          ? Color.parseColor("#94A39F")
          : (isPositive ? Color.parseColor("#1E9468") : Color.parseColor("#F37D57"));

        String rateLabel = sr.optString("rateLabel", "—");
        String numberPart = rateLabel;
        boolean hasPercent = rateLabel.endsWith("%");
        if (hasPercent) numberPart = rateLabel.substring(0, rateLabel.length() - 1);
        views.setTextViewText(R.id.savings_rate_num, numberPart);
        views.setTextColor(R.id.savings_rate_num, heroColor);
        views.setViewVisibility(R.id.savings_rate_pct, hasPercent ? View.VISIBLE : View.GONE);
        views.setTextColor(R.id.savings_rate_pct, heroColor);

        String month = sr.optString("monthLabel", "");
        views.setTextViewText(R.id.savings_month, month);

        String time = sr.optString("timeEquivalentLabel", "");
        String subtitle = !hasIncome
          ? "Add income to see your rate"
          : (time.isEmpty() ? "of income saved" : time);
        views.setTextViewText(R.id.savings_subtitle, subtitle);

        int progress = isPositive ? (int) Math.round(Math.max(0, Math.min(1, rate)) * 100) : 0;
        views.setProgressBar(R.id.savings_bar, 100, progress, false);

        views.setInt(
          R.id.savings_saved_dot,
          "setBackgroundResource",
          isPositive ? R.drawable.money2time_dot_saved : R.drawable.money2time_dot_overspent);
        views.setTextViewText(
          R.id.savings_saved,
          sr.optString("savedCaption", "Saved") + " " + sr.optString("savedLabel", "$0"));
        views.setTextViewText(R.id.savings_spent, "Spent " + sr.optString("expenseLabel", "$0"));
      }
    } catch (Exception e) {
      views.setViewVisibility(R.id.savings_content, View.GONE);
      views.setViewVisibility(R.id.savings_locked, View.VISIBLE);
      views.setTextViewText(R.id.savings_locked_text, "Open Money2Time to get started.");
    }

    manager.updateAppWidget(appWidgetId, views);
  }
}
`,
      );

      // --- Savings history provider (pro, large) ---------------------------
      writeFileIfChanged(
        path.join(widgetRoot, 'Money2TimeSavingsHistoryWidgetProvider.java'),
        `package com.nelsongan.money2time.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import com.nelsongan.money2time.R;

import org.json.JSONArray;
import org.json.JSONObject;

public class Money2TimeSavingsHistoryWidgetProvider extends AppWidgetProvider {
  static final String PREFS_NAME = "${SNAPSHOT_PREFS}";
  static final String SNAPSHOT_KEY = "${SNAPSHOT_KEY}";

  private static final int[] MONTH_IDS = { ${histMonthIds} };
  private static final int[] BAR_POS_IDS = { ${histBarPosIds} };
  private static final int[] BAR_NEG_IDS = { ${histBarNegIds} };
  private static final int[] RATE_IDS = { ${histRateIds} };
  private static final int[] SAVED_IDS = { ${histSavedIds} };

  @Override
  public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
    for (int appWidgetId : appWidgetIds) {
      updateWidget(context, manager, appWidgetId);
    }
  }

  static void updateAll(Context context) {
    AppWidgetManager manager = AppWidgetManager.getInstance(context);
    ComponentName provider = new ComponentName(context, Money2TimeSavingsHistoryWidgetProvider.class);
    int[] ids = manager.getAppWidgetIds(provider);
    for (int id : ids) {
      updateWidget(context, manager, id);
    }
  }

  private static PendingIntent linkIntent(Context context, String url, int code) {
    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
    intent.setPackage(context.getPackageName());
    return PendingIntent.getActivity(
      context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.money2time_savings_history_widget);
    views.setViewVisibility(R.id.hist_pro_badge, View.GONE);
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    String json = prefs.getString(SNAPSHOT_KEY, null);

    try {
      if (json == null) json = Money2TimeWidgetSampleData.JSON;
      JSONObject root = new JSONObject(json);
      boolean isPro = root.optBoolean("isPro", false);

      if (!isPro) {
        views.setViewVisibility(R.id.hist_content, View.GONE);
        views.setViewVisibility(R.id.hist_locked, View.VISIBLE);
        views.setTextViewText(R.id.hist_locked_text, "Available with Money2Time Pro");
        String url = "money2time://pro";
        JSONObject unlock = root.optJSONObject("proUnlockUrlByWidgetId");
        if (unlock != null) url = unlock.optString("savings_history", url);
        views.setOnClickPendingIntent(R.id.hist_root, linkIntent(context, url, 601));
        manager.updateAppWidget(appWidgetId, views);
        return;
      }

      views.setViewVisibility(R.id.hist_locked, View.GONE);
      views.setViewVisibility(R.id.hist_content, View.VISIBLE);
      views.setOnClickPendingIntent(
        R.id.hist_root, linkIntent(context, "money2time://insights?focus=savings_rate", 602));

      JSONObject sh = root.getJSONObject("savingsHistory");
      boolean totalPositive = sh.optBoolean("totalIsPositive", true);
      views.setTextViewText(R.id.hist_total, sh.optString("totalSavedLabel", "$0"));
      views.setTextColor(
        R.id.hist_total,
        totalPositive ? Color.parseColor("#1E9468") : Color.parseColor("#D45F57"));
      views.setTextViewText(R.id.hist_avg, sh.optString("averageRateLabel", "—"));

      JSONArray months = sh.getJSONArray("months");
      for (int i = 0; i < MONTH_IDS.length; i++) {
        if (i >= months.length()) {
          views.setTextViewText(MONTH_IDS[i], "");
          views.setTextViewText(RATE_IDS[i], "");
          views.setTextViewText(SAVED_IDS[i], "");
          views.setViewVisibility(BAR_POS_IDS[i], View.GONE);
          views.setViewVisibility(BAR_NEG_IDS[i], View.GONE);
          continue;
        }
        JSONObject m = months.getJSONObject(i);
        boolean hasIncome = m.optBoolean("hasIncome", false);
        boolean hasActivity = m.optBoolean("hasActivity", false);
        boolean isPositive = m.optBoolean("isPositive", true);
        double rate = m.optDouble("savingsRate", 0);
        int color = !hasIncome
          ? Color.parseColor("#94A39F")
          : (isPositive ? Color.parseColor("#1E9468") : Color.parseColor("#D45F57"));

        views.setTextViewText(MONTH_IDS[i], m.optString("monthLabel", ""));
        views.setTextViewText(RATE_IDS[i], m.optString("rateLabel", "—"));
        views.setTextColor(RATE_IDS[i], hasActivity ? color : Color.parseColor("#94A39F"));
        views.setTextViewText(SAVED_IDS[i], m.optString("savedLabel", "—"));

        int pct = (int) Math.round(Math.min(1.0, Math.abs(rate)) * 100);
        if (!hasActivity) {
          views.setViewVisibility(BAR_POS_IDS[i], View.GONE);
          views.setViewVisibility(BAR_NEG_IDS[i], View.GONE);
        } else if (isPositive) {
          views.setViewVisibility(BAR_NEG_IDS[i], View.GONE);
          views.setViewVisibility(BAR_POS_IDS[i], View.VISIBLE);
          views.setProgressBar(BAR_POS_IDS[i], 100, Math.max(4, pct), false);
        } else {
          views.setViewVisibility(BAR_POS_IDS[i], View.GONE);
          views.setViewVisibility(BAR_NEG_IDS[i], View.VISIBLE);
          views.setProgressBar(BAR_NEG_IDS[i], 100, Math.max(8, pct), false);
        }
      }
    } catch (Exception e) {
      views.setViewVisibility(R.id.hist_content, View.GONE);
      views.setViewVisibility(R.id.hist_locked, View.VISIBLE);
      views.setTextViewText(R.id.hist_locked_text, "Open Money2Time to get started.");
    }

    manager.updateAppWidget(appWidgetId, views);
  }
}
`,
      );

      // --- Budget ring provider (free, small) -------------------------------
      writeFileIfChanged(
        path.join(widgetRoot, 'Money2TimeBudgetRingWidgetProvider.java'),
        `package com.nelsongan.money2time.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import com.nelsongan.money2time.R;

import org.json.JSONObject;

public class Money2TimeBudgetRingWidgetProvider extends AppWidgetProvider {
  static final String PREFS_NAME = "${SNAPSHOT_PREFS}";
  static final String SNAPSHOT_KEY = "${SNAPSHOT_KEY}";

  @Override
  public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
    for (int appWidgetId : appWidgetIds) {
      updateWidget(context, manager, appWidgetId);
    }
  }

  static void updateAll(Context context) {
    AppWidgetManager manager = AppWidgetManager.getInstance(context);
    ComponentName provider = new ComponentName(context, Money2TimeBudgetRingWidgetProvider.class);
    int[] ids = manager.getAppWidgetIds(provider);
    for (int id : ids) {
      updateWidget(context, manager, id);
    }
  }

  private static PendingIntent linkIntent(Context context, String url, int code) {
    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
    intent.setPackage(context.getPackageName());
    return PendingIntent.getActivity(
      context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.money2time_budget_ring_widget);
    // The PRO ribbon only rides the static picker preview; a placed widget hides it.
    views.setViewVisibility(R.id.ring_pro_badge, View.GONE);
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    String json = prefs.getString(SNAPSHOT_KEY, null);

    views.setOnClickPendingIntent(R.id.ring_root, linkIntent(context, "money2time://budget", 701));

    try {
      if (json == null) json = Money2TimeWidgetSampleData.JSON;
      JSONObject root = new JSONObject(json);
      boolean isPro = root.optBoolean("isPro", false);

      if (!isPro) {
        views.setViewVisibility(R.id.ring_content, View.GONE);
        views.setViewVisibility(R.id.ring_setup, View.GONE);
        views.setViewVisibility(R.id.ring_locked, View.VISIBLE);
        String url = "money2time://pro";
        JSONObject unlock = root.optJSONObject("proUnlockUrlByWidgetId");
        if (unlock != null) url = unlock.optString("budget_ring", url);
        views.setOnClickPendingIntent(R.id.ring_root, linkIntent(context, url, 703));
        manager.updateAppWidget(appWidgetId, views);
        return;
      }
      views.setViewVisibility(R.id.ring_locked, View.GONE);

      JSONObject br = root.optJSONObject("budgetRing");
      // Snapshots from an older app version have no budget section — treat as no budget.
      boolean hasBudget = br != null && br.optBoolean("hasBudget", false);

      if (!hasBudget) {
        // The snapshot carries the localized CTA; the layout text is only the
        // fallback for stale (pre-budget) snapshots.
        String setupLabel = br != null ? br.optString("setupLabel", "") : "";
        if (!setupLabel.isEmpty()) views.setTextViewText(R.id.ring_setup_title, setupLabel);
        views.setViewVisibility(R.id.ring_content, View.GONE);
        views.setViewVisibility(R.id.ring_setup, View.VISIBLE);
        manager.updateAppWidget(appWidgetId, views);
        return;
      }

      views.setViewVisibility(R.id.ring_setup, View.GONE);
      views.setViewVisibility(R.id.ring_content, View.VISIBLE);

      boolean isOver = br.optBoolean("isOver", false);
      double ratio = br.optDouble("usageRatio", 0);
      int amountColor = isOver
        ? Color.parseColor("#D45F57")
        : Color.parseColor("#1A2E2A");

      views.setTextViewText(R.id.ring_amount, br.optString("remainingLabel", ""));
      views.setTextColor(R.id.ring_amount, amountColor);
      views.setTextViewText(R.id.ring_caption, br.optString("captionLabel", ""));
      views.setTextViewText(R.id.ring_days, br.optString("daysLeftLabel", ""));
      String shortMonth = br.optString("monthShortLabel", "");
      if (!shortMonth.isEmpty()) {
        views.setTextViewText(R.id.ring_month, shortMonth.toUpperCase(java.util.Locale.ROOT));
      }

      int progress = (int) Math.round(Math.max(0, Math.min(1, ratio)) * 100);
      if (isOver || ratio >= 0.8) {
        views.setViewVisibility(R.id.ring_bar_pos, View.GONE);
        views.setViewVisibility(R.id.ring_bar_neg, View.VISIBLE);
        views.setProgressBar(R.id.ring_bar_neg, 100, Math.max(6, progress), false);
      } else {
        views.setViewVisibility(R.id.ring_bar_neg, View.GONE);
        views.setViewVisibility(R.id.ring_bar_pos, View.VISIBLE);
        views.setProgressBar(R.id.ring_bar_pos, 100, Math.max(3, progress), false);
      }
    } catch (Exception e) {
      views.setViewVisibility(R.id.ring_content, View.GONE);
      views.setViewVisibility(R.id.ring_setup, View.VISIBLE);
    }

    manager.updateAppWidget(appWidgetId, views);
  }
}
`,
      );

      // --- Budget breakdown provider (pro, large) ---------------------------
      const BUD_ROWS = 5;
      const budRowIds = joinIds('bud_row_', BUD_ROWS);
      const budEmojiIds = joinIds('bud_emoji_', BUD_ROWS);
      const budNameIds = joinIds('bud_name_', BUD_ROWS);
      const budValsIds = joinIds('bud_vals_', BUD_ROWS);
      const budBarPosIds = joinIds('bud_bar_pos_', BUD_ROWS);
      const budBarNegIds = joinIds('bud_bar_neg_', BUD_ROWS);

      writeFileIfChanged(
        path.join(widgetRoot, 'Money2TimeBudgetBreakdownWidgetProvider.java'),
        `package com.nelsongan.money2time.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import com.nelsongan.money2time.R;

import org.json.JSONArray;
import org.json.JSONObject;

public class Money2TimeBudgetBreakdownWidgetProvider extends AppWidgetProvider {
  static final String PREFS_NAME = "${SNAPSHOT_PREFS}";
  static final String SNAPSHOT_KEY = "${SNAPSHOT_KEY}";

  private static final int[] ROW_IDS = { ${budRowIds} };
  private static final int[] EMOJI_IDS = { ${budEmojiIds} };
  private static final int[] NAME_IDS = { ${budNameIds} };
  private static final int[] VALS_IDS = { ${budValsIds} };
  private static final int[] BAR_POS_IDS = { ${budBarPosIds} };
  private static final int[] BAR_NEG_IDS = { ${budBarNegIds} };

  @Override
  public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
    for (int appWidgetId : appWidgetIds) {
      updateWidget(context, manager, appWidgetId);
    }
  }

  static void updateAll(Context context) {
    AppWidgetManager manager = AppWidgetManager.getInstance(context);
    ComponentName provider = new ComponentName(context, Money2TimeBudgetBreakdownWidgetProvider.class);
    int[] ids = manager.getAppWidgetIds(provider);
    for (int id : ids) {
      updateWidget(context, manager, id);
    }
  }

  private static PendingIntent linkIntent(Context context, String url, int code) {
    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
    intent.setPackage(context.getPackageName());
    return PendingIntent.getActivity(
      context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.money2time_budget_breakdown_widget);
    views.setViewVisibility(R.id.bud_pro_badge, View.GONE);
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    String json = prefs.getString(SNAPSHOT_KEY, null);

    try {
      if (json == null) json = Money2TimeWidgetSampleData.JSON;
      JSONObject root = new JSONObject(json);
      boolean isPro = root.optBoolean("isPro", false);

      if (!isPro) {
        views.setViewVisibility(R.id.bud_content, View.GONE);
        views.setViewVisibility(R.id.bud_locked, View.VISIBLE);
        views.setTextViewText(R.id.bud_locked_text, "Available with Money2Time Pro");
        String url = "money2time://pro";
        JSONObject unlock = root.optJSONObject("proUnlockUrlByWidgetId");
        if (unlock != null) url = unlock.optString("budget_breakdown", url);
        views.setOnClickPendingIntent(R.id.bud_root, linkIntent(context, url, 801));
        manager.updateAppWidget(appWidgetId, views);
        return;
      }

      views.setViewVisibility(R.id.bud_locked, View.GONE);
      views.setViewVisibility(R.id.bud_content, View.VISIBLE);
      views.setOnClickPendingIntent(R.id.bud_root, linkIntent(context, "money2time://budget", 802));

      JSONObject bb = root.optJSONObject("budgetBreakdown");
      // Snapshots from an older app version have no budget section — treat as no budget.
      boolean hasBudget = bb != null && bb.optBoolean("hasBudget", false);
      if (!hasBudget) {
        // The snapshot carries the localized CTA; the layout text is only the
        // fallback for stale (pre-budget) snapshots.
        String setupLabel = bb != null ? bb.optString("setupLabel", "") : "";
        if (!setupLabel.isEmpty()) views.setTextViewText(R.id.bud_setup_title, setupLabel);
        views.setViewVisibility(R.id.bud_body, View.GONE);
        views.setViewVisibility(R.id.bud_setup, View.VISIBLE);
        manager.updateAppWidget(appWidgetId, views);
        return;
      }
      views.setViewVisibility(R.id.bud_setup, View.GONE);
      views.setViewVisibility(R.id.bud_body, View.VISIBLE);

      boolean isOver = bb.optBoolean("isOver", false);
      double ratio = bb.optDouble("usageRatio", 0);

      views.setTextViewText(R.id.bud_month, bb.optString("monthLabel", ""));
      views.setTextViewText(
        R.id.bud_totals,
        bb.optString("totalSpentLabel", "$0") + " / " + bb.optString("totalBudgetLabel", "$0"));
      views.setTextViewText(R.id.bud_remaining, bb.optString("remainingLabel", ""));
      views.setTextColor(
        R.id.bud_remaining,
        isOver ? Color.parseColor("#D45F57") : Color.parseColor("#1F8A6F"));

      int progress = (int) Math.round(Math.max(0, Math.min(1, ratio)) * 100);
      if (isOver || ratio >= 0.8) {
        views.setViewVisibility(R.id.bud_total_bar_pos, View.GONE);
        views.setViewVisibility(R.id.bud_total_bar_neg, View.VISIBLE);
        views.setProgressBar(R.id.bud_total_bar_neg, 100, Math.max(6, progress), false);
      } else {
        views.setViewVisibility(R.id.bud_total_bar_neg, View.GONE);
        views.setViewVisibility(R.id.bud_total_bar_pos, View.VISIBLE);
        views.setProgressBar(R.id.bud_total_bar_pos, 100, Math.max(3, progress), false);
      }

      JSONArray categories = bb.getJSONArray("categories");
      for (int i = 0; i < ROW_IDS.length; i++) {
        if (i >= categories.length()) {
          views.setViewVisibility(ROW_IDS[i], View.GONE);
          continue;
        }
        views.setViewVisibility(ROW_IDS[i], View.VISIBLE);
        JSONObject line = categories.getJSONObject(i);
        boolean lineOver = line.optBoolean("isOver", false);
        double lineRatio = line.optDouble("usageRatio", 0);
        String emoji = line.optString("emoji", "");
        views.setTextViewText(EMOJI_IDS[i], emoji.isEmpty() ? "\\u2022" : emoji);
        views.setTextViewText(NAME_IDS[i], line.optString("name", ""));
        views.setTextViewText(
          VALS_IDS[i],
          line.optString("spentLabel", "$0") + " / " + line.optString("budgetedLabel", "$0"));

        int linePct = (int) Math.round(Math.max(0, Math.min(1, lineRatio)) * 100);
        if (lineOver || lineRatio >= 0.8) {
          views.setViewVisibility(BAR_POS_IDS[i], View.GONE);
          views.setViewVisibility(BAR_NEG_IDS[i], View.VISIBLE);
          views.setProgressBar(BAR_NEG_IDS[i], 100, Math.max(6, linePct), false);
        } else {
          views.setViewVisibility(BAR_NEG_IDS[i], View.GONE);
          views.setViewVisibility(BAR_POS_IDS[i], View.VISIBLE);
          views.setProgressBar(BAR_POS_IDS[i], 100, Math.max(3, linePct), false);
        }
      }

      views.setTextViewText(R.id.bud_unbudgeted, bb.optString("unbudgetedLabel", ""));
      views.setTextViewText(R.id.bud_more, bb.optString("moreLabel", ""));
    } catch (Exception e) {
      views.setViewVisibility(R.id.bud_content, View.GONE);
      views.setViewVisibility(R.id.bud_locked, View.VISIBLE);
      views.setTextViewText(R.id.bud_locked_text, "Open Money2Time to get started.");
    }

    manager.updateAppWidget(appWidgetId, views);
  }
}
`,
      );

      // --- Native module + package ----------------------------------------
      writeFileIfChanged(
        path.join(widgetRoot, 'Money2TimeWidgetModule.java'),
        `package com.nelsongan.money2time.widgets;

import android.content.Context;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class Money2TimeWidgetModule extends ReactContextBaseJavaModule {
  public Money2TimeWidgetModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @NonNull
  @Override
  public String getName() {
    return "Money2TimeWidget";
  }

  private void reloadWidgets(Context context) {
    Money2TimeWidgetProvider.updateAll(context);
    Money2TimeQuickAddWidgetProvider.updateAll(context);
    Money2TimeWeeklyExpenseWidgetProvider.updateAll(context);
    Money2TimeCalendarWidgetProvider.updateAll(context);
    Money2TimeSavingsRateWidgetProvider.updateAll(context);
    Money2TimeSavingsHistoryWidgetProvider.updateAll(context);
    Money2TimeBudgetRingWidgetProvider.updateAll(context);
    Money2TimeBudgetBreakdownWidgetProvider.updateAll(context);
  }

  @ReactMethod
  public void writeSnapshot(String json, Promise promise) {
    getReactApplicationContext()
      .getSharedPreferences("${SNAPSHOT_PREFS}", Context.MODE_PRIVATE)
      .edit()
      .putString("${SNAPSHOT_KEY}", json)
      .apply();
    reloadWidgets(getReactApplicationContext());
    promise.resolve(null);
  }

  @ReactMethod
  public void reloadAll(Promise promise) {
    reloadWidgets(getReactApplicationContext());
    promise.resolve(null);
  }
}
`,
      );

      writeFileIfChanged(
        path.join(widgetRoot, 'Money2TimeWidgetPackage.java'),
        `package com.nelsongan.money2time.widgets;

import androidx.annotation.NonNull;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class Money2TimeWidgetPackage implements ReactPackage {
  @NonNull
  @Override
  public List<NativeModule> createNativeModules(@NonNull ReactApplicationContext reactContext) {
    List<NativeModule> modules = new ArrayList<>();
    modules.add(new Money2TimeWidgetModule(reactContext));
    return modules;
  }

  @NonNull
  @Override
  public List<ViewManager> createViewManagers(@NonNull ReactApplicationContext reactContext) {
    return Collections.emptyList();
  }
}
`,
      );

      // --- Provider-info XML -----------------------------------------------
      writeFileIfChanged(
        path.join(resRoot, 'xml/money2time_monthly_expense_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:minWidth="250dp"
  android:minHeight="150dp"
  android:targetCellWidth="4"
  android:targetCellHeight="3"
  android:updatePeriodMillis="0"
  android:initialLayout="@layout/money2time_monthly_expense_widget"
  android:previewLayout="@layout/money2time_monthly_expense_widget"
  android:resizeMode="horizontal|vertical"
  android:widgetCategory="home_screen" />
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'xml/money2time_weekly_expense_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:minWidth="250dp"
  android:minHeight="110dp"
  android:targetCellWidth="4"
  android:targetCellHeight="2"
  android:updatePeriodMillis="0"
  android:initialLayout="@layout/money2time_weekly_expense_widget"
  android:previewLayout="@layout/money2time_weekly_expense_widget"
  android:resizeMode="horizontal|vertical"
  android:widgetCategory="home_screen" />
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'xml/money2time_calendar_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:minWidth="250dp"
  android:minHeight="250dp"
  android:targetCellWidth="4"
  android:targetCellHeight="4"
  android:updatePeriodMillis="0"
  android:initialLayout="@layout/money2time_calendar_widget"
  android:previewLayout="@layout/money2time_calendar_widget"
  android:resizeMode="horizontal|vertical"
  android:widgetCategory="home_screen" />
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'xml/money2time_savings_rate_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:minWidth="250dp"
  android:minHeight="110dp"
  android:targetCellWidth="4"
  android:targetCellHeight="2"
  android:updatePeriodMillis="0"
  android:initialLayout="@layout/money2time_savings_rate_widget"
  android:previewLayout="@layout/money2time_savings_rate_widget"
  android:resizeMode="horizontal|vertical"
  android:widgetCategory="home_screen" />
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'xml/money2time_quick_add_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:minWidth="110dp"
  android:minHeight="110dp"
  android:targetCellWidth="2"
  android:targetCellHeight="2"
  android:updatePeriodMillis="0"
  android:initialLayout="@layout/money2time_quick_add_widget"
  android:previewLayout="@layout/money2time_quick_add_widget"
  android:resizeMode="horizontal|vertical"
  android:widgetCategory="home_screen" />
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'xml/money2time_savings_history_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:minWidth="250dp"
  android:minHeight="250dp"
  android:targetCellWidth="4"
  android:targetCellHeight="4"
  android:updatePeriodMillis="0"
  android:initialLayout="@layout/money2time_savings_history_widget"
  android:previewLayout="@layout/money2time_savings_history_widget"
  android:resizeMode="horizontal|vertical"
  android:widgetCategory="home_screen" />
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'xml/money2time_budget_ring_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:minWidth="110dp"
  android:minHeight="110dp"
  android:targetCellWidth="2"
  android:targetCellHeight="2"
  android:updatePeriodMillis="0"
  android:initialLayout="@layout/money2time_budget_ring_widget"
  android:previewLayout="@layout/money2time_budget_ring_widget"
  android:resizeMode="horizontal|vertical"
  android:widgetCategory="home_screen" />
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'xml/money2time_budget_breakdown_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:minWidth="250dp"
  android:minHeight="250dp"
  android:targetCellWidth="4"
  android:targetCellHeight="4"
  android:updatePeriodMillis="0"
  android:initialLayout="@layout/money2time_budget_breakdown_widget"
  android:previewLayout="@layout/money2time_budget_breakdown_widget"
  android:resizeMode="horizontal|vertical"
  android:widgetCategory="home_screen" />
`,
      );

      // --- Layouts ----------------------------------------------------------
      writeFileIfChanged(
        path.join(resRoot, 'layout/money2time_monthly_expense_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:background="@drawable/money2time_widget_background"
  android:orientation="vertical"
  android:padding="14dp">

  <ImageView
    android:layout_width="112dp"
    android:layout_height="28dp"
    android:adjustViewBounds="true"
    android:contentDescription="Money2Time"
    android:scaleType="fitStart"
    android:src="@drawable/banner" />

  <FrameLayout
    android:layout_width="match_parent"
    android:layout_height="0dp"
    android:layout_weight="1" />

  <TextView
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:letterSpacing="0.12"
    android:text="THIS MONTH"
    android:textColor="#94A39F"
    android:textSize="11sp"
    android:textStyle="bold" />

  <TextView
    android:id="@+id/money2time_widget_amount"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="4dp"
    android:autoSizeMaxTextSize="38sp"
    android:autoSizeMinTextSize="22sp"
    android:autoSizeTextType="uniform"
    android:includeFontPadding="false"
    android:maxLines="1"
    android:text="$1,284"
    android:textColor="#D45F57"
    android:textSize="38sp"
    android:textStyle="bold" />

  <TextView
    android:id="@+id/money2time_widget_time"
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:layout_marginTop="5dp"
    android:maxLines="1"
    android:text="85h 36m of work"
    android:textColor="#6B7A77"
    android:textSize="13sp"
    android:textStyle="bold" />

  <TextView
    android:id="@+id/money2time_widget_locked"
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:text="Unlock Pro"
    android:textColor="#1F8A6F"
    android:textStyle="bold"
    android:visibility="gone" />

  <FrameLayout
    android:layout_width="match_parent"
    android:layout_height="0dp"
    android:layout_weight="1" />

  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="horizontal">

    <LinearLayout
      android:id="@+id/money2time_widget_income"
      android:layout_width="0dp"
      android:layout_height="46dp"
      android:layout_weight="1"
      android:background="@drawable/money2time_widget_income_button"
      android:gravity="center"
      android:orientation="horizontal"
      android:paddingHorizontal="12dp">
      <ImageView
        android:layout_width="26dp"
        android:layout_height="26dp"
        android:background="@drawable/money2time_badge_income"
        android:padding="6dp"
        android:scaleType="fitCenter"
        android:src="@drawable/money2time_ic_plus" />
      <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginStart="9dp"
        android:maxLines="1"
        android:text="Income"
        android:textColor="#1E9468"
        android:textSize="14sp"
        android:textStyle="bold" />
    </LinearLayout>

    <LinearLayout
      android:id="@+id/money2time_widget_expense"
      android:layout_width="0dp"
      android:layout_height="46dp"
      android:layout_weight="1"
      android:layout_marginStart="12dp"
      android:background="@drawable/money2time_widget_expense_button"
      android:gravity="center"
      android:orientation="horizontal"
      android:paddingHorizontal="12dp">
      <ImageView
        android:layout_width="26dp"
        android:layout_height="26dp"
        android:background="@drawable/money2time_badge_expense"
        android:padding="6dp"
        android:scaleType="fitCenter"
        android:src="@drawable/money2time_ic_minus" />
      <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginStart="9dp"
        android:maxLines="1"
        android:text="Expense"
        android:textColor="#D45F57"
        android:textSize="14sp"
        android:textStyle="bold" />
    </LinearLayout>
  </LinearLayout>
</LinearLayout>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'layout/money2time_weekly_expense_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/weekly_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:background="@drawable/money2time_widget_background"
  android:clipToPadding="false"
  android:clipToOutline="true"
  android:padding="16dp">

  <LinearLayout
    android:id="@+id/weekly_content"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical">

    <LinearLayout
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:orientation="horizontal">
      <ImageView
        android:layout_width="116dp"
        android:layout_height="32dp"
        android:adjustViewBounds="true"
        android:contentDescription="Money2Time"
        android:scaleType="fitStart"
        android:src="@drawable/banner" />
      <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_weight="1"
        android:gravity="end"
        android:orientation="vertical">
        <TextView
          android:layout_width="wrap_content"
          android:layout_height="wrap_content"
          android:letterSpacing="0.12"
          android:text="PAST 7 DAYS"
          android:textColor="#94A39F"
          android:textSize="10sp"
          android:textStyle="bold" />
        <TextView
          android:id="@+id/weekly_total"
          android:layout_width="wrap_content"
          android:layout_height="wrap_content"
          android:text="$401"
          android:textColor="#D45F57"
          android:textSize="22sp"
          android:textStyle="bold" />
      </LinearLayout>
    </LinearLayout>

    <LinearLayout
      android:layout_width="match_parent"
      android:layout_height="0dp"
      android:layout_weight="1"
      android:layout_marginTop="8dp"
      android:orientation="horizontal">
${barColumns}
    </LinearLayout>
  </LinearLayout>

  <LinearLayout
    android:id="@+id/weekly_locked"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:gravity="center_vertical"
    android:orientation="vertical"
    android:visibility="gone">
    <LinearLayout
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:gravity="center_vertical"
      android:orientation="horizontal">
      <ImageView
        android:layout_width="58dp"
        android:layout_height="58dp"
        android:adjustViewBounds="true"
        android:contentDescription="Money2Time Pro"
        android:src="@drawable/widget_mascot" />
      <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_marginStart="12dp"
        android:layout_weight="1"
        android:orientation="vertical">
        <TextView
          android:layout_width="wrap_content"
          android:layout_height="wrap_content"
          android:maxLines="1"
          android:text="Past 7 Days"
          android:textColor="#1A2E2A"
          android:textSize="16sp"
          android:textStyle="bold" />
        <TextView
          android:id="@+id/weekly_locked_text"
          android:layout_width="wrap_content"
          android:layout_height="wrap_content"
          android:layout_marginTop="2dp"
          android:maxLines="1"
          android:text="Available with Money2Time Pro"
          android:textColor="#6B7A77"
          android:textSize="11sp"
          android:textStyle="bold" />
      </LinearLayout>
    </LinearLayout>
    <TextView
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:layout_marginTop="12dp"
      android:background="@drawable/money2time_cta_pill"
      android:gravity="center"
      android:paddingVertical="10dp"
      android:text="✨ Unlock Pro"
      android:textColor="#FFFFFF"
      android:textSize="14sp"
      android:textStyle="bold" />
  </LinearLayout>

  <FrameLayout
    android:id="@+id/weekly_pro_badge"
    android:layout_width="58dp"
    android:layout_height="58dp"
    android:layout_gravity="top|end"
    android:layout_marginTop="-16dp"
    android:layout_marginEnd="-16dp"
    android:clipChildren="true">
    <TextView
      android:layout_width="120dp"
      android:layout_height="wrap_content"
      android:layout_gravity="center"
      android:background="#F6B750"
      android:gravity="center"
      android:includeFontPadding="false"
      android:paddingVertical="3dp"
      android:rotation="45"
      android:text="PRO"
      android:textColor="#FFFFFF"
      android:textSize="9sp"
      android:textStyle="bold"
      android:translationX="15dp"
      android:translationY="-15dp" />
  </FrameLayout>
</FrameLayout>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'layout/money2time_calendar_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/calendar_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:background="@drawable/money2time_widget_background"
  android:clipToPadding="false"
  android:clipToOutline="true"
  android:padding="16dp">

  <LinearLayout
    android:id="@+id/calendar_content"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical">

    <LinearLayout
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:orientation="horizontal"
      android:gravity="top">
      <ImageView
        android:layout_width="108dp"
        android:layout_height="30dp"
        android:adjustViewBounds="true"
        android:contentDescription="Money2Time"
        android:scaleType="fitStart"
        android:src="@drawable/banner" />
      <FrameLayout
        android:layout_width="0dp"
        android:layout_height="1dp"
        android:layout_weight="1" />
      <LinearLayout
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:orientation="vertical"
        android:gravity="end">
        <TextView
          android:id="@+id/cal_month"
          android:layout_width="wrap_content"
          android:layout_height="wrap_content"
          android:layout_gravity="end"
          android:text="This Month"
          android:textColor="#1A2E2A"
          android:textSize="14sp"
          android:textStyle="bold" />
        <LinearLayout
          android:layout_width="wrap_content"
          android:layout_height="wrap_content"
          android:layout_marginTop="6dp"
          android:orientation="horizontal">
          <TextView
            android:id="@+id/cal_in"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:background="@drawable/money2time_chip_income"
            android:paddingHorizontal="9dp"
            android:paddingVertical="5dp"
            android:text="↓ $3.7K"
            android:textColor="#1E9468"
            android:textSize="12sp"
            android:textStyle="bold" />
          <TextView
            android:id="@+id/cal_out"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginStart="7dp"
            android:background="@drawable/money2time_chip_expense"
            android:paddingHorizontal="9dp"
            android:paddingVertical="5dp"
            android:text="↑ $776"
            android:textColor="#D45F57"
            android:textSize="12sp"
            android:textStyle="bold" />
        </LinearLayout>
      </LinearLayout>
    </LinearLayout>

    <LinearLayout
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:layout_marginTop="12dp"
      android:layout_marginBottom="4dp"
      android:orientation="horizontal">
${calWeekdays}
    </LinearLayout>

    <LinearLayout
      android:layout_width="match_parent"
      android:layout_height="0dp"
      android:layout_weight="1"
      android:orientation="vertical">
${calRows}
    </LinearLayout>
  </LinearLayout>

  <LinearLayout
    android:id="@+id/calendar_locked"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:gravity="center_horizontal"
    android:orientation="vertical"
    android:paddingHorizontal="16dp"
    android:visibility="gone">
    <FrameLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" />
    <ImageView
      android:layout_width="104dp"
      android:layout_height="104dp"
      android:adjustViewBounds="true"
      android:contentDescription="Money2Time Pro"
      android:src="@drawable/widget_mascot" />
    <TextView
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="6dp"
      android:text="Calendar"
      android:textColor="#1A2E2A"
      android:textSize="21sp"
      android:textStyle="bold" />
    <TextView
      android:id="@+id/calendar_locked_text"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="3dp"
      android:gravity="center"
      android:text="Available with Money2Time Pro"
      android:textColor="#6B7A77"
      android:textSize="13sp"
      android:textStyle="bold" />
    <FrameLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" />
    <TextView
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:background="@drawable/money2time_cta_pill"
      android:gravity="center"
      android:paddingVertical="12dp"
      android:text="✨ Unlock Pro"
      android:textColor="#FFFFFF"
      android:textSize="15sp"
      android:textStyle="bold" />
  </LinearLayout>

  <FrameLayout
    android:id="@+id/calendar_pro_badge"
    android:layout_width="58dp"
    android:layout_height="58dp"
    android:layout_gravity="top|end"
    android:layout_marginTop="-16dp"
    android:layout_marginEnd="-16dp"
    android:clipChildren="true">
    <TextView
      android:layout_width="120dp"
      android:layout_height="wrap_content"
      android:layout_gravity="center"
      android:background="#F6B750"
      android:gravity="center"
      android:includeFontPadding="false"
      android:paddingVertical="3dp"
      android:rotation="45"
      android:text="PRO"
      android:textColor="#FFFFFF"
      android:textSize="9sp"
      android:textStyle="bold"
      android:translationX="15dp"
      android:translationY="-15dp" />
  </FrameLayout>
</FrameLayout>
`,
      );

      // Android medium widgets are taller/more square than iOS; the hero row is
      // weighted so it absorbs the extra height with header pinned top, footer bottom.
      writeFileIfChanged(
        path.join(resRoot, 'layout/money2time_savings_rate_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/savings_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:background="@drawable/money2time_widget_background"
  android:clipToPadding="false"
  android:clipToOutline="true"
  android:padding="16dp">

  <LinearLayout
    android:id="@+id/savings_content"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical">

    <LinearLayout
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:gravity="center_vertical"
      android:orientation="horizontal">
      <ImageView
        android:layout_width="104dp"
        android:layout_height="28dp"
        android:adjustViewBounds="true"
        android:contentDescription="Money2Time"
        android:scaleType="fitStart"
        android:src="@drawable/banner" />
      <TextView
        android:id="@+id/savings_month"
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_weight="1"
        android:gravity="end"
        android:maxLines="1"
        android:text="June 2026"
        android:textColor="#1A2E2A"
        android:textSize="14sp"
        android:textStyle="bold" />
    </LinearLayout>

    <FrameLayout
      android:layout_width="match_parent"
      android:layout_height="16dp" />

    <LinearLayout
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:baselineAligned="true"
      android:gravity="bottom"
      android:orientation="horizontal">
      <TextView
        android:id="@+id/savings_rate_num"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:includeFontPadding="false"
        android:maxLines="1"
        android:text="68"
        android:textColor="#1E9468"
        android:textSize="56sp"
        android:textStyle="bold" />
      <TextView
        android:id="@+id/savings_rate_pct"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginStart="2dp"
        android:layout_marginBottom="7dp"
        android:includeFontPadding="false"
        android:text="%"
        android:textColor="#1E9468"
        android:textSize="28sp"
        android:textStyle="bold" />
    </LinearLayout>

    <TextView
      android:id="@+id/savings_subtitle"
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:layout_marginTop="2dp"
      android:maxLines="2"
      android:text="≈ 167h 32m of work kept"
      android:textColor="#6B7A77"
      android:textSize="13sp"
      android:textStyle="bold" />

    <FrameLayout
      android:layout_width="match_parent"
      android:layout_height="0dp"
      android:layout_weight="1" />

    <ProgressBar
      android:id="@+id/savings_bar"
      style="@android:style/Widget.ProgressBar.Horizontal"
      android:layout_width="match_parent"
      android:layout_height="12dp"
      android:max="100"
      android:progress="68"
      android:progressDrawable="@drawable/money2time_savings_progress" />

    <LinearLayout
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:layout_marginTop="12dp"
      android:gravity="center_vertical"
      android:orientation="horizontal">
      <FrameLayout
        android:id="@+id/savings_saved_dot"
        android:layout_width="8dp"
        android:layout_height="8dp"
        android:background="@drawable/money2time_dot_saved" />
      <TextView
        android:id="@+id/savings_saved"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginStart="6dp"
        android:maxLines="1"
        android:text="Saved $2.5K"
        android:textColor="#6B7A77"
        android:textSize="12sp"
        android:textStyle="bold" />
      <FrameLayout
        android:layout_width="0dp"
        android:layout_height="1dp"
        android:layout_weight="1" />
      <FrameLayout
        android:layout_width="8dp"
        android:layout_height="8dp"
        android:background="@drawable/money2time_dot_spent" />
      <TextView
        android:id="@+id/savings_spent"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginStart="6dp"
        android:maxLines="1"
        android:text="Spent $1.2K"
        android:textColor="#6B7A77"
        android:textSize="12sp"
        android:textStyle="bold" />
    </LinearLayout>
  </LinearLayout>

  <LinearLayout
    android:id="@+id/savings_locked"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:gravity="center_vertical"
    android:orientation="vertical"
    android:visibility="gone">
    <LinearLayout
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:gravity="center_vertical"
      android:orientation="horizontal">
      <ImageView
        android:layout_width="58dp"
        android:layout_height="58dp"
        android:adjustViewBounds="true"
        android:contentDescription="Money2Time Pro"
        android:src="@drawable/widget_mascot" />
      <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_marginStart="12dp"
        android:layout_weight="1"
        android:orientation="vertical">
        <TextView
          android:layout_width="wrap_content"
          android:layout_height="wrap_content"
          android:maxLines="1"
          android:text="Savings Rate"
          android:textColor="#1A2E2A"
          android:textSize="16sp"
          android:textStyle="bold" />
        <TextView
          android:id="@+id/savings_locked_text"
          android:layout_width="wrap_content"
          android:layout_height="wrap_content"
          android:layout_marginTop="2dp"
          android:maxLines="1"
          android:text="Available with Money2Time Pro"
          android:textColor="#6B7A77"
          android:textSize="11sp"
          android:textStyle="bold" />
      </LinearLayout>
    </LinearLayout>
    <TextView
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:layout_marginTop="12dp"
      android:background="@drawable/money2time_cta_pill"
      android:gravity="center"
      android:paddingVertical="10dp"
      android:text="✨ Unlock Pro"
      android:textColor="#FFFFFF"
      android:textSize="14sp"
      android:textStyle="bold" />
  </LinearLayout>

  <FrameLayout
    android:id="@+id/savings_pro_badge"
    android:layout_width="58dp"
    android:layout_height="58dp"
    android:layout_gravity="top|end"
    android:layout_marginTop="-16dp"
    android:layout_marginEnd="-16dp"
    android:clipChildren="true">
    <TextView
      android:layout_width="120dp"
      android:layout_height="wrap_content"
      android:layout_gravity="center"
      android:background="#F6B750"
      android:gravity="center"
      android:includeFontPadding="false"
      android:paddingVertical="3dp"
      android:rotation="45"
      android:text="PRO"
      android:textColor="#FFFFFF"
      android:textSize="9sp"
      android:textStyle="bold"
      android:translationX="15dp"
      android:translationY="-15dp" />
  </FrameLayout>
</FrameLayout>
`,
      );

      // Quick add (free, small): compact spend + two icon-only add buttons.
      writeFileIfChanged(
        path.join(resRoot, 'layout/money2time_quick_add_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:background="@drawable/money2time_widget_background"
  android:orientation="vertical"
  android:padding="16dp">

  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="0dp"
    android:layout_weight="1"
    android:gravity="center_vertical"
    android:orientation="vertical">
    <TextView
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:letterSpacing="0.12"
      android:text="THIS MONTH"
      android:textColor="#94A39F"
      android:textSize="11sp"
      android:textStyle="bold" />
    <TextView
      android:id="@+id/quickadd_amount"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="6dp"
      android:includeFontPadding="false"
      android:maxLines="1"
      android:text="$1,284"
      android:textColor="#D45F57"
      android:textSize="34sp"
      android:textStyle="bold" />
    <TextView
      android:id="@+id/quickadd_time"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="6dp"
      android:maxLines="1"
      android:text="85h 36m of work"
      android:textColor="#6B7A77"
      android:textSize="12sp"
      android:textStyle="bold" />
  </LinearLayout>

  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="58dp"
    android:orientation="horizontal">
    <LinearLayout
      android:id="@+id/quickadd_income"
      android:layout_width="0dp"
      android:layout_height="match_parent"
      android:layout_weight="1"
      android:background="@drawable/money2time_widget_income_button"
      android:gravity="center"
      android:orientation="horizontal">
      <ImageView
        android:layout_width="24dp"
        android:layout_height="24dp"
        android:contentDescription="Add income"
        android:scaleType="fitCenter"
        android:src="@drawable/money2time_ic_plus_income" />
    </LinearLayout>
    <LinearLayout
      android:id="@+id/quickadd_expense"
      android:layout_width="0dp"
      android:layout_height="match_parent"
      android:layout_weight="1"
      android:layout_marginStart="10dp"
      android:background="@drawable/money2time_widget_expense_button"
      android:gravity="center"
      android:orientation="horizontal">
      <ImageView
        android:layout_width="24dp"
        android:layout_height="24dp"
        android:contentDescription="Add expense"
        android:scaleType="fitCenter"
        android:src="@drawable/money2time_ic_minus_expense" />
    </LinearLayout>
  </LinearLayout>
</LinearLayout>
`,
      );

      // Savings history (pro, large): month-by-month savings-rate rows.
      writeFileIfChanged(
        path.join(resRoot, 'layout/money2time_savings_history_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/hist_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:background="@drawable/money2time_widget_background"
  android:clipToPadding="false"
  android:clipToOutline="true"
  android:padding="16dp">

  <LinearLayout
    android:id="@+id/hist_content"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical">

    <LinearLayout
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:orientation="horizontal"
      android:gravity="top">
      <ImageView
        android:layout_width="116dp"
        android:layout_height="32dp"
        android:adjustViewBounds="true"
        android:contentDescription="Money2Time"
        android:scaleType="fitStart"
        android:src="@drawable/banner" />
      <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_weight="1"
        android:gravity="end"
        android:orientation="vertical">
        <TextView
          android:id="@+id/hist_total"
          android:layout_width="wrap_content"
          android:layout_height="wrap_content"
          android:maxLines="1"
          android:text="$2.4K"
          android:textColor="#1E9468"
          android:textSize="24sp"
          android:textStyle="bold" />
        <TextView
          android:id="@+id/hist_avg"
          android:layout_width="wrap_content"
          android:layout_height="wrap_content"
          android:maxLines="1"
          android:text="35%"
          android:textColor="#94A39F"
          android:textSize="13sp"
          android:textStyle="bold" />
      </LinearLayout>
    </LinearLayout>

    <LinearLayout
      android:layout_width="match_parent"
      android:layout_height="0dp"
      android:layout_weight="1"
      android:layout_marginTop="10dp"
      android:orientation="vertical">
${historyRows}
    </LinearLayout>
  </LinearLayout>

  <LinearLayout
    android:id="@+id/hist_locked"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:gravity="center_horizontal"
    android:orientation="vertical"
    android:paddingHorizontal="16dp"
    android:visibility="gone">
    <FrameLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" />
    <ImageView
      android:layout_width="104dp"
      android:layout_height="104dp"
      android:adjustViewBounds="true"
      android:contentDescription="Money2Time Pro"
      android:src="@drawable/widget_mascot" />
    <TextView
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="6dp"
      android:text="Savings History"
      android:textColor="#1A2E2A"
      android:textSize="21sp"
      android:textStyle="bold" />
    <TextView
      android:id="@+id/hist_locked_text"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="3dp"
      android:gravity="center"
      android:text="Available with Money2Time Pro"
      android:textColor="#6B7A77"
      android:textSize="13sp"
      android:textStyle="bold" />
    <FrameLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" />
    <TextView
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:background="@drawable/money2time_cta_pill"
      android:gravity="center"
      android:paddingVertical="12dp"
      android:text="✨ Unlock Pro"
      android:textColor="#FFFFFF"
      android:textSize="15sp"
      android:textStyle="bold" />
  </LinearLayout>

  <FrameLayout
    android:id="@+id/hist_pro_badge"
    android:layout_width="58dp"
    android:layout_height="58dp"
    android:layout_gravity="top|end"
    android:layout_marginTop="-16dp"
    android:layout_marginEnd="-16dp"
    android:clipChildren="true">
    <TextView
      android:layout_width="120dp"
      android:layout_height="wrap_content"
      android:layout_gravity="center"
      android:background="#F6B750"
      android:gravity="center"
      android:includeFontPadding="false"
      android:paddingVertical="3dp"
      android:rotation="45"
      android:text="PRO"
      android:textColor="#FFFFFF"
      android:textSize="9sp"
      android:textStyle="bold"
      android:translationX="15dp"
      android:translationY="-15dp" />
  </FrameLayout>
</FrameLayout>
`,
      );

      // --- Budget ring layout (small, free) ---------------------------------
      writeFileIfChanged(
        path.join(resRoot, 'layout/money2time_budget_ring_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/ring_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:background="@drawable/money2time_widget_background"
  android:clipToPadding="false"
  android:clipToOutline="true"
  android:padding="14dp">

  <LinearLayout
    android:id="@+id/ring_content"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:gravity="center_horizontal"
    android:orientation="vertical">

    <TextView
      android:id="@+id/ring_month"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:letterSpacing="0.12"
      android:text="BUDGET"
      android:textColor="#94A39F"
      android:textSize="10sp"
      android:textStyle="bold" />

    <FrameLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" />

    <TextView
      android:id="@+id/ring_amount"
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:autoSizeMaxTextSize="26sp"
      android:autoSizeMinTextSize="16sp"
      android:autoSizeTextType="uniform"
      android:gravity="center"
      android:includeFontPadding="false"
      android:maxLines="1"
      android:text="$258"
      android:textColor="#1A2E2A"
      android:textSize="26sp"
      android:textStyle="bold" />

    <TextView
      android:id="@+id/ring_caption"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="2dp"
      android:maxLines="1"
      android:text="left of $1.2K"
      android:textColor="#94A39F"
      android:textSize="10sp"
      android:textStyle="bold" />

    <FrameLayout
      android:layout_width="match_parent"
      android:layout_height="10dp"
      android:layout_marginTop="10dp">
      <ProgressBar android:id="@+id/ring_bar_pos" style="@android:style/Widget.ProgressBar.Horizontal" android:layout_width="match_parent" android:layout_height="10dp" android:max="100" android:progress="78" android:progressDrawable="@drawable/money2time_budget_progress" />
      <ProgressBar android:id="@+id/ring_bar_neg" style="@android:style/Widget.ProgressBar.Horizontal" android:layout_width="match_parent" android:layout_height="10dp" android:max="100" android:progress="78" android:progressDrawable="@drawable/money2time_budget_progress_over" android:visibility="gone" />
    </FrameLayout>

    <FrameLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" />

    <TextView
      android:id="@+id/ring_days"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:maxLines="1"
      android:text="12 days left"
      android:textColor="#94A39F"
      android:textSize="10sp"
      android:textStyle="bold" />
  </LinearLayout>

  <LinearLayout
    android:id="@+id/ring_setup"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:gravity="center"
    android:orientation="vertical"
    android:visibility="gone">
    <TextView
      android:id="@+id/ring_setup_title"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:gravity="center"
      android:text="Set a monthly budget"
      android:textColor="#1A2E2A"
      android:textSize="14sp"
      android:textStyle="bold" />
    <TextView
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="3dp"
      android:gravity="center"
      android:text="Open Money2Time"
      android:textColor="#6B7A77"
      android:textSize="11sp"
      android:textStyle="bold" />
  </LinearLayout>

  <LinearLayout
    android:id="@+id/ring_locked"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:gravity="center_horizontal"
    android:orientation="vertical"
    android:visibility="gone">
    <FrameLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" />
    <ImageView
      android:layout_width="44dp"
      android:layout_height="44dp"
      android:adjustViewBounds="true"
      android:contentDescription="Money2Time Pro"
      android:src="@drawable/widget_mascot" />
    <TextView
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="6dp"
      android:maxLines="1"
      android:text="Budget"
      android:textColor="#1A2E2A"
      android:textSize="15sp"
      android:textStyle="bold" />
    <TextView
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="1dp"
      android:maxLines="1"
      android:text="Money2Time Pro"
      android:textColor="#6B7A77"
      android:textSize="10sp"
      android:textStyle="bold" />
    <FrameLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" />
    <TextView
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:background="@drawable/money2time_cta_pill"
      android:gravity="center"
      android:maxLines="1"
      android:paddingVertical="10dp"
      android:text="✨ Unlock Pro"
      android:textColor="#FFFFFF"
      android:textSize="13sp"
      android:textStyle="bold" />
  </LinearLayout>

  <FrameLayout
    android:id="@+id/ring_pro_badge"
    android:layout_width="58dp"
    android:layout_height="58dp"
    android:layout_gravity="top|end"
    android:layout_marginTop="-4dp"
    android:layout_marginEnd="-16dp"
    android:clipChildren="true">
    <TextView
      android:layout_width="120dp"
      android:layout_height="wrap_content"
      android:layout_gravity="center"
      android:background="#F6B750"
      android:gravity="center"
      android:includeFontPadding="false"
      android:paddingVertical="3dp"
      android:rotation="45"
      android:text="PRO"
      android:textColor="#FFFFFF"
      android:textSize="9sp"
      android:textStyle="bold"
      android:translationX="15dp"
      android:translationY="-15dp" />
  </FrameLayout>
</FrameLayout>
`,
      );

      // --- Budget breakdown layout (large, pro) ------------------------------
      // Sample rows baked into the static layout so the widget picker shows a
      // populated breakdown (provider overrides every row on placement).
      const BUD_SAMPLE_ROWS = [
        { emoji: '🎬', name: 'Fun', vals: '$236 / $200', pct: 100, over: true },
        { emoji: '🍜', name: 'Food', vals: '$320 / $450', pct: 71, over: false },
        { emoji: '🛍️', name: 'Shopping', vals: '$143 / $300', pct: 48, over: false },
        { emoji: '🚌', name: 'Transport', vals: '$96 / $250', pct: 38, over: false },
        { emoji: '•', name: '', vals: '', pct: 0, over: false, hidden: true },
      ];
      const budgetRows = BUD_SAMPLE_ROWS.map(
        (row, i) => `      <LinearLayout
        android:id="@+id/bud_row_${i}"
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1"
        android:gravity="center_vertical"
        android:orientation="horizontal"
        android:visibility="${row.hidden ? 'gone' : 'visible'}">
        <TextView android:id="@+id/bud_emoji_${i}" android:layout_width="22dp" android:layout_height="wrap_content" android:gravity="center" android:textSize="13sp" android:text="${row.emoji}" />
        <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:layout_marginStart="6dp" android:orientation="vertical">
          <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal">
            <TextView android:id="@+id/bud_name_${i}" android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:maxLines="1" android:textSize="11sp" android:textStyle="bold" android:textColor="#1A2E2A" android:text="${row.name}" />
            <TextView android:id="@+id/bud_vals_${i}" android:layout_width="wrap_content" android:layout_height="wrap_content" android:maxLines="1" android:textSize="10sp" android:textStyle="bold" android:textColor="#6B7A77" android:text="${row.vals}" />
          </LinearLayout>
          <FrameLayout android:layout_width="match_parent" android:layout_height="5dp" android:layout_marginTop="3dp">
            <ProgressBar android:id="@+id/bud_bar_pos_${i}" style="@android:style/Widget.ProgressBar.Horizontal" android:layout_width="match_parent" android:layout_height="5dp" android:max="100" android:progress="${row.over ? 0 : row.pct}" android:progressDrawable="@drawable/money2time_budget_progress" android:visibility="${row.over ? 'gone' : 'visible'}" />
            <ProgressBar android:id="@+id/bud_bar_neg_${i}" style="@android:style/Widget.ProgressBar.Horizontal" android:layout_width="match_parent" android:layout_height="5dp" android:max="100" android:progress="${row.over ? row.pct : 0}" android:progressDrawable="@drawable/money2time_budget_progress_over" android:visibility="${row.over ? 'visible' : 'gone'}" />
          </FrameLayout>
        </LinearLayout>
      </LinearLayout>`,
      ).join('\n');

      writeFileIfChanged(
        path.join(resRoot, 'layout/money2time_budget_breakdown_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/bud_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:background="@drawable/money2time_widget_background"
  android:clipToPadding="false"
  android:clipToOutline="true"
  android:padding="16dp">

  <LinearLayout
    android:id="@+id/bud_content"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical">

    <LinearLayout
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:orientation="horizontal"
      android:gravity="top">
      <ImageView
        android:layout_width="116dp"
        android:layout_height="32dp"
        android:adjustViewBounds="true"
        android:contentDescription="Money2Time"
        android:scaleType="fitStart"
        android:src="@drawable/banner" />
      <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_weight="1"
        android:gravity="end"
        android:orientation="vertical">
        <TextView
          android:id="@+id/bud_month"
          android:layout_width="wrap_content"
          android:layout_height="wrap_content"
          android:maxLines="1"
          android:text="July 2026"
          android:textColor="#1A2E2A"
          android:textSize="14sp"
          android:textStyle="bold" />
        <TextView
          android:id="@+id/bud_totals"
          android:layout_width="wrap_content"
          android:layout_height="wrap_content"
          android:maxLines="1"
          android:text="$942 / $1.2K"
          android:textColor="#1F8A6F"
          android:textSize="15sp"
          android:textStyle="bold" />
      </LinearLayout>
    </LinearLayout>

    <LinearLayout
      android:id="@+id/bud_body"
      android:layout_width="match_parent"
      android:layout_height="0dp"
      android:layout_weight="1"
      android:orientation="vertical">

      <FrameLayout
        android:layout_width="match_parent"
        android:layout_height="10dp"
        android:layout_marginTop="10dp">
        <ProgressBar android:id="@+id/bud_total_bar_pos" style="@android:style/Widget.ProgressBar.Horizontal" android:layout_width="match_parent" android:layout_height="10dp" android:max="100" android:progress="78" android:progressDrawable="@drawable/money2time_budget_progress" />
        <ProgressBar android:id="@+id/bud_total_bar_neg" style="@android:style/Widget.ProgressBar.Horizontal" android:layout_width="match_parent" android:layout_height="10dp" android:max="100" android:progress="78" android:progressDrawable="@drawable/money2time_budget_progress_over" android:visibility="gone" />
      </FrameLayout>

      <TextView
        android:id="@+id/bud_remaining"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="4dp"
        android:maxLines="1"
        android:text="$258 left"
        android:textColor="#1F8A6F"
        android:textSize="10sp"
        android:textStyle="bold" />

      <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1"
        android:layout_marginTop="6dp"
        android:orientation="vertical">
${budgetRows}
      </LinearLayout>

      <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="4dp"
        android:orientation="horizontal">
        <TextView
          android:id="@+id/bud_unbudgeted"
          android:layout_width="0dp"
          android:layout_height="wrap_content"
          android:layout_weight="1"
          android:maxLines="1"
          android:text="+$147 unbudgeted"
          android:textColor="#94A39F"
          android:textSize="10sp"
          android:textStyle="bold" />
        <TextView
          android:id="@+id/bud_more"
          android:layout_width="wrap_content"
          android:layout_height="wrap_content"
          android:maxLines="1"
          android:text=""
          android:textColor="#94A39F"
          android:textSize="10sp"
          android:textStyle="bold" />
      </LinearLayout>
    </LinearLayout>

    <LinearLayout
      android:id="@+id/bud_setup"
      android:layout_width="match_parent"
      android:layout_height="0dp"
      android:layout_weight="1"
      android:gravity="center"
      android:orientation="vertical"
      android:visibility="gone">
      <TextView
        android:id="@+id/bud_setup_title"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:gravity="center"
        android:text="Set a monthly budget"
        android:textColor="#1A2E2A"
        android:textSize="16sp"
        android:textStyle="bold" />
      <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="3dp"
        android:gravity="center"
        android:text="Open Money2Time"
        android:textColor="#6B7A77"
        android:textSize="12sp"
        android:textStyle="bold" />
    </LinearLayout>
  </LinearLayout>

  <LinearLayout
    android:id="@+id/bud_locked"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:gravity="center_horizontal"
    android:orientation="vertical"
    android:paddingHorizontal="16dp"
    android:visibility="gone">
    <FrameLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" />
    <ImageView
      android:layout_width="104dp"
      android:layout_height="104dp"
      android:adjustViewBounds="true"
      android:contentDescription="Money2Time Pro"
      android:src="@drawable/widget_mascot" />
    <TextView
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="6dp"
      android:text="Budget Breakdown"
      android:textColor="#1A2E2A"
      android:textSize="21sp"
      android:textStyle="bold" />
    <TextView
      android:id="@+id/bud_locked_text"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="3dp"
      android:gravity="center"
      android:text="Available with Money2Time Pro"
      android:textColor="#6B7A77"
      android:textSize="13sp"
      android:textStyle="bold" />
    <FrameLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" />
    <TextView
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:background="@drawable/money2time_cta_pill"
      android:gravity="center"
      android:paddingVertical="12dp"
      android:text="✨ Unlock Pro"
      android:textColor="#FFFFFF"
      android:textSize="15sp"
      android:textStyle="bold" />
  </LinearLayout>

  <FrameLayout
    android:id="@+id/bud_pro_badge"
    android:layout_width="58dp"
    android:layout_height="58dp"
    android:layout_gravity="top|end"
    android:layout_marginTop="-4dp"
    android:layout_marginEnd="-16dp"
    android:clipChildren="true">
    <TextView
      android:layout_width="120dp"
      android:layout_height="wrap_content"
      android:layout_gravity="center"
      android:background="#F6B750"
      android:gravity="center"
      android:includeFontPadding="false"
      android:paddingVertical="3dp"
      android:rotation="45"
      android:text="PRO"
      android:textColor="#FFFFFF"
      android:textSize="9sp"
      android:textStyle="bold"
      android:translationX="15dp"
      android:translationY="-15dp" />
  </FrameLayout>
</FrameLayout>
`,
      );

      // --- Drawables --------------------------------------------------------
      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_widget_background.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <solid android:color="#FAF7F0" />
  <corners android:radius="26dp" />
</shape>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_widget_income_button.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <solid android:color="#EAF7F1" />
  <corners android:radius="16dp" />
  <stroke android:width="1.5dp" android:color="#BFE4D4" />
</shape>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_widget_expense_button.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <solid android:color="#FBEAE8" />
  <corners android:radius="16dp" />
  <stroke android:width="1.5dp" android:color="#F1C8C4" />
</shape>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_badge_income.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
  <solid android:color="#1E9468" />
</shape>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_badge_expense.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
  <solid android:color="#D45F57" />
</shape>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_ic_plus.xml'),
        `<vector xmlns:android="http://schemas.android.com/apk/res/android"
  android:width="24dp"
  android:height="24dp"
  android:viewportWidth="24"
  android:viewportHeight="24">
  <path
    android:fillColor="#00000000"
    android:strokeColor="#FFFFFF"
    android:strokeWidth="3.2"
    android:strokeLineCap="round"
    android:pathData="M12,5 L12,19 M5,12 L19,12" />
</vector>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_ic_minus.xml'),
        `<vector xmlns:android="http://schemas.android.com/apk/res/android"
  android:width="24dp"
  android:height="24dp"
  android:viewportWidth="24"
  android:viewportHeight="24">
  <path
    android:fillColor="#00000000"
    android:strokeColor="#FFFFFF"
    android:strokeWidth="3.2"
    android:strokeLineCap="round"
    android:pathData="M5,12 L19,12" />
</vector>
`,
      );

      // Accent-colored icons for the small quick-add buttons (no badge circle).
      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_ic_plus_income.xml'),
        `<vector xmlns:android="http://schemas.android.com/apk/res/android"
  android:width="24dp"
  android:height="24dp"
  android:viewportWidth="24"
  android:viewportHeight="24">
  <path
    android:fillColor="#00000000"
    android:strokeColor="#1E9468"
    android:strokeWidth="3.2"
    android:strokeLineCap="round"
    android:pathData="M12,5 L12,19 M5,12 L19,12" />
</vector>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_ic_minus_expense.xml'),
        `<vector xmlns:android="http://schemas.android.com/apk/res/android"
  android:width="24dp"
  android:height="24dp"
  android:viewportWidth="24"
  android:viewportHeight="24">
  <path
    android:fillColor="#00000000"
    android:strokeColor="#D45F57"
    android:strokeWidth="3.2"
    android:strokeLineCap="round"
    android:pathData="M5,12 L19,12" />
</vector>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_bar.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <gradient android:startColor="#F37D57" android:endColor="#D45F57" android:angle="270" />
  <corners android:topLeftRadius="6dp" android:topRightRadius="6dp" android:bottomLeftRadius="5dp" android:bottomRightRadius="5dp" />
</shape>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_bar_peak.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <gradient android:startColor="#F6B750" android:endColor="#F37D57" android:angle="270" />
  <corners android:topLeftRadius="6dp" android:topRightRadius="6dp" android:bottomLeftRadius="5dp" android:bottomRightRadius="5dp" />
</shape>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_bar_zero.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <solid android:color="#F3EEE3" />
  <corners android:radius="4dp" />
</shape>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_cal_cell.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <solid android:color="#F6F2EA" />
  <corners android:radius="11dp" />
  <stroke android:width="1dp" android:color="#E8E2D6" />
</shape>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_cal_cell_today.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <solid android:color="#E0F5EE" />
  <corners android:radius="11dp" />
  <stroke android:width="1.5dp" android:color="#1F8A6F" />
</shape>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_chip_income.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <solid android:color="#DFFBF0" />
  <corners android:radius="999dp" />
</shape>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_chip_expense.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <solid android:color="#FDE8E6" />
  <corners android:radius="999dp" />
</shape>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_cta_pill.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <gradient android:startColor="#1F8A6F" android:endColor="#1E9468" android:angle="0" />
  <corners android:radius="999dp" />
</shape>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_pro_chip.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <solid android:color="#FDF0D8" />
  <corners android:radius="999dp" />
</shape>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_dot_saved.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
  <solid android:color="#1E9468" />
</shape>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_dot_overspent.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
  <solid android:color="#F37D57" />
</shape>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_dot_spent.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
  <solid android:color="#D45F57" />
</shape>
`,
      );

      // Horizontal progress bar: light-red track with a rounded green fill.
      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_savings_progress.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:id="@android:id/background">
    <shape>
      <solid android:color="#F4D6D2" />
      <corners android:radius="999dp" />
    </shape>
  </item>
  <item android:id="@android:id/progress">
    <clip>
      <shape>
        <solid android:color="#1E9468" />
        <corners android:radius="999dp" />
      </shape>
    </clip>
  </item>
</layer-list>
`,
      );

      // Overspent variant: faint track with a rounded red fill (savings history).
      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_savings_progress_neg.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:id="@android:id/background">
    <shape>
      <solid android:color="#ECE7DC" />
      <corners android:radius="999dp" />
    </shape>
  </item>
  <item android:id="@android:id/progress">
    <clip>
      <shape>
        <solid android:color="#D45F57" />
        <corners android:radius="999dp" />
      </shape>
    </clip>
  </item>
</layer-list>
`,
      );

      // Budget usage bars: primary fill on a soft track, red variant when
      // depleted (≥80%) or over budget.
      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_budget_progress.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:id="@android:id/background">
    <shape>
      <solid android:color="#E0F5EE" />
      <corners android:radius="999dp" />
    </shape>
  </item>
  <item android:id="@android:id/progress">
    <clip>
      <shape>
        <solid android:color="#1F8A6F" />
        <corners android:radius="999dp" />
      </shape>
    </clip>
  </item>
</layer-list>
`,
      );

      writeFileIfChanged(
        path.join(resRoot, 'drawable/money2time_budget_progress_over.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:id="@android:id/background">
    <shape>
      <solid android:color="#F4D6D2" />
      <corners android:radius="999dp" />
    </shape>
  </item>
  <item android:id="@android:id/progress">
    <clip>
      <shape>
        <solid android:color="#D45F57" />
        <corners android:radius="999dp" />
      </shape>
    </clip>
  </item>
</layer-list>
`,
      );

      writeFileIfChanged(
        path.join(widgetRoot, 'Money2TimeWidgetSampleData.java'),
        `package com.nelsongan.money2time.widgets;

/** Illustrative snapshot used when no real snapshot has been written yet. */
public final class Money2TimeWidgetSampleData {
  public static final String JSON = "${SAMPLE_SNAPSHOT_JSON_LITERAL}";

  private Money2TimeWidgetSampleData() {}
}
`,
      );

      patchMainApplication(androidRoot);

      return cfg;
    },
  ]);
}

function addIosWidgetFiles(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const iosRoot = path.join(projectRoot, 'ios/Money2TimeWidget');
      const appRoot = path.join(projectRoot, 'ios/Money2Time');
      const bannerAssetPath = path.join(projectRoot, BANNER_ASSET);
      const mascotAssetPath = path.join(projectRoot, MASCOT_ASSET);

      copyFileIfChanged(bannerAssetPath, path.join(iosRoot, 'banner.png'));
      copyFileIfChanged(mascotAssetPath, path.join(iosRoot, 'mascot.png'));

      writeFileIfChanged(
        path.join(iosRoot, 'Money2TimeWidget.swift'),
        `import SwiftUI
import UIKit
import WidgetKit

private let appGroup = "${APP_GROUP}"
private let snapshotKey = "${SNAPSHOT_KEY}"

// MARK: - Snapshot models

private struct MonthlySpendData: Decodable {
  let expenseLabel: String
  let timeEquivalentLabel: String
  let incomeUrl: String
  let expenseUrl: String
}

private struct QuickAddSmallData: Decodable {
  let expenseLabel: String
  let timeEquivalentLabel: String
  let incomeUrl: String
  let expenseUrl: String
}

private struct WeeklyDayData: Decodable {
  let weekdayLabel: String
  let amount: Double
  let barLabel: String
  let isToday: Bool
}

private struct WeeklyExpenseData: Decodable {
  let totalLabel: String
  let maxAmount: Double
  let days: [WeeklyDayData]
}

private struct CalendarDayData: Decodable {
  let dayNumber: Int
  let incomeLabel: String
  let expenseLabel: String
  let hasActivity: Bool
  let incomeStronger: Bool
  let intensity: Double
  let isToday: Bool
}

private struct CalendarMonthData: Decodable {
  let monthLabel: String
  let weekdayLabels: [String]
  let leadingSpacers: Int
  let incomeLabel: String
  let expenseLabel: String
  let days: [CalendarDayData]
}

private struct SavingsRateData: Decodable {
  let monthLabel: String
  let savingsRate: Double
  let rateLabel: String
  let expenseLabel: String
  let savedLabel: String
  let savedCaption: String
  let isPositive: Bool
  let hasIncome: Bool
  let timeEquivalentLabel: String
}

private struct SavingsHistoryMonthData: Decodable {
  let monthLabel: String
  let savingsRate: Double
  let rateLabel: String
  let savedLabel: String
  let isPositive: Bool
  let hasIncome: Bool
  let hasActivity: Bool
}

private struct SavingsHistoryData: Decodable {
  let months: [SavingsHistoryMonthData]
  let averageRateLabel: String
  let totalSavedLabel: String
  let totalIsPositive: Bool
}

private struct BudgetRingData: Decodable {
  let monthLabel: String
  // Optional: snapshots written before the short header existed lack it.
  let monthShortLabel: String?
  let hasBudget: Bool
  let usageRatio: Double
  let isOver: Bool
  let remainingLabel: String
  let captionLabel: String
  let paceRatio: Double
  let daysLeftLabel: String
  let setupLabel: String
  let budgetUrl: String
}

private struct BudgetBreakdownCategoryData: Decodable {
  let categoryId: String
  let name: String
  let emoji: String
  let usageRatio: Double
  let isOver: Bool
  let spentLabel: String
  let budgetedLabel: String
}

private struct BudgetBreakdownData: Decodable {
  let monthLabel: String
  let hasBudget: Bool
  let totalSpentLabel: String
  let totalBudgetLabel: String
  let usageRatio: Double
  let isOver: Bool
  let remainingLabel: String
  let paceRatio: Double
  let categories: [BudgetBreakdownCategoryData]
  let moreLabel: String
  let unbudgetedLabel: String
  let setupLabel: String
  let budgetUrl: String
}

private struct WidgetSnapshot: Decodable {
  let isPro: Bool
  let monthlyExpenseQuickLog: MonthlySpendData
  let quickAddSmall: QuickAddSmallData
  let weeklyExpense: WeeklyExpenseData
  let calendarMonth: CalendarMonthData
  let savingsRate: SavingsRateData
  let savingsHistory: SavingsHistoryData
  // Optional so a schema-v1 snapshot written by an older app still decodes;
  // the budget widgets then render their set-up state instead of crashing.
  let budgetRing: BudgetRingData?
  let budgetBreakdown: BudgetBreakdownData?
  let proUnlockUrlByWidgetId: [String: String]
}

private let sampleSnapshotJSON = "${SAMPLE_SNAPSHOT_JSON_LITERAL}"

private func decodeSnapshot(_ json: String) -> WidgetSnapshot? {
  guard let data = json.data(using: .utf8) else { return nil }
  return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
}

private func sampleSnapshot() -> WidgetSnapshot? {
  decodeSnapshot(sampleSnapshotJSON)
}

// Falls back to the illustrative sample so the widget never renders empty in
// the gallery or before the app has written a real snapshot.
private func loadSnapshot() -> WidgetSnapshot? {
  guard
    let defaults = UserDefaults(suiteName: appGroup),
    let json = defaults.string(forKey: snapshotKey),
    let decoded = decodeSnapshot(json)
  else {
    return sampleSnapshot()
  }
  return decoded
}

// MARK: - Theme

private struct Palette {
  let background: Color
  let text: Color
  let textSoft: Color
  let textMuted: Color
  let surfaceMuted: Color
  let primary: Color
  let success: Color
  let error: Color
  let accent: Color
  let coral: Color

  static func current(_ scheme: ColorScheme) -> Palette {
    scheme == .dark ? dark : light
  }

  static let light = Palette(
    background: Color(hex: 0xFAF7F0), text: Color(hex: 0x1A2E2A), textSoft: Color(hex: 0x6B7A77),
    textMuted: Color(hex: 0x94A39F), surfaceMuted: Color(hex: 0xF3EEE3), primary: Color(hex: 0x1F8A6F),
    success: Color(hex: 0x1E9468), error: Color(hex: 0xD45F57), accent: Color(hex: 0xF6B750),
    coral: Color(hex: 0xF37D57))

  static let dark = Palette(
    background: Color(hex: 0x121A24), text: Color(hex: 0xE8EDF2), textSoft: Color(hex: 0x9AACA6),
    textMuted: Color(hex: 0x6B8078), surfaceMuted: Color(hex: 0x1E2A36), primary: Color(hex: 0x34C99A),
    success: Color(hex: 0x2DB87E), error: Color(hex: 0xE06B63), accent: Color(hex: 0xE8AD4A),
    coral: Color(hex: 0xF37D57))
}

private extension Color {
  init(hex: UInt32) {
    self.init(
      .sRGB,
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255,
      opacity: 1)
  }
}

private extension View {
  @ViewBuilder
  func money2TimeWidgetBackground(_ color: Color) -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      self.containerBackground(color, for: .widget)
    } else {
      self.background(color)
    }
  }
}

// MARK: - Shared components

private func loadBundleImage(_ name: String) -> Image? {
  // Loose resources (no asset catalog), so Image(name) can't find them — load
  // straight from the extension bundle.
  if let path = Bundle.main.path(forResource: name, ofType: "png"),
    let uiImage = UIImage(contentsOfFile: path)
  {
    return Image(uiImage: uiImage)
  }
  if let uiImage = UIImage(named: name) {
    return Image(uiImage: uiImage)
  }
  return nil
}

private func bannerImage() -> Image? {
  loadBundleImage("banner")
}

private func mascotImage() -> Image? {
  loadBundleImage("mascot")
}

private struct Wordmark: View {
  var width: CGFloat = 116
  @Environment(\\.colorScheme) private var scheme
  var body: some View {
    Group {
      if let banner = bannerImage() {
        banner
          .resizable()
          .scaledToFit()
          .frame(width: width, height: width * 0.27, alignment: .leading)
      } else {
        Text("Money2Time")
          .font(.system(size: width * 0.15, weight: .heavy, design: .rounded))
          .foregroundStyle(Palette.current(scheme).primary)
          .frame(height: width * 0.27, alignment: .leading)
      }
    }
    .accessibilityLabel("Money2Time")
  }
}

private struct ActionPill: View {
  let isIncome: Bool
  let url: String
  let palette: Palette

  var body: some View {
    let accent = isIncome ? palette.success : palette.error
    Link(destination: URL(string: url) ?? URL(string: "money2time://")!) {
      HStack(spacing: 9) {
        ZStack {
          Circle().fill(accent).frame(width: 26, height: 26)
          Image(systemName: isIncome ? "plus" : "minus")
            .font(.system(size: 13, weight: .heavy))
            .foregroundStyle(.white)
        }
        Text(isIncome ? "Income" : "Expense")
          .font(.system(size: 13.5, weight: .heavy, design: .rounded))
          .foregroundStyle(accent)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 12)
      .frame(maxWidth: .infinity, minHeight: 44, maxHeight: 44, alignment: .leading)
      .background(accent.opacity(0.11), in: RoundedRectangle(cornerRadius: 16))
      .overlay(
        RoundedRectangle(cornerRadius: 16).strokeBorder(accent.opacity(0.26), lineWidth: 1.5))
    }
  }
}

private struct ProLockView: View {
  let title: String
  let url: String
  let palette: Palette
  var compact: Bool = false
  // A centered vertical layout tuned for the small (square) widget family, so
  // the mascot + title + unlock button never clip the way the medium compact
  // or large full layouts would at 2x2.
  var small: Bool = false

  var body: some View {
    let mascotSize: CGFloat = compact ? 58 : 104
    Link(destination: URL(string: url) ?? URL(string: "money2time://pro")!) {
      VStack(spacing: 0) {
        Spacer(minLength: 0)
        if small {
          mascot(size: 44)
          Text(title)
            .font(.system(size: 15, weight: .heavy, design: .rounded))
            .foregroundStyle(palette.text)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .padding(.top, 6)
          Text("Money2Time Pro")
            .font(.system(size: 10.5, weight: .semibold, design: .rounded))
            .foregroundStyle(palette.textSoft)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.top, 1)
        } else if compact {
          HStack(spacing: 12) {
            mascot(size: mascotSize)
            VStack(alignment: .leading, spacing: 2) {
              Text(title)
                .font(.system(size: 16, weight: .heavy, design: .rounded))
                .foregroundStyle(palette.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
              Text("Available with Money2Time Pro")
                .font(.system(size: 11.5, weight: .semibold, design: .rounded))
                .foregroundStyle(palette.textSoft)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            }
            Spacer(minLength: 0)
          }
        } else {
          mascot(size: mascotSize)
          Text(title)
            .font(.system(size: 21, weight: .heavy, design: .rounded))
            .foregroundStyle(palette.text)
            .padding(.top, 8)
          Text("Available with Money2Time Pro")
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundStyle(palette.textSoft)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 3)
            .padding(.horizontal, 10)
        }
        Spacer(minLength: 0)
        unlockButton
      }
      .padding(compact || small ? 14 : 18)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  @ViewBuilder
  private func mascot(size: CGFloat) -> some View {
    if let image = mascotImage() {
      image.resizable().scaledToFit().frame(width: size, height: size)
    } else {
      ZStack {
        Circle().fill(palette.accent.opacity(0.18)).frame(width: size, height: size)
        Image(systemName: "star.fill")
          .font(.system(size: size * 0.4, weight: .black))
          .foregroundStyle(palette.accent)
      }
    }
  }

  private var unlockButton: some View {
    let dense = compact || small
    return HStack(spacing: 6) {
      Image(systemName: "sparkles")
        .font(.system(size: dense ? 12 : 14, weight: .bold))
      Text("Unlock Pro")
        .font(.system(size: dense ? 14 : 15, weight: .heavy, design: .rounded))
    }
    .foregroundStyle(.white)
    .frame(maxWidth: .infinity)
    .frame(height: dense ? 38 : 44)
    .background(
      LinearGradient(
        colors: [palette.primary, palette.success],
        startPoint: .leading,
        endPoint: .trailing),
      in: RoundedRectangle(cornerRadius: 14))
  }
}

// MARK: - Monthly spend (free)

private struct MonthlySpendView: View {
  let data: MonthlySpendData
  let palette: Palette

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Wordmark()
      Spacer(minLength: 8)
      HStack(alignment: .bottom, spacing: 14) {
        VStack(alignment: .leading, spacing: 6) {
          Text("THIS MONTH")
            .font(.system(size: 10, weight: .heavy))
            .tracking(1.4)
            .foregroundStyle(palette.textMuted)
          Text(data.expenseLabel)
            .font(.system(size: 34, weight: .bold, design: .rounded))
            .foregroundStyle(palette.error)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
          HStack(spacing: 5) {
            Image(systemName: "clock")
              .font(.system(size: 11, weight: .bold))
              .foregroundStyle(palette.primary)
            Text(data.timeEquivalentLabel)
              .font(.system(size: 12.5, weight: .semibold, design: .rounded))
              .foregroundStyle(palette.textSoft)
              .lineLimit(1)
              .minimumScaleFactor(0.8)
          }
        }
        Spacer(minLength: 12)
        VStack(spacing: 10) {
          ActionPill(isIncome: true, url: data.incomeUrl, palette: palette)
          ActionPill(isIncome: false, url: data.expenseUrl, palette: palette)
        }
        .frame(width: 124)
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

// MARK: - Quick add (free, small)

private struct SmallActionButton: View {
  let isIncome: Bool
  let url: String
  let palette: Palette

  var body: some View {
    let accent = isIncome ? palette.success : palette.error
    Link(destination: URL(string: url) ?? URL(string: "money2time://")!) {
      Image(systemName: isIncome ? "plus" : "minus")
        .font(.system(size: 20, weight: .heavy))
        .foregroundStyle(accent)
        .frame(maxWidth: .infinity)
        .frame(height: 42)
        .background(accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
        .overlay(
          RoundedRectangle(cornerRadius: 14).strokeBorder(accent.opacity(0.26), lineWidth: 1.5))
    }
  }
}

private struct QuickAddSmallView: View {
  let data: QuickAddSmallData
  let palette: Palette

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 4) {
        Text("THIS MONTH")
          .font(.system(size: 10, weight: .heavy))
          .tracking(1.4)
          .foregroundStyle(palette.textMuted)
        Text(data.expenseLabel)
          .font(.system(size: 26, weight: .bold, design: .rounded))
          .foregroundStyle(palette.error)
          .lineLimit(1)
          .minimumScaleFactor(0.5)
        HStack(spacing: 5) {
          Image(systemName: "clock")
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(palette.primary)
          Text(data.timeEquivalentLabel)
            .font(.system(size: 11.5, weight: .semibold, design: .rounded))
            .foregroundStyle(palette.textSoft)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
      }
      Spacer(minLength: 8)
      HStack(spacing: 8) {
        SmallActionButton(isIncome: true, url: data.incomeUrl, palette: palette)
        SmallActionButton(isIncome: false, url: data.expenseUrl, palette: palette)
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

// MARK: - Past 7 days (pro)

// Diagonal "PRO" corner ribbon — absolutely overlaid (never pushes content),
// shown only in the widget gallery so users know a widget is Pro before adding.
private extension View {
  @ViewBuilder
  func proCornerRibbon(_ show: Bool, palette: Palette) -> some View {
    if show {
      self.overlay(alignment: .topTrailing) {
        Text("PRO")
          .font(.system(size: 9, weight: .black, design: .rounded))
          .tracking(0.5)
          .foregroundStyle(.white)
          .frame(width: 76)
          .padding(.vertical, 3)
          .background(palette.accent)
          .rotationEffect(.degrees(45))
          .offset(x: 22, y: 14)
      }
      .clipped()
    } else {
      self
    }
  }
}

private struct WeeklyExpenseView: View {
  let data: WeeklyExpenseData
  let palette: Palette

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .top) {
        Wordmark()
        Spacer()
        VStack(alignment: .trailing, spacing: 3) {
          Text("PAST 7 DAYS")
            .font(.system(size: 10, weight: .heavy))
            .tracking(1.4)
            .foregroundStyle(palette.textMuted)
          Text(data.totalLabel)
            .font(.system(size: 22, weight: .bold, design: .rounded))
            .foregroundStyle(palette.error)
            .lineLimit(1)
        }
      }
      GeometryReader { geo in
        let maxBarHeight = max(10, geo.size.height - 38)
        HStack(alignment: .bottom, spacing: 9) {
          ForEach(Array(data.days.enumerated()), id: \\.offset) { _, day in
            let isZero = day.amount <= 0
            let fraction = isZero ? 0 : max(0.08, min(1, day.amount / max(1, data.maxAmount)))
            let isPeak = !isZero && day.amount >= data.maxAmount
            VStack(spacing: 5) {
              Text(isZero ? "–" : day.barLabel)
                .font(.system(size: 9.5, weight: .heavy))
                .foregroundStyle(isZero ? palette.textMuted.opacity(0.5) : palette.error)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
              Spacer(minLength: 0)
              if isZero {
                RoundedRectangle(cornerRadius: 4)
                  .fill(palette.surfaceMuted)
                  .frame(height: 5)
                  .frame(maxWidth: .infinity)
              } else {
                RoundedRectangle(cornerRadius: 6)
                  .fill(
                    LinearGradient(
                      colors: isPeak ? [palette.accent, palette.coral] : [palette.coral, palette.error],
                      startPoint: .top,
                      endPoint: .bottom)
                  )
                  .frame(height: max(6, maxBarHeight * fraction))
                  .frame(maxWidth: .infinity)
              }
              Text(day.weekdayLabel)
                .font(.system(size: 10.5, weight: .heavy))
                .foregroundStyle(day.isToday ? palette.primary : palette.textMuted)
            }
          }
        }
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

// MARK: - Savings rate (pro)

private struct SavingsRateView: View {
  let data: SavingsRateData
  let palette: Palette

  private var gradientColors: [Color] {
    if !data.hasIncome { return [palette.textMuted, palette.textMuted] }
    return data.isPositive
      ? [Color(hex: 0x3FD9A6), palette.success]
      : [palette.coral, palette.error]
  }
  private var savedFraction: CGFloat {
    guard data.isPositive else { return 0 }
    return CGFloat(max(0, min(1, data.savingsRate)))
  }
  private var subtitle: String {
    if !data.hasIncome { return "Add income to see your rate" }
    return data.timeEquivalentLabel.isEmpty ? "of income saved" : data.timeEquivalentLabel
  }

  var body: some View {
    let hasPercent = data.rateLabel.hasSuffix("%")
    let numberPart = hasPercent ? String(data.rateLabel.dropLast()) : data.rateLabel
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top) {
        Wordmark()
        Spacer()
        Text(data.monthLabel)
          .font(.system(size: 14, weight: .bold, design: .rounded))
          .foregroundStyle(palette.text)
          .lineLimit(1)
      }
      Spacer(minLength: 6)
      HStack(alignment: .lastTextBaseline, spacing: 12) {
        (
          Text(numberPart)
            .font(.system(size: 44, weight: .bold, design: .rounded))
          + Text(hasPercent ? "%" : "")
            .font(.system(size: 24, weight: .bold, design: .rounded))
        )
        .foregroundStyle(
          LinearGradient(colors: gradientColors, startPoint: .top, endPoint: .bottom))
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        HStack(spacing: 5) {
          if data.hasIncome && !data.timeEquivalentLabel.isEmpty {
            Image(systemName: "clock")
              .font(.system(size: 11, weight: .bold))
              .foregroundStyle(palette.primary)
          }
          Text(subtitle)
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .foregroundStyle(palette.textSoft)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      Spacer(minLength: 8)
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule().fill(palette.error.opacity(0.22))
          Capsule().fill(palette.success)
            .frame(width: max(0, geo.size.width * savedFraction))
        }
      }
      .frame(height: 10)
      HStack(spacing: 0) {
        HStack(spacing: 6) {
          Circle().fill(data.isPositive ? palette.success : palette.coral).frame(width: 8, height: 8)
          Text("\\(data.savedCaption) \\(data.savedLabel)")
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .foregroundStyle(palette.textSoft)
            .lineLimit(1)
        }
        Spacer()
        HStack(spacing: 6) {
          Circle().fill(palette.error).frame(width: 8, height: 8)
          Text("Spent \\(data.expenseLabel)")
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .foregroundStyle(palette.textSoft)
            .lineLimit(1)
        }
      }
      .padding(.top, 8)
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

// MARK: - Savings history (pro, large)

private struct SavingsHistoryRow: View {
  let month: SavingsHistoryMonthData
  let palette: Palette

  private var accent: Color {
    if !month.hasIncome { return palette.textMuted }
    return month.isPositive ? palette.success : palette.error
  }
  private var fillFraction: CGFloat {
    if !month.hasIncome { return 0 }
    let magnitude = min(1, abs(month.savingsRate))
    return CGFloat(month.isPositive ? max(0.04, magnitude) : max(0.08, magnitude))
  }

  var body: some View {
    HStack(spacing: 10) {
      Text(month.monthLabel)
        .font(.system(size: 12, weight: .heavy, design: .rounded))
        .foregroundStyle(palette.textSoft)
        .frame(width: 34, alignment: .leading)
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule().fill(palette.text.opacity(0.06))
          Capsule()
            .fill(month.hasActivity ? accent : palette.text.opacity(0.08))
            .frame(width: max(4, geo.size.width * fillFraction))
        }
      }
      .frame(height: 12)
      VStack(alignment: .trailing, spacing: 0) {
        Text(month.rateLabel)
          .font(.system(size: 15, weight: .bold, design: .rounded))
          .foregroundStyle(month.hasActivity ? accent : palette.textMuted)
          .lineLimit(1)
        Text(month.savedLabel)
          .font(.system(size: 10, weight: .heavy, design: .rounded))
          .foregroundStyle(palette.textMuted)
          .lineLimit(1)
      }
      .frame(width: 64, alignment: .trailing)
    }
  }
}

private struct SavingsHistoryView: View {
  let data: SavingsHistoryData
  let palette: Palette

  var body: some View {
    let totalColor = data.totalIsPositive ? palette.success : palette.error
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top) {
        Wordmark()
        Spacer()
        VStack(alignment: .trailing, spacing: 0) {
          Text(data.totalSavedLabel)
            .font(.system(size: 24, weight: .bold, design: .rounded))
            .foregroundStyle(totalColor)
            .lineLimit(1)
          Text(data.averageRateLabel)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundStyle(palette.textMuted)
            .lineLimit(1)
        }
      }
      Spacer(minLength: 10)
      VStack(spacing: 0) {
        ForEach(Array(data.months.enumerated()), id: \\.offset) { index, month in
          SavingsHistoryRow(month: month, palette: palette)
          if index < data.months.count - 1 {
            Spacer(minLength: 0)
          }
        }
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

// MARK: - Calendar (pro)

private struct IoChip: View {
  let isIncome: Bool
  let label: String
  let palette: Palette

  var body: some View {
    let accent = isIncome ? palette.success : palette.error
    HStack(spacing: 4) {
      Image(systemName: isIncome ? "arrow.down.right" : "arrow.up.right")
        .font(.system(size: 11, weight: .bold))
        .foregroundStyle(accent)
      Text(label)
        .font(.system(size: 12, weight: .heavy, design: .rounded))
        .foregroundStyle(accent)
    }
    .padding(.horizontal, 9)
    .padding(.vertical, 5)
    .background(accent.opacity(0.12), in: Capsule())
  }
}

private struct CalendarCell: View {
  let day: CalendarDayData
  let palette: Palette
  let height: CGFloat

  var body: some View {
    let accent = day.incomeStronger ? palette.success : palette.error
    let bgColor: Color =
      day.isToday
        ? palette.primary.opacity(0.16)
        : (day.hasActivity
          ? accent.opacity(0.08 + day.intensity * 0.2)
          : palette.surfaceMuted.opacity(0.55))
    let borderColor: Color =
      day.isToday
        ? palette.primary
        : (day.hasActivity
          ? accent.opacity(0.22 + day.intensity * 0.28)
          : palette.textMuted.opacity(0.14))
    let dayColor: Color =
      day.isToday ? palette.primary : (day.hasActivity ? accent : palette.textMuted)

    VStack(spacing: 0) {
      Text("\\(day.dayNumber)")
        .font(.system(size: 11, weight: .heavy))
        .foregroundStyle(dayColor)
      Spacer(minLength: 0)
      VStack(spacing: 0) {
        if day.hasActivity {
          if !day.incomeLabel.isEmpty {
            Text(day.incomeLabel)
              .font(.system(size: 8.5, weight: .heavy))
              .foregroundStyle(palette.success)
              .lineLimit(1)
              .minimumScaleFactor(0.7)
          }
          if !day.expenseLabel.isEmpty {
            Text(day.expenseLabel)
              .font(.system(size: 8.5, weight: .heavy))
              .foregroundStyle(palette.error)
              .lineLimit(1)
              .minimumScaleFactor(0.7)
          }
        } else {
          Text("–")
            .font(.system(size: 8.5, weight: .heavy))
            .foregroundStyle(palette.textMuted.opacity(0.45))
        }
      }
    }
    .padding(.top, 5)
    .padding(.bottom, 4)
    .frame(maxWidth: .infinity)
    .frame(height: height)
    .background(bgColor, in: RoundedRectangle(cornerRadius: 11))
    .overlay(
      RoundedRectangle(cornerRadius: 11)
        .strokeBorder(borderColor, lineWidth: day.isToday ? 1.5 : 1))
  }
}

private struct CalendarView: View {
  let data: CalendarMonthData
  let palette: Palette

  var body: some View {
    let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top) {
        Wordmark(width: 108)
        Spacer()
        VStack(alignment: .trailing, spacing: 6) {
          Text(data.monthLabel)
            .font(.system(size: 14, weight: .bold, design: .rounded))
            .foregroundStyle(palette.text)
          HStack(spacing: 7) {
            IoChip(isIncome: true, label: data.incomeLabel, palette: palette)
            IoChip(isIncome: false, label: data.expenseLabel, palette: palette)
          }
        }
      }
      LazyVGrid(columns: columns, spacing: 4) {
        ForEach(Array(data.weekdayLabels.enumerated()), id: \\.offset) { _, label in
          Text(label)
            .font(.system(size: 10, weight: .heavy))
            .foregroundStyle(palette.textMuted)
            .frame(maxWidth: .infinity)
        }
      }
      .padding(.top, 12)
      .padding(.bottom, 6)
      GeometryReader { geo in
        let rows = max(1, ceil(Double(data.leadingSpacers + data.days.count) / 7.0))
        // A per-month cycle override can stretch a financial month well past 31
        // days (its neighbour lends it the days), so this grid can need eight
        // rows or more where a calendar month never needs more than six. Fit the
        // rows to the height the widget actually has instead of flooring each
        // cell at a comfortable 28pt and running off the bottom; at six rows or
        // fewer in systemLarge there is room to spare, so this is a no-op for
        // every month that exists today. Mirrors CalendarMonthGrid in the app.
        // The remaining floor only guards a zero-height proposal during layout.
        let cellHeight = max(12, (geo.size.height - CGFloat(rows - 1) * 4) / CGFloat(rows))
        LazyVGrid(columns: columns, spacing: 4) {
          ForEach(0..<data.leadingSpacers, id: \\.self) { _ in
            Color.clear.frame(height: cellHeight)
          }
          ForEach(Array(data.days.enumerated()), id: \\.offset) { _, day in
            CalendarCell(day: day, palette: palette, height: cellHeight)
          }
        }
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

// MARK: - Budget (ring + breakdown)

// isOver wins so a zero-budget overspend (ratio 0) still reads as over.
private func budgetUsageColor(_ ratio: Double, isOver: Bool, palette: Palette) -> Color {
  if isOver || ratio > 1 { return palette.error }
  if ratio >= 0.8 { return palette.coral }
  return palette.primary
}

private struct BudgetSetupView: View {
  let title: String
  let monthLabel: String
  let palette: Palette

  var body: some View {
    VStack(spacing: 4) {
      Spacer(minLength: 0)
      Text(title)
        .font(.system(size: 15, weight: .heavy, design: .rounded))
        .foregroundStyle(palette.text)
        .multilineTextAlignment(.center)
      Text(monthLabel)
        .font(.system(size: 11, weight: .semibold, design: .rounded))
        .foregroundStyle(palette.textSoft)
      Spacer(minLength: 0)
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

private struct BudgetRingView: View {
  let data: BudgetRingData
  let palette: Palette

  var body: some View {
    let color = budgetUsageColor(data.usageRatio, isOver: data.isOver, palette: palette)
    let used = CGFloat(max(0, min(data.usageRatio, 1)))

    VStack(spacing: 4) {
      if let shortMonth = data.monthShortLabel, !shortMonth.isEmpty {
        Text(shortMonth.uppercased())
          .font(.system(size: 9, weight: .heavy))
          .kerning(0.8)
          .foregroundStyle(palette.textMuted)
          .lineLimit(1)
      }
      ZStack {
        Circle().stroke(color.opacity(0.15), lineWidth: 9)
        Circle()
          .trim(from: 0, to: used)
          .stroke(color, style: StrokeStyle(lineWidth: 9, lineCap: .round))
          .rotationEffect(.degrees(-90))
        // Pacing tick at day-of-month around the ring: ahead/behind pace reads
        // from the gap between the arc tip and this notch.
        VStack(spacing: 0) {
          RoundedRectangle(cornerRadius: 1)
            .fill(palette.text.opacity(0.55))
            .frame(width: 2, height: 13)
            .offset(y: -6)
          Spacer(minLength: 0)
        }
        .rotationEffect(.degrees(data.paceRatio * 360))
        VStack(spacing: 1) {
          Text(data.remainingLabel)
            .font(.system(size: 21, weight: .bold, design: .rounded))
            .foregroundStyle(data.isOver ? palette.error : palette.text)
            .lineLimit(1)
            .minimumScaleFactor(0.55)
          Text(data.captionLabel)
            .font(.system(size: 8.5, weight: .heavy))
            .foregroundStyle(palette.textMuted)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 18)
      }
      .aspectRatio(1, contentMode: .fit)
      Text(data.daysLeftLabel)
        .font(.system(size: 9.5, weight: .heavy))
        .foregroundStyle(palette.textMuted)
        .lineLimit(1)
    }
    .padding(13)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

private struct BudgetBreakdownRowView: View {
  let line: BudgetBreakdownCategoryData
  let palette: Palette

  var body: some View {
    let color = budgetUsageColor(line.usageRatio, isOver: line.isOver, palette: palette)
    let fill = CGFloat(max(0.03, min(line.usageRatio, 1)))
    HStack(spacing: 8) {
      Text(line.emoji.isEmpty ? "\\u{2022}" : line.emoji)
        .font(.system(size: 13))
        .frame(width: 20)
      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 8) {
          Text(line.name)
            .font(.system(size: 11.5, weight: .heavy, design: .rounded))
            .foregroundStyle(palette.text)
            .lineLimit(1)
          Spacer(minLength: 0)
          (Text(line.spentLabel).foregroundColor(color)
            + Text(" / " + line.budgetedLabel).foregroundColor(palette.textMuted))
            .font(.system(size: 10.5, weight: .heavy, design: .rounded))
            .lineLimit(1)
        }
        GeometryReader { geo in
          ZStack(alignment: .leading) {
            Capsule().fill(color.opacity(0.14))
            Capsule().fill(color).frame(width: geo.size.width * fill)
          }
        }
        .frame(height: 5)
      }
    }
  }
}

private struct BudgetBreakdownView: View {
  let data: BudgetBreakdownData
  let palette: Palette

  var body: some View {
    let color = budgetUsageColor(data.usageRatio, isOver: data.isOver, palette: palette)
    let used = CGFloat(max(0, min(data.usageRatio, 1)))
    let pace = CGFloat(max(0, min(data.paceRatio, 1)))

    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top) {
        Wordmark(width: 104)
        Spacer(minLength: 8)
        VStack(alignment: .trailing, spacing: 2) {
          Text(data.monthLabel)
            .font(.system(size: 14, weight: .heavy, design: .rounded))
            .foregroundStyle(palette.text)
            .lineLimit(1)
          (Text(data.totalSpentLabel).foregroundColor(color)
            + Text(" / " + data.totalBudgetLabel).foregroundColor(palette.textMuted))
            .font(.system(size: 15, weight: .heavy, design: .rounded))
            .lineLimit(1)
        }
      }

      // Overall usage bar with the pacing tick.
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule().fill(color.opacity(0.14))
          Capsule().fill(color).frame(width: geo.size.width * used)
          RoundedRectangle(cornerRadius: 1)
            .fill(palette.text.opacity(0.55))
            .frame(width: 2, height: 12)
            .offset(x: geo.size.width * pace - 1)
        }
      }
      .frame(height: 10)
      .padding(.top, 10)

      Text(data.remainingLabel)
        .font(.system(size: 10.5, weight: .heavy, design: .rounded))
        .foregroundStyle(data.isOver ? palette.error : color)
        .lineLimit(1)
        .padding(.top, 5)

      VStack(spacing: 0) {
        ForEach(Array(data.categories.enumerated()), id: \\.offset) { _, line in
          Spacer(minLength: 4)
          BudgetBreakdownRowView(line: line, palette: palette)
        }
        Spacer(minLength: 4)
      }
      .frame(maxHeight: .infinity)

      if !data.unbudgetedLabel.isEmpty || !data.moreLabel.isEmpty {
        HStack {
          Text(data.unbudgetedLabel)
            .font(.system(size: 9.5, weight: .heavy, design: .rounded))
            .foregroundStyle(palette.textMuted)
            .lineLimit(1)
          Spacer(minLength: 8)
          Text(data.moreLabel)
            .font(.system(size: 9.5, weight: .heavy, design: .rounded))
            .foregroundStyle(palette.textMuted)
            .lineLimit(1)
        }
        .padding(.top, 4)
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

// MARK: - Timeline

private struct SnapshotEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
  var isPreview: Bool = false
}

private struct SnapshotProvider: TimelineProvider {
  // In the widget gallery (preview) always show the illustrative sample — which
  // is marked Pro — so non-Pro users can see what every widget looks like, with
  // a PRO badge. The Pro lock only appears once the widget is actually placed.
  func placeholder(in context: Context) -> SnapshotEntry {
    SnapshotEntry(date: Date(), snapshot: sampleSnapshot(), isPreview: true)
  }

  func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
    let preview = context.isPreview
    let snapshot = preview ? sampleSnapshot() : loadSnapshot()
    completion(SnapshotEntry(date: Date(), snapshot: snapshot, isPreview: preview))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
    completion(
      Timeline(
        entries: [SnapshotEntry(date: Date(), snapshot: loadSnapshot(), isPreview: false)],
        policy: .never))
  }
}

private struct EmptyStateView: View {
  let palette: Palette
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Wordmark()
      Spacer(minLength: 0)
      Text("Open Money2Time to set up.")
        .font(.system(size: 13, weight: .semibold, design: .rounded))
        .foregroundStyle(palette.textSoft)
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

// MARK: - Widget roots

private struct MonthlyRoot: View {
  var entry: SnapshotEntry
  @Environment(\\.colorScheme) private var scheme
  var body: some View {
    let palette = Palette.current(scheme)
    Group {
      if let snapshot = entry.snapshot {
        MonthlySpendView(data: snapshot.monthlyExpenseQuickLog, palette: palette)
      } else {
        EmptyStateView(palette: palette)
      }
    }
    .money2TimeWidgetBackground(palette.background)
  }
}

private struct QuickAddSmallRoot: View {
  var entry: SnapshotEntry
  @Environment(\\.colorScheme) private var scheme
  var body: some View {
    let palette = Palette.current(scheme)
    Group {
      if let snapshot = entry.snapshot {
        QuickAddSmallView(data: snapshot.quickAddSmall, palette: palette)
      } else {
        EmptyStateView(palette: palette)
      }
    }
    .money2TimeWidgetBackground(palette.background)
  }
}

private struct WeeklyRoot: View {
  var entry: SnapshotEntry
  @Environment(\\.colorScheme) private var scheme
  var body: some View {
    let palette = Palette.current(scheme)
    Group {
      if let snapshot = entry.snapshot {
        if snapshot.isPro {
          WeeklyExpenseView(data: snapshot.weeklyExpense, palette: palette)
            .proCornerRibbon(entry.isPreview, palette: palette)
            .widgetURL(URL(string: "money2time://insights?focus=expense_breakdown"))
        } else {
          ProLockView(
            title: "Past 7 Days",
            url: snapshot.proUnlockUrlByWidgetId["weekly_expense"] ?? "money2time://pro",
            palette: palette,
            compact: true)
        }
      } else {
        EmptyStateView(palette: palette)
      }
    }
    .money2TimeWidgetBackground(palette.background)
  }
}

private struct CalendarRoot: View {
  var entry: SnapshotEntry
  @Environment(\\.colorScheme) private var scheme
  var body: some View {
    let palette = Palette.current(scheme)
    Group {
      if let snapshot = entry.snapshot {
        if snapshot.isPro {
          CalendarView(data: snapshot.calendarMonth, palette: palette)
            .proCornerRibbon(entry.isPreview, palette: palette)
            .widgetURL(URL(string: "money2time://calendar"))
        } else {
          ProLockView(
            title: "Calendar",
            url: snapshot.proUnlockUrlByWidgetId["calendar_month"] ?? "money2time://pro",
            palette: palette,
            compact: false)
        }
      } else {
        EmptyStateView(palette: palette)
      }
    }
    .money2TimeWidgetBackground(palette.background)
  }
}

private struct SavingsRoot: View {
  var entry: SnapshotEntry
  @Environment(\\.colorScheme) private var scheme
  var body: some View {
    let palette = Palette.current(scheme)
    Group {
      if let snapshot = entry.snapshot {
        if snapshot.isPro {
          SavingsRateView(data: snapshot.savingsRate, palette: palette)
            .proCornerRibbon(entry.isPreview, palette: palette)
            .widgetURL(URL(string: "money2time://insights?focus=savings_rate"))
        } else {
          ProLockView(
            title: "Savings Rate",
            url: snapshot.proUnlockUrlByWidgetId["savings_rate"] ?? "money2time://pro",
            palette: palette,
            compact: true)
        }
      } else {
        EmptyStateView(palette: palette)
      }
    }
    .money2TimeWidgetBackground(palette.background)
  }
}

private struct SavingsHistoryRoot: View {
  var entry: SnapshotEntry
  @Environment(\\.colorScheme) private var scheme
  var body: some View {
    let palette = Palette.current(scheme)
    Group {
      if let snapshot = entry.snapshot {
        if snapshot.isPro {
          SavingsHistoryView(data: snapshot.savingsHistory, palette: palette)
            .proCornerRibbon(entry.isPreview, palette: palette)
            .widgetURL(URL(string: "money2time://insights?focus=savings_rate"))
        } else {
          ProLockView(
            title: "Savings History",
            url: snapshot.proUnlockUrlByWidgetId["savings_history"] ?? "money2time://pro",
            palette: palette,
            compact: false)
        }
      } else {
        EmptyStateView(palette: palette)
      }
    }
    .money2TimeWidgetBackground(palette.background)
  }
}

private struct BudgetRingRoot: View {
  var entry: SnapshotEntry
  @Environment(\\.colorScheme) private var scheme
  var body: some View {
    let palette = Palette.current(scheme)
    Group {
      if let snapshot = entry.snapshot, let data = snapshot.budgetRing {
        if snapshot.isPro {
          Group {
            if data.hasBudget {
              BudgetRingView(data: data, palette: palette)
            } else {
              BudgetSetupView(title: data.setupLabel, monthLabel: data.monthLabel, palette: palette)
            }
          }
          .proCornerRibbon(entry.isPreview, palette: palette)
          .widgetURL(URL(string: data.budgetUrl))
        } else {
          ProLockView(
            title: "Budget",
            url: snapshot.proUnlockUrlByWidgetId["budget_ring"] ?? "money2time://pro",
            palette: palette,
            small: true)
        }
      } else {
        EmptyStateView(palette: palette)
      }
    }
    .money2TimeWidgetBackground(palette.background)
  }
}

private struct BudgetBreakdownRoot: View {
  var entry: SnapshotEntry
  @Environment(\\.colorScheme) private var scheme
  var body: some View {
    let palette = Palette.current(scheme)
    Group {
      if let snapshot = entry.snapshot, let data = snapshot.budgetBreakdown {
        if snapshot.isPro {
          Group {
            if data.hasBudget {
              BudgetBreakdownView(data: data, palette: palette)
            } else {
              BudgetSetupView(title: data.setupLabel, monthLabel: data.monthLabel, palette: palette)
            }
          }
          .proCornerRibbon(entry.isPreview, palette: palette)
          .widgetURL(URL(string: data.budgetUrl))
        } else {
          ProLockView(
            title: "Budget Breakdown",
            url: snapshot.proUnlockUrlByWidgetId["budget_breakdown"] ?? "money2time://pro",
            palette: palette,
            compact: false)
        }
      } else {
        EmptyStateView(palette: palette)
      }
    }
    .money2TimeWidgetBackground(palette.background)
  }
}

// MARK: - Widgets

struct Money2TimeMonthlyWidget: Widget {
  let kind = "Money2TimeMonthlyExpenseQuickLog"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
      MonthlyRoot(entry: entry)
    }
    .configurationDisplayName("Monthly Spend")
    .description("Log income or expenses and see this month's spending as time.")
    .supportedFamilies([.systemMedium])
    .contentMarginsDisabled()
  }
}

struct Money2TimeQuickAddWidget: Widget {
  let kind = "Money2TimeQuickAddSmall"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
      QuickAddSmallRoot(entry: entry)
    }
    .configurationDisplayName("Quick Add")
    .description("Add an expense or income in one tap.")
    .supportedFamilies([.systemSmall])
    .contentMarginsDisabled()
  }
}

struct Money2TimeWeeklyWidget: Widget {
  let kind = "Money2TimeWeeklyExpense"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
      WeeklyRoot(entry: entry)
    }
    .configurationDisplayName("Past 7 Days")
    .description("See your spending for each of the last 7 days.")
    .supportedFamilies([.systemMedium])
    .contentMarginsDisabled()
  }
}

struct Money2TimeCalendarWidget: Widget {
  let kind = "Money2TimeCalendarMonth"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
      CalendarRoot(entry: entry)
    }
    .configurationDisplayName("Calendar")
    .description("This month's income and expenses at a glance.")
    .supportedFamilies([.systemLarge])
    .contentMarginsDisabled()
  }
}

struct Money2TimeSavingsRateWidget: Widget {
  let kind = "Money2TimeSavingsRate"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
      SavingsRoot(entry: entry)
    }
    .configurationDisplayName("Savings Rate")
    .description("How much of this month's income you have kept.")
    .supportedFamilies([.systemMedium])
    .contentMarginsDisabled()
  }
}

struct Money2TimeSavingsHistoryWidget: Widget {
  let kind = "Money2TimeSavingsHistory"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
      SavingsHistoryRoot(entry: entry)
    }
    .configurationDisplayName("Savings History")
    .description("Your savings rate over the last several months.")
    .supportedFamilies([.systemLarge])
    .contentMarginsDisabled()
  }
}

struct Money2TimeBudgetRingWidget: Widget {
  let kind = "Money2TimeBudgetRing"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
      BudgetRingRoot(entry: entry)
    }
    .configurationDisplayName("Budget")
    .description("How much of this month's budget is left, with a pace marker.")
    .supportedFamilies([.systemSmall])
    .contentMarginsDisabled()
  }
}

struct Money2TimeBudgetBreakdownWidget: Widget {
  let kind = "Money2TimeBudgetBreakdown"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
      BudgetBreakdownRoot(entry: entry)
    }
    .configurationDisplayName("Budget Breakdown")
    .description("Your top budget categories and how fast they're depleting.")
    .supportedFamilies([.systemLarge])
    .contentMarginsDisabled()
  }
}

@main
struct Money2TimeWidgetBundle: WidgetBundle {
  var body: some Widget {
    Money2TimeMonthlyWidget()
    Money2TimeQuickAddWidget()
    Money2TimeWeeklyWidget()
    Money2TimeCalendarWidget()
    Money2TimeSavingsRateWidget()
    Money2TimeSavingsHistoryWidget()
    Money2TimeBudgetRingWidget()
    Money2TimeBudgetBreakdownWidget()
    Money2TimeLiveEarningsWidget()
    Money2TimeEarningsTickerWidget()
  }
}
`,
      );

      writeFileIfChanged(
        path.join(iosRoot, 'Info.plist'),
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>Money2Time</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.widgetkit-extension</string>
  </dict>
</dict>
</plist>
`,
      );

      writeFileIfChanged(
        path.join(iosRoot, 'Money2TimeWidget.entitlements'),
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>${APP_GROUP}</string>
  </array>
</dict>
</plist>
`,
      );

      writeFileIfChanged(
        path.join(appRoot, 'Money2TimeWidgetModule.swift'),
        `import Foundation
import React
import WidgetKit

@objc(Money2TimeWidget)
class Money2TimeWidget: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(writeSnapshot:resolver:rejecter:)
  func writeSnapshot(
    _ json: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard let defaults = UserDefaults(suiteName: "${APP_GROUP}") else {
      reject("widget_app_group_unavailable", "Money2Time widget App Group is unavailable.", nil)
      return
    }

    defaults.set(json, forKey: "${SNAPSHOT_KEY}")
    defaults.synchronize()
    WidgetCenter.shared.reloadAllTimelines()
    resolve(nil)
  }

  /// Hands the live-earnings widget its precomputed timeline. Only that
  /// widget's kind is reloaded: this fires on every foreground transition
  /// while a session runs, and rebuilding all eight snapshot widgets each time
  /// would spend the reload budget on work none of them need.
  @objc(writeLiveEarnings:resolver:rejecter:)
  func writeLiveEarnings(
    _ json: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard let defaults = UserDefaults(suiteName: "${APP_GROUP}") else {
      reject("widget_app_group_unavailable", "Money2Time widget App Group is unavailable.", nil)
      return
    }

    defaults.set(json, forKey: "${LIVE_EARNINGS_KEY}")
    defaults.synchronize()
    WidgetCenter.shared.reloadTimelines(ofKind: "${LIVE_EARNINGS_WIDGET_KIND}")
    resolve(nil)
  }

  @objc(reloadAll:rejecter:)
  func reloadAll(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    WidgetCenter.shared.reloadAllTimelines()
    resolve(nil)
  }
}
`,
      );

      writeFileIfChanged(
        path.join(appRoot, 'Money2TimeLiveEarningsIntent.swift'),
        `import ActivityKit
import AppIntents
import Foundation
import os

${LIVE_EARNINGS_FEED_SWIFT}`,
      );

      writeFileIfChanged(
        path.join(appRoot, 'Money2TimeWidgetModule.m'),
        `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(Money2TimeWidget, NSObject)

RCT_EXTERN_METHOD(writeSnapshot:(NSString *)json
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(writeLiveEarnings:(NSString *)json
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(reloadAll:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
`,
      );

      writeFileIfChanged(
        path.join(iosRoot, 'Money2TimeLiveEarnings.swift'),
        `import ActivityKit
import AppIntents
import os
import SwiftUI
import UIKit
import WidgetKit

${LIVE_ACTIVITY_ATTRIBUTES_SWIFT}
${LIVE_EARNINGS_FEED_SWIFT}
// MARK: - Theme
//
// The card borrows the user's own theme colour (Apple: a Live Activity should
// feel visually connected to the app through shared colours), and spends it on
// exactly one thing - the earned amount - so the number is what the eye lands
// on. Everything else is '.primary' / '.secondary', which are the only colours
// that stay legible both over the Lock Screen and in light contexts.

private extension Color {
  init(liveHex: UInt32) {
    self.init(
      .sRGB,
      red: Double((liveHex >> 16) & 0xFF) / 255,
      green: Double((liveHex >> 8) & 0xFF) / 255,
      blue: Double(liveHex & 0xFF) / 255,
      opacity: 1)
  }

  static func liveAdaptive(light: UInt32, dark: UInt32) -> Color {
    Color(
      UIColor { traits in
        traits.userInterfaceStyle == .dark
          ? UIColor(Color(liveHex: dark))
          : UIColor(Color(liveHex: light))
      })
  }
}

private func liveAccent(_ attributes: Money2TimeEarningsAttributes) -> Color {
  Color.liveAdaptive(light: attributes.accentLightHex, dark: attributes.accentDarkHex)
}

private func liveRange(_ attributes: Money2TimeEarningsAttributes) -> ClosedRange<Date> {
  let start = attributes.startedAt
  let end = attributes.endsAt
  return start <= end ? start...end : start...start.addingTimeInterval(1)
}

// MARK: - Pieces

private struct LiveBadge: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.system(size: 12.5, weight: .semibold, design: .rounded))
      .foregroundStyle(.secondary)
      .lineLimit(1)
  }
}

private struct SessionBar: View {
  let range: ClosedRange<Date>
  let accent: Color

  var body: some View {
    // Live without an update: the system fills this from the two dates alone,
    // which is what keeps the card from ever looking frozen between refreshes.
    ProgressView(
      timerInterval: range,
      countsDown: false,
      label: { EmptyView() },
      currentValueLabel: { EmptyView() }
    )
    .progressViewStyle(.linear)
    .tint(accent)
  }
}

/// Elapsed clock and the session end, side by side on their own row.
///
/// The clock lives down here at footnote size on purpose. Next to the big
/// amount it had to fight for width, and a 'Text(timerInterval:)' that is not
/// given the width it reserved silently renders '1:--' instead of the time.
private struct SessionFooter: View {
  let range: ClosedRange<Date>
  let endsText: String

  var body: some View {
    HStack(spacing: 8) {
      // The clock gets a fixed box, and both halves of that are load-bearing.
      //
      // A 'Text(timerInterval:)' reserves the width of the widest time its
      // range can reach ("3:59:59" on a four-hour session) and renders "3:--"
      // the moment it is handed less, which is what the Lock Screen did - it is
      // narrower there than in Notification Center. So the clock has to be
      // given its width rather than left to compete for it.
      //
      // But that reservation must be FINITE. 'fixedSize(horizontal: true)' is
      // the obvious way to say "take what you need" and it proposes an
      // unspecified width instead; the system's own ideal width for a timer
      // text is not finite there, and the nan came back out through the
      // sibling progress bar as 'view origin is invalid: (nan, 3.0)' - a trap
      // in SwiftUI's layout that killed WidgetRenderer_Activities outright.
      // That crash takes every presentation of the activity with it: the whole
      // card and every Dynamic Island state render as blank black.
      //
      // 72pt fits "0:00:00" at this size with room to spare, and leaves the
      // end time the rest of the row.
      Text(timerInterval: range, countsDown: false)
        .monospacedDigit()
        .lineLimit(1)
        .frame(width: 72, alignment: .leading)
      Spacer(minLength: 8)
      Text(endsText)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }
    .font(.system(size: 12.5, weight: .medium, design: .rounded))
    .foregroundStyle(.secondary)
  }
}

/// The card's one interactive element.
///
/// A Live Activity cannot repaint its own money figure - only time-derived
/// views redraw without an update - so this is the manual lever: the intent
/// runs in the app's process (that is what 'LiveActivityIntent' buys) and
/// pushes the current amount, all without leaving the Lock Screen or waking
/// the app to the foreground.
@available(iOS 17.0, *)
private struct RefreshEarningsButton: View {
  let accent: Color
  let label: String

  var body: some View {
    Button(intent: Money2TimeRefreshEarningsIntent()) {
      Image(systemName: "arrow.clockwise")
        .font(.system(size: 12, weight: .bold))
        .foregroundStyle(accent)
        .frame(width: 28, height: 28)
        .background(Circle().fill(.quaternary))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text(label))
  }
}

/// The hero number. 'numericText' is Apple's own recommendation for a counting
/// figure: the digits that changed roll over instead of the whole string
/// swapping, which is what makes the update read as counting rather than
/// blinking.
private struct EarnedAmount: View {
  let text: String
  let value: Double
  let accent: Color
  let size: CGFloat

  var body: some View {
    Text(text)
      .font(.system(size: size, weight: .heavy, design: .rounded))
      .monospacedDigit()
      .contentTransition(.numericText(value: value))
      .lineLimit(1)
      .minimumScaleFactor(0.5)
      .foregroundStyle(accent)
  }
}

// MARK: - Lock Screen / banner

private struct LiveEarningsLockScreenView: View {
  let context: ActivityViewContext<Money2TimeEarningsAttributes>

  var body: some View {
    let accent = liveAccent(context.attributes)

    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .center, spacing: 8) {
        // The headline is a sentence now, not a one-word badge, so it takes
        // the row's space first: if anything has to truncate on a narrow
        // device it should be the rate, which the card repeats nowhere else
        // but which is the lesser of the two.
        LiveBadge(text: context.attributes.titleText)
          .layoutPriority(1)
        Spacer(minLength: 8)
        Text(context.attributes.rateText)
          .font(.system(size: 12.5, weight: .medium, design: .rounded))
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }

      // The amount leads the row and takes its space first. What sits beside
      // it is deliberately static: a 'Text(timerInterval:)' here would reserve
      // the width of the widest time it could ever show and shove the amount
      // off the row entirely, which is why the clock stays in the footer.
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        EarnedAmount(
          text: context.state.earnedText,
          value: context.state.earned,
          accent: accent,
          size: 40)
          .layoutPriority(1)

        // Scales the bar below into money: without it the fill is an abstract
        // proportion, and the one element that moves on its own says nothing
        // about what has been earned.
        Text(context.attributes.totalText)
          .font(.system(size: 13, weight: .medium, design: .rounded))
          .foregroundStyle(.secondary)
          .lineLimit(1)

        Spacer(minLength: 4)

        if #available(iOS 17.0, *) {
          RefreshEarningsButton(
            accent: accent,
            label: context.attributes.refreshText)
        }
      }

      SessionBar(range: liveRange(context.attributes), accent: accent)
        .padding(.top, 2)

      SessionFooter(
        range: liveRange(context.attributes),
        endsText: context.attributes.endsText)
    }
    // Apple's spec for a Lock Screen Live Activity: 14pt margins all round.
    .padding(14)
  }
}

// MARK: - Widget

struct Money2TimeLiveEarningsWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: Money2TimeEarningsAttributes.self) { context in
      LiveEarningsLockScreenView(context: context)
        // No background tint on purpose: the system material is what the rest
        // of the iOS 26 Lock Screen is made of, and a flat colour behind this
        // card makes it the one opaque brick in the stack. The foreground
        // colour still drives the auto-generated dismiss button.
        .activitySystemActionForegroundColor(liveAccent(context.attributes))
    } dynamicIsland: { context in
      let accent = liveAccent(context.attributes)

      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          EarnedAmount(
            text: context.state.earnedText,
            value: context.state.earned,
            accent: accent,
            size: 26)
            .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(context.attributes.rateText)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(spacing: 7) {
            SessionBar(range: liveRange(context.attributes), accent: accent)
            SessionFooter(
              range: liveRange(context.attributes),
              endsText: context.attributes.endsText)
          }
          .padding(.top, 2)
          // The expanded region runs edge to edge, and its corners clip: without
          // this the clock loses its first digit and the end time loses its
          // last letter.
          .padding(.horizontal, 6)
        }
      } compactLeading: {
        EarnedAmount(
          text: context.state.earnedText,
          value: context.state.earned,
          accent: accent,
          size: 13)
          .frame(maxWidth: 64)
      } compactTrailing: {
        Text(timerInterval: liveRange(context.attributes), countsDown: false)
          .font(.system(size: 13, weight: .semibold, design: .rounded))
          .monospacedDigit()
          .lineLimit(1)
          .frame(maxWidth: 68)
          .multilineTextAlignment(.trailing)
          .foregroundStyle(.secondary)
      } minimal: {
        // A ring rather than a logo: the HIG asks the minimal state to still
        // say something about the activity, and this one fills itself from the
        // session dates, so it is both informative and alive.
        ProgressView(
          timerInterval: liveRange(context.attributes),
          countsDown: false,
          label: { EmptyView() },
          currentValueLabel: { EmptyView() }
        )
        .progressViewStyle(.circular)
        .tint(accent)
      }
      .keylineTint(accent)
    }
  }
}

// MARK: - Live earnings widget
//
// The counterpart to the card above, and the only one of the two whose figure
// moves by itself. A Live Activity repaints just its time-derived views, so
// its amount is only ever as fresh as the last update; a widget, by contrast,
// is handed a *timeline* of future entries and the system renders each at its
// date with no app process involved. Money accruing at a fixed rate is
// perfectly predictable, so the app precomputes the whole session (see
// 'features/widgets/lib/liveEarningsWidget.ts') and the number climbs on its
// own on the Lock Screen.

/// Stands in only before the app has ever written a feed - the widget gallery
/// on a fresh install. Everything else the widget says is localized in JS.
private let earningsTickerIdleFallback = "Not tracking"

private struct EarningsTickerEntry: TimelineEntry {
  let date: Date
  let feed: Money2TimeEarningsFeed?
  let tick: Money2TimeEarningsTick?

  var isRunning: Bool { feed?.active == true && tick != nil }
  var amountText: String { tick?.label ?? feed?.idleText ?? earningsTickerIdleFallback }
  var captionText: String { isRunning ? (feed?.rateText ?? "") : "" }
  var footnoteText: String { isRunning ? (feed?.endsText ?? "") : "" }
  var progress: Double { min(max(tick?.progress ?? 0, 0), 1) }

  var accent: Color {
    guard let feed else { return .primary }
    return Color.liveAdaptive(light: feed.accentLightHex, dark: feed.accentDarkHex)
  }

  var url: URL? { URL(string: feed?.openUrl ?? "money2time://live-earnings") }
}

private struct EarningsTickerProvider: TimelineProvider {
  func placeholder(in context: Context) -> EarningsTickerEntry {
    entry(at: Date())
  }

  func getSnapshot(in context: Context, completion: @escaping (EarningsTickerEntry) -> Void) {
    completion(entry(at: Date()))
  }

  func getTimeline(
    in context: Context,
    completion: @escaping (Timeline<EarningsTickerEntry>) -> Void
  ) {
    let now = Date()
    let feed = Money2TimeEarningsFeedStore.load()

    guard let feed, feed.active, !feed.ticks.isEmpty else {
      completion(
        Timeline(entries: [EarningsTickerEntry(date: now, feed: feed, tick: nil)], policy: .never))
      return
    }

    // The first entry is 'now' rather than the next tick, so the widget is
    // right the instant it reloads instead of holding the previous figure
    // until the following minute.
    var entries = [EarningsTickerEntry(date: now, feed: feed, tick: feed.tick(at: now))]
    for tick in feed.ticks where tick.date > now {
      entries.append(EarningsTickerEntry(date: tick.date, feed: feed, tick: tick))
    }

    // '.never': the app rewrites the feed on every foreground transition, and
    // the last entry is the session's final total - so a timeline that runs
    // out leaves the right answer on screen rather than a stale one.
    completion(Timeline(entries: entries, policy: .never))
  }

  private func entry(at date: Date) -> EarningsTickerEntry {
    let feed = Money2TimeEarningsFeedStore.load()
    let tick = feed?.active == true ? feed?.tick(at: date) : nil
    return EarningsTickerEntry(date: date, feed: feed, tick: tick)
  }
}

private extension View {
  @ViewBuilder
  func earningsTickerBackground(_ color: Color) -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      self.containerBackground(color, for: .widget)
    } else {
      self.background(color)
    }
  }
}

/// Lock Screen, below the clock. Accessory widgets are rendered in a single
/// vibrant tint, so this one spends its space on size and hierarchy rather
/// than colour, which would be thrown away.
private struct EarningsTickerRectangular: View {
  let entry: EarningsTickerEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 1) {
      if !entry.captionText.isEmpty {
        Text(entry.captionText)
          .font(.system(size: 12, weight: .medium, design: .rounded))
          .lineLimit(1)
      }
      Text(entry.amountText)
        .font(.system(size: 21, weight: .heavy, design: .rounded))
        .minimumScaleFactor(0.5)
        .lineLimit(1)
        .widgetAccentable()
      if entry.isRunning {
        ProgressView(value: entry.progress)
          .progressViewStyle(.linear)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }
}

private struct EarningsTickerCircular: View {
  let entry: EarningsTickerEntry

  @ViewBuilder
  var body: some View {
    if entry.isRunning {
      Gauge(value: entry.progress) {
        EmptyView()
      } currentValueLabel: {
        Text(entry.amountText)
          .font(.system(size: 13, weight: .semibold, design: .rounded))
          .minimumScaleFactor(0.4)
          .lineLimit(1)
      }
      .gaugeStyle(.accessoryCircular)
    } else {
      // A sentence like "Not tracking" cannot be squeezed into a circular
      // complication at any legible size, so idle says the same thing with a
      // glyph instead of shrinking text to nothing.
      Image(systemName: "clock")
        .font(.system(size: 18, weight: .semibold))
    }
  }
}

/// Home Screen and StandBy, where colour survives, so the amount carries the
/// user's theme the way it does on the Live Activity.
private struct EarningsTickerSmall: View {
  let entry: EarningsTickerEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      if !entry.captionText.isEmpty {
        Text(entry.captionText)
          .font(.system(size: 12.5, weight: .medium, design: .rounded))
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }

      // Idle drops out of the hero treatment: "Not tracking" set at 27pt heavy
      // reads as something having gone wrong rather than as nothing running.
      Text(entry.amountText)
        .font(
          .system(
            size: entry.isRunning ? 27 : 17,
            weight: entry.isRunning ? .heavy : .semibold,
            design: .rounded))
        .foregroundStyle(entry.isRunning ? entry.accent : Color.secondary)
        .minimumScaleFactor(0.5)
        .lineLimit(1)

      if entry.isRunning {
        ProgressView(value: entry.progress)
          .progressViewStyle(.linear)
          .tint(entry.accent)
      }

      Spacer(minLength: 0)

      if !entry.footnoteText.isEmpty {
        Text(entry.footnoteText)
          .font(.system(size: 11.5, weight: .medium, design: .rounded))
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .earningsTickerBackground(Color(uiColor: .systemBackground))
  }
}

private struct EarningsTickerRoot: View {
  @Environment(\\.widgetFamily) private var family
  let entry: EarningsTickerEntry

  var body: some View {
    content
      .widgetURL(entry.url)
  }

  @ViewBuilder
  private var content: some View {
    switch family {
    case .accessoryCircular:
      EarningsTickerCircular(entry: entry)
    case .accessoryInline:
      // Inline sits beside the Lock Screen clock and takes a single view, so
      // it gets the one thing worth saying there.
      Text(entry.amountText)
    case .accessoryRectangular:
      EarningsTickerRectangular(entry: entry)
    default:
      EarningsTickerSmall(entry: entry)
    }
  }
}

struct Money2TimeEarningsTickerWidget: Widget {
  // Matches the kind the app reloads after writing a feed.
  let kind = "${LIVE_EARNINGS_WIDGET_KIND}"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: EarningsTickerProvider()) { entry in
      EarningsTickerRoot(entry: entry)
    }
    .configurationDisplayName("Live Earnings")
    .description("Your pay counting up while the clock runs.")
    .supportedFamilies([.systemSmall, .accessoryRectangular, .accessoryCircular, .accessoryInline])
    .contentMarginsDisabled()
  }
}
`,
      );

      writeFileIfChanged(
        path.join(appRoot, 'Money2TimeLiveActivityModule.swift'),
        `import ActivityKit
import Foundation
import React

${LIVE_ACTIVITY_ATTRIBUTES_SWIFT}
@objc(Money2TimeLiveActivity)
class Money2TimeLiveActivity: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  private typealias EarningsActivity = Activity<Money2TimeEarningsAttributes>

  /// The device's push-to-start token, hex-encoded.
  ///
  /// This one belongs to the activity *type*, not to any card: it is how the
  /// Worker raises a scheduled shift on a phone that is not running the app.
  /// It survives every card started from it, and iOS may rotate it, which is
  /// why the app re-registers it on every foreground.
  private static var observedPushToStartToken: String?

  /// The update token of the running card, remembered by activity id.
  ///
  /// 'activity.pushToken' is nil for a moment after a card appears, and the
  /// moment that matters most is a card raised by a push while the app was not
  /// running: iOS wakes the app for a few seconds, and if that read comes back
  /// nil the amount cannot be pushed until the user next opens the app. So the
  /// stream is observed and the answer cached, and 'describe' falls back to it.
  private static var observedUpdateToken: (activityId: String, token: String)?

  private static var observing = false

  /// Set while the manual start path is between ending the old card and
  /// requesting the new one.
  ///
  /// Without it the reaper below could see that pair as a duplicate and end the
  /// card the user just asked for - the one failure here that would be visible
  /// on every single tap of Start.
  private static var startingByHand = false

  /// Starts the token observers, once per process.
  ///
  /// Called from 'init', so the first JS call into this module arms it - which
  /// on a background wake is the app's own startup, well before anything asks
  /// what is running. Both sequences replay their current value to a late
  /// subscriber, so arming late costs nothing.
  private static func beginObserving() {
    guard !observing else { return }
    observing = true

    if #available(iOS 17.2, *) {
      Task {
        for await data in EarningsActivity.pushToStartTokenUpdates {
          observedPushToStartToken = hexString(data)
        }
      }
    }

    Task {
      for await activity in EarningsActivity.activityUpdates {
        await reapDuplicates()
        Task {
          for await data in activity.pushTokenUpdates {
            observedUpdateToken = (activity.id, hexString(data))
          }
        }
      }
    }
  }

  /// Leaves at most one card up.
  ///
  /// A push-to-start raises a card whether or not one is already running. The
  /// Worker will not send one to an account that has a session registered, but
  /// it cannot see a session the app never got as far as registering, so this
  /// is the backstop.
  ///
  /// The one that has been accruing longest survives: a shift already in
  /// progress is the one with something to lose, and a scheduled start that
  /// slipped past the server's check would otherwise reset it to zero. The flag
  /// above is what makes that safe - the deliberate replacement in 'start'
  /// below is the only other way two of these ever coexist.
  private static func reapDuplicates() async {
    guard !startingByHand else { return }
    let running = EarningsActivity.activities.filter { $0.activityState == .active }
    guard running.count > 1 else { return }
    let keep = running.min { $0.attributes.startedAtMillis < $1.attributes.startedAtMillis }
    for activity in running where activity.id != keep?.id {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }

  override init() {
    super.init()
    Money2TimeLiveActivity.beginObserving()
  }

  private static func date(_ payload: NSDictionary, _ key: String) -> Date? {
    guard let millis = payload[key] as? NSNumber else { return nil }
    return Date(timeIntervalSince1970: millis.doubleValue / 1000)
  }

  private static func text(_ payload: NSDictionary, _ key: String) -> String {
    (payload[key] as? String) ?? ""
  }

  private static func number(_ payload: NSDictionary, _ key: String) -> Double {
    (payload[key] as? NSNumber)?.doubleValue ?? 0
  }

  private static func hex(_ payload: NSDictionary, _ key: String, fallback: UInt32) -> UInt32 {
    guard let value = payload[key] as? NSNumber else { return fallback }
    return UInt32(truncatingIfNeeded: value.intValue)
  }

  /// ActivityKit hands the push token over as raw bytes; APNs addresses a
  /// device by their hex.
  private static func hexString(_ data: Data) -> String {
    data.map { String(format: "%02x", $0) }.joined()
  }

  private static func describe(_ activity: EarningsActivity) -> [String: Any] {
    var payload: [String: Any] = [
      "id": activity.id,
      "startedAt": activity.attributes.startedAtMillis,
      "endsAt": activity.attributes.endsAtMillis,
      "hourlyRate": activity.attributes.hourlyRate,
      "earnedText": activity.content.state.earnedText,
    ]
    // Carried on every read, not just on start: ActivityKit can rotate a token
    // mid-session, and the app re-registers whenever it sees a new one. The
    // observed fallback covers the seconds right after a card appears, when
    // 'pushToken' is still nil - see 'observedUpdateToken'.
    if let token = activity.pushToken {
      payload["pushToken"] = hexString(token)
    } else if let observed = observedUpdateToken, observed.activityId == activity.id {
      payload["pushToken"] = observed.token
    }
    return payload
  }

  /// Whether the device can show Live Activities at all, and whether the user
  /// has left them switched on for Money2Time. There is no prompt to raise:
  /// the toggle lives in Settings, so the UI has to read it rather than ask.
  @objc(getStatus:rejecter:)
  func getStatus(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter _: @escaping RCTPromiseRejectBlock
  ) {
    let info = ActivityAuthorizationInfo()
    resolve([
      "supported": true,
      "enabled": info.areActivitiesEnabled,
    ])
  }

  /// The token a scheduled shift is started through, or nil when this device
  /// cannot be pushed to (iOS below 17.2, Live Activities switched off, or a
  /// token that has simply not been minted yet - it arrives asynchronously,
  /// like an activity's own).
  ///
  /// Reads the static property first and the observed stream second: the first
  /// is authoritative the moment it exists, the second covers a build where it
  /// has not been populated yet but the stream has already yielded.
  @objc(getPushToStartToken:rejecter:)
  func getPushToStartToken(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter _: @escaping RCTPromiseRejectBlock
  ) {
    if #available(iOS 17.2, *) {
      if let token = EarningsActivity.pushToStartToken {
        resolve(Money2TimeLiveActivity.hexString(token))
        return
      }
      resolve(Money2TimeLiveActivity.observedPushToStartToken)
      return
    }
    resolve(nil)
  }

  @objc(getCurrent:rejecter:)
  func getCurrent(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter _: @escaping RCTPromiseRejectBlock
  ) {
    // ActivityKit is the source of truth for what is on the Lock Screen: the
    // activity outlives the JS runtime, so the app has to ask rather than
    // remember. Only ever one at a time.
    guard let activity = EarningsActivity.activities.first else {
      resolve(nil)
      return
    }
    resolve(Money2TimeLiveActivity.describe(activity))
  }

  @objc(start:resolver:rejecter:)
  func start(
    _ payload: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      reject(
        "live_activity_disabled",
        "Live Activities are turned off for Money2Time in iOS Settings.",
        nil)
      return
    }

    guard
      let startedAt = Money2TimeLiveActivity.date(payload, "startedAt"),
      let endsAt = Money2TimeLiveActivity.date(payload, "endsAt"),
      endsAt > startedAt
    else {
      reject("live_activity_invalid_payload", "Live Activity needs a valid time range.", nil)
      return
    }

    let attributes = Money2TimeEarningsAttributes(
      startedAtMillis: startedAt.timeIntervalSince1970 * 1000,
      endsAtMillis: endsAt.timeIntervalSince1970 * 1000,
      hourlyRate: (payload["hourlyRate"] as? NSNumber)?.doubleValue ?? 0,
      titleText: Money2TimeLiveActivity.text(payload, "titleText"),
      rateText: Money2TimeLiveActivity.text(payload, "rateText"),
      endsText: Money2TimeLiveActivity.text(payload, "endsText"),
      totalText: Money2TimeLiveActivity.text(payload, "totalText"),
      refreshText: Money2TimeLiveActivity.text(payload, "refreshText"),
      accentLightHex: Money2TimeLiveActivity.hex(payload, "accentLightHex", fallback: 0x1F8A6F),
      accentDarkHex: Money2TimeLiveActivity.hex(payload, "accentDarkHex", fallback: 0x34C99A))

    let state = Money2TimeEarningsAttributes.ContentState(
      earnedText: Money2TimeLiveActivity.text(payload, "earnedText"),
      earned: Money2TimeLiveActivity.number(payload, "earned"),
      asOfMillis: Date().timeIntervalSince1970 * 1000)

    Task {
      // Replace rather than stack: two "you are earning" cards on one Lock
      // Screen is never what the user asked for. The flag holds the reaper off
      // for the moment the old card and the new one both exist.
      Money2TimeLiveActivity.startingByHand = true
      defer { Money2TimeLiveActivity.startingByHand = false }
      for existing in EarningsActivity.activities {
        await existing.end(nil, dismissalPolicy: .immediate)
      }

      do {
        // '.token' rather than nil: this is what makes the card's amount able to
        // move at all. ActivityKit repaints only its time-derived views on its
        // own, and the app is suspended on the Lock Screen, so the figure is
        // pushed from the live-earnings Worker for the life of the session.
        let activity = try EarningsActivity.request(
          attributes: attributes,
          content: ActivityContent(state: state, staleDate: endsAt),
          pushType: .token)
        // Deliberately does NOT wait for a push token. 'request' returns
        // before ActivityKit has minted one, and waiting means a Start button
        // that sits disabled for however long the guess was - measured on a
        // simulator, the first token of an install does not arrive within
        // several seconds, so the wait mostly bought a stall and no token.
        //
        // 'describe' still carries the token when there already is one, which
        // is the case from the second session onwards. When there is not, the
        // very next transition out of the foreground registers it, and that is
        // the moment before the user looks at their Lock Screen anyway.
        resolve(Money2TimeLiveActivity.describe(activity))
      } catch {
        reject("live_activity_start_failed", error.localizedDescription, error)
      }
    }
  }

  /// Pushes a freshly computed amount into the running activity. ActivityKit
  /// only repaints on an update like this one, so the app calls it whenever it
  /// gets the chance - above all right before it goes to the background, which
  /// is the moment just before the user looks at the Lock Screen.
  @objc(update:resolver:rejecter:)
  func update(
    _ payload: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter _: @escaping RCTPromiseRejectBlock
  ) {
    let earnedText = Money2TimeLiveActivity.text(payload, "earnedText")
    let earned = Money2TimeLiveActivity.number(payload, "earned")

    Task {
      guard let activity = EarningsActivity.activities.first else {
        resolve(false)
        return
      }
      let state = Money2TimeEarningsAttributes.ContentState(
        earnedText: earnedText,
        earned: earned,
        asOfMillis: Date().timeIntervalSince1970 * 1000)
      await activity.update(
        ActivityContent(state: state, staleDate: activity.attributes.endsAt))
      resolve(true)
    }
  }

  @objc(end:rejecter:)
  func end(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter _: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      for activity in EarningsActivity.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      resolve(nil)
    }
  }
}
`,
      );

      writeFileIfChanged(
        path.join(appRoot, 'Money2TimeLiveActivityModule.m'),
        `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(Money2TimeLiveActivity, NSObject)

RCT_EXTERN_METHOD(getStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getCurrent:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getPushToStartToken:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(start:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(update:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(end:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
`,
      );

      writeFileIfChanged(
        path.join(iosRoot, 'README.md'),
        `# Money2Time WidgetKit Extension

This folder is generated by \`plugins/withMoney2TimeWidgets.js\`.

The Swift file contains the fixed-size free widget implementation. The Xcode
target still needs to be attached to the generated iOS project if Expo prebuild
does not create the extension target automatically in your local workflow.
`,
      );

      return cfg;
    },
  ]);
}

function getOrCreateGroup(project, name, groupPath) {
  const existingGroup = project.pbxGroupByName(name);
  if (existingGroup) {
    return project.findPBXGroupKey({ name });
  }

  const group = project.addPbxGroup([], name, groupPath);
  const mainGroupKey = project.getFirstProject().firstProject.mainGroup;
  project.hash.project.objects.PBXGroup[mainGroupKey].children.push({
    value: group.uuid,
    comment: name,
  });
  return group.uuid;
}

function updateBuildSettingsForTarget(project, targetUuid, updater) {
  const target = project.pbxNativeTargetSection()[targetUuid];
  const configurationList =
    project.hash.project.objects.XCConfigurationList[target.buildConfigurationList];

  configurationList.buildConfigurations.forEach((configurationRef) => {
    const configuration = project.hash.project.objects.XCBuildConfiguration[configurationRef.value];
    updater(configuration.buildSettings);
  });
}

function unquoteXcodeValue(value) {
  return typeof value === 'string' ? value.replace(/^"|"$/g, '') : value;
}

function findNativeTargetByName(project, name) {
  const targets = project.pbxNativeTargetSection();
  const entry = Object.entries(targets).find(([key, target]) => {
    if (key.endsWith('_comment')) return false;
    return unquoteXcodeValue(target.name) === name;
  });
  if (!entry) return null;
  return { uuid: entry[0], ...entry[1] };
}

function ensureSourceFile(project, filePath, targetUuid, groupKey) {
  const basename = path.basename(filePath);
  const existingFileReference = Object.values(project.pbxFileReferenceSection()).find(
    (entry) => entry && entry.name === `"${basename}"`,
  );
  if (existingFileReference) {
    existingFileReference.path = `"${filePath}"`;
  }

  const fileExists = Object.values(project.pbxBuildFileSection()).some(
    (entry) => entry && entry.fileRef_comment === basename,
  );
  if (fileExists) return;
  project.addSourceFile(filePath, { target: targetUuid }, groupKey);
}

function ensureResourceFile(project, filePath, targetUuid, groupKey) {
  if (!project.pbxGroupByName('Resources')) {
    getOrCreateGroup(project, 'Resources', 'Resources');
  }

  const basename = path.basename(filePath);
  const existingFileReference = Object.values(project.pbxFileReferenceSection()).find(
    (entry) => entry && entry.name === `"${basename}"`,
  );
  if (existingFileReference) {
    existingFileReference.path = `"${filePath}"`;
  }

  const fileExists = Object.values(project.pbxBuildFileSection()).some(
    (entry) => entry && entry.fileRef_comment === basename,
  );
  if (fileExists) return;
  project.addResourceFile(filePath, { target: targetUuid }, groupKey);
}

function removeProjectFileByBasename(project, basename) {
  const fileReferenceSection = project.pbxFileReferenceSection();
  const removedFileRefs = new Set();

  Object.entries(fileReferenceSection).forEach(([key, entry]) => {
    if (key.endsWith('_comment') || !entry || typeof entry !== 'object') return;
    const entryName = unquoteXcodeValue(entry.name);
    const entryPath = unquoteXcodeValue(entry.path);
    if (entryName === basename || entryPath === basename) {
      removedFileRefs.add(key);
      delete fileReferenceSection[key];
      delete fileReferenceSection[`${key}_comment`];
    }
  });

  if (removedFileRefs.size === 0) return;

  const buildFileSection = project.pbxBuildFileSection();
  const removedBuildFiles = new Set();

  Object.entries(buildFileSection).forEach(([key, entry]) => {
    if (key.endsWith('_comment') || !entry || typeof entry !== 'object') return;
    if (removedFileRefs.has(entry.fileRef) || entry.fileRef_comment === basename) {
      removedBuildFiles.add(key);
      delete buildFileSection[key];
      delete buildFileSection[`${key}_comment`];
    }
  });

  Object.values(project.hash.project.objects.PBXGroup).forEach((group) => {
    if (!group || typeof group !== 'object' || !Array.isArray(group.children)) return;
    group.children = group.children.filter(
      (child) => !removedFileRefs.has(child.value) && child.comment !== basename,
    );
  });

  ['PBXResourcesBuildPhase', 'PBXSourcesBuildPhase'].forEach((sectionName) => {
    const section = project.hash.project.objects[sectionName];
    if (!section) return;
    Object.values(section).forEach((phase) => {
      if (!phase || typeof phase !== 'object' || !Array.isArray(phase.files)) return;
      phase.files = phase.files.filter(
        (file) => !removedBuildFiles.has(file.value) && file.comment !== basename,
      );
    });
  });
}

function ensureIosWidgetXcodeTarget(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const appTarget = findNativeTargetByName(project, IOS_APP_TARGET_NAME);
    if (!appTarget) return cfg;

    const appGroupKey = getOrCreateGroup(project, IOS_APP_TARGET_NAME, IOS_APP_TARGET_NAME);
    ensureSourceFile(
      project,
      'Money2Time/Money2TimeWidgetModule.swift',
      appTarget.uuid,
      appGroupKey,
    );
    ensureSourceFile(project, 'Money2Time/Money2TimeWidgetModule.m', appTarget.uuid, appGroupKey);
    ensureSourceFile(
      project,
      'Money2Time/Money2TimeLiveActivityModule.swift',
      appTarget.uuid,
      appGroupKey,
    );
    ensureSourceFile(
      project,
      'Money2Time/Money2TimeLiveEarningsIntent.swift',
      appTarget.uuid,
      appGroupKey,
    );
    ensureSourceFile(
      project,
      'Money2Time/Money2TimeLiveActivityModule.m',
      appTarget.uuid,
      appGroupKey,
    );

    let widgetTarget = findNativeTargetByName(project, IOS_WIDGET_TARGET_NAME);
    if (!widgetTarget) {
      widgetTarget = project.addTarget(
        IOS_WIDGET_TARGET_NAME,
        'app_extension',
        IOS_WIDGET_TARGET_NAME,
        IOS_WIDGET_BUNDLE_ID,
      );
      project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', widgetTarget.uuid);
      project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', widgetTarget.uuid);
      project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', widgetTarget.uuid);
    }

    const widgetGroupKey = getOrCreateGroup(
      project,
      IOS_WIDGET_TARGET_NAME,
      IOS_WIDGET_TARGET_NAME,
    );
    ensureSourceFile(project, 'Money2TimeWidget.swift', widgetTarget.uuid, widgetGroupKey);
    ensureSourceFile(project, 'Money2TimeLiveEarnings.swift', widgetTarget.uuid, widgetGroupKey);
    removeProjectFileByBasename(project, 'money2time_widget_banner.png');
    ensureResourceFile(project, 'banner.png', widgetTarget.uuid, widgetGroupKey);
    ensureResourceFile(project, 'mascot.png', widgetTarget.uuid, widgetGroupKey);

    updateBuildSettingsForTarget(project, widgetTarget.uuid, (buildSettings) => {
      buildSettings.APPLICATION_EXTENSION_API_ONLY = 'YES';
      buildSettings.CODE_SIGN_ENTITLEMENTS = 'Money2TimeWidget/Money2TimeWidget.entitlements';
      buildSettings.CURRENT_PROJECT_VERSION = buildSettings.CURRENT_PROJECT_VERSION || '1';
      buildSettings.DEVELOPMENT_TEAM = 'A9QF26PBRS';
      buildSettings.GENERATE_INFOPLIST_FILE = 'NO';
      buildSettings.INFOPLIST_FILE = 'Money2TimeWidget/Info.plist';
      // contentMarginsDisabled() requires iOS 17; the widget extension targets
      // 17 while the host app stays on its lower minimum.
      buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '17.0';
      buildSettings.MARKETING_VERSION = config.version || buildSettings.MARKETING_VERSION || '1.0';
      buildSettings.PRODUCT_BUNDLE_IDENTIFIER = IOS_WIDGET_BUNDLE_ID;
      buildSettings.PRODUCT_NAME = IOS_WIDGET_TARGET_NAME;
      buildSettings.SKIP_INSTALL = 'YES';
      buildSettings.SWIFT_VERSION = '5.0';
      buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
    });

    project.addTargetAttribute('CreatedOnToolsVersion', '15.0', widgetTarget);
    project.addTargetAttribute('ProvisioningStyle', 'Manual', widgetTarget);
    project.addTargetAttribute(
      'SystemCapabilities',
      {
        'com.apple.ApplicationGroups.iOS': {
          enabled: 1,
        },
      },
      widgetTarget,
    );

    return cfg;
  });
}

function addIosEntitlements(config) {
  return withEntitlementsPlist(config, (cfg) => {
    const groups = cfg.modResults['com.apple.security.application-groups'] ?? [];
    if (!groups.includes(APP_GROUP)) {
      cfg.modResults['com.apple.security.application-groups'] = [...groups, APP_GROUP];
    }
    return cfg;
  });
}

function addIosInfoPlist(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.CFBundleURLTypes = cfg.modResults.CFBundleURLTypes ?? [];
    // The only thing Apple asks for before an app may run a Live Activity.
    // There is no entitlement and no review step; without this key
    // ActivityKit refuses every request at runtime.
    cfg.modResults.NSSupportsLiveActivities = true;
    // Raises the ActivityKit push delivery budget. The live-earnings Worker
    // pushes the card's amount about once a minute for the life of a session,
    // which is well past what Apple budgets for an app that does not declare
    // this; without it the pushes are simply dropped part-way through a shift
    // and the figure freezes again with nothing to say why.
    cfg.modResults.NSSupportsLiveActivitiesFrequentUpdates = true;
    return cfg;
  });
}

module.exports = function withMoney2TimeWidgets(config) {
  config = addAndroidWidgetReceiver(config);
  config = addAndroidWidgetFiles(config);
  config = addIosEntitlements(config);
  config = addIosInfoPlist(config);
  config = addIosWidgetFiles(config);
  config = ensureIosWidgetXcodeTarget(config);
  return config;
};
