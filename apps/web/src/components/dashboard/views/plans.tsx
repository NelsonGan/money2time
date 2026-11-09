"use client";

/* eslint-disable @next/next/no-img-element -- goal covers are in-memory object URLs */

import { useTranslations } from "next-intl";
import { Fragment, useMemo, useState } from "react";

import { budgetRate, budgetSpendValue, formatFxRate, latestBudgetRate } from "@/lib/backup/budget-currency";
import { DAYS_PER_MONTH, daysBetween, financialMonthRange, parseLocalDate } from "@/lib/backup/dates";
import type { Account, BudgetMonth, Model, RecurringRule, Tx } from "@/lib/backup/model";
import { isRepeatingPattern, recurrenceFrequencyOf } from "@/lib/backup/recurrence";

import { upcomingRules, workdayLength as workdayLengthOf } from "../aggregate";
import { BarChart } from "../charts/bar-chart";
import { EXPENSE_COLOR } from "../charts/scale";
import { Legend } from "../charts/tooltip";
import { BudgetEditBar } from "../edit/budget-editor";
import { Confirm, EditError, newGoalOrLoanLimit, useEditRun } from "../edit/kit";
import { RuleEditor } from "../edit/rule-editor";
import { GoalCardActions, GoalEditor } from "../edit/goal-editor";
import { FREE_MAX_RECURRING_RULES } from "../pro-limits";
import { LoanEditor } from "../edit/loan-editor";
import { EditUnavailable } from "../editing";
import { usePaywall } from "../paywall";
import { hoursAt, offersEdits, useDashboard, useFormat } from "../state";
import { AccountLogo, Card, CategoryGlyph, ClayImg, Empty, Kpi, Pill, Progress, Select, SubscriptionLogo } from "../ui";

/**
 * Counted spending by month, in one pass, for the budget maths. A loan
 * repayment counted as spending depletes its budget line like any expense, as
 * the app's Budget screen has it (`asSpendingRow`).
 */
function expensesByMonth(model: Model): Map<string, Tx[]> {
  const byMonth = new Map<string, Tx[]>();
  for (const tx of model.txs) {
    if (!tx.spending) continue;
    const list = byMonth.get(tx.month);
    if (list) list.push(tx);
    else byMonth.set(tx.month, [tx]);
  }
  return byMonth;
}

/**
 * The app's budget maths (features/budget/lib/budgetMath.ts). Every figure is
 * in the budget's currency: spending in it counts as entered, the rest through
 * the budget's frozen rate (or the latest one); spending with no rate at all
 * is left out and counted in `unconverted`. `rate` is one unit of the
 * budget's currency in the main one (1 for a main-currency budget).
 */
function budgetSummary(model: Model, budget: BudgetMonth, byMonth: Map<string, Tx[]>) {
  const lineIds = new Set(budget.lines.map((l) => l.categoryId));
  const spentBy = new Map<string, number>();
  const rate = budgetRate(budget, model.currency, latestBudgetRate(model));
  let budgeted = 0;
  let unbudgeted = 0;
  let unconverted = 0;
  for (const tx of byMonth.get(budget.month) ?? []) {
    // As in the app, a budget is made of top-level lines: spending counts as
    // budgeted when its top-level category has a line. The app knows only
    // live categories, so spending on a deleted one (a subcategory too) is
    // its own root with no line: unbudgeted.
    const category = tx.categoryId ? model.categories.get(tx.categoryId) : undefined;
    const live = category && !category.deleted ? category : null;
    const root = live ? (live.parentId ?? live.id) : null;
    // A counted transfer's size is its amount, whatever its sign as stored.
    const original = tx.type === "transfer" ? Math.abs(tx.originalAmount) : tx.originalAmount;
    const value = budgetSpendValue({ amount: tx.amount, original, currency: tx.currency }, budget.currency, rate);
    if (value === null) {
      // Only spending that would count toward this budget is worth a mention.
      if ((root && lineIds.has(root)) || budget.countUnbudgeted) unconverted += 1;
      continue;
    }
    if (root && lineIds.has(root)) budgeted += value;
    else unbudgeted += value;
    if (live) spentBy.set(live.id, (spentBy.get(live.id) ?? 0) + value);
  }
  const lines = budget.lines.map((line) => {
    const category = model.categories.get(line.categoryId)!;
    // A line on a top-level category rolls up its subcategories.
    const spent = category.parentId
      ? (spentBy.get(category.id) ?? 0)
      : (spentBy.get(category.id) ?? 0) + category.children.reduce((s, id) => s + (spentBy.get(id) ?? 0), 0);
    return { category, amount: line.amount, spent, remaining: line.amount - spent, ratio: line.amount ? spent / line.amount : 0 };
  });
  const totalSpent = budgeted + (budget.countUnbudgeted ? unbudgeted : 0);
  return { lines, totalSpent, unbudgeted, total: budget.total, rate, unconverted };
}

