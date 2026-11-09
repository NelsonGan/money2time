"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { monthRange, shiftMonthKey } from "@/lib/backup/dates";

import { breakdown } from "../aggregate";
import { LineChart } from "../charts/line-chart";
import { HEAT_RAMP } from "../charts/calendar-heatmap";
import { useDashboard, useFormat, useMonthLabels, usePeriodTxs, ZERO, addAmt, type Amt } from "../state";
import { Card, CategoryGlyph, Empty, Pill } from "../ui";

export function TrendsView() {
  const t = useTranslations("dashboard.trends");
  const tc = useTranslations("dashboard.common");
  const { model, resolved } = useDashboard();
  const f = useFormat();
  const { current, previous } = usePeriodTxs();

  // A grid needs a few columns to say anything; a short period widens to 6.
  const months = useMemo(
    () => (resolved.months.length >= 6 ? resolved.months.slice(-24) : monthRange(shiftMonthKey(resolved.end, -5), resolved.end)),
    [resolved],
  );
  const { labels, titles } = useMonthLabels(months);

  const grid = useMemo(() => {
    const rows = new Map<string, Amt[]>();
    const column = new Map(months.map((month, i) => [month, i]));
    for (const tx of model.txs) {
      const i = tx.spending ? column.get(tx.month) : undefined;
      if (i === undefined) continue;
      const key = tx.parentId ?? "__none";
      let row = rows.get(key);
      if (!row) {
        row = months.map(() => ZERO);
        rows.set(key, row);
      }
      row[i] = addAmt(row[i], { money: tx.amount, hours: tx.hours });
    }
    return [...rows.entries()]
      .map(([id, values]) => ({ id, values, total: values.reduce((s, v) => s + v.money, 0) }))
      .sort((a, b) => b.total - a.total);
  }, [model.txs, months]);

  const [selected, setSelected] = useState<string | null>(null);
  const focus = (selected && grid.some((row) => row.id === selected) ? selected : null) ?? grid[0]?.id ?? null;
  const focusRow = grid.find((row) => row.id === focus);
  const focusCategory = focus ? model.categories.get(focus) : null;
  const elapsed = months.filter((m) => m <= model.currentMonth).length || 1;
  const average = focusRow ? focusRow.values.reduce((s, v) => s + f.pick(v), 0) / elapsed : 0;

  const movers = useMemo(() => {
    const now = new Map(breakdown(current, model, "spending").map((s) => [s.id, s]));
    const before = new Map(breakdown(previous, model, "spending").map((s) => [s.id, s]));
    const ids = new Set([...now.keys(), ...before.keys()]);
    return [...ids]
      .map((id) => {
        const a = now.get(id)?.amt ?? ZERO;
        const b = before.get(id)?.amt ?? ZERO;
        const slice = now.get(id) ?? before.get(id)!;
        return { id, slice, change: { money: a.money - b.money, hours: a.hours - b.hours }, now: a, before: b };
      })
      .filter((m) => Math.abs(m.change.money) > 0.005)
      .sort((x, y) => Math.abs(y.change.money) - Math.abs(x.change.money))
      .slice(0, 8);
  }, [current, previous, model]);

  const name = (id: string) => model.categories.get(id)?.name ?? tc("uncategorized");

  return (
    <div className="space-y-5">
      <Card title={t("gridTitle")} subtitle={t("gridSubtitle")}>
        {grid.length === 0 ? (
          <Empty title={t("empty")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabular w-full border-separate border-spacing-[3px] text-[12.5px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[170px] bg-card pb-1 text-left text-[11.5px] font-bold uppercase tracking-[0.06em] text-foreground-muted">{t("category")}</th>
                  {labels.map((label, i) => (
                    <th key={months[i]} title={titles[i]} className="min-w-[64px] pb-1 text-center text-[11.5px] font-bold text-foreground-muted">
                      {label}
                    </th>
                  ))}
                  <th className="min-w-[80px] pb-1 text-right text-[11.5px] font-bold uppercase tracking-[0.06em] text-foreground-muted">{tc("average")}</th>
                </tr>
              </thead>
              <tbody>
                {grid.map((row) => {
                  const category = model.categories.get(row.id);
                  const max = Math.max(...row.values.map((v) => v.money), 1);
                  const avg = { money: row.values.reduce((s, v) => s + v.money, 0) / elapsed, hours: row.values.reduce((s, v) => s + v.hours, 0) / elapsed };
                  return (
                    <tr key={row.id} className={`cursor-pointer ${focus === row.id ? "outline outline-2 outline-primary/40" : ""}`} onClick={() => setSelected(row.id)}>
                      <td className="sticky left-0 z-10 bg-card pr-2">
                        <span className="flex items-center gap-2 font-bold text-foreground">
                          <CategoryGlyph icon={category?.icon} name={name(row.id)} color={category?.color} size={22} />
                          <span className="truncate">{name(row.id)}</span>
                        </span>
                      </td>
                      {row.values.map((value, i) => {
                        const ratio = value.money / max;
                        const step = value.money <= 0 ? 0 : Math.min(HEAT_RAMP.length - 1, 1 + Math.floor(ratio * (HEAT_RAMP.length - 1.01)));
                        return (
                          <td
                            key={months[i]}
                            title={`${titles[i]} · ${f.value(value)}`}
                            className={`rounded-lg px-1.5 py-2 text-center font-semibold ${step >= 4 ? "text-card" : "text-foreground"}`}
                            style={{ background: HEAT_RAMP[step] }}
                          >
                            {value.money > 0 ? f.axis(f.pick(value)) : "·"}
                          </td>
                        );
                      })}
                      <td className="pl-2 text-right font-bold text-foreground">{f.axis(f.pick(avg))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card
          title={focusCategory?.name ?? tc("uncategorized")}
          subtitle={t("lineSubtitle", { amount: f.plain(average) })}
          action={focusCategory ? <CategoryGlyph icon={focusCategory.icon} name={focusCategory.name} color={focusCategory.color} size={32} /> : null}
        >
          {focusRow ? (
            <LineChart
              labels={labels}
              titles={titles}
              series={[
                { key: "avg", label: tc("average"), color: "#94A39F", dashed: true, values: months.map(() => average) },
                { key: "v", label: focusCategory?.name ?? tc("uncategorized"), color: focusCategory?.color ?? "#B1525F", area: true, values: focusRow.values.map((v) => f.pick(v)) },
              ]}
              format={(v) => f.plain(v)}
              formatAxis={f.axis}
              height={260}
            />
          ) : (
            <Empty title={t("empty")} />
          )}
        </Card>

        <Card title={t("moversTitle")} subtitle={t("moversSubtitle")}>
          {movers.length === 0 ? (
            <Empty title={t("noMovers")} />
          ) : (
            <ul className="space-y-1">
              {movers.map((m) => (
                <li key={m.id} className="flex items-center gap-3 rounded-2xl px-2 py-2">
                  <CategoryGlyph icon={m.slice.icon} name={m.slice.name || "?"} color={m.slice.color} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold text-foreground">{m.slice.name || tc("uncategorized")}</p>
                    <p className="tabular text-[12px] text-foreground-soft">
                      {f.value(m.before)} → {f.value(m.now)}
                    </p>
                  </div>
                  <Pill tone={m.change.money > 0 ? "bad" : "good"}>{f.value(m.change, { signed: true })}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
