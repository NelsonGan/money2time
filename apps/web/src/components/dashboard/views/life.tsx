"use client";

/* eslint-disable @next/next/no-img-element -- trip covers are in-memory object URLs */

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { DAYS_PER_MONTH, daysBetween, monthRange, shiftMonthKey } from "@/lib/backup/dates";
import type { Tx } from "@/lib/backup/model";
import { memberShare, type TripMember, tripPeople } from "@/lib/backup/member-share";
import { balancesByAlbum, sharedAlbumIds, type PayerSplit } from "@/lib/backup/split-payer";

import type { ItemRow } from "@/lib/backup/types";

import { breakdown, monthlyFlows, weekdayIndex, weekdayLabels, workdayLength, workedHours } from "../aggregate";
import { AlbumActions, AlbumEditor, AlbumToolbar } from "../edit/album-editor";
import { ItemEditor, ItemToolbar, itemRows } from "../edit/item-editor";
import { WageCard } from "../edit/wage-editor";
import { EditUnavailable } from "../editing";
import { BarChart } from "../charts/bar-chart";
import { HEAT_RAMP } from "../charts/calendar-heatmap";
import { LineChart } from "../charts/line-chart";
import { EXPENSE_COLOR, NET_COLOR } from "../charts/scale";
import { Legend } from "../charts/tooltip";
import { offersEdits, addAmt, sumAmt, useDashboard, useFormat, useMonthLabels, usePeriodTxs, ZERO } from "../state";
import { Card, CategoryGlyph, ClayImg, Empty, ItemArt, Kpi, Pill, Progress, RankRow } from "../ui";
import { splitShareKey } from "../edit/split-ops";
import { SplitShares } from "../edit/split-shares";
import { AlbumActivity } from "./album-activity";
import { TxList } from "./transactions";

/** At least six months, so a monthly chart has a shape. */
function useChartMonths() {
  const { resolved } = useDashboard();
  return useMemo(() => {
    const end = resolved.focus;
    const start = resolved.months.length >= 6 ? resolved.start : shiftMonthKey(end, -5);
    return monthRange(start, end).slice(-36);
  }, [resolved]);
}

