"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { monthRange, parseLocalDate, shiftMonthKey } from "@/lib/backup/dates";
import type { Account, AccountGroup } from "@/lib/backup/model";

import { BarChart } from "../charts/bar-chart";
import { Donut } from "../charts/donut";
import { LineChart } from "../charts/line-chart";
import { Sparkline } from "../charts/calendar-heatmap";
import { EXPENSE_COLOR, INCOME_COLOR, NET_COLOR, seriesColor } from "../charts/scale";
import { Legend } from "../charts/tooltip";
import { AccountEditor, GroupEditor, PaySheet } from "../edit/account-editor";
import { LoanEditor } from "../edit/loan-editor";
import { CurrenciesSheet } from "../edit/currency-editor";
import { AccountsReorderSheet } from "../edit/reorder";
import { EditUnavailable } from "../editing";
import { balanceHistory } from "../history";
import { usePaywall } from "../paywall";
import { FREE_MAX_ACCOUNTS } from "../pro-limits";
import { offersEdits, useDashboard, useFormat, useMonthLabels, hoursAt } from "../state";
import { AccountLogo, Card, ClayImg, Delta, Empty, Kpi, Pill, RankRow, useAccountTypeLabel } from "../ui";
import { withPaybackRows } from "@/lib/backup/paybacks";

import { TxList } from "./transactions";

function useGroups(withoutGoals = false) {
  const { model } = useDashboard();
  return useMemo(() => {
    const groups = new Map<string, Account[]>();
    for (const account of model.accounts) {
      // The app keeps savings goals off its Accounts screen.
      if (withoutGoals && account.type === "goal") continue;
      const key = account.group || "";
      const list = groups.get(key);
      if (list) list.push(account);
      else groups.set(key, [account]);
    }
    return [...groups.entries()];
  }, [model.accounts, withoutGoals]);
}

