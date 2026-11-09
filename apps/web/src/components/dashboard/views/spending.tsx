"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { dayRange, daysBetween } from "@/lib/backup/dates";
import type { Tx } from "@/lib/backup/model";

import { breakdown, merchants, monthlyFlows, totals, weekdayIndex, weekdayLabels, type Slice } from "../aggregate";
import { BarChart } from "../charts/bar-chart";
import { Donut } from "../charts/donut";
import { EXPENSE_COLOR, OTHER_COLOR } from "../charts/scale";
import { Legend } from "../charts/tooltip";
import { ZERO, addAmt, useDashboard, useFormat, useMonthLabels, usePeriodTxs, type Amt } from "../state";
import { Card, CategoryGlyph, Delta, Empty, Kpi, RankRow } from "../ui";
import { TxList } from "./transactions";

export function SpendingView() {
  return <BreakdownView kind="spending" />;
}

/** Spending and income share one layout; only the side of the ledger differs. */
export function BreakdownView({ kind }: { kind: "spending" | "earning" }) {
  const t = useTranslations("dashboard.breakdown");
  const tc = useTranslations("dashboard.common");
  const { model, resolved } = useDashboard();
  const f = useFormat();
  const { current, previous } = usePeriodTxs();
  const rows = useMemo(() => current.filter((tx) => tx[kind]), [current, kind]);
  const prevRows = useMemo(() => previous.filter((tx) => tx[kind]), [previous, kind]);
  const now = useMemo(() => totals(rows), [rows]);
  const before = useMemo(() => totals(prevRows), [prevRows]);
  const total = kind === "spending" ? now.spend : now.income;
  const totalBefore = kind === "spending" ? before.spend : before.income;
  const count = kind === "spending" ? now.spendCount : now.incomeCount;
  const color = kind === "spending" ? EXPENSE_COLOR : "#1E9468";

  const [chosenParent, setParentId] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const parents = useMemo(() => breakdown(rows, model, kind), [rows, model, kind]);
  // A category picked in another period may have nothing in this one.
  const parentId = parents.some((p) => p.id === chosenParent) ? chosenParent : null;
  const children = useMemo(() => (parentId ? breakdown(rows, model, kind, parentId) : []), [rows, model, kind, parentId]);
  const selected = parents.find((p) => p.id === parentId) ?? null;
  const shown = selected ? children : parents;
  const shownTotal = selected ? selected.amt : total;

  // Calendar days so far, the backup's own day included (its time of day aside).
  const lastDay = resolved.endDate.getTime() < model.today.getTime() ? resolved.endDate : model.today;
  const days = Math.max(1, daysBetween(resolved.startDate, lastDay) + 1);
  const single = resolved.months.length === 1;
  const { labels, titles } = useMonthLabels(resolved.months);

  // Stacked bars: the six biggest top-level categories, the rest as "Other".
  const stack = useMemo(() => {
    const top = parents.slice(0, 6).map((p) => p.id);
    const buckets = single
      ? dayRange(resolved.startDate, resolved.endDate)
      : resolved.months;
    const index = new Map(buckets.map((b, i) => [b, i]));
    const series = new Map<string, Amt[]>([...top, "__other"].map((id) => [id, buckets.map(() => ZERO)]));
    for (const tx of rows) {
      const i = index.get(single ? tx.dayKey : tx.month);
      if (i === undefined) continue;
      const key = top.includes(tx.parentId ?? "__none") ? (tx.parentId ?? "__none") : "__other";
      const list = series.get(key)!;
      list[i] = addAmt(list[i], { money: tx.amount, hours: tx.hours });
    }
    return { buckets, top, series };
  }, [parents, rows, resolved, single]);

  const merchantList = useMemo(() => (kind === "spending" ? merchants(rows).slice(0, 8) : []), [rows, kind]);
  const biggest = useMemo(() => [...rows].sort((a, b) => b.amount - a.amount).slice(0, 8), [rows]);
  const weekdays = useMemo(() => {
    const sums = Array.from({ length: 7 }, () => ZERO);
    for (const tx of rows) {
      const i = weekdayIndex(tx.date, model.weekStartsOn);
      sums[i] = addAmt(sums[i], { money: tx.amount, hours: tx.hours });
    }
    return sums;
  }, [rows, model.weekStartsOn]);
  const flows = useMemo(() => monthlyFlows(rows, resolved.months), [rows, resolved.months]);

  const filteredTxs = useMemo<Tx[]>(
    () => (parentId ? rows.filter((tx) => (tx.parentId ?? "__none") === parentId) : rows),
    [rows, parentId],
  );

  const sliceName = (slice: Slice) => slice.name || tc("uncategorized");
  const isSpending = kind === "spending";

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={isSpending ? "money-time/wallet-out" : "money-time/wallet-in"}
          tone={isSpending ? "expense" : "income"}
          label={isSpending ? t("totalSpent") : t("totalEarned")}
          value={f.value(total)}
          sub={f.other(total)}
          delta={<Delta current={total.money} previous={totalBefore.money} invert={isSpending} formatPercent={f.percent} label={tc("vsPrevious")} />}
        />
        <Kpi icon="money-time/calendar-clock" tone="neutral" label={t("perDay")} value={f.value({ money: total.money / days, hours: total.hours / days })} sub={t("overDays", { count: days })} />
        <Kpi icon="money-time/receipt" tone="neutral" label={t("count")} value={f.number(count)} sub={t("avgEach", { amount: f.value({ money: total.money / Math.max(1, count), hours: total.hours / Math.max(1, count) }) })} />
        <Kpi
          icon="insights/pie-chart"
          tone="neutral"
          label={t("largestCategory")}
          value={parents[0] ? sliceName(parents[0]) : "–"}
          sub={parents[0] ? `${f.value(parents[0].amt)} · ${f.percent(total.money ? parents[0].amt.money / total.money : 0)}` : undefined}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <Card
          title={selected ? sliceName(selected) : t("byCategory")}
          subtitle={selected ? t("subcategories") : t("clickToDrill")}
          action={
            selected ? (
              <button type="button" onClick={() => setParentId(null)} className="rounded-full border border-border px-3 py-1 text-[13px] font-bold text-foreground-soft hover:bg-background-subtle">
                ← {t("allCategories")}
              </button>
            ) : null
          }
        >
          {shown.length === 0 ? (
            <Empty title={t("empty")} />
          ) : (
            <div className="flex flex-col items-center gap-5 @[560px]:flex-row @[560px]:items-start">
              <Donut
                size={210}
                thickness={30}
                slices={shown.map((s, i) => ({
                  key: s.id,
                  label: sliceName(s),
                  value: f.pick(s.amt),
                  // Children share their parent's hue, so step them by lightness.
                  color: selected ? shade(selected.color, i, shown.length) : s.color,
                }))}
                activeKey={hover}
                onHover={setHover}
                format={(v) => f.plain(v)}
                percent={f.percent}
                center={
                  <>
                    <span className="tabular text-[18px] font-extrabold text-foreground">{f.value(shownTotal, { whole: true })}</span>
                    <span className="text-[12px] font-semibold text-foreground-soft">{f.other(shownTotal)}</span>
                  </>
                }
              />
              <div className="max-h-[420px] w-full min-w-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
                {shown.map((slice, i) => (
                  <RankRow
                    key={slice.id}
                    active={hover === slice.id}
                    onClick={selected ? undefined : () => setParentId(slice.id)}
                    icon={<CategoryGlyph icon={slice.icon} name={sliceName(slice)} color={slice.color} size={28} />}
                    name={sliceName(slice)}
                    meta={`${f.percent(shownTotal.money ? slice.amt.money / shownTotal.money : 0)} · ${tc("transactions", { count: slice.count })}`}
                    value={f.value(slice.amt)}
                    other={f.other(slice.amt)}
                    share={shownTotal.money ? slice.amt.money / shownTotal.money : 0}
                    color={selected ? shade(selected.color, i, shown.length) : slice.color}
                  />
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card
          title={single ? t("byDay") : t("byMonth")}
          action={
            <Legend
              items={[
                ...stack.top.map((id) => {
                  const category = model.categories.get(id);
                  return { label: category?.name ?? tc("uncategorized"), color: category?.color ?? OTHER_COLOR };
                }),
                ...(parents.length > 6 ? [{ label: tc("other"), color: OTHER_COLOR }] : []),
              ]}
              className="max-w-[520px] justify-end"
            />
          }
        >
          <BarChart
            stacked
            height={single ? 300 : 320}
            labels={single ? stack.buckets.map((d) => String(Number(d.slice(8)))) : labels}
            titles={single ? stack.buckets.map((d) => f.day(d, "long")) : titles}
            series={[...stack.top, ...(parents.length > 6 ? ["__other"] : [])].map((id) => {
              const category = model.categories.get(id);
              return {
                key: id,
                label: id === "__other" ? tc("other") : (category?.name ?? tc("uncategorized")),
                color: id === "__other" ? OTHER_COLOR : (category?.color ?? OTHER_COLOR),
                values: stack.series.get(id)!.map((a) => f.pick(a)),
              };
            })}
            format={(v) => f.plain(v)}
            formatAxis={f.axis}
          />
          {!single ? (
            <p className="mt-3 text-[13px] text-foreground-soft">
              {t("monthlyAverage", {
                amount: f.value({
                  money: total.money / Math.max(1, flows.filter((m) => m.month <= model.currentMonth).length),
                  hours: total.hours / Math.max(1, flows.filter((m) => m.month <= model.currentMonth).length),
                }),
              })}
            </p>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {isSpending ? (
          <Card title={t("topMerchants")} subtitle={t("topMerchantsNote")}>
            {merchantList.length === 0 ? (
              <Empty title={t("empty")} />
            ) : (
              <div className="space-y-0.5">
                {merchantList.map((m) => {
                  const category = m.parentId ? model.categories.get(m.parentId) : null;
                  return (
                    <RankRow
                      key={m.name}
                      icon={<CategoryGlyph icon={category?.icon} name={m.name} color={category?.color} size={28} />}
                      name={m.name}
                      meta={tc("transactions", { count: m.count })}
                      value={f.value(m.amt)}
                      other={f.other(m.amt)}
                    />
                  );
                })}
              </div>
            )}
          </Card>
        ) : null}

        <Card title={isSpending ? t("biggestPurchases") : t("biggestPayments")}>
          {biggest.length === 0 ? (
            <Empty title={t("empty")} />
          ) : (
            <div className="space-y-0.5">
              {biggest.map((tx) => {
                const category = tx.categoryId ? model.categories.get(tx.categoryId) : null;
                return (
                  <RankRow
                    key={tx.id}
                    icon={<CategoryGlyph icon={category?.icon} name={category?.name ?? tx.note} color={category?.color} size={28} />}
                    name={tx.note || category?.name || tc("uncategorized")}
                    meta={`${f.date(tx.date)} · ${category?.name ?? tc("uncategorized")}`}
                    value={f.value({ money: tx.amount, hours: tx.hours })}
                    other={f.other({ money: tx.amount, hours: tx.hours })}
                  />
                );
              })}
            </div>
          )}
        </Card>

        <Card title={t("byWeekday")} subtitle={t("byWeekdayNote")}>
          <BarChart
            height={240}
            labels={weekdayLabels(f.locale, model.weekStartsOn)}
            series={[{ key: "w", label: isSpending ? tc("spending") : tc("income"), color, values: weekdays.map((w) => f.pick(w)) }]}
            format={(v) => f.plain(v)}
            formatAxis={f.axis}
          />
        </Card>
      </div>

      <Card title={selected ? t("transactionsIn", { name: sliceName(selected) }) : t("allTransactions")}>
        <TxList txs={filteredTxs} pageSize={25} />
      </Card>
    </div>
  );
}

/** Lightness steps of one hue for the children of a category. */
function shade(hex: string, index: number, count: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const t = count <= 1 ? 0 : (index / (count - 1)) * 0.6;
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