export function TimeView() {
  const t = useTranslations("dashboard.time");
  const tc = useTranslations("dashboard.common");
  const { model, resolved } = useDashboard();
  const f = useFormat();
  const { current } = usePeriodTxs();
  const spend = useMemo(() => sumAmt(current.filter((tx) => tx.spending)), [current]);
  const worked = resolved.months.filter((m) => m <= model.currentMonth).reduce((s, m) => s + workedHours(model, m), 0);
  const workday = workdayLength(model);
  const rate = model.rateForMonth(model.currentMonth);

  const months = useChartMonths();
  const { labels, titles } = useMonthLabels(months);
  const flows = useMemo(() => monthlyFlows(model.txs, months), [model.txs, months]);

  const slices = useMemo(() => breakdown(current, model, "spending").slice(0, 8), [current, model]);
  const regret = useMemo(() => current.filter((tx) => tx.spending && tx.sentiment === "sad").sort((a, b) => b.hours - a.hours), [current]);
  const regretHours = regret.reduce((s, tx) => s + tx.hours, 0);
  const biggest = useMemo(() => current.filter((tx) => tx.spending).sort((a, b) => b.hours - a.hours).slice(0, 5), [current]);

  // How long the money in everyday accounts would last at recent spending.
  const liquid = model.accounts.filter((a) => a.includeInTotals && !a.liability && a.type !== "goal").reduce((s, a) => s + a.netBase, 0);
  const since = new Date(model.today.getTime() - 90 * 86_400_000);
  const recent = model.txs.filter((tx) => tx.spending && tx.date >= since && tx.date <= model.today).reduce((s, tx) => s + tx.amount, 0);
  const runwayDays = recent > 0 ? liquid / (recent / 90) : null;

  const wageMonths = useMemo(() => (model.wages.length ? monthRange(model.wages[0].month, model.currentMonth) : []), [model.wages, model.currentMonth]);
  const wageLabels = useMonthLabels(wageMonths);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon="money-time/hourglass" tone="expense" label={t("spentHours")} value={f.hours(spend.hours)} sub={f.money(spend.money)} />
        <Kpi icon="money-time/balance-scale" tone="neutral" label={t("share")} value={worked > 0 ? f.percent(spend.hours / worked) : "–"} sub={t("shareNote", { hours: f.hours(worked) })} />
        <Kpi icon="money-time/clock" tone="neutral" label={t("workdays")} value={t("workdaysValue", { count: Math.round((spend.hours / workday) * 10) / 10 })} sub={t("workdayLength", { hours: f.hours(workday) })} />
        <Kpi icon="settings/hourly-value" tone="income" label={t("hourlyValue")} value={rate > 0 ? `${f.money(rate)}` : "–"} sub={t("perHour")} />
      </div>

      <Card
        title={t("chartTitle")}
        subtitle={t("chartSubtitle")}
        action={
          <Legend
            items={[
              { label: t("hoursSpent"), color: EXPENSE_COLOR },
              { label: t("hoursWorked"), color: NET_COLOR, line: true },
            ]}
          />
        }
      >
        <BarChart
          height={280}
          labels={labels}
          titles={titles}
          series={[{ key: "s", label: t("hoursSpent"), color: EXPENSE_COLOR, values: flows.map((m) => m.spend.hours) }]}
          line={{ label: t("hoursWorked"), color: NET_COLOR, values: months.map((m) => workedHours(model, m)) }}
          format={(v) => f.hours(v)}
          formatAxis={(v) => f.hoursCompact(v)}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        <Card title={t("categoriesTitle")} subtitle={t("categoriesSubtitle")}>
          {slices.length === 0 ? (
            <Empty title={t("empty")} />
          ) : (
            <div className="space-y-0.5">
              {slices.map((slice) => (
                <RankRow
                  key={slice.id}
                  icon={<CategoryGlyph icon={slice.icon} name={slice.name || "?"} color={slice.color} size={28} />}
                  name={slice.name || tc("uncategorized")}
                  meta={f.money(slice.amt.money)}
                  value={t("workdaysValue", { count: Math.round((slice.amt.hours / workday) * 10) / 10 })}
                  other={f.hours(slice.amt.hours)}
                  share={spend.hours ? slice.amt.hours / spend.hours : 0}
                  color={slice.color}
                />
              ))}
            </div>
          )}
        </Card>

        <Card title={t("runwayTitle")} icon="status/growing-plant">
          <p className="tabular text-[34px] font-extrabold tracking-[-0.02em] text-foreground">{runwayDays !== null ? t("daysValue", { count: Math.floor(runwayDays) }) : "–"}</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-foreground-soft">{t("runwayBody", { liquid: f.money(liquid), daily: f.money(recent / 90) })}</p>
          <div className="mt-5 border-t border-border pt-4">
            <p className="flex items-center gap-2 text-[14px] font-extrabold text-foreground">
              <ClayImg name="sentiment/regret" size={24} />
              {t("regretTitle")}
            </p>
            <p className="tabular mt-1 text-[24px] font-extrabold text-foreground">{f.hours(regretHours)}</p>
            <p className="text-[13px] text-foreground-soft">{t("regretBody", { count: regret.length })}</p>
            <ul className="mt-2 space-y-1 text-[13px]">
              {regret.slice(0, 3).map((tx) => (
                <li key={tx.id} className="flex justify-between gap-3">
                  <span className="truncate text-foreground">{tx.note || model.categories.get(tx.categoryId ?? "")?.name || tc("uncategorized")}</span>
                  <span className="tabular shrink-0 font-bold text-foreground">{f.hours(tx.hours)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card title={t("biggestTitle")} subtitle={t("biggestSubtitle")}>
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
                    meta={f.date(tx.date)}
                    value={f.hours(tx.hours)}
                    other={f.money(tx.amount)}
                  />
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {wageMonths.length > 1 ? (
        <Card title={t("wageTitle")} subtitle={t("wageSubtitle")}>
          <LineChart
            labels={wageLabels.labels}
            titles={wageLabels.titles}
            series={[{ key: "w", label: t("hourlyValue"), color: "#1E9468", area: true, values: wageMonths.map((m) => model.rateForMonth(m)) }]}
            format={(v) => f.money(v)}
            formatAxis={(v) => f.moneyCompact(v)}
            height={220}
          />
        </Card>
      ) : (
        <Card>
          <Empty title={t("noWage")} mascot="thinking" />
        </Card>
      )}

      <WageCard />
    </div>
  );
}

export function TripsView() {
  const t = useTranslations("dashboard.trips");
  const tc = useTranslations("dashboard.common");
  const { model, asset, link } = useDashboard();
  const canEdit = offersEdits(link.editing);
  const [creating, setCreating] = useState(false);
  const albumToolbar = canEdit ? (
    <AlbumToolbar onCreate={() => setCreating(true)} />
  ) : (
    <EditUnavailable state={link.editing} />
  );
  const albumEditor = creating ? <AlbumEditor trip={null} onClose={() => setCreating(false)} /> : null;
  const f = useFormat();
  const workday = workdayLength(model);

  const trips = useMemo(
    () =>
      model.trips.map((trip) => {
        const txs = trip.txIds.map((id) => model.txById.get(id)!).filter((tx): tx is Tx => !!tx);
        const spend = sumAmt(txs.filter((tx) => tx.spending));
        const days = trip.start && trip.end ? Math.max(1, daysBetween(trip.start, trip.end) + 1) : 1;
        return { trip, txs, spend, days };
      }),
    [model],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = trips.find((x) => x.trip.id === selectedId) ?? null;
  const selectedTxs = useMemo(() => (selected ? [...selected.txs].sort((a, b) => b.date.getTime() - a.date.getTime()) : []), [selected]);
  // With a split bill in the trip, its breakdown can show one person's share,
  // as the app's album Breakdown does.
  const splitsByTx = useMemo(() => {
    const map = new Map<string, PayerSplit[]>();
    for (const split of model.splits) {
      const list = map.get(split.transaction_id);
      if (list) list.push(split);
      else map.set(split.transaction_id, [split]);
    }
    return map;
  }, [model.splits]);
  const people = useMemo(() => (selected ? tripPeople(splitsByTx, selected.trip.txIds) : []), [selected, splitsByTx]);
  const [memberKey, setMemberKey] = useState<string | null>(null);
  // Each entry at the member's share of it, by its own rate; null for everyone.
  const memberTxs = useMemo(() => {
    const member: TripMember | null =
      memberKey === "self" ? { kind: "self" } : memberKey && people.some((p) => p.key === memberKey) ? { kind: "person", key: memberKey } : null;
    if (!selected || !member || people.length === 0) return null;
    return selected.txs.flatMap((tx) => {
      const original = Math.abs(tx.originalAmount);
      const share = memberShare(splitsByTx.get(tx.id), original, member);
      if (share <= 0 || original <= 0) return [];
      const ratio = share / original;
      return [{ ...tx, amount: tx.amount * ratio, hours: tx.hours * ratio }];
    });
  }, [selected, memberKey, people, splitsByTx]);
  const breakdownTxs = memberTxs ?? selected?.txs ?? [];
  const breakdownSpend = memberTxs ? sumAmt(memberTxs.filter((tx) => tx.spending)) : (selected?.spend ?? ZERO);
  const total = trips.reduce((s, x) => addAmt(s, x.spend), ZERO);

  if (trips.length === 0) {
    return (
      <div className="space-y-5">
        {albumToolbar}
        <Card>
          <Empty title={t("emptyTitle")} body={t("emptyBody")} mascot="thinking" />
        </Card>
        {albumEditor}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {albumToolbar}
      {albumEditor}
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi icon="settings/albums" tone="neutral" label={t("count")} value={f.number(trips.length)} sub={t("countries", { count: new Set(trips.map((x) => x.trip.countryCode).filter(Boolean)).size })} />
        <Kpi icon="money-time/wallet-out" tone="expense" label={t("total")} value={f.value(total)} sub={f.other(total)} />
        <Kpi icon="money-time/clock" tone="neutral" label={t("workdays")} value={t("workdaysValue", { count: Math.round((total.hours / workday) * 10) / 10 })} sub={t("workdaysNote")} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {trips.map(({ trip, spend, days, txs }) => {
          const cover = asset(trip.coverUri);
          const active = selected?.trip.id === trip.id;
          return (
            <button
              key={trip.id}
              type="button"
              onClick={() => {
                setSelectedId(active ? null : trip.id);
                setMemberKey(null);
              }}
              className={`card-surface card-lift overflow-hidden rounded-[22px] text-left ${active ? "ring-2 ring-primary" : ""}`}
            >
              <div className="relative h-36 bg-gradient-to-br from-sky/40 via-primary-soft to-accent-soft">
                {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <ClayImg name="money-time/coins-stack" size={56} className="absolute bottom-4 right-4" />}
                {trip.active ? (
                  <span className="absolute left-3 top-3">
                    <Pill tone="brand">{t("current")}</Pill>
                  </span>
                ) : null}
              </div>
              <div className="p-4">
                <h3 className="truncate text-[15.5px] font-extrabold text-foreground">{trip.name}</h3>
                <p className="truncate text-[12.5px] text-foreground-soft">
                  {[trip.place, trip.start && trip.end ? `${f.date(trip.start, "short")} – ${f.date(trip.end)}` : null].filter(Boolean).join(" · ")}
                </p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="tabular text-[19px] font-extrabold text-foreground">{f.value(spend)}</p>
                    <p className="text-[12px] text-foreground-soft">{t("perDay", { amount: f.value({ money: spend.money / days, hours: spend.hours / days }) })}</p>
                  </div>
                  <p className="text-right text-[12px] font-semibold text-foreground-soft">
                    {t("workdaysValue", { count: Math.round((spend.hours / workday) * 10) / 10 })}
                    <br />
                    {tc("transactions", { count: txs.length })}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selected && canEdit ? <AlbumActions key={selected.trip.id} trip={selected.trip} /> : null}
      {selected ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Card title={selected.trip.name} subtitle={t("breakdown")}>
            {people.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {[{ key: null, name: t("everyone") }, { key: "self", name: t("me") }, ...people].map((chip) => {
                  const active = chip.key === null ? memberTxs === null : chip.key === memberKey;
                  return (
                    <button
                      key={chip.key ?? "everyone"}
                      type="button"
                      onClick={() => setMemberKey(chip.key)}
                      aria-pressed={active}
                      className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground-soft hover:bg-background-subtle"}`}
                    >
                      {chip.name}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="space-y-0.5">
              {breakdown(breakdownTxs, model, "spending").map((slice) => (
                <RankRow
                  key={slice.id}
                  icon={<CategoryGlyph icon={slice.icon} name={slice.name || "?"} color={slice.color} size={28} />}
                  name={slice.name || tc("uncategorized")}
                  meta={f.percent(breakdownSpend.money ? slice.amt.money / breakdownSpend.money : 0)}
                  value={f.value(slice.amt)}
                  other={f.other(slice.amt)}
                  share={breakdownSpend.money ? slice.amt.money / breakdownSpend.money : 0}
                  color={slice.color}
                />
              ))}
            </div>
          </Card>
          <Card title={t("transactionsTitle")}>
            <TxList txs={selectedTxs} pageSize={20} />
          </Card>
          <div className="xl:col-span-2">
            <AlbumActivity key={selected.trip.id} albumId={selected.trip.id} />
          </div>
        </div>
      ) : (
        <p className="text-center text-[13px] text-foreground-muted">{t("pick")}</p>
      )}
    </div>
  );
}

export function ItemsView() {
  const t = useTranslations("dashboard.items");
  const ti = useTranslations("dashboard.edit.item");
  const { model, fullModel, link } = useDashboard();
  const f = useFormat();
  const canEdit = offersEdits(link.editing);
  // undefined: closed; null: a new item.
  const [editingItem, setEditingItem] = useState<ItemRow | null | undefined>(undefined);
  const openItem = (id: string) => setEditingItem(itemRows(fullModel).find((row) => row.id === id));
  const itemToolbar = canEdit ? (
    <ItemToolbar onCreate={() => setEditingItem(null)} />
  ) : (
    <EditUnavailable state={link.editing} />
  );
  const itemEditor = editingItem !== undefined ? <ItemEditor key={editingItem?.id ?? "new"} row={editingItem} onClose={() => setEditingItem(undefined)} /> : null;
  const items = [...model.items].sort((a, b) => b.dailyCostBase - a.dailyCostBase);
  const active = items.filter((i) => i.active);
  const value = active.reduce((s, i) => s + i.priceBase, 0);
  const daily = active.reduce((s, i) => s + i.dailyCostBase, 0);
  const dailyHours = active.reduce((s, i) => s + i.dailyHours, 0);
  const maxDaily = Math.max(...items.map((i) => i.dailyCostBase), 0.0001);

  if (items.length === 0) {
    return (
      <div className="space-y-5">
        {itemToolbar}
        <Card>
          <Empty title={t("emptyTitle")} body={t("emptyBody")} mascot="thinking" />
        </Card>
        {itemEditor}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {itemToolbar}
      {itemEditor}
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi icon="settings/items" tone="neutral" label={t("value")} value={f.money(value)} sub={t("count", { count: active.length })} />
        <Kpi icon="money-time/calendar-clock" tone="expense" label={t("perDay")} value={f.money(daily)} sub={t("perMonth", { amount: f.money(daily * DAYS_PER_MONTH) })} />
        <Kpi icon="money-time/clock" tone="neutral" label={t("workPerDay")} value={f.hours(dailyHours)} sub={t("workPerDayNote")} />
      </div>
      <Card title={t("listTitle")} subtitle={t("listSubtitle")}>
        <ul className="divide-y divide-border/60">
          {items.map((item) => (
            <li key={item.id} className={`flex items-center gap-4 py-3 ${item.active ? "" : "opacity-60"}`}>
              <ItemArt iconId={item.iconId} name={item.name} size={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-foreground">{item.name}</p>
                <p className="text-[12.5px] text-foreground-soft">
                  {item.purchaseDate ? t("bought", { date: f.date(item.purchaseDate), price: f.money(item.priceBase) }) : f.money(item.priceBase)}
                  {" · "}
                  {t("owned", { count: item.daysOwned })}
                  {item.salePriceBase != null ? ` · ${t("sold", { price: f.money(item.salePriceBase) })}` : ""}
                </p>
                <div className="mt-2 max-w-[360px]">
                  <Progress ratio={item.dailyCostBase / maxDaily} color="#E39A1E" />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular text-[15px] font-extrabold text-foreground">{t("perDayValue", { amount: f.money(item.dailyCostBase) })}</p>
                <p className="tabular text-[12px] text-foreground-muted">{t("workValue", { time: f.hours(item.dailyHours) })}</p>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => openItem(item.id)}
                  aria-label={`${ti("editTitle")}: ${item.name}`}
                  title={ti("editTitle")}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-background-subtle"
                >
                  <ClayImg name="ui/pencil" size={16} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function SplitsView() {
  const t = useTranslations("dashboard.splits");
  const { model } = useDashboard();
  const f = useFormat();

  // One net balance per person, either way, as the app's Balances lists them:
  // what they owe on the bills the user paid, less what the user owes them
  // for the bills they paid. As in the app, a shared album's bills are listed
  // under it, and the people are every other bill (an album of the user's own
  // is settled here like any bill).
  const { people, albums } = useMemo(
    () => balancesByAlbum(model.splitDebts, model.splitOwed, model.trips, sharedAlbumIds(model.txs), model.currency),
    [model.splitDebts, model.splitOwed, model.trips, model.txs, model.currency],
  );
  // The totals are every open share, each once (a bill can be in two albums).
  const owed = model.splitDebts.reduce((s, debt) => s + debt.amountBase, 0);
  const youOwe = model.splitOwed.reduce((s, debt) => s + debt.amountBase, 0);
  const owingPeople = new Set(model.splitDebts.map((debt) => debt.key)).size;
  const largest = [...people, ...albums].reduce((max, p) => Math.max(max, Math.abs(p.net)), 0);
  // Counted by share: a friend who paid in parts has a paid row per payment
  // and maybe one still owed, and is settled once nothing is owed. A bill a
  // friend paid has one share to settle, the user's own, kept on the payer's row.
  const { shares, settled } = useMemo(() => {
    const friendPaid = new Set(model.txs.filter((tx) => tx.paidBy !== undefined).map((tx) => tx.id));
    const owing = new Map<string, boolean>();
    for (const split of model.splits) {
      if (split.is_self) continue;
      if (friendPaid.has(split.transaction_id) && !split.is_payer) continue;
      const key = splitShareKey(split);
      owing.set(key, (owing.get(key) ?? false) || !split.paid_at);
    }
    return { shares: owing.size, settled: [...owing.values()].filter((owes) => !owes).length };
  }, [model.splits, model.txs]);
  // Memoised: a new array would send the list back to its first page on every render.
  const splitTxs = useMemo(() => {
    const ids = new Set(model.splits.map((s) => s.transaction_id));
    return model.txs.filter((tx) => ids.has(tx.id));
  }, [model.splits, model.txs]);

  if (model.splits.length === 0) {
    return (
      <Card>
        <Empty title={t("emptyTitle")} body={t("emptyBody")} mascot="thinking" />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon="settings/settle-up" tone="income" label={t("owedToYou")} value={f.money(owed)} sub={t("people", { count: owingPeople })} />
        <Kpi icon="status/people-two" tone={youOwe > 0 ? "expense" : "neutral"} label={t("youOwe")} value={f.money(youOwe)} sub={t("youOweNote")} />
        <Kpi icon="status/handshake" tone="neutral" label={t("settled")} value={f.number(settled)} sub={t("ofShares", { count: shares })} />
        <Kpi icon="insights/split-bill" tone="neutral" label={t("bills")} value={f.number(splitTxs.length)} sub={t("billsNote")} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card title={t("byPerson")}>
          {people.length === 0 && albums.length === 0 ? (
            <Empty title={t("allSettled")} mascot="presenting" />
          ) : (
            <div className="space-y-0.5">
              {albums.map((album) => {
                // As the app's Balances: an album's balance is never
                // converted, one figure per currency, each signed when there
                // are several. The bar still compares the main-currency net.
                const open = t("open", { count: album.people.reduce((n, p) => n + p.count, 0) });
                const [only] = album.netByCurrency;
                const several = album.netByCurrency.length > 1;
                // Every currency nets to nothing: level, so no direction and a plain zero.
                const owe = !!only && only.amount < 0;
                return (
                  <RankRow
                    key={`album:${album.id}`}
                    icon={<ClayImg name="settings/albums" size={30} />}
                    name={album.name}
                    meta={several || !only ? open : `${owe ? t("youOwe") : t("owedToYou")} · ${open}`}
                    value={
                      several ? (
                        <span className="flex flex-col items-end">
                          {album.netByCurrency.map((entry) => (
                            <span key={entry.currency} className={entry.amount < 0 ? "text-error" : undefined}>
                              {entry.amount < 0 ? "−" : "+"}
                              {f.moneyIn(Math.abs(entry.amount), entry.currency)}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className={owe ? "text-error" : undefined}>{only ? f.moneyIn(Math.abs(only.amount), only.currency) : f.money(0)}</span>
                      )
                    }
                    share={largest ? Math.abs(album.net) / largest : 0}
                    color={album.net < 0 ? "#C2604A" : "#1E9468"}
                  />
                );
              })}
              {people.map((p) => (
                <RankRow
                  key={p.person}
                  icon={<ClayImg name="status/people-two" size={30} />}
                  name={p.person || t("unnamed")}
                  meta={`${p.net < 0 ? t("youOwe") : t("owesYou")} · ${t("open", { count: p.count })}`}
                  value={<span className={p.net < 0 ? "text-error" : undefined}>{f.money(Math.abs(p.net))}</span>}
                  share={largest ? Math.abs(p.net) / largest : 0}
                  color={p.net < 0 ? "#C2604A" : "#1E9468"}
                />
              ))}
            </div>
          )}
        </Card>
        <Card title={t("billsTitle")}>
          <TxList txs={splitTxs} pageSize={15} />
        </Card>
      </div>
      <SplitShares />
    </div>
  );
}

const MOOD_COLORS = { happy: "#1E9468", neutral: "#E39A1E", sad: "#B1525F" } as const;

export function MoodView() {
  const t = useTranslations("dashboard.mood");
  const { model } = useDashboard();
  const f = useFormat();
  const { current } = usePeriodTxs();
  const spending = useMemo(() => current.filter((tx) => tx.spending), [current]);
  const months = useChartMonths();
  const { labels, titles } = useMonthLabels(months);

  const shares = (["happy", "neutral", "sad"] as const).map((key) => {
    const rows = spending.filter((tx) => tx.sentiment === key);
    return { key, count: rows.length, amt: sumAmt(rows) };
  });
  const total = sumAmt(spending);

  const monthly = useMemo(() => {
    const index = new Map(months.map((m, i) => [m, i]));
    const counts = { happy: months.map(() => 0), neutral: months.map(() => 0), sad: months.map(() => 0) };
    for (const tx of model.txs) {
      if (!tx.spending) continue;
      const i = index.get(tx.month);
      if (i !== undefined) counts[tx.sentiment][i] += 1;
    }
    return counts;
  }, [model.txs, months]);

  const grid = useMemo(() => {
    const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    for (const tx of spending) {
      if (tx.hour === null) continue;
      cells[weekdayIndex(tx.date, model.weekStartsOn)][tx.hour] += 1;
    }
    return cells;
  }, [spending, model.weekStartsOn]);
  const maxCell = Math.max(1, ...grid.flat());
  const timed = spending.filter((tx) => tx.hour !== null).length;
  const peakHour = grid.reduce<number[]>((acc, row) => row.map((v, h) => (acc[h] ?? 0) + v), []).reduce((best, v, h, all) => (v > all[best] ? h : best), 0);
  const days = weekdayLabels(f.locale, model.weekStartsOn);
  const regrets = useMemo(() => spending.filter((tx) => tx.sentiment === "sad").sort((a, b) => b.amount - a.amount), [spending]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {shares.map((share) => (
          <Kpi
            key={share.key}
            icon={`sentiment/${share.key === "sad" ? "regret" : share.key}`}
            tone={share.key === "happy" ? "income" : share.key === "sad" ? "expense" : "neutral"}
            label={t(`feelings.${share.key}`)}
            value={f.percent(total.money ? share.amt.money / total.money : 0)}
            sub={t("shareSub", { amount: f.value(share.amt), count: share.count })}
          />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card
          title={t("monthlyTitle")}
          subtitle={t("monthlySubtitle")}
          action={<Legend items={(["happy", "neutral", "sad"] as const).map((k) => ({ label: t(`feelings.${k}`), color: MOOD_COLORS[k] }))} />}
        >
          <BarChart
            stacked
            height={260}
            labels={labels}
            titles={titles}
            series={(["happy", "neutral", "sad"] as const).map((k) => ({ key: k, label: t(`feelings.${k}`), color: MOOD_COLORS[k], values: monthly[k] }))}
            format={(v) => f.number(v)}
            formatAxis={(v) => f.number(v)}
          />
        </Card>
        <Card title={t("regretsTitle")} subtitle={t("regretsSubtitle")}>
          {regrets.length === 0 ? (
            <Empty title={t("noRegrets")} mascot="presenting" />
          ) : (
            <TxList txs={regrets} pageSize={8} />
          )}
        </Card>
      </div>

      <Card title={t("clockTitle")} subtitle={timed ? t("clockSubtitle", { hour: f.hour(new Date(2000, 0, 1, peakHour)) }) : t("noTimes")}>
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-[3px] text-[11px]">
            <thead>
              <tr>
                <th />
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} className="w-7 text-center font-semibold text-foreground-muted">
                    {h % 3 === 0 ? f.hour(new Date(2000, 0, 1, h)) : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, d) => (
                <tr key={d}>
                  <th className="pr-2 text-right font-semibold text-foreground-muted">{days[d]}</th>
                  {row.map((count, h) => {
                    const step = count === 0 ? 0 : Math.min(HEAT_RAMP.length - 1, 1 + Math.floor(Math.sqrt(count / maxCell) * (HEAT_RAMP.length - 1.01)));
                    return <td key={h} title={`${days[d]} ${f.hour(new Date(2000, 0, 1, h))} · ${count}`} className="h-7 w-7 rounded-md" style={{ background: HEAT_RAMP[step] }} />;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