export function AccountsView() {
  const t = useTranslations("dashboard.accounts");
  const tc = useTranslations("dashboard.common");
  const ta = useTranslations("dashboard.edit.account");
  const accountType = useAccountTypeLabel();
  const paywall = usePaywall();
  const { model, fullModel, link } = useDashboard();
  const f = useFormat();
  const accountGroups = useGroups(true);
  // Goals live on the Goals & loans page, as in the app.
  const accountList = useMemo(() => model.accounts.filter((a) => a.type !== "goal"), [model.accounts]);
  const editable = offersEdits(link.editing);
  const ready = link.editing === "ready";
  // While changes can be made, groups with no accounts yet show too, so they can be filled, renamed or deleted.
  const groups = useMemo(() => {
    if (!editable) return accountGroups;
    const shown = new Set(accountGroups.map(([name]) => name));
    const empty = fullModel.groups.filter((group) => !shown.has(group.name)).map((group): [string, Account[]] => [group.name, []]);
    return [...accountGroups, ...empty];
  }, [accountGroups, editable, fullModel.groups]);
  const [editingAccount, setEditingAccount] = useState<{ account: Account | null; group?: string | null } | undefined>(undefined);
  const [editingGroup, setEditingGroup] = useState<AccountGroup | null | undefined>(undefined);
  const [paying, setPaying] = useState<Account | null>(null);
  // The free plan's limit, checked before the editor opens as the app does.
  const newAccount = (group?: string | null) => {
    if (!link.pro && fullModel.accounts.filter((a) => a.type !== "goal").length >= FREE_MAX_ACCOUNTS) {
      paywall("accounts");
      return;
    }
    setEditingAccount({ account: null, group });
  };
  const [accountsPanel, setAccountsPanel] = useState<"reorder" | "currencies" | null>(null);
  const tPanel = useTranslations("dashboard.edit");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = (selectedId ? accountList.find((a) => a.id === selectedId) : null) ?? accountList[0] ?? null;

  const months = useMemo(() => monthRange(shiftMonthKey(model.currentMonth, -23), model.currentMonth), [model.currentMonth]);
  const history = useMemo(() => balanceHistory(model, months, accountList), [model, months, accountList]);
  const { labels, titles } = useMonthLabels(months);

  // The app's Accounts header: every account in totals, goals included, each
  // as this page shows it (a flat loan by what is left to pay).
  const inTotals = model.accounts.filter((a) => a.includeInTotals);
  const assets = inTotals.filter((a) => !a.liability).reduce((s, a) => s + a.pageBase, 0);
  const debts = inTotals.filter((a) => a.liability).reduce((s, a) => s - a.pageBase, 0);
  const selectedTxs = useMemo(
    () =>
      selected
        ? withPaybackRows(
            model.txs.filter((tx) => tx.accountId === selected.id || tx.fromAccountId === selected.id || tx.toAccountId === selected.id),
            // Paybacks into this account that wrote no transfer, as the app's account page lists them.
            model.paybackRows.filter((tx) => tx.fromAccountId === selected.id),
          )
        : [],
    [model.txs, model.paybackRows, selected],
  );

  const iconButton = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground-soft hover:bg-background-subtle disabled:opacity-40";

  return (
    <div className="space-y-5">
      <EditUnavailable state={link.editing} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi icon="money-time/bank" tone="income" label={t("assets")} value={f.money(assets)} sub={t("inTotals", { count: inTotals.filter((a) => !a.liability).length })} />
        <Kpi icon="money-time/card" tone="expense" label={t("debts")} value={f.money(debts)} sub={t("inTotals", { count: inTotals.filter((a) => a.liability).length })} />
        <Kpi icon="insights/growth-analysis" tone="neutral" label={t("netWorth")} value={f.money(assets - debts)} sub={t("excluded", { count: model.accounts.length - inTotals.length })} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-5">
          {editable ? (
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setAccountsPanel("currencies")}
                disabled={!ready}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-[13px] font-extrabold text-foreground-soft hover:text-foreground disabled:opacity-50"
              >
                {tPanel("currency.open")}
              </button>
              <button
                type="button"
                onClick={() => setAccountsPanel("reorder")}
                disabled={!ready}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-[13px] font-extrabold text-foreground-soft hover:text-foreground disabled:opacity-50"
              >
                {tPanel("reorder.open")}
              </button>
              <button
                type="button"
                onClick={() => setEditingGroup(null)}
                disabled={!ready}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-[13px] font-extrabold text-foreground-soft hover:text-foreground disabled:opacity-50"
              >
                <ClayImg name="ui/plus" size={16} />
                {ta("newGroup")}
              </button>
              <button
                type="button"
                onClick={() => newAccount()}
                disabled={!ready}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-extrabold text-card shadow-[var(--shadow-soft)] hover:bg-primary-dark disabled:opacity-50"
              >
                <ClayImg name="ui/plus" size={16} />
                {ta("newAccount")}
              </button>
            </div>
          ) : null}
          {groups.map(([group, accounts]) => {
            const total = accounts.filter((a) => a.includeInTotals).reduce((s, a) => s + a.pageBase, 0);
            const record = group ? fullModel.groups.find((item) => item.name === group) : undefined;
            return (
              <Card
                key={group || "_"}
                title={group || t("ungrouped")}
                action={
                  <>
                    <span className="tabular text-[15px] font-extrabold text-foreground">{f.money(total)}</span>
                    {editable ? (
                      <>
                        {record || !group ? (
                          <button type="button" onClick={() => newAccount(group || null)} disabled={!ready} aria-label={ta("addToGroup")} title={ta("addToGroup")} className={iconButton}>
                            <ClayImg name="ui/plus" size={16} />
                          </button>
                        ) : null}
                        {record ? (
                          <button type="button" onClick={() => setEditingGroup(record)} disabled={!ready} aria-label={ta("editGroup")} title={ta("editGroup")} className={iconButton}>
                            <ClayImg name="ui/pencil" size={16} />
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </>
                }
              >
                <div className="space-y-0.5">
                  {!accounts.length ? <p className="px-2 py-2 text-[13px] text-foreground-muted">{ta("emptyGroup")}</p> : null}
                  {accounts.map((account) => (
                    <div key={account.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedId(account.id)}
                        className={`flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors ${selected?.id === account.id ? "bg-primary-soft" : "hover:bg-background-subtle"}`}
                      >
                        <AccountLogo logoId={account.logoId} name={account.name} size={34} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-bold text-foreground">{account.name}</p>
                          <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-foreground-soft">
                            {accountType(account.type)}
                            {account.currency !== model.currency ? <Pill>{account.currency}</Pill> : null}
                            {!account.includeInTotals ? <Pill>{t("notInTotals")}</Pill> : null}
                          </p>
                        </div>
                        <Sparkline values={history.get(account.id)?.slice(-12) ?? []} color={account.liability ? EXPENSE_COLOR : INCOME_COLOR} />
                        <div className="w-[112px] shrink-0 text-right">
                          <p className={`tabular text-[14px] font-extrabold ${account.liability && account.pageBalance > 0 ? "text-error" : "text-foreground"}`}>
                            {account.currency !== model.currency ? f.foreign(account.pageBalance, account.currency) : f.money(account.pageBalance)}
                          </p>
                          {account.liability ? <p className="text-[11.5px] text-foreground-muted">{t("owed")}</p> : null}
                        </div>
                      </button>
                      {editable && (account.type === "credit" || (account.type === "loan" && !account.loan?.archived)) ? (
                        <button
                          type="button"
                          onClick={() => setPaying(fullModel.accountById.get(account.id) ?? account)}
                          disabled={!ready}
                          aria-label={`${account.type === "loan" ? ta("loanPayTitle") : ta("payTitle")}: ${account.name}`}
                          title={account.type === "loan" ? ta("loanPayTitle") : ta("payTitle")}
                          className="inline-flex h-8 shrink-0 items-center rounded-full border border-primary/40 bg-primary/10 px-3 text-[12px] font-extrabold text-primary-dark hover:bg-primary/15 disabled:opacity-40"
                        >
                          {ta("pay")}
                        </button>
                      ) : null}
                      {editable ? (
                        <button
                          type="button"
                          onClick={() => setEditingAccount({ account: fullModel.accountById.get(account.id) ?? account })}
                          disabled={!ready}
                          aria-label={`${ta("editAccount")}: ${account.name}`}
                          title={ta("editAccount")}
                          className={iconButton}
                        >
                          <ClayImg name="ui/pencil" size={16} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>

        {selected ? (
          <div className="space-y-5">
            <Card
              title={selected.name}
              subtitle={accountType(selected.type)}
              action={<AccountLogo logoId={selected.logoId} name={selected.name} size={40} />}
            >
              <p className="tabular text-[30px] font-extrabold tracking-[-0.02em] text-foreground">
                {selected.currency !== model.currency ? f.foreign(selected.pageBalance, selected.currency) : f.money(selected.pageBalance)}
              </p>
              <p className="text-[13px] text-foreground-soft">
                {selected.liability ? t("owedNow") : t("balanceNow")}
                {selected.lastActivity ? ` · ${t("lastActivity", { date: f.date(parseLocalDate(selected.lastActivity) ?? new Date(selected.lastActivity)) })}` : ""}
              </p>
              {selected.creditLimitDays?.statementDay ? (
                <p className="mt-2 text-[13px] text-foreground-soft">
                  {selected.creditLimitDays.dueDaysAfter != null
                    ? t("statementDaysAfter", { statement: selected.creditLimitDays.statementDay, days: selected.creditLimitDays.dueDaysAfter })
                    : t("statementDays", { statement: selected.creditLimitDays.statementDay, due: selected.creditLimitDays.dueDay ?? "–" })}
                </p>
              ) : null}
              <div className="mt-4">
                <LineChart
                  labels={labels}
                  titles={titles}
                  series={[{ key: "b", label: selected.name, color: selected.liability ? EXPENSE_COLOR : INCOME_COLOR, area: true, values: (history.get(selected.id) ?? []).map((v) => (selected.liability ? -v : v)) }]}
                  format={(v) => f.money(v)}
                  formatAxis={(v) => f.moneyCompact(v)}
                  zeroBased={false}
                  height={220}
                />
              </div>
            </Card>
            <Card title={t("activity")} subtitle={tc("transactions", { count: selected.txCount })}>
              <TxList txs={selectedTxs} pageSize={15} />
            </Card>
          </div>
        ) : (
          <Empty title={t("empty")} />
        )}
      </div>
      {editingAccount !== undefined ? (
        editingAccount.account?.type === "loan" ? (
          <LoanEditor key={editingAccount.account.id} account={editingAccount.account} onClose={() => setEditingAccount(undefined)} />
        ) : (
          <AccountEditor key={editingAccount.account?.id ?? "new"} account={editingAccount.account} presetGroup={editingAccount.group} onClose={() => setEditingAccount(undefined)} />
        )
      ) : null}
      {paying ? <PaySheet key={paying.id} account={paying} onClose={() => setPaying(null)} /> : null}
      {editingGroup !== undefined ? <GroupEditor key={editingGroup?.id ?? "new"} group={editingGroup} onClose={() => setEditingGroup(undefined)} /> : null}
      {accountsPanel === "reorder" ? <AccountsReorderSheet onClose={() => setAccountsPanel(null)} /> : null}
      {accountsPanel === "currencies" ? <CurrenciesSheet onClose={() => setAccountsPanel(null)} /> : null}
    </div>
  );
}

export function NetWorthView() {
  const t = useTranslations("dashboard.netWorth");
  const tc = useTranslations("dashboard.common");
  const { model, resolved } = useDashboard();
  const f = useFormat();
  const groups = useGroups();

  // At least a year, so the trend reads; capped at the present.
  const months = useMemo(() => {
    const end = resolved.focus;
    const start = resolved.months.length >= 12 ? resolved.start : shiftMonthKey(end, -11);
    return monthRange(start < model.firstMonth ? model.firstMonth : start, end);
  }, [resolved, model]);
  const accounts = useMemo(() => model.accounts.filter((a) => a.includeInTotals), [model.accounts]);
  const history = useMemo(() => balanceHistory(model, months, accounts), [model, months, accounts]);
  const { labels, titles } = useMonthLabels(months);

  const assetsSeries = months.map((_, i) => accounts.filter((a) => !a.liability).reduce((s, a) => s + (history.get(a.id)?.[i] ?? 0), 0));
  const debtSeries = months.map((_, i) => accounts.filter((a) => a.liability).reduce((s, a) => s + (history.get(a.id)?.[i] ?? 0), 0));
  const netSeries = months.map((_, i) => assetsSeries[i] + debtSeries[i]);
  const last = netSeries[netSeries.length - 1] ?? 0;
  const first = netSeries[0] ?? 0;
  const changes = netSeries.map((v, i) => (i === 0 ? 0 : v - netSeries[i - 1]));
  const bestIndex = changes.reduce((best, v, i) => (v > changes[best] ? i : best), 0);

  const groupSlices = groups
    .map(([group, list], i) => ({
      key: group || "_",
      label: group || t("ungrouped"),
      value: list.filter((a) => a.includeInTotals && !a.liability).reduce((s, a) => s + a.netBase, 0),
      color: seriesColor(i),
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((s, i) => ({ ...s, color: seriesColor(i) }));
  const assetTotal = groupSlices.reduce((s, x) => s + x.value, 0);
  const hoursOf = (value: number) => hoursAt(model, value);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon="insights/growth-analysis" tone="neutral" label={t("now")} value={f.money(last)} sub={t("inHours", { hours: f.hours(hoursOf(last)) })} />
        <Kpi
          icon="money-time/chart-up"
          tone={last - first >= 0 ? "income" : "expense"}
          label={t("change")}
          value={f.money(last - first, { signed: true })}
          sub={t("since", { month: f.monthLong(months[0]) })}
          delta={<Delta current={last} previous={first} formatPercent={f.percent} />}
        />
        <Kpi icon="status/trophy" tone="income" label={t("bestMonth")} value={months[bestIndex] ? f.money(changes[bestIndex], { signed: true }) : "–"} sub={months[bestIndex] ? f.monthLong(months[bestIndex]) : undefined} />
        <Kpi icon="money-time/card" tone="expense" label={t("debts")} value={f.money(-(debtSeries[debtSeries.length - 1] ?? 0))} sub={t("debtNote")} />
      </div>

      <Card
        title={t("chartTitle")}
        subtitle={t("chartSubtitle")}
        action={
          <Legend
            items={[
              { label: t("assets"), color: INCOME_COLOR },
              { label: t("debts"), color: EXPENSE_COLOR },
              { label: tc("net"), color: NET_COLOR, line: true },
            ]}
          />
        }
      >
        <BarChart
          height={320}
          stacked
          labels={labels}
          titles={titles}
          series={[
            { key: "a", label: t("assets"), color: INCOME_COLOR, values: assetsSeries },
            { key: "d", label: t("debts"), color: EXPENSE_COLOR, values: debtSeries },
          ]}
          line={{ label: tc("net"), color: NET_COLOR, values: netSeries }}
          format={(v) => f.money(v)}
          formatAxis={(v) => f.moneyCompact(v)}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t("mixTitle")} subtitle={t("mixSubtitle")}>
          {groupSlices.length === 0 ? (
            <Empty title={t("empty")} />
          ) : (
            <div className="flex flex-col items-center gap-5 @[480px]:flex-row @[480px]:items-start">
              <Donut
                size={190}
                thickness={28}
                slices={groupSlices}
                format={(v) => f.money(v)}
                percent={f.percent}
                center={<span className="tabular text-[16px] font-extrabold text-foreground">{f.money(assetTotal, { whole: true })}</span>}
              />
              <div className="w-full min-w-0 flex-1 space-y-0.5">
                {groupSlices.map((slice) => (
                  <RankRow
                    key={slice.key}
                    icon={<span className="h-3 w-3 shrink-0 rounded-full" style={{ background: slice.color }} />}
                    name={slice.label}
                    meta={f.percent(assetTotal ? slice.value / assetTotal : 0)}
                    value={f.money(slice.value)}
                    share={assetTotal ? slice.value / assetTotal : 0}
                    color={slice.color}
                  />
                ))}
              </div>
            </div>
          )}
        </Card>
        <Card title={t("monthlyChange")}>
          <BarChart
            height={260}
            labels={labels}
            titles={titles}
            series={[{ key: "c", label: t("change"), color: NET_COLOR, values: changes }]}
            format={(v) => f.money(v, { signed: true })}
            formatAxis={(v) => f.moneyCompact(v)}
          />
        </Card>
      </div>
    </div>
  );
}
