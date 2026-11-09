"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { dayKeyOf, dayRange, financialMonthRange, monthRange, shiftMonthKey } from "@/lib/backup/dates";

import { breakdown, monthlyFlows, totals, upcomingRules, workedHours } from "../aggregate";
import { BarChart } from "../charts/bar-chart";
import { Donut } from "../charts/donut";
import { LineChart } from "../charts/line-chart";
import { EXPENSE_COLOR, INCOME_COLOR, NET_COLOR, OTHER_COLOR } from "../charts/scale";
import { Legend } from "../charts/tooltip";
import { useDashboard, useFormat, useMonthLabels, usePeriodTxs, hoursAt } from "../state";
import { AccountLogo, Card, CategoryGlyph, ClayImg, Delta, Empty, Kpi, RankRow, SubscriptionLogo, useAccountTypeLabel } from "../ui";

export function OverviewView() {
  const t = useTranslations("dashboard.overview");
  const tc = useTranslations("dashboard.common");
  const accountType = useAccountTypeLabel();
  const { model, resolved, navigate, mode } = useDashboard();
  const f = useFormat();
  const { current, previous } = usePeriodTxs();

  const now = useMemo(() => totals(current), [current]);
  const before = useMemo(() => totals(previous), [previous]);
  const netWorth = model.accounts.filter((a) => a.includeInTotals).reduce((sum, a) => sum + a.netBase, 0);
  const netWorthHours = hoursAt(model, netWorth);

  // Cash flow always shows the twelve months up to the end of the period.
  const flowMonths = useMemo(() => monthRange(shiftMonthKey(resolved.focus, -11), resolved.focus), [resolved.focus]);
  const flows = useMemo(() => monthlyFlows(model.txs, flowMonths), [model.txs, flowMonths]);
  const { labels, titles } = useMonthLabels(flowMonths);

  const allSlices = useMemo(() => breakdown(current, model, "spending"), [current, model]);
  const slices = allSlices.slice(0, 6);
  // The donut is whole: the rest of the spending is one "Other" slice, so the
  // shares on hover add up with the list's.
  const otherSpend = allSlices.slice(6).reduce((sum, slice) => sum + f.pick(slice.amt), 0);
  const totalSpend = now.spend;
  const [activeSlice, setActiveSlice] = useState<string | null>(null);

  const biggest = useMemo(
    () => current.filter((tx) => tx.spending).sort((a, b) => b.amount - a.amount).slice(0, 5),
    [current],
  );

  const upcoming = useMemo(() => upcomingRules(model, 5), [model]);

  // Months that have happened only, as the Time page counts them.
  const worked = resolved.months.filter((month) => month <= model.currentMonth).reduce((sum, month) => sum + workedHours(model, month), 0);
  const workShare = worked > 0 ? now.spend.hours / worked : null;

  return (
    <div className="space-y-5">
      <BackupStrip />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon="insights/wallet-cash"
          tone="expense"
          label={t("spent")}
          value={f.value(now.spend)}
          sub={<OtherUnit text={f.other(now.spend)} mode={mode} />}
          delta={<Delta current={now.spend.money} previous={before.spend.money} invert formatPercent={f.percent} label={tc("vsPrevious")} />}
        />
        <Kpi
          icon="insights/money-bags"
          tone="income"
          label={t("earned")}
          value={f.value(now.income)}
          sub={<OtherUnit text={f.other(now.income)} mode={mode} />}
          delta={<Delta current={now.income.money} previous={before.income.money} formatPercent={f.percent} label={tc("vsPrevious")} />}
        />
        <Kpi
          icon="insights/piggy-bank-coins"
          tone="neutral"
          label={now.net.money >= 0 ? t("saved") : t("overspent")}
          value={f.value({ money: Math.abs(now.net.money), hours: Math.abs(now.net.hours) })}
          sub={now.savingsRate !== null ? t("savingsRate", { rate: f.percent(now.savingsRate) }) : t("noIncome")}
          delta={<Delta current={now.net.money} previous={before.net.money} formatPercent={f.percent} label={tc("vsPrevious")} />}
        />
        <Kpi
          icon="insights/growth-analysis"
          tone="neutral"
          label={t("netWorth")}
          value={f.value({ money: netWorth, hours: netWorthHours })}
          sub={t("netWorthNote", { count: model.accounts.filter((a) => a.includeInTotals).length })}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card
          title={t("cashFlowTitle")}
          subtitle={t("cashFlowSubtitle")}
          action={
            <Legend
              items={[
                { label: tc("income"), color: INCOME_COLOR },
                { label: tc("spending"), color: EXPENSE_COLOR },
                { label: tc("net"), color: NET_COLOR, line: true },
              ]}
            />
          }
        >
          <BarChart
            labels={labels}
            titles={titles}
            series={[
              { key: "income", label: tc("income"), color: INCOME_COLOR, values: flows.map((m) => f.pick(m.income)) },
              { key: "spend", label: tc("spending"), color: EXPENSE_COLOR, values: flows.map((m) => f.pick(m.spend)) },
            ]}
            line={{ label: tc("net"), color: NET_COLOR, values: flows.map((m) => f.pick(m.net)) }}
            format={(v) => f.plain(v)}
            formatAxis={f.axis}
            activeIndex={flowMonths.indexOf(resolved.focus)}
            onSelect={() => navigate("cash-flow")}
          />
        </Card>
        <PaceCard />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        <Card title={t("topCategories")} action={<ViewAll onClick={() => navigate("spending")} />}>
          {slices.length === 0 ? (
            <Empty title={t("noSpending")} />
          ) : (
            <div className="flex flex-col items-center gap-5 @[480px]:flex-row @[480px]:items-start">
              <Donut
                size={176}
                thickness={26}
                slices={[
                  ...slices.map((s) => ({ key: s.id, label: s.name || tc("uncategorized"), value: f.pick(s.amt), color: s.color })),
                  ...(otherSpend > 0 ? [{ key: "__other", label: tc("other"), value: otherSpend, color: OTHER_COLOR }] : []),
                ]}
                percent={f.percent}
                activeKey={activeSlice}
                onHover={setActiveSlice}
                format={(v) => f.plain(v)}
                center={
                  <>
                    <span className="tabular text-[17px] font-extrabold text-foreground">{f.value(totalSpend, { whole: true })}</span>
                    <span className="text-[12px] font-semibold text-foreground-soft">{f.other(totalSpend)}</span>
                  </>
                }
              />
              <div className="w-full min-w-0 flex-1 space-y-0.5">
                {slices.map((slice) => (
                  <RankRow
                    key={slice.id}
                    active={activeSlice === slice.id}
                    icon={<CategoryGlyph icon={slice.icon} name={slice.name || "?"} color={slice.color} size={26} />}
                    name={slice.name || tc("uncategorized")}
                    value={f.value(slice.amt)}
                    meta={f.percent(totalSpend.money ? slice.amt.money / totalSpend.money : 0)}
                    other={f.other(slice.amt)}
                  />
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card title={t("biggestExpenses")} action={<ViewAll onClick={() => navigate("transactions")} />}>
          {biggest.length === 0 ? (
            <Empty title={t("noSpending")} />
          ) : (
            <div className="space-y-0.5">
              {biggest.map((tx) => {
                const category = tx.categoryId ? model.categories.get(tx.categoryId) : null;
                return (
                  <RankRow
                    key={tx.id}
                    icon={<CategoryGlyph icon={category?.icon} name={category?.name ?? tx.note} color={category?.color} size={30} />}
                    name={tx.note || category?.name || tc("uncategorized")}
                    meta={`${f.date(tx.date, "short")} · ${category?.name ?? tc("uncategorized")}`}
                    value={f.value({ money: tx.amount, hours: tx.hours })}
                    other={f.other({ money: tx.amount, hours: tx.hours })}
                  />
                );
              })}
            </div>
          )}
        </Card>

        <Card title={t("upcoming")} action={<ViewAll onClick={() => navigate("recurring")} />}>
          {upcoming.length === 0 ? (
            <Empty title={t("noRecurring")} />
          ) : (
            <div className="space-y-0.5">
              {upcoming.map((rule) => {
                const category = rule.categoryId ? model.categories.get(rule.categoryId) : null;
                const hours = hoursAt(model, rule.amountBase);
                return (
                  <RankRow
                    key={rule.id}
                    icon={<SubscriptionLogo logoId={rule.logoId} name={rule.name} size={32} fallbackIcon={category?.icon} />}
                    name={rule.name}
                    meta={t("nextOn", { date: f.date(rule.nextRun!, "medium") })}
                    value={f.value({ money: rule.amountBase, hours })}
                    other={f.other({ money: rule.amountBase, hours })}
                  />
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t("timeTitle")} icon="money-time/hourglass" action={<ViewAll onClick={() => navigate("time")} />}>
          <p className="text-[15px] leading-relaxed text-foreground-soft">
            {t.rich("timeBody", {
              hours: f.hours(now.spend.hours),
              strong: (chunks) => <strong className="font-extrabold text-foreground">{chunks}</strong>,
            })}
          </p>
          {workShare !== null ? (
            <div className="mt-4">
              <div className="flex items-baseline justify-between text-[13px] font-semibold text-foreground-soft">
                <span>{t("workShare")}</span>
                <span className="tabular text-[15px] font-extrabold text-foreground">{f.percent(workShare)}</span>
              </div>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, workShare * 100)}%` }} />
              </div>
              <p className="mt-2 text-[12.5px] text-foreground-muted">{t("workShareNote", { worked: f.hours(worked) })}</p>
            </div>
          ) : (
            <p className="mt-3 text-[13px] text-foreground-muted">{t("noWage")}</p>
          )}
        </Card>

        <Card title={t("accountsTitle")} icon="settings/accounts" action={<ViewAll onClick={() => navigate("accounts")} />}>
          <div className="space-y-0.5">
            {model.accounts
              .filter((a) => a.includeInTotals)
              .sort((a, b) => Math.abs(b.netBase) - Math.abs(a.netBase))
              .slice(0, 5)
              .map((account) => (
                <RankRow
                  key={account.id}
                  icon={<AccountLogo logoId={account.logoId} name={account.name} size={30} />}
                  name={account.name}
                  meta={account.group || accountType(account.type)}
                  // No rate to the main currency: the balance in its own, as the Accounts page shows it.
                  value={account.balanceBase === null ? f.foreign(account.liability ? -account.balance : account.balance, account.currency) : f.money(account.netBase)}
                />
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function OtherUnit({ text, mode }: { text: string; mode: "money" | "hours" }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ClayImg name={mode === "money" ? "ui/clock" : "money-time/coin"} size={16} />
      {text}
    </span>
  );
}

function ViewAll({ onClick }: { onClick: () => void }) {
  const t = useTranslations("dashboard.common");
  return (
    <button type="button" onClick={onClick} className="text-[13px] font-bold text-primary hover:text-primary-dark">
      {t("viewAll")}
    </button>
  );
}

/** What this copy is, and that the phone is where changes happen. */
function BackupStrip() {
  const t = useTranslations("dashboard.cloud");
  const { link } = useDashboard();
  const f = useFormat();
  return (
    <div className="flex items-start gap-3 rounded-[18px] border border-success/30 bg-success-soft/60 px-4 py-3 text-[13.5px] text-[#14583F]">
      <ClayImg name="status/info" size={22} className="mt-px" />
      <p className="leading-relaxed">
        {t("strip", { date: f.instant(link.dataAt, "long"), device: link.sourceDevice || link.phoneName || t("yourPhone") })}
      </p>
    </div>
  );
}

/**
 * Month-to-date spending, day by day, against the month before: the pace line
 * Copilot made popular. Always the last month of the period.
 */
function PaceCard() {
  const t = useTranslations("dashboard.overview");
  const { model, resolved } = useDashboard();
  const f = useFormat();
  const month = resolved.focus;
  const prev = shiftMonthKey(month, -1);

  const data = useMemo(() => {
    const series = (key: string) => {
      const { start, end } = financialMonthRange(key, model.cycle);
      const days = dayRange(start, end);
      const daily = new Map(days.map((d) => [d, { money: 0, hours: 0 }]));
      for (const tx of model.txs) {
        if (!tx.spending || tx.month !== key) continue;
        const entry = daily.get(tx.dayKey);
        if (entry) {
          entry.money += tx.amount;
          entry.hours += tx.hours;
        }
      }
      let money = 0;
      let hours = 0;
      return days.map((d) => {
        money += daily.get(d)!.money;
        hours += daily.get(d)!.hours;
        return { day: d, money, hours };
      });
    };
    return { current: series(month), previous: series(prev) };
  }, [model, month, prev]);

  const todayKey = dayKeyOf(model.today);
  const length = Math.max(data.current.length, data.previous.length);
  const labels = Array.from({ length }, (_, i) => String(i + 1));
  const currentValues = data.current.map((d) => (d.day > todayKey ? null : f.pick(d)));
  const lastIndex = currentValues.reduce<number>((last, v, i) => (v !== null ? i : last), -1);
  const prevAtSameDay = lastIndex >= 0 ? data.previous[Math.min(lastIndex, data.previous.length - 1)] : null;
  const nowValue = lastIndex >= 0 ? data.current[lastIndex] : null;

  return (
    <Card
      title={t("paceTitle")}
      subtitle={f.monthLong(month)}
      action={
        <Legend
          items={[
            { label: t("thisMonth"), color: EXPENSE_COLOR, line: true },
            { label: t("lastMonth"), color: "#C9A2A8", dashed: true },
          ]}
        />
      }
    >
      <LineChart
        labels={labels}
        titles={labels.map((d) => t("dayN", { day: d }))}
        series={[
          { key: "prev", label: f.monthLong(prev), color: "#C9A2A8", dashed: true, values: data.previous.map((d) => f.pick(d)) },
          { key: "now", label: f.monthLong(month), color: EXPENSE_COLOR, area: true, values: currentValues },
        ]}
        format={(v) => f.plain(v)}
        formatAxis={f.axis}
        height={232}
      />
      {nowValue && prevAtSameDay ? (
        <p className="mt-3 text-[13px] text-foreground-soft">
          {nowValue.money <= prevAtSameDay.money
            ? t("paceBehind", { amount: f.plain(f.pick({ money: prevAtSameDay.money - nowValue.money, hours: prevAtSameDay.hours - nowValue.hours })) })
            : t("paceAhead", { amount: f.plain(f.pick({ money: nowValue.money - prevAtSameDay.money, hours: nowValue.hours - prevAtSameDay.hours })) })}
        </p>
      ) : null}
    </Card>
  );
}
