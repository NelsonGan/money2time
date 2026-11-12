"use client";

import { useTranslations } from "next-intl";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import type { Tx } from "@/lib/backup/model";
import { withPaybackRows } from "@/lib/backup/paybacks";

import { accountOptions, categoryOptions, Dropdown, type MenuOption } from "../dropdown";
import { SentimentIcon } from "../edit/kit";
import { TxEditor } from "../edit/tx-editor";
import { BulkToolbar, EditUnavailable } from "../editing";
import { offersEdits, useDashboard, useFormat, usePeriodTxs } from "../state";
import { AccountLogo, Card, CategoryGlyph, ClayImg, Empty, Pill } from "../ui";

type TypeFilter = "all" | "expense" | "income" | "transfer";

export function TransactionsView() {
  const t = useTranslations("dashboard.transactions");
  const tc = useTranslations("dashboard.common");
  const te = useTranslations("dashboard.edit");
  const { model, link, resolved } = useDashboard();
  const f = useFormat();
  const { current: stored } = usePeriodTxs();
  // Paybacks into a bill's own account have no transaction of their own; the
  // list shows them as rows, as the app does (`model.paybackRows`).
  const current = useMemo(
    () => withPaybackRows(stored, model.paybackRows.filter((tx) => resolved.monthSet.has(tx.month))),
    [stored, model.paybackRows, resolved],
  );
  // Selecting and editing show only while changes can reach the phone.
  const editable = offersEdits(link.editing);
  const ready = link.editing === "ready";
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  /** The entry in the editor: a row, or null for a new one; undefined when closed. */
  const [editing, setEditing] = useState<Tx | null | undefined>(undefined);

  const [query, setQuery] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [category, setCategory] = useState("");
  const [account, setAccount] = useState("");
  const [sentiment, setSentiment] = useState("");
  const deferred = useDeferredValue(query);

  const filtered = useMemo(() => {
    const needle = deferred.trim().toLocaleLowerCase();
    return current.filter((tx) => {
      if (type === "expense" && tx.type !== "expense") return false;
      if (type === "income" && tx.type !== "income") return false;
      if (type === "transfer" && tx.type !== "transfer") return false;
      if (category && tx.categoryId !== category && tx.parentId !== category) return false;
      if (account && tx.accountId !== account && tx.fromAccountId !== account && tx.toAccountId !== account) return false;
      if (sentiment && tx.sentiment !== sentiment) return false;
      if (needle) {
        const cat = tx.categoryId ? model.categories.get(tx.categoryId)?.name : "";
        const hay = `${tx.note} ${cat ?? ""} ${tx.originalAmount}`.toLocaleLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [current, deferred, type, category, account, sentiment, model]);

  const sum = useMemo(() => {
    let spend = { money: 0, hours: 0 };
    let income = { money: 0, hours: 0 };
    for (const tx of filtered) {
      if (tx.spending) spend = { money: spend.money + tx.amount, hours: spend.hours + tx.hours };
      if (tx.earning) income = { money: income.money + tx.amount, hours: income.hours + tx.hours };
    }
    return { spend, income };
  }, [filtered]);

  // Only rows on screen count: a filter change leaves hidden ones out of a bulk change.
  const selected = useMemo(() => (picked.size ? filtered.filter((tx) => picked.has(tx.id)) : []), [filtered, picked]);
  // A payback row is not a stored transaction, so it is never ticked.
  const selectable = useMemo(() => filtered.filter((tx) => tx.payback !== "row"), [filtered]);
  // A shift-click ticks or unticks every row between it and the last one clicked, as lists on the web do.
  const anchor = useRef<string | null>(null);
  const toggle = (id: string, range: boolean) => {
    const on = !picked.has(id);
    const from = range && anchor.current ? selectable.findIndex((tx) => tx.id === anchor.current) : -1;
    const to = selectable.findIndex((tx) => tx.id === id);
    const ids = from >= 0 && to >= 0 ? selectable.slice(Math.min(from, to), Math.max(from, to) + 1).map((tx) => tx.id) : [id];
    anchor.current = id;
    setPicked((current) => {
      const next = new Set(current);
      for (const rowId of ids) {
        if (on) next.add(rowId);
        else next.delete(rowId);
      }
      return next;
    });
  };
  // Select all ticks the rows on the page showing, as many as one can see.
  const [visibleRows, setVisible] = useState<Tx[]>([]);
  const visible = useMemo(() => visibleRows.filter((tx) => tx.payback !== "row"), [visibleRows]);
  const allPicked = visible.length > 0 && visible.every((tx) => picked.has(tx.id));
  const somePicked = selected.length > 0 && !allPicked;
  const headerBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = somePicked;
  }, [somePicked]);
  // Escape clears the selection, unless it closed a menu or an editor first.
  const anySelected = selected.length > 0;
  useEffect(() => {
    if (!anySelected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("[data-sheet]")) return;
      setPicked(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anySelected]);
  const togglePage = () =>
    setPicked((current) => {
      const next = new Set(current);
      for (const tx of visible) {
        if (allPicked) next.delete(tx.id);
        else next.add(tx.id);
      }
      return next;
    });

  const categoryChoices = useMemo<MenuOption[]>(
    () => [
      { value: "", label: t("allCategories"), icon: <ClayImg name="ui/checklist" size={20} /> },
      ...categoryOptions(model, ["expense", "income"], { expense: te("expense"), income: te("income") }),
    ],
    [model, t, te],
  );
  const accountChoices = useMemo<MenuOption[]>(
    () => [
      { value: "", label: t("allAccounts"), icon: <ClayImg name="settings/accounts" size={20} /> },
      ...accountOptions(model, { ungrouped: te("ungrouped"), goals: te("savingsGoals") }),
    ],
    [model, t, te],
  );
  const typeOptions: MenuOption[] = [
    { value: "all", label: t("types.all"), icon: <ClayImg name="money-time/coins-stack" size={20} /> },
    { value: "expense", label: t("types.expense"), icon: <ClayImg name="money-time/wallet-out" size={20} /> },
    { value: "income", label: t("types.income"), icon: <ClayImg name="money-time/wallet-in" size={20} /> },
    { value: "transfer", label: t("types.transfer"), icon: <ClayImg name="money-time/transfer" size={20} /> },
  ];
  const feelingOptions: MenuOption[] = [
    { value: "", label: t("allFeelings"), icon: <ClayImg name="sentiment/neutral" size={20} className="opacity-50" /> },
    ...(["happy", "neutral", "sad"] as const).map((value) => ({ value, label: t(`feelings.${value}`), icon: <SentimentIcon value={value} size={20} /> })),
  ];

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">{t("search")}</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
              <ClayImg name="ui/search" size={18} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search")}
              className="h-10 w-full rounded-full border border-border bg-card pl-9 pr-4 text-[14px] text-foreground shadow-[var(--shadow-soft)] outline-none focus:border-primary"
            />
          </label>
          <Dropdown label={t("type")} value={type} onChange={(next) => setType(next as TypeFilter)} options={typeOptions} width={220} />
          <Dropdown label={t("category")} value={category} onChange={setCategory} options={categoryChoices} searchable className="max-w-[240px]" width={300} />
          <Dropdown label={t("account")} value={account} onChange={setAccount} options={accountChoices} searchable className="max-w-[220px]" width={280} />
          <Dropdown label={t("feeling")} value={sentiment} onChange={setSentiment} options={feelingOptions} align="right" width={220} />
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[13.5px] text-foreground-soft">
          <span>{tc("transactions", { count: filtered.filter((tx) => tx.payback !== "row").length })}</span>
          <span>
            {tc("spending")}: <strong className="tabular text-foreground">{f.value(sum.spend)}</strong>
          </span>
          <span>
            {tc("income")}: <strong className="tabular text-foreground">{f.value(sum.income)}</strong>
          </span>
        </div>
      </Card>

      <EditUnavailable state={link.editing} />

      <Card>
        {editable ? (
          <div
            className={`sticky top-0 z-20 -mx-2 lg:top-[var(--dashboard-topbar,0px)] mb-3 flex min-h-[52px] flex-wrap items-center gap-3 rounded-2xl px-2 py-1.5 transition-colors ${
              anySelected ? "bg-primary-soft/60 ring-1 ring-primary/20" : "border-b border-border/60"
            }`}
          >
            <label className="flex cursor-pointer items-center gap-2 pl-1 text-[13px] font-bold text-foreground-soft">
              <input
                ref={headerBox}
                type="checkbox"
                checked={allPicked}
                onChange={togglePage}
                disabled={!selectable.length}
                aria-label={te("selectAll")}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              {anySelected ? null : te("selectAll")}
            </label>
            {anySelected ? (
              <BulkToolbar
                selected={selected}
                onClear={() => {
                  setPicked(new Set());
                  // The toolbar goes with the selection; keep the keyboard in the list's header.
                  requestAnimationFrame(() => headerBox.current?.focus());
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={!ready}
                className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-extrabold text-card shadow-[var(--shadow-soft)] hover:bg-primary-dark disabled:opacity-50"
              >
                <ClayImg name="ui/plus" size={16} />
                {te("add")}
              </button>
            )}
          </div>
        ) : null}
        <TxList
          txs={filtered}
          pageSize={50}
          selection={editable ? { picked, toggle, open: (tx) => setEditing(tx), enabled: ready } : undefined}
          onPage={setVisible}
        />
      </Card>
      {editing !== undefined ? <TxEditor key={editing?.id ?? "new"} tx={editing} onClose={() => setEditing(undefined)} /> : null}
    </div>
  );
}

/** Ticking rows and opening one in the editor, on the Transactions page while the phone is connected. */
type Selection = {
  picked: Set<string>;
  /** `range`: a shift-click, which takes in the rows since the last one clicked. */
  toggle: (id: string, range: boolean) => void;
  open: (tx: Tx) => void;
  /** False while a change is saving or the changed data is on its way. */
  enabled: boolean;
};

/** A paged list of transactions, grouped by day; with `selection`, rows can be ticked and opened to edit. */
export function TxList({ txs, pageSize = 30, selection, onPage }: { txs: Tx[]; pageSize?: number; selection?: Selection; onPage?: (rows: Tx[]) => void }) {
  const t = useTranslations("dashboard.transactions");
  const te = useTranslations("dashboard.edit");
  const tc = useTranslations("dashboard.common");
  const { model } = useDashboard();
  const f = useFormat();
  const pages = Math.max(1, Math.ceil(txs.length / pageSize));
  // A new list (another filter, another category) starts from its first page.
  const [paging, setPaging] = useState<{ list: Tx[]; page: number }>({ list: txs, page: 0 });
  const page = paging.list === txs ? Math.min(paging.page, pages - 1) : 0;
  const setPage = (update: (current: number) => number) => setPaging({ list: txs, page: update(page) });

  const slice = useMemo(() => txs.slice(page * pageSize, page * pageSize + pageSize), [txs, page, pageSize]);
  useEffect(() => onPage?.(slice), [onPage, slice]);
  if (txs.length === 0) return <Empty title={t("empty")} mascot="searching" />;

  // A day heading above the first row of each day.
  const headers = slice.map((tx, i) => (i === 0 || slice[i - 1].dayKey !== tx.dayKey ? tx.dayKey : null));
  return (
    <div>
      <ul className="divide-y divide-border/60">
        {slice.map((tx, index) => {
          const category = tx.categoryId ? model.categories.get(tx.categoryId) : null;
          const parent = category?.parentId ? model.categories.get(category.parentId) : null;
          const account = tx.accountId ? model.accountById.get(tx.accountId) : tx.fromAccountId ? model.accountById.get(tx.fromAccountId) : null;
          const to = tx.toAccountId ? model.accountById.get(tx.toAccountId) : null;
          const header = headers[index];
          const isTransfer = tx.type === "transfer" || tx.type === "balance_adjustment";
          // Money out shows −, money in +; a negative expense (a refund) or a
          // downward adjustment flips that, and the figure itself is unsigned.
          const out = tx.type === "expense" || (tx.type === "transfer" && tx.spending);
          const positive = tx.amount >= 0;
          const sign = out ? (positive ? "−" : "+") : tx.type === "income" || tx.type === "balance_adjustment" ? (positive ? "+" : "−") : "";
          const tone = tx.type === "income" ? "text-success" : isTransfer && !tx.spending ? "text-foreground-soft" : "text-foreground";
          // A payback into the bill's own account stays in that one account.
          const paybackRow = tx.payback === "row";
          const rowSelection = paybackRow ? undefined : selection;
          // Made by a recurring rule: the app's soft lavender, unless the row is ticked or a payback.
          const recurringTint = model.highlightRecurring && tx.recurring;
          const title =
            tx.note || category?.name || (paybackRow ? te("split.paidTitle") : isTransfer ? t("types.transfer") : tc("uncategorized"));
          return (
            <li key={tx.id}>
              {header ? (
                <p className="bg-background-subtle/70 px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.06em] text-foreground-muted">{f.day(header, "long")}</p>
              ) : null}
              <div
                className={`flex items-center gap-3 px-3 py-2.5 ${selection?.picked.has(tx.id) ? "bg-primary-soft/50" : tx.payback ? "bg-success-soft/40" : recurringTint ? "bg-lavender/15" : ""}`}
              >
                {selection && !rowSelection ? <span aria-hidden className="h-4 w-4 shrink-0" /> : null}
                {rowSelection ? (
                  <input
                    type="checkbox"
                    checked={rowSelection.picked.has(tx.id)}
                    onChange={() => undefined}
                    onClick={(event) => rowSelection.toggle(tx.id, event.shiftKey)}
                    aria-label={`${te("select")}: ${title}`}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-primary)]"
                  />
                ) : null}
                {isTransfer ? (
                  <ClayImg name="money-time/transfer" size={32} />
                ) : (
                  <CategoryGlyph icon={category?.icon} name={category?.name ?? title} color={category?.color} size={32} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-foreground">{title}</p>
                  <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-foreground-soft">
                    {/* Said once: an untitled payback row is already titled "Paid back". */}
                    {paybackRow && tx.note ? <Pill tone="good">{te("split.paidTitle")}</Pill> : null}
                    {/* A split bill a friend paid: the row is the user's own share, owed to them until it has an account. */}
                    {tx.paidBy !== undefined ? <Pill tone={account ? "neutral" : "warn"}>{te("split.personPaid", { name: tx.paidBy || te("split.someone") })}</Pill> : null}
                    {category ? <span className="truncate">{parent ? `${parent.name} · ${category.name}` : category.name}</span> : null}
                    {account ? (
                      <span className="inline-flex items-center gap-1 truncate">
                        <AccountLogo logoId={account.logoId} name={account.name} size={14} />
                        {account.name}
                        {to && !paybackRow ? ` → ${to.name}` : ""}
                      </span>
                    ) : null}
                    {tx.hasTime ? <span>{f.time(tx.date)}</span> : null}
                    {tx.sentiment !== "neutral" ? <Pill tone={tx.sentiment === "happy" ? "good" : "bad"}>{t(`feelings.${tx.sentiment}`)}</Pill> : null}
                    {tx.currency !== model.currency ? <Pill>{f.foreign(tx.originalAmount, tx.currency)}</Pill> : null}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`tabular text-[14px] font-extrabold ${tone}`}>
                    {sign}
                    {f.value({ money: Math.abs(tx.amount), hours: Math.abs(tx.hours) })}
                  </p>
                  {tx.spending || tx.earning ? (
                    <p className="tabular text-[12px] text-foreground-muted">{f.other({ money: Math.abs(tx.amount), hours: Math.abs(tx.hours) })}</p>
                  ) : null}
                </div>
                {selection && !rowSelection ? <span aria-hidden className="h-8 w-8 shrink-0" /> : null}
                {rowSelection ? (
                  <button
                    type="button"
                    onClick={() => rowSelection.open(tx)}
                    disabled={!rowSelection.enabled}
                    aria-label={`${te("editTitle")}: ${title}`}
                    title={te("editTitle")}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground-soft hover:bg-background-subtle disabled:opacity-40"
                  >
                    <ClayImg name="ui/pencil" size={18} />
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3 text-[13px] font-semibold text-foreground-soft">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-full border border-border px-3.5 py-1.5 font-bold hover:bg-background-subtle disabled:opacity-40">
            ← {t("newer")}
          </button>
          <span className="tabular">{t("page", { page: page + 1, pages })}</span>
          <button type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="rounded-full border border-border px-3.5 py-1.5 font-bold hover:bg-background-subtle disabled:opacity-40">
            {t("older")} →
          </button>
        </div>
      ) : null}
    </div>
  );
}
