"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { dayKeyOf, financialMonthKey, financialMonthRange, parseLocalDate, shiftMonthKey } from "@/lib/backup/dates";

import { dailyFlows, weekdayIndex, weekdayLabels } from "../aggregate";
import { CalendarHeatmap, heatColor } from "../charts/calendar-heatmap";
import { useDashboard, useFormat } from "../state";
import { Card, Kpi } from "../ui";
import { withPaybackRows } from "@/lib/backup/paybacks";

import { TxList } from "./transactions";

export function CalendarView() {
  const t = useTranslations("dashboard.calendar");
  const { model, resolved } = useDashboard();
  const f = useFormat();
  // A day picked on the year's heatmap shows its own month here, until the
  // period moves; the heatmap itself stays on the period's year.
  const [picked, setPicked] = useState<{ base: string; month: string } | null>(null);
  const month = picked && picked.base === resolved.focus ? picked.month : resolved.focus;
  const { start, end } = useMemo(() => financialMonthRange(month, model.cycle), [month, model.cycle]);
  const todayKey = dayKeyOf(model.today);

  const days = useMemo(() => dailyFlows(model.txs, start, end), [model.txs, start, end]);
  const [selected, setSelected] = useState<string | null>(null);
  // A day picked in another month is not one of this month's.
  const selectedDay = selected && days.some((d) => d.day === selected) ? selected : null;

  const yearEnd = useMemo(() => financialMonthRange(resolved.focus, model.cycle).end, [resolved.focus, model.cycle]);
  const yearStart = useMemo(() => financialMonthRange(shiftMonthKey(resolved.focus, -11), model.cycle).start, [resolved.focus, model.cycle]);
  const year = useMemo(() => dailyFlows(model.txs, yearStart, yearEnd), [model.txs, yearStart, yearEnd]);
  const pickDay = (key: string) => {
    const date = parseLocalDate(key);
    const dayMonth = date ? financialMonthKey(date, model.cycle) : month;
    setPicked(dayMonth === resolved.focus ? null : { base: resolved.focus, month: dayMonth });
    setSelected(key);
  };

  const past = days.filter((d) => d.day <= todayKey);
  const noSpend = past.filter((d) => d.spend.money === 0).length;
  const busiest = [...days].sort((a, b) => b.spend.money - a.spend.money)[0];
  const spendTotal = past.reduce((s, d) => ({ money: s.money + d.spend.money, hours: s.hours + d.spend.hours }), { money: 0, hours: 0 });
  const perDay = { money: spendTotal.money / Math.max(1, past.length), hours: spendTotal.hours / Math.max(1, past.length) };

  // Longest run of days with no spending, over the heatmap's year.
  let streak = 0;
  let best = 0;
  for (const d of year) {
    if (d.day > todayKey) break;
    streak = d.spend.money === 0 ? streak + 1 : 0;
    best = Math.max(best, streak);
  }

  const max = Math.max(...days.map((d) => d.spend.money), 1);
  const offset = weekdayIndex(start, model.weekStartsOn);
  const labels = weekdayLabels(f.locale, model.weekStartsOn);
  // The lists also show paybacks into a bill's own account, as the app's calendar does.
  const dayTxs = useMemo(
    () =>
      selectedDay
        ? withPaybackRows(
            model.txs.filter((tx) => tx.dayKey === selectedDay),
            model.paybackRows.filter((tx) => tx.dayKey === selectedDay),
          )
        : [],
    [model.txs, model.paybackRows, selectedDay],
  );
  const monthTxs = useMemo(
    () =>
      withPaybackRows(
        model.txs.filter((tx) => tx.month === month),
        model.paybackRows.filter((tx) => tx.month === month),
      ).slice(0, 12),
    [model.txs, model.paybackRows, month],
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon="money-time/calendar-clock" tone="expense" label={t("perDay")} value={f.value(perDay)} sub={f.other(perDay)} />
        <Kpi icon="status/calendar-check" tone="income" label={t("noSpendDays")} value={f.number(noSpend)} sub={t("ofDays", { count: past.length })} />
        <Kpi icon="status/streak" tone="neutral" label={t("bestStreak")} value={t("daysValue", { count: best })} sub={t("bestStreakNote")} />
        <Kpi icon="money-time/chart-up" tone="neutral" label={t("busiest")} value={busiest && busiest.spend.money > 0 ? f.value(busiest.spend) : "–"} sub={busiest && busiest.spend.money > 0 ? f.day(busiest.day, "long") : undefined} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card title={f.monthLong(month)} subtitle={t("monthSubtitle")}>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {labels.map((label) => (
              <p key={label} className="pb-1 text-center text-[11.5px] font-bold uppercase tracking-[0.06em] text-foreground-muted">
                {label}
              </p>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={`pad-${i}`} />
            ))}
            {days.map((d) => {
              const active = selectedDay === d.day;
              const future = d.day > todayKey;
              const bg = heatColor(d.spend.money, max);
              const dark = bg === "#B1525F" || bg === "#7E3341" || bg === "#CF7B87";
              return (
                <button
                  key={d.day}
                  type="button"
                  onClick={() => setSelected(active ? null : d.day)}
                  aria-pressed={active}
                  aria-label={`${f.day(d.day, "long")}: ${d.spend.money > 0 ? f.plain(f.pick(d.spend)) : t("noSpend")}`}
                  className={`flex min-h-[48px] flex-col items-start justify-between rounded-xl p-1.5 text-left transition sm:min-h-[74px] sm:rounded-2xl sm:p-2 ${active ? "ring-2 ring-foreground" : ""} ${future ? "opacity-45" : ""}`}
                  style={{ background: bg }}
                >
                  <span className={`text-[12px] font-extrabold ${dark ? "text-card" : "text-foreground"}`}>{Number(d.day.slice(8))}</span>
                  <span className={`tabular hidden w-full truncate text-[11.5px] font-bold sm:block ${dark ? "text-card" : "text-foreground"}`}>
                    {d.spend.money > 0 ? f.axis(f.pick(d.spend)) : ""}
                  </span>
                  {d.income.money > 0 ? <span className={`tabular hidden w-full truncate text-[10.5px] font-bold sm:block ${dark ? "text-card/90" : "text-success"}`}>+{f.axis(f.pick(d.income))}</span> : null}
                </button>
              );
            })}
          </div>
        </Card>

        <Card title={selectedDay ? f.day(selectedDay, "long") : t("pickDay")} subtitle={selectedDay ? undefined : t("pickDayNote")}>
          {selectedDay ? <TxList txs={dayTxs} pageSize={20} /> : <TxList txs={monthTxs} pageSize={12} />}
        </Card>
      </div>

      <Card title={t("yearTitle")} subtitle={t("yearSubtitle")}>
        <CalendarHeatmap
          days={year.map((d) => ({ key: d.day, value: f.pick(d.spend) }))}
          weekStartsOn={model.weekStartsOn}
          weekdayLabels={weekdayLabels(f.locale, model.weekStartsOn, "narrow")}
          monthLabel={(key) => f.monthShort(key.slice(0, 7))}
          formatDay={(key) => f.day(key, "long")}
          format={(v) => f.plain(v)}
          selected={selectedDay}
          onSelect={pickDay}
        />
      </Card>
    </div>
  );
}