export function BudgetsView() {
  const t = useTranslations("dashboard.budgets");
  const { model, resolved, link } = useDashboard();
  const f = useFormat();
  const available = model.budgets;
  const fallback =
    available.find((b) => b.month === resolved.focus) ??
    [...available].reverse().find((b) => b.month <= model.currentMonth) ??
    available[available.length - 1];
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const budget = available.find((b) => b.month === monthKey) ?? fallback ?? null;
  const byMonth = useMemo(() => expensesByMonth(model), [model]);
  const summary = useMemo(() => (budget ? budgetSummary(model, budget, byMonth) : null), [model, budget, byMonth]);
  // In the main currency, so months budgeted in different currencies compare;
  // a month whose currency has no rate at all is left out.
  const history = useMemo(
    () =>
      available.flatMap((b) => {
        const s = budgetSummary(model, b, byMonth);
        return s.rate === null ? [] : [{ month: b.month, total: b.total * s.rate, spent: s.totalSpent * s.rate }];
      }),
    [model, available, byMonth],
  );
  const historyForeign = available.some((b) => b.currency !== null);
  const canEdit = offersEdits(link.editing);
  const editBar = canEdit ? <BudgetEditBar key={budget?.id ?? monthKey} budget={budget} month={monthKey} onShowMonth={setMonthKey} /> : <EditUnavailable state={link.editing} />;

  if (!budget || !summary) {
    return (
      <div className="space-y-5">
        {editBar}
        <Card>
          <Empty title={t("emptyTitle")} body={t("emptyBody")} mascot="thinking" />
        </Card>
      </div>
    );
  }

  const { start, end } = financialMonthRange(budget.month, model.cycle);
  const length = daysBetween(start, end) + 1;
  const elapsed = Math.max(0, Math.min(length, daysBetween(start, model.today) + 1));
  const pace = budget.month < model.currentMonth ? 1 : budget.month > model.currentMonth ? 0 : elapsed / length;
  const remaining = summary.total - summary.totalSpent;
  // A budget's hours are at its own month's wage, of what it is worth in the main currency.
  const rate = summary.rate;
  const hrs = (v: number) => hoursAt(model, v * (rate ?? 0), budget.month);
  // Every money figure of the budget is in its own currency; with no rate to
  // the main one there are no hours to show, so the money stands in.
  const code = budget.currency;
  const val = (v: number) => (rate === null ? f.moneyIn(v, code) : f.valueIn({ money: v, hours: hrs(v) }, code));

  return (
    <div className="space-y-5">
      {editBar}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[13px] font-bold text-foreground-soft" htmlFor="budget-month">
          {t("month")}
        </label>
        <Select id="budget-month" value={budget.month} onChange={(e) => setMonthKey(e.target.value)}>
          {[...available].reverse().map((b) => (
            <option key={b.month} value={b.month}>
              {f.monthLong(b.month)}
            </option>
          ))}
        </Select>
        {budget.name ? <Pill tone="brand">{budget.name}</Pill> : null}
        {code ? <Pill tone="neutral">{code}</Pill> : null}
      </div>

      {code ? (
        <p className="rounded-2xl bg-surface-muted px-4 py-3 text-[13px] text-foreground-soft">
          {summary.rate !== null ? t("rateNote", { currency: code, rate: formatFxRate(summary.rate, f.locale), main: model.currency }) : null}
          {summary.rate !== null && remaining !== 0 ? ` ${t(remaining > 0 ? "approxLeft" : "approxOver", { amount: f.money(Math.abs(remaining) * summary.rate) })}` : null}
          {summary.unconverted > 0 ? `${summary.rate !== null ? " " : ""}${t("unconverted", { count: summary.unconverted, currency: code })}` : null}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon="settings/budget" tone="neutral" label={t("budget")} value={val(summary.total)} sub={f.monthLong(budget.month)} />
        <Kpi icon="money-time/wallet-out" tone="expense" label={t("spent")} value={val(summary.totalSpent)} sub={t("ofBudget", { pct: f.percent(summary.total ? summary.totalSpent / summary.total : 0) })} />
        <Kpi
          icon={remaining >= 0 ? "insights/piggy-bank-coins" : "status/warning"}
          tone={remaining >= 0 ? "income" : "expense"}
          label={remaining >= 0 ? t("left") : t("over")}
          value={val(Math.abs(remaining))}
          sub={pace > 0 && pace < 1 ? t("perDayLeft", { amount: val(Math.max(0, remaining) / Math.max(1, length - elapsed + 1)) }) : undefined}
        />
        <Kpi icon="money-time/calendar-clock" tone="neutral" label={t("pace")} value={f.percent(pace)} sub={t("paceNote", { day: elapsed, days: length })} />
      </div>

      <Card title={t("linesTitle")} subtitle={t("linesSubtitle")}>
        <div className="mb-4">
          <div className="mb-1.5 flex items-baseline justify-between text-[13px] font-bold text-foreground">
            <span>{t("overall")}</span>
            <span className="tabular">
              {val(summary.totalSpent)} / {val(summary.total)}
            </span>
          </div>
          <Progress ratio={summary.total ? summary.totalSpent / summary.total : 0} color={summary.totalSpent > summary.total ? "#D45F57" : summary.totalSpent / Math.max(1, summary.total) > pace ? "#E39A1E" : "#1E9468"} marker={pace} />
        </div>
        <ul className="grid gap-x-8 gap-y-4 md:grid-cols-2">
          {summary.lines.map((line) => {
            const over = line.remaining < 0;
            const ahead = !over && line.ratio > pace + 0.05;
            return (
              <li key={line.category.id}>
                <div className="flex items-center gap-2.5">
                  <CategoryGlyph icon={line.category.icon} name={line.category.name} color={line.category.color} size={28} />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-foreground">{line.category.name}</span>
                  <span className="tabular text-[13px] font-bold text-foreground">
                    {val(line.spent)}
                    <span className="font-semibold text-foreground-muted"> / {val(line.amount)}</span>
                  </span>
                </div>
                <div className="mt-2">
                  <Progress ratio={line.ratio} color={over ? "#D45F57" : ahead ? "#E39A1E" : "#1E9468"} marker={pace} />
                </div>
                <p className={`mt-1 text-[12px] font-semibold ${over ? "text-error" : "text-foreground-soft"}`}>
                  {over ? t("overBy", { amount: val(-line.remaining) }) : t("leftOf", { amount: val(line.remaining) })}
                  {ahead ? ` · ${t("aheadOfPace")}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
        {summary.unbudgeted > 0 ? (
          <p className="mt-5 rounded-2xl bg-surface-muted px-4 py-3 text-[13px] text-foreground-soft">
            {budget.countUnbudgeted
              ? t("unbudgetedCounted", { amount: val(summary.unbudgeted) })
              : t("unbudgetedNot", { amount: val(summary.unbudgeted) })}
          </p>
        ) : null}
      </Card>

      {history.length > 1 ? (
        <Card
          title={t("historyTitle")}
          subtitle={historyForeign ? t("historyInMain", { currency: model.currency }) : undefined}
          action={
            <Legend
              items={[
                { label: t("budget"), color: "#D8D2C3" },
                { label: t("spent"), color: EXPENSE_COLOR },
              ]}
            />
          }
        >
          <BarChart
            height={240}
            labels={history.map((h) => f.monthShort(h.month))}
            titles={history.map((h) => f.monthLong(h.month))}
            series={[
              // Already in the main currency: each month's hours at its own wage.
              { key: "b", label: t("budget"), color: "#D8D2C3", values: history.map((h) => f.pick({ money: h.total, hours: hoursAt(model, h.total, h.month) })) },
              { key: "s", label: t("spent"), color: EXPENSE_COLOR, values: history.map((h) => f.pick({ money: h.spent, hours: hoursAt(model, h.spent, h.month) })) },
            ]}
            format={(v) => f.plain(v)}
            formatAxis={f.axis}
            onSelect={(i) => setMonthKey(history[i].month)}
          />
        </Card>
      ) : null}
    </div>
  );
}

export function RecurringView() {
  const t = useTranslations("dashboard.recurring");
  const te = useTranslations("dashboard.edit");
  const tr = useTranslations("dashboard.edit.rule");
  const paywall = usePaywall();
  const { model, fullModel, link } = useDashboard();
  const f = useFormat();
  const { run, busy, error, ready } = useEditRun();
  const canEdit = offersEdits(link.editing);
  // undefined: closed; null: a new rule.
  const [editing, setEditing] = useState<RecurringRule | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<string | null>(null);
  // As the app's create button: the free plan stops at its limit before the form opens.
  const openNew = () => {
    if (!link.pro && fullModel.recurring.length >= FREE_MAX_RECURRING_RULES) paywall("recurring");
    else setEditing(null);
  };
  const hrs = (v: number) => hoursAt(model, v);

  const active = model.recurring.filter((r) => r.active).sort((a, b) => b.monthlyBase - a.monthlyBase);
  const paused = model.recurring.filter((r) => !r.active);
  const spending = active.filter((r) => r.counts);
  const monthly = spending.reduce((s, r) => s + r.monthlyBase, 0);
  const upcoming = upcomingRules(model, 10);

  // "Each workday you work until…": the fixed bills, spread over workdays.
  const workdays = 21.67;
  const perWorkday = hrs(monthly) / workdays;
  const workdayLength = workdayLengthOf(model);
  const clock = new Date(2000, 0, 1, 9, 0);
  clock.setMinutes(clock.getMinutes() + Math.round(perWorkday * 60));
  const clockText = f.time(clock);

  const cadence = (pattern: string, interval: number) => {
    if (!isRepeatingPattern(pattern)) return pattern;
    const choice = recurrenceFrequencyOf(pattern, interval);
    return choice.frequency === "quarterly" || choice.frequency === "semiannually"
      ? tr(choice.frequency)
      : t(`cadence.${pattern}`, { count: interval });
  };

  const toggle = (rule: RecurringRule) => {
    if (!ready || busy) return;
    void run([{ entity: "recurring", op: "update", id: rule.id, at: rule.updatedAt, set: { isActive: !rule.active } }], "recurring_update");
  };
  const remove = async (rule: RecurringRule) => {
    if (!ready || busy) return;
    if (await run([{ entity: "recurring", op: "delete", id: rule.id, at: rule.updatedAt }], "recurring_delete")) setDeleting(null);
  };

  /** The row's pause or resume and delete buttons, and the app's delete question under it. */
  const actions = (rule: RecurringRule) =>
    canEdit ? (
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => toggle(rule)}
          disabled={!ready || busy}
          aria-label={rule.active ? tr("pause") : tr("resume")}
          title={rule.active ? tr("pause") : tr("resume")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-foreground-soft hover:bg-background-subtle hover:text-foreground disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" width={15} height={15} fill="currentColor" aria-hidden="true">
            {rule.active ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />}
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setDeleting(rule.id)}
          disabled={busy}
          aria-label={tr("deleteRule")}
          title={tr("deleteRule")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-error-soft disabled:opacity-40"
        >
          <ClayImg name="ui/trash" size={16} />
        </button>
      </div>
    ) : null;
  const confirm = (rule: RecurringRule) =>
    deleting === rule.id ? (
      <li className="list-none py-2">
        <Confirm
          title={tr("deleteRule")}
          body={tr("deleteConfirm", { name: rule.name })}
          actions={[
            { label: te("cancel"), onClick: () => setDeleting(null) },
            { label: te("delete"), tone: "danger", onClick: () => void remove(rule), disabled: !ready || busy },
          ]}
        />
      </li>
    ) : null;

  const toolbar = canEdit ? (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <button
        type="button"
        onClick={openNew}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-[13.5px] font-extrabold text-card shadow-[var(--shadow-soft)] hover:bg-primary-dark"
      >
        <ClayImg name="ui/plus" size={16} />
        {tr("newRule")}
      </button>
    </div>
  ) : (
    <EditUnavailable state={link.editing} />
  );
  const editor = editing !== undefined ? <RuleEditor rule={editing} onClose={() => setEditing(undefined)} /> : null;

  if (model.recurring.length === 0) {
    return (
      <div className="space-y-5">
        {toolbar}
        <Card>
          <Empty title={t("emptyTitle")} body={t("emptyBody")} mascot="thinking" />
        </Card>
        {editor}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {toolbar}
      <EditError message={error} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon="settings/recurring" tone="expense" label={t("perMonth")} value={f.value({ money: monthly, hours: hrs(monthly) })} sub={f.other({ money: monthly, hours: hrs(monthly) })} />
        <Kpi icon="money-time/calendar-clock" tone="expense" label={t("perYear")} value={f.value({ money: monthly * 12, hours: hrs(monthly * 12) })} sub={f.other({ money: monthly * 12, hours: hrs(monthly * 12) })} />
        <Kpi icon="money-time/alarm-clock-coin" tone="neutral" label={t("clockTitle")} value={clockText} sub={t("clockNote", { hours: f.hours(perWorkday), day: f.hours(workdayLength) })} />
        <Kpi icon="ui/checklist" tone="neutral" label={t("active")} value={f.number(active.length)} sub={t("pausedCount", { count: paused.length })} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title={t("listTitle")} subtitle={t("listSubtitle")}>
          <ul className="divide-y divide-border/60">
            {active.map((rule) => {
              const category = rule.categoryId ? model.categories.get(rule.categoryId) : null;
              const account = rule.accountId ? model.accountById.get(rule.accountId) : null;
              const body = (
                <>
                  <SubscriptionLogo logoId={rule.logoId} name={rule.name} size={36} fallbackIcon={category?.icon} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold text-foreground">{rule.name}</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-foreground-soft">
                      {cadence(rule.pattern, rule.interval)}
                      {rule.nextRun ? <span>· {t("next", { date: f.date(rule.nextRun) })}</span> : null}
                      {account ? <span className="inline-flex items-center gap-1">· <AccountLogo logoId={account.logoId} name={account.name} size={14} />{account.name}</span> : null}
                      {!rule.counts ? <Pill>{t("transfer")}</Pill> : null}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-[14px] font-extrabold text-foreground">{f.value({ money: rule.amountBase, hours: hrs(rule.amountBase) })}</p>
                    <p className="tabular text-[12px] text-foreground-muted">{t("yearHours", { hours: f.hours(hrs(rule.monthlyBase * 12)) })}</p>
                  </div>
                </>
              );
              return (
                <Fragment key={rule.id}>
                  <li className="flex items-center gap-2 py-2.5">
                    {canEdit ? (
                      <button type="button" onClick={() => setEditing(rule)} aria-label={`${tr("editRule")}: ${rule.name}`} className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-1 text-left transition-colors hover:bg-background-subtle/70">
                        {body}
                      </button>
                    ) : (
                      <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
                    )}
                    {actions(rule)}
                  </li>
                  {confirm(rule)}
                </Fragment>
              );
            })}
          </ul>
          {!active.length ? <p className="py-4 text-center text-[13px] text-foreground-muted">{t("pausedCount", { count: paused.length })}</p> : null}
        </Card>

        <div className="space-y-5">
          {upcoming.length ? (
            <Card title={t("upcomingTitle")}>
              <ol className="relative space-y-3 border-l-2 border-border pl-4">
                {upcoming.map((rule) => (
                  <li key={rule.id} className="relative">
                    <span className="absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-card bg-primary" aria-hidden="true" />
                    <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-foreground-muted">{f.date(rule.nextRun!, "medium")}</p>
                    <p className="flex items-baseline justify-between gap-3 text-[14px] font-bold text-foreground">
                      <span className="truncate">{rule.name}</span>
                      <span className="tabular shrink-0">{f.value({ money: rule.amountBase, hours: hrs(rule.amountBase) })}</span>
                    </p>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
          {paused.length ? (
            <Card title={t("pausedTitle")}>
              <ul className="space-y-2">
                {paused.map((rule) => {
                  const body = (
                    <>
                      <SubscriptionLogo logoId={rule.logoId} name={rule.name} size={28} />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-foreground">{rule.name}</span>
                      <span className="tabular text-[13px] text-foreground-soft">{f.money(rule.amountBase)}</span>
                    </>
                  );
                  return (
                    <Fragment key={rule.id}>
                      <li className="flex items-center gap-2">
                        {canEdit ? (
                          <button type="button" onClick={() => setEditing(rule)} aria-label={`${tr("editRule")}: ${rule.name}`} className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-1 text-left opacity-70 transition hover:bg-background-subtle/70 hover:opacity-100">
                            {body}
                          </button>
                        ) : (
                          <div className="flex min-w-0 flex-1 items-center gap-3 opacity-70">{body}</div>
                        )}
                        {actions(rule)}
                      </li>
                      {confirm(rule)}
                    </Fragment>
                  );
                })}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
      {editor}
    </div>
  );
}

export function GoalsView() {
  const t = useTranslations("dashboard.goals");
  const tg = useTranslations("dashboard.edit.goal");
  const tl = useTranslations("dashboard.edit.loan");
  const paywall = usePaywall();
  const { model, fullModel, asset, link, mode } = useDashboard();
  const f = useFormat();
  // A goal or loan in another currency shows in it; its hours are worked out
  // from the amount converted to the main currency.
  const amount = (account: Account, value: number) => (account.currency !== model.currency ? f.foreign(value, account.currency) : f.money(value));
  const hrs = (account: Account, value: number) => hoursAt(model, model.toBase(value, account.currency) ?? value);
  const goals = model.accounts.filter((a) => a.goal && a.type === "goal");
  const loans = model.accounts.filter((a) => a.loan);
  const canEdit = offersEdits(link.editing);
  // undefined: closed; null: a new one; else the account as it was when the sheet opened,
  // so a draft is saved against the copy it was made from.
  const [editingGoal, setEditingGoal] = useState<Account | null | undefined>(undefined);
  const [editingLoan, setEditingLoan] = useState<Account | null | undefined>(undefined);
  // The free plan's limit, checked before a new one's form opens, as the app's add buttons do.
  const openNew = (kind: "goal" | "loan") => {
    const reached = link.pro ? null : newGoalOrLoanLimit(fullModel, kind);
    if (reached) {
      paywall(reached);
      return;
    }
    if (kind === "goal") setEditingGoal(null);
    else setEditingLoan(null);
  };
  const open = (kind: "goal" | "loan", id: string) => {
    const account = fullModel.accountById.get(id);
    if (!account) return;
    if (kind === "goal") setEditingGoal(account);
    else setEditingLoan(account);
  };
  // A row gone on the phone (deleted there) closes its sheet rather than turning it into a new one.
  const goalGone = Boolean(editingGoal && !fullModel.accountById.has(editingGoal.id));
  const loanGone = Boolean(editingLoan && !fullModel.accountById.has(editingLoan.id));
  const editors = (
    <>
      {editingGoal !== undefined && !goalGone ? <GoalEditor key={editingGoal?.id ?? "new"} account={editingGoal} onClose={() => setEditingGoal(undefined)} /> : null}
      {editingLoan !== undefined && !loanGone ? <LoanEditor key={editingLoan?.id ?? "new"} account={editingLoan} onClose={() => setEditingLoan(undefined)} /> : null}
    </>
  );
  const toolbar = canEdit ? (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {[
        { label: tg("newGoal"), open: () => openNew("goal") },
        { label: tl("newTitle"), open: () => openNew("loan") },
      ].map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.open}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-[13.5px] font-extrabold text-card shadow-[var(--shadow-soft)] hover:bg-primary-dark"
        >
          <ClayImg name="ui/plus" size={16} />
          {action.label}
        </button>
      ))}
    </div>
  ) : (
    <EditUnavailable state={link.editing} />
  );
  const editButton = (label: string, onClick: () => void) =>
    canEdit ? (
      <button type="button" onClick={onClick} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-[13px] font-bold text-foreground-soft hover:bg-background-subtle hover:text-foreground">
        <ClayImg name="ui/pencil" size={15} />
        {label}
      </button>
    ) : null;

  if (goals.length === 0 && loans.length === 0) {
    return (
      <div className="space-y-5">
        {toolbar}
        <Card>
          <Empty title={t("emptyTitle")} body={t("emptyBody")} mascot="thinking" />
        </Card>
        {editors}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toolbar}
      {goals.length ? (
        <section>
          <h2 className="mb-3 text-[18px] font-extrabold text-foreground">{t("goalsTitle")}</h2>
          <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
            {goals.map((account) => {
              const goal = account.goal!;
              const saved = account.balance;
              // As the app's goal card: past 100% once the goal is beaten.
              const ratio = goal.target > 0 ? Math.max(0, saved) / goal.target : 0;
              const left = Math.max(0, goal.target - saved);
              // A bare date is a local day, not UTC midnight (which is the day before, west of UTC).
              const target = parseLocalDate(goal.targetDate);
              // The app's goal maths: whole days to the date in fractional
              // months, and with no time left (the date passed) the whole remainder.
              const monthsLeft = target ? daysBetween(model.today, target) / DAYS_PER_MONTH : null;
              const perMonth = monthsLeft === null ? null : monthsLeft > 0 ? left / monthsLeft : left;
              const cover = asset(goal.coverUri);
              return (
                <article key={account.id} className="card-surface overflow-hidden rounded-[22px]">
                  <div className="relative h-32 bg-gradient-to-br from-primary-soft via-accent-soft to-success-soft">
                    {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : null}
                    <span className="absolute left-4 top-4">
                      {goal.emoji ? <CategoryGlyph icon={goal.emoji} name={account.name} size={40} /> : <ClayImg name="status/goal-target" size={40} />}
                    </span>
                    {goal.achieved ? (
                      <span className="absolute right-4 top-4">
                        <Pill tone="good">{t("achieved")}</Pill>
                      </span>
                    ) : null}
                  </div>
                  <div className="p-5">
                    <h3 className="flex min-w-0 items-center gap-2 text-[16px] font-extrabold text-foreground">
                      <span className="truncate">{account.name}</span>
                      {goal.archived ? <Pill>{tg("archived")}</Pill> : null}
                    </h3>
                    <p className="tabular mt-1 text-[22px] font-extrabold text-foreground">
                      {amount(account, saved)} <span className="text-[14px] font-semibold text-foreground-muted">/ {amount(account, goal.target)}</span>
                    </p>
                    <div className="mt-3">
                      <Progress ratio={ratio} color={goal.achieved ? "#1E9468" : "#B1525F"} />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
                      <div>
                        <dt className="text-foreground-muted">{t("left")}</dt>
                        <dd className="tabular font-bold text-foreground">{mode === "hours" ? f.hours(hrs(account, left)) : amount(account, left)}</dd>
                      </div>
                      <div>
                        <dt className="text-foreground-muted">{t("progress")}</dt>
                        <dd className="tabular font-bold text-foreground">{f.percent(ratio)}</dd>
                      </div>
                      {target && perMonth !== null && left > 0 && !goal.achieved ? (
                        <div className="col-span-2">
                          <dt className="text-foreground-muted">{t("byDate", { date: f.date(target) })}</dt>
                          <dd className="tabular font-bold text-foreground">{t("perMonthNeeded", { amount: amount(account, perMonth) })}</dd>
                        </div>
                      ) : null}
                    </dl>
                    {canEdit ? (
                      <div className="mt-4">
                        <GoalCardActions account={fullModel.accountById.get(account.id) ?? account} onEdit={() => open("goal", account.id)} />
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {loans.length ? (
        <section>
          <h2 className="mb-3 text-[18px] font-extrabold text-foreground">{t("loansTitle")}</h2>
          <div className="grid gap-5 lg:grid-cols-2">
            {loans.map((account) => {
              const loan = account.loan!;
              return (
                <Card key={account.id} title={account.name} subtitle={t(`model.${loan.interestModel}`)} action={<AccountLogo logoId={account.logoId} name={account.name} size={36} />}>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-[12.5px] font-semibold text-foreground-soft">{t("leftToPay")}</p>
                      <p className="tabular text-[28px] font-extrabold tracking-[-0.02em] text-foreground">{amount(account, loan.leftToPay)}</p>
                      <p className="text-[12.5px] text-foreground-soft">{t("leftInHours", { hours: f.hours(hrs(account, loan.leftToPay)) })}</p>
                    </div>
                    {loan.isPaidOff ? <Pill tone="good">{t("paidOff")}</Pill> : null}
                  </div>
                  <div className="mt-4">
                    <Progress ratio={loan.progressRatio} color="#1E9468" />
                    <p className="mt-1.5 text-[12px] font-semibold text-foreground-soft">
                      {loan.instalmentsTotal != null && loan.instalmentsPaid != null
                        ? t("instalments", { paid: loan.instalmentsPaid, total: loan.instalmentsTotal })
                        : f.percent(loan.progressRatio)}
                    </p>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-3">
                    <Stat label={t("principal")} value={amount(account, loan.principal)} />
                    <Stat label={t("owedNow")} value={amount(account, loan.remaining)} />
                    {loan.paidSoFar != null ? <Stat label={t("paidSoFar")} value={amount(account, loan.paidSoFar)} /> : null}
                    {loan.monthlyPayment ? <Stat label={t("monthly")} value={amount(account, loan.monthlyPayment)} /> : null}
                    {loan.rate != null ? <Stat label={t("rate")} value={f.rate(loan.rate)} /> : null}
                    {loan.interestCharged > 0 ? <Stat label={t("interestCharged")} value={amount(account, loan.interestCharged)} /> : null}
                    {loan.nextDueDate ? <Stat label={t("nextDue")} value={f.day(loan.nextDueDate)} /> : null}
                    {loan.projectedPayoffDate ? <Stat label={t("payoff")} value={f.day(loan.projectedPayoffDate)} /> : null}
                    {loan.paymentsRemaining != null ? <Stat label={t("paymentsLeft")} value={f.number(loan.paymentsRemaining)} /> : null}
                  </dl>
                  {canEdit ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {editButton(tl("edit"), () => open("loan", account.id))}
                      {loan.archived ? <Pill>{tl("archived")}</Pill> : null}
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}
      <p className="text-[12.5px] text-foreground-muted">{t("netNote")}</p>
      {editors}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="tabular font-bold text-foreground">{value}</dd>
    </div>
  );
}
