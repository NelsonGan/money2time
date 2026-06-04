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
const IOS_APP_TARGET_NAME = 'Money2Time';
const IOS_WIDGET_TARGET_NAME = 'Money2TimeWidget';
const IOS_WIDGET_BUNDLE_ID = 'com.nelsongan.money2time.Money2TimeWidget';
const BANNER_ASSET = 'assets/banner.png';
const MASCOT_ASSET = 'assets/mascots/rich.png';

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

  return JSON.stringify({
    schemaVersion: 1,
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
    proUnlockUrlByWidgetId: {
      weekly_expense: 'money2time://pro?source=widget_weekly_expense',
      calendar_month: 'money2time://pro?source=widget_calendar_month',
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
    name: '.widgets.Money2TimeWeeklyExpenseWidgetProvider',
    resource: '@xml/money2time_weekly_expense_widget',
  },
  {
    name: '.widgets.Money2TimeCalendarWidgetProvider',
    resource: '@xml/money2time_calendar_widget',
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

      const calRows = Array.from(
        { length: 6 },
        (_, r) =>
          `      <LinearLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" android:orientation="horizontal">\n${Array.from(
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
        views.setOnClickPendingIntent(R.id.weekly_root, linkIntent(context, "money2time://open", 302));
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
      views.setOnClickPendingIntent(R.id.calendar_root, linkIntent(context, "money2time://open", 402));

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
    Money2TimeWeeklyExpenseWidgetProvider.updateAll(context);
    Money2TimeCalendarWidgetProvider.updateAll(context);
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
  android:minHeight="110dp"
  android:targetCellWidth="4"
  android:targetCellHeight="2"
  android:updatePeriodMillis="0"
  android:initialLayout="@layout/money2time_monthly_expense_widget"
  android:previewLayout="@layout/money2time_monthly_expense_widget"
  android:resizeMode="none"
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
  android:resizeMode="none"
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
  android:resizeMode="none"
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
  android:gravity="center_vertical"
  android:orientation="horizontal"
  android:padding="16dp">

  <LinearLayout
    android:layout_width="0dp"
    android:layout_height="wrap_content"
    android:layout_weight="1"
    android:orientation="vertical">

    <ImageView
      android:layout_width="116dp"
      android:layout_height="30dp"
      android:adjustViewBounds="true"
      android:contentDescription="Money2Time"
      android:scaleType="fitStart"
      android:src="@drawable/banner" />

    <TextView
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="14dp"
      android:letterSpacing="0.12"
      android:text="THIS MONTH"
      android:textColor="#94A39F"
      android:textSize="10sp"
      android:textStyle="bold" />

    <TextView
      android:id="@+id/money2time_widget_amount"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="3dp"
      android:maxLines="1"
      android:text="$1,284"
      android:textColor="#D45F57"
      android:textSize="28sp"
      android:textStyle="bold" />

    <TextView
      android:id="@+id/money2time_widget_time"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="4dp"
      android:maxLines="1"
      android:text="85h 36m of work"
      android:textColor="#6B7A77"
      android:textSize="12sp"
      android:textStyle="bold" />

    <TextView
      android:id="@+id/money2time_widget_locked"
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:text="Unlock Pro"
      android:textColor="#1F8A6F"
      android:textStyle="bold"
      android:visibility="gone" />
  </LinearLayout>

  <LinearLayout
    android:layout_width="120dp"
    android:layout_height="wrap_content"
    android:layout_marginStart="12dp"
    android:gravity="center"
    android:orientation="vertical">

    <LinearLayout
      android:id="@+id/money2time_widget_income"
      android:layout_width="match_parent"
      android:layout_height="44dp"
      android:background="@drawable/money2time_widget_income_button"
      android:gravity="center_vertical"
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
        android:textSize="13sp"
        android:textStyle="bold" />
    </LinearLayout>

    <LinearLayout
      android:id="@+id/money2time_widget_expense"
      android:layout_width="match_parent"
      android:layout_height="44dp"
      android:layout_marginTop="10dp"
      android:background="@drawable/money2time_widget_expense_button"
      android:gravity="center_vertical"
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
        android:textSize="13sp"
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

private struct WidgetSnapshot: Decodable {
  let isPro: Bool
  let monthlyExpenseQuickLog: MonthlySpendData
  let weeklyExpense: WeeklyExpenseData
  let calendarMonth: CalendarMonthData
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

  var body: some View {
    let mascotSize: CGFloat = compact ? 58 : 104
    Link(destination: URL(string: url) ?? URL(string: "money2time://pro")!) {
      VStack(spacing: 0) {
        Spacer(minLength: 0)
        if compact {
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
      .padding(compact ? 14 : 18)
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
    HStack(spacing: 6) {
      Image(systemName: "sparkles")
        .font(.system(size: compact ? 12 : 14, weight: .bold))
      Text("Unlock Pro")
        .font(.system(size: compact ? 14 : 15, weight: .heavy, design: .rounded))
    }
    .foregroundStyle(.white)
    .frame(maxWidth: .infinity)
    .frame(height: compact ? 38 : 44)
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
        let cellHeight = max(28, (geo.size.height - CGFloat(rows - 1) * 4) / CGFloat(rows))
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

@main
struct Money2TimeWidgetBundle: WidgetBundle {
  var body: some Widget {
    Money2TimeMonthlyWidget()
    Money2TimeWeeklyWidget()
    Money2TimeCalendarWidget()
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
        path.join(appRoot, 'Money2TimeWidgetModule.m'),
        `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(Money2TimeWidget, NSObject)

RCT_EXTERN_METHOD(writeSnapshot:(NSString *)json
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(reloadAll:(RCTPromiseResolveBlock)resolve
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
