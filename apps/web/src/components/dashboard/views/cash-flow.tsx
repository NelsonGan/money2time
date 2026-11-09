"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { dayKeyOf } from "@/lib/backup/dates";

import { breakdown, dailyFlows, monthlyFlows, totals } from "../aggregate";
import { BarChart } from "../charts/bar-chart";
import { LineChart } from "../charts/line-chart";
import { Sankey } from "../charts/sankey";
import { EXPENSE_COLOR, INCOME_COLOR, NET_COLOR, OTHER_COLOR } from "../charts/scale";
import { Legend } from "../charts/tooltip";
import { useDashboard, useFormat, useMonthLabels, usePeriodTxs } from "../state";
import { Card, Delta, Empty, Kpi } from "../ui";

export function CashFlowView() {
  const t = useTranslations("dashboard.cashFlow");
  const tc = useTranslations("dashboard.common");
  const { model, resolved } = useDashboard();
  const f = useFormat();
  const { current, previous } = usePeriodTxs();
  const now = useMemo(() => totals(current), [current]);
  const before = useMemo(() => totals(previous), [previous]);

  const single = resolved.months.length === 1;
  const flows = useMemo(() => monthlyFlows(current, resolved.months), [current, resolved.months]);
  const days = useMemo(
    () => (single ? dailyFlows(current, resolved.startDate, resolved.endDate) : []),
    [current, resolved, single],
  );
  const { labels, titles } = useMonthLabels(resolved.months);

  const elapsedMonths = flows.filter((m) => m.month <= model.currentMonth).length || 1;
  // Days of the month so far, as the Calendar counts them: the rest have not happened.
  const pastDays = Math.max(1, days.filter((d) => d.day <= dayKeyOf(model.today)).length);
  const avgNet = { money: now.net.money / elapsedMonths, hours: now.net.hours / elapsedMonths };

  const income = useMemo(() => breakdown(current, model, "earning"), [current, model]);
  const spend = useMemo(() => breakdown(current, model, "spending"), [current, model]);

  const sankey = useMemo(() => {
    const top = (slices: typeof spend, limit: number) => {
      const head = slices.slice(0, limit);
      const rest = slices.slice(limit);
      const restSum = rest.reduce((s, x) => s + f.pick(x.amt), 0);
      const nodes = head.map((s) => ({ key: s.id, label: s.name || tc("uncategorized"), value: f.pick(s.amt), color: s.color }));
      if (restSum > 0) nodes.push({ key: "__rest", label: tc("other"), value: restSum, color: OTHER_COLOR });
      return nodes;
    };
    const sources = top(income, 5);
    const targets = top(spend, 7);
    const inSum = sources.reduce((s, n) => s + n.value, 0);
    const outSum = targets.reduce((s, n) => s + n.value, 0);
    if (inSum > outSum) targets.push({ key: "__saved", label: tc("saved"), value: inSum - outSum, color: INCOME_COLOR });
    else if (outSum > inSum) sources.push({ key: "__savings", label: t("fromSavings"), value: outSum - inSum, color: "#94A39F" });
    return { sources, targets };
  }, [income, spend, f, t, tc]);

  const savingsSeries = flows.map((m) => (m.income.money > 0 ? Math.max(-1, m.net.money / m.income.money) * 100 : null));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon="money-time/wallet-in" tone="income" label={tc("income")} value={f.value(now.income)} sub={f.other(now.income)} delta={<Delta current={now.income.money} previous={before.income.money} formatPercent={f.percent} label={tc("vsPrevious")} />} />
        <Kpi icon="money-time/wallet-out" tone="expense" label={tc("spending")} value={f.value(now.spend)} sub={f.other(now.spend)} delta={<Delta current={now.spend.money} previous={before.spend.money} invert formatPercent={f.percent} label={tc("vsPrevious")} />} />
        <Kpi icon="money-time/balance-scale" tone="neutral" label={tc("net")} value={f.value(now.net, { signed: true })} sub={now.savingsRate !== null ? t("savingsRate", { rate: f.percent(now.savingsRate) }) : t("noIncome")} />
        <Kpi icon="insights/revenue-growth" tone="neutral" label={single ? t("netPerDay") : t("avgNet")} value={single ? f.value({ money: now.net.money / pastDays, hours: now.net.hours / pastDays }, { signed: true }) : f.value(avgNet, { signed: true })} sub={single ? t("daysCount", { count: pastDays }) : t("monthsCount", { count: elapsedMonths })} />
      </div>

      <Card
        title={single ? t("dailyTitle") : t("monthlyTitle")}
        action={
          <Legend
            items={[
              { label: tc("income"), color: INCOME_COLOR },
              { label: tc("spending"), color: EXPENSE_COLOR },
              ...(single ? [] : [{ label: tc("net"), color: NET_COLOR, line: true }]),
            ]}
          />
        }
      >
        {single ? (
          <BarChart
            height={280}
            labels={days.map((d) => String(Number(d.day.slice(8))))}
            titles={days.map((d) => f.day(d.day, "long"))}
            series={[
              { key: "income", label: tc("income"), color: INCOME_COLOR, values: days.map((d) => f.pick(d.income)) },
              { key: "spend", label: tc("spending"), color: EXPENSE_COLOR, values: days.map((d) => f.pick(d.spend)) },
            ]}
            format={(v) => f.plain(v)}
            formatAxis={f.axis}
          />
        ) : (
          <BarChart
            height={300}
            labels={labels}
            titles={titles}
            series={[
              { key: "income", label: tc("income"), color: INCOME_COLOR, values: flows.map((m) => f.pick(m.income)) },
              { key: "spend", label: tc("spending"), color: EXPENSE_COLOR, values: flows.map((m) => f.pick(m.spend)) },
            ]}
            line={{ label: tc("net"), color: NET_COLOR, values: flows.map((m) => f.pick(m.net)) }}
            format={(v) => f.plain(v)}
            formatAxis={f.axis}
          />
        )}
      </Card>

      <Card title={t("sankeyTitle")} subtitle={t("sankeySubtitle")}>
        {sankey.sources.length === 0 && sankey.targets.length === 0 ? (
          <Empty title={t("empty")} />
        ) : (
          <Sankey sources={sankey.sources} targets={sankey.targets} centerLabel={t("sankeyTitle")} format={(v) => f.plain(v)} percent={f.percent} height={Math.max(340, Math.max(sankey.sources.length, sankey.targets.length) * 48)} />
        )}
      </Card>

      {!single ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <Card title={t("savingsRateTitle")} subtitle={t("savingsRateSubtitle")}>
            <LineChart
              labels={labels}
              titles={titles}
              series={[{ key: "rate", label: t("savingsRateTitle"), color: NET_COLOR, values: savingsSeries, area: true }]}
              format={(v) => f.percent(v / 100)}
              formatAxis={(v) => f.percent(Math.round(v) / 100)}
              height={240}
            />
          </Card>
          <Card title={t("tableTitle")}>
            <div className="max-h-[360px] overflow-auto">
              <table className="tabular w-full min-w-[480px] text-[13.5px]">
                <thead className="sticky top-0 bg-card text-left text-[12px] font-bold uppercase tracking-[0.06em] text-foreground-muted">
                  <tr>
                    <th className="py-2 pr-3 font-bold">{t("month")}</th>
                    <th className="py-2 pr-3 text-right font-bold">{tc("income")}</th>
                    <th className="py-2 pr-3 text-right font-bold">{tc("spending")}</th>
                    <th className="py-2 pr-3 text-right font-bold">{tc("net")}</th>
                    <th className="py-2 text-right font-bold">{t("rate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...flows].reverse().map((m) => (
                    <tr key={m.month} className="border-t border-border/70">
                      <td className="py-2 pr-3 font-semibold text-foreground">{f.monthLong(m.month)}</td>
                      <td className="py-2 pr-3 text-right text-foreground">{f.value(m.income)}</td>
                      <td className="py-2 pr-3 text-right text-foreground">{f.value(m.spend)}</td>
                      <td className={`py-2 pr-3 text-right font-bold ${m.net.money >= 0 ? "text-success" : "text-error"}`}>{f.value(m.net, { signed: true })}</td>
                      <td className="py-2 text-right text-foreground-soft">{m.income.money > 0 ? f.percent(m.net.money / m.income.money) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border font-bold">
                  <tr>
                    <td className="py-2 pr-3 text-foreground">{tc("average")}</td>
                    <td className="py-2 pr-3 text-right">{f.value({ money: now.income.money / elapsedMonths, hours: now.income.hours / elapsedMonths })}</td>
                    <td className="py-2 pr-3 text-right">{f.value({ money: now.spend.money / elapsedMonths, hours: now.spend.hours / elapsedMonths })}</td>
                    <td className="py-2 pr-3 text-right">{f.value(avgNet, { signed: true })}</td>
                    <td className="py-2 text-right">{now.savingsRate !== null ? f.percent(now.savingsRate) : "–"}</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 text-foreground">{tc("total")}</td>
                    <td className="py-2 pr-3 text-right">{f.value(now.income)}</td>
                    <td className="py-2 pr-3 text-right">{f.value(now.spend)}</td>
                    <td className="py-2 pr-3 text-right">{f.value(now.net, { signed: true })}</td>
                    <td className="py-2 text-right" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
