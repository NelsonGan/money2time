"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useState, type FormEvent } from "react";

import { cents } from "@/lib/album/debts";
import { billHasPayments, billPeople, MAX_NOTE, type Bill, type Group } from "@/lib/album/group";
import { balanceSelf, methodOf, readValue, splitCents, splitShares, trimNumber, valuesFor, type SplitInput, type SplitMethod, type SplitProblem } from "@/lib/album/split";
import { billRow, deletedBillRow, newId, undonePaymentRows } from "@/lib/album/writes";
import { marketFor } from "@/lib/money";

import type { AlbumActions } from "./album-screen";
import { Avatar, BILL_CATEGORIES, Button, CategoryIcon, Confirm, Icon, InfoTip, Segmented, Sheet, Switch, currencySymbol, currencyOrder, personColor, today, useCategoryLabel, useDay, useMoney } from "./ui";

const MAX_AMOUNT = 1e12;
/** Currencies offered when the browser cannot list them. */
const FALLBACK_CURRENCIES = ["MYR", "SGD", "USD", "EUR", "GBP", "AUD", "JPY", "THB", "IDR", "VND", "PHP", "KRW", "CNY", "HKD", "TWD", "INR", "NZD", "CAD", "CHF"];

function allCurrencies(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("currency") ?? FALLBACK_CURRENCIES;
  } catch {
    return FALLBACK_CURRENCIES;
  }
}

type Category = { name: string | null; icon: string | null };

/**
 * A bill of the album, new or changed, as the app's editor and Split Bill
 * make one: its amount and currency, what it was for, its category, the day,
 * who paid, and how it is split (evenly, or by amount, percentage, shares or
 * adjustment). Anyone in the album changes any bill; saving needs a
 * connection, and a failed save keeps every edit.
 */
export function BillEditor({ group, bill, actions, onClose, onSaved }: { group: Group; bill: Bill | null; actions: AlbumActions; onClose: () => void; onSaved: (text: string) => void }) {
  const t = useTranslations("album");
  const locale = useLocale();
  const money = useMoney();
  const day = useDay();
  const categoryLabel = useCategoryLabel();
  const formId = useId();
  const selfId = group.selfId;
  const readOnly = !selfId;
  const people = useMemo(() => billPeople(group.members, bill), [bill, group.members]);
  const ordered = useMemo(() => [...people].sort((a, b) => Number(b.id === selfId) - Number(a.id === selfId)), [people, selfId]);
  const nameOf = (id: string) => (id === selfId ? t("people.you") : (group.members.find((member) => member.id === id)?.name ?? t("someone")));

  const usedCurrencies = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of group.bills) if (!item.deleted) counts.set(item.currency, (counts.get(item.currency) ?? 0) + 1);
    return currencyOrder(counts.keys(), counts);
  }, [group.bills]);
  const latest = useMemo(() => [...group.bills].filter((item) => !item.deleted).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0], [group.bills]);

  const [amountText, setAmountText] = useState(bill ? trimNumber(bill.amount) : "");
  const [currency, setCurrency] = useState(bill?.currency ?? latest?.currency ?? marketFor(locale).currency);
  const [note, setNote] = useState(bill?.note ?? "");
  const [category, setCategory] = useState<Category>(bill ? { name: bill.categoryName, icon: bill.categoryIcon } : { name: "Food", icon: "meal" });
  const [date, setDate] = useState(bill?.date ?? today());
  const [paidBy, setPaidBy] = useState(bill?.paidBy ?? selfId ?? ordered[0]?.id ?? "");
  const [onBill, setOnBill] = useState<string[]>(() => (bill ? ordered.filter((member) => bill.shares.some((share) => share.memberId === member.id)).map((member) => member.id) : ordered.filter((member) => member.userId).map((member) => member.id)));
  const [method, setMethod] = useState<SplitMethod>(bill ? methodOf(bill.shares) : "even");
  const [values, setValues] = useState<Record<string, string>>(() => (bill ? Object.fromEntries(bill.shares.map((share) => [share.memberId, trimNumber(share.amount)])) : {}));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "paid_edit" | null>(null);
  const [touched, setTouched] = useState(false);

  const total = readValue(amountText);
  const totalCents = total > 0 && total <= MAX_AMOUNT ? cents(total) : 0;
  const peopleOnBill = ordered.filter((member) => onBill.includes(member.id)).map((member) => member.id);
  const input: SplitInput = { method, totalCents, people: peopleOnBill, values, selfId };
  const { shares, problem } = splitShares(input);
  const amounts = splitCents(input);
  const hasPayments = bill ? billHasPayments(group.payments, bill.id) : false;
  const payments = bill ? group.payments.filter((payment) => !payment.deleted && payment.expenseId === bill.id) : [];
  const valid = totalCents > 0 && !problem && !!paidBy && shares.length > 0;

  const chooseMethod = (next: SplitMethod) => {
    if (next === method) return;
    setValues(valuesFor(next, input));
    setMethod(next);
  };
  const togglePerson = (id: string) => {
    const next = onBill.includes(id) ? onBill.filter((value) => value !== id) : [...onBill, id];
    setOnBill(next);
    if (method !== "even" && !onBill.includes(id)) {
      setValues((current) => ({ ...current, [id]: method === "shares" ? "1" : "0" }));
    }
  };
  const typeValue = (id: string, text: string) => {
    const cleaned = text.replace(/[^\d.,-]/g, "").slice(0, 14);
    setValues((current) => balanceSelf({ ...input, values: { ...current, [id]: cleaned } }, id));
  };

  const groupChanged = !bill || cents(bill.amount) !== totalCents || bill.currency !== currency || bill.date !== date || bill.paidBy !== paidBy || (bill.note ?? "") !== note.trim() || JSON.stringify(bill.shares.map((s) => [s.memberId, cents(s.amount)]).sort()) !== JSON.stringify(shares.map((s) => [s.memberId, cents(s.amount)]).sort());

  const save = async (event?: FormEvent, confirmed = false) => {
    event?.preventDefault();
    setTouched(true);
    if (!valid || busy || readOnly) return;
    if (hasPayments && groupChanged && !confirmed) {
      setConfirm("paid_edit");
      return;
    }
    setBusy(true);
    const row = billRow({ id: bill?.id ?? newId(), date, note: note.trim() || null, currency, categoryName: category.name, categoryIcon: category.icon, paidBy, shares });
    const ok = await actions.write([row], bill ? "bill_edit" : "bill_add");
    setBusy(false);
    if (ok) {
      onSaved(bill ? t("bill.saved") : t("bill.added"));
      onClose();
    }
  };

  const remove = async () => {
    if (!bill || busy) return;
    setBusy(true);
    const ok = await actions.write([deletedBillRow(bill.id)], "bill_delete");
    setBusy(false);
    if (ok) {
      onSaved(t("bill.deleted"));
      onClose();
    }
  };

  const undoPayment = async (id: string) => {
    if (busy) return;
    setBusy(true);
    await actions.write(undonePaymentRows(id, group.payments), "payment_undo");
    setBusy(false);
  };

  const myShare = shares.find((share) => share.memberId === selfId)?.amount ?? 0;
  const status = problem ? problemText(problem) : summary();
  function problemText(value: SplitProblem): string {
    switch (value.kind) {
      case "nobody":
        return t("split.nobody");
      case "amount_left":
        return t("split.left", { amount: money(value.cents / 100, currency) });
      case "amount_over":
        return t("split.over", { amount: money(value.cents / 100, currency) });
      case "percent":
        return t("split.percent", { given: trimNumber(value.given) });
      case "no_shares":
        return t("split.noShares");
      case "adjust_over":
        return t("split.adjustOver");
    }
  }
  function summary(): string {
    if (!totalCents) return t("split.enterAmount");
    if (paidBy === selfId) {
      const lent = totalCents - cents(myShare);
      return lent > 0 ? t("split.youLent", { amount: money(lent / 100, currency) }) : t("split.justYou");
    }
    return myShare > 0 ? t("split.youOwe", { name: nameOf(paidBy), amount: money(myShare, currency) }) : t("split.notYou", { name: nameOf(paidBy) });
  }

  const unit = method === "percent" ? "%" : method === "shares" ? "×" : currencySymbol(locale, currency);

  return (
    <Sheet
      title={readOnly ? t("bill.view") : bill ? t("bill.edit") : t("bill.new")}
      onClose={onClose}
      busy={busy}
      headerAction={
        bill && !readOnly ? (
          <button type="button" onClick={() => setConfirm("delete")} aria-label={t("bill.delete")} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-error-soft text-error hover:bg-error/15">
            <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h16M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M6.5 7l.9 11.2A2 2 0 0 0 9.4 20h5.2a2 2 0 0 0 2-1.8L17.5 7" />
            </svg>
          </button>
        ) : null
      }
      footer={
        readOnly ? null : (
          <div className="flex flex-col gap-2.5">
            <p role="status" aria-live="polite" className={`flex items-center justify-center gap-1.5 text-center text-[14.5px] font-bold ${problem && (touched || totalCents) ? "text-error" : "text-foreground"}`}>
              {status}
              {valid ? (
                <span className="text-success">
                  <Icon name="check" size={18} />
                </span>
              ) : null}
            </p>
            <Button type="submit" form={formId} size="lg" busy={busy} disabled={!valid} className="w-full">
              {bill ? t("bill.save") : t("bill.add")}
            </Button>
          </div>
        )
      }
    >
      <form id={formId} onSubmit={save} className="flex flex-col gap-4">
        {confirm === "delete" ? (
          <Confirm
            title={t("bill.deleteTitle")}
            body={hasPayments ? t("bill.deleteBodyPaid") : t("bill.deleteBody")}
            actions={[
              { label: t("cancel"), onClick: () => setConfirm(null) },
              { label: t("bill.delete"), tone: "danger", onClick: () => void remove(), disabled: busy },
            ]}
          />
        ) : null}
        {confirm === "paid_edit" ? (
          <Confirm
            title={t("bill.paidEditTitle")}
            body={t("bill.paidEditBody")}
            actions={[
              { label: t("cancel"), onClick: () => setConfirm(null) },
              {
                label: t("bill.save"),
                tone: "primary",
                onClick: () => {
                  setConfirm(null);
                  void save(undefined, true);
                },
                disabled: busy,
              },
            ]}
          />
        ) : null}

        <fieldset disabled={readOnly || busy} className="contents">
          {/* Amount and currency: the biggest thing on the form, as in the app. */}
          <div className="rounded-[22px] border border-border bg-background-subtle px-4 pb-3 pt-3">
            <div className="flex items-center gap-2">
              <input
                value={amountText}
                onChange={(event) => setAmountText(event.target.value.replace(/[^\d.,]/g, "").slice(0, 15))}
                inputMode="decimal"
                placeholder="0.00"
                aria-label={t("bill.amount")}
                autoFocus={!bill}
                data-autofocus
                className="min-w-0 flex-1 bg-transparent text-[38px] font-extrabold tracking-[-0.03em] text-error outline-none placeholder:text-foreground-muted/60 tabular"
              />
              <select
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
                aria-label={t("bill.currency")}
                className="h-11 shrink-0 rounded-full border border-border bg-card px-3.5 text-[15px] font-bold text-foreground outline-none focus:border-primary"
              >
                {usedCurrencies.length ? (
                  <optgroup label={t("bill.inThisAlbum")}>
                    {usedCurrencies.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                <optgroup label={t("bill.allCurrencies")}>
                  {[...new Set([currency, ...allCurrencies()])]
                    .filter((code) => !usedCurrencies.includes(code))
                    .map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, MAX_NOTE))}
              placeholder={t("bill.notePlaceholder")}
              aria-label={t("bill.note")}
              className="mt-1 w-full border-t border-border bg-transparent pt-3 text-[16px] font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-foreground-muted"
            />
          </div>

          {/* Category: the app's defaults; a bill filed under someone's own category keeps it until changed. */}
          <div>
            <p className="mb-2 px-1 text-[13px] font-bold text-foreground-soft">{t("bill.category")}</p>
            <div className="grid grid-cols-4 gap-2">
              {BILL_CATEGORIES.map((option) => {
                const active = category.name === option.name || (!category.name && category.icon === option.icon);
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategory({ name: option.name, icon: option.icon })}
                    className={`flex flex-col items-center gap-0.5 rounded-[16px] border px-1 py-1.5 text-[11.5px] font-bold transition-colors ${active ? "border-primary-muted bg-primary-soft text-primary" : "border-transparent bg-background-subtle text-foreground-soft hover:text-foreground"}`}
                  >
                    <CategoryIcon icon={option.icon} name={option.name} size={26} />
                    <span className="max-w-full truncate">{categoryLabel(option.name, option.icon)}</span>
                  </button>
                );
              })}
            </div>
            {category.name && !BILL_CATEGORIES.some((option) => option.name === category.name) ? (
              <p className="mt-2 flex items-center gap-2 px-1 text-[13px] text-foreground-soft">
                <CategoryIcon icon={category.icon} name={category.name} size={20} />
                {t("bill.ownCategory", { name: category.name })}
              </p>
            ) : null}
          </div>

          {/* The day: one chip, as in the app; the browser's own date picker opens from it. */}
          <div className="flex items-center justify-between gap-3 rounded-[18px] border border-border bg-card px-4 py-2">
            <span className="text-[15px] font-semibold">{t("bill.date")}</span>
            <span className="relative inline-flex h-9 items-center gap-1.5 rounded-full bg-background-subtle px-3.5 text-[14px] font-bold text-foreground">
              {date ? day(date, { weekday: true }) : ""}
              <input
                type="date"
                value={date}
                min="1970-01-01"
                max="2200-12-31"
                onChange={(event) => event.target.value && setDate(event.target.value)}
                onClick={(event) => (event.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                aria-label={t("bill.date")}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </span>
          </div>

          {/* Split Bill, laid out as the app's: the method, then who paid and Split evenly, then the people. */}
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <Segmented
                label={t("split.by")}
                value={method === "even" ? "amount" : method}
                onChange={(next) => next !== "amount" || method !== "even" ? chooseMethod(next) : undefined}
                options={[
                  { value: "amount", label: t("split.amount") },
                  { value: "percent", label: "%" },
                  { value: "shares", label: t("split.shares") },
                  { value: "adjust", label: "+/−" },
                ]}
              />
            </div>
            <InfoTip
              label={t("split.by")}
              text={[
                `${t("split.amount")}: ${t("split.amountHint")}`,
                `%: ${t("split.percentHint")}`,
                `${t("split.shares")}: ${t("split.sharesHint")}`,
                `+/−: ${t("split.adjustHint")}`,
              ].join("\n")}
            />
          </div>

          <div className="rounded-[22px] border border-border bg-card">
            {/* Paid by: anyone still in the album. */}
            <label className="relative flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <span className="text-[15px] font-semibold">{t("bill.paidBy")}</span>
              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={group.members.find((member) => member.id === paidBy)?.name ?? "?"} color={personColor(group.members, paidBy, selfId)} size={28} />
                <span className="truncate text-[15px] font-bold">{nameOf(paidBy)}</span>
                <span className="text-foreground-muted">
                  <Icon name="chevron" size={18} />
                </span>
              </span>
              <select
                value={paidBy}
                onChange={(event) => {
                  setPaidBy(event.target.value);
                  if (!onBill.includes(event.target.value)) togglePerson(event.target.value);
                }}
                aria-label={t("bill.paidBy")}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              >
                {ordered.map((member) => (
                  <option key={member.id} value={member.id}>
                    {nameOf(member.id)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px] font-semibold">{t("split.evenly")}</span>
              <Switch checked={method === "even"} onChange={(on) => chooseMethod(on ? "even" : "amount")} label={t("split.evenly")} />
            </div>
          </div>

          <div className="rounded-[22px] border border-border bg-card">
            <ul>
              {ordered.map((member) => {
                const on = onBill.includes(member.id);
                const index = peopleOnBill.indexOf(member.id);
                const share = index >= 0 ? (amounts[index] ?? 0) : 0;
                return (
                  <li key={member.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                    <button type="button" role="checkbox" aria-checked={on} onClick={() => togglePerson(member.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] border-2 ${on ? "border-primary bg-primary text-card" : "border-border bg-card text-transparent"}`}>
                        <Icon name="check" size={15} />
                      </span>
                      <Avatar name={member.name} color={personColor(group.members, member.id, selfId)} size={30} />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold">
                          {nameOf(member.id)}
                          {!member.userId ? <span className="ml-1.5 text-[12px] font-semibold text-foreground-muted">{t("people.left")}</span> : null}
                        </span>
                        {/* What a percentage, shares or an adjustment comes to, under the name. */}
                        {on && method !== "even" && method !== "amount" ? <span className="block text-[12.5px] font-semibold text-foreground-soft tabular">{money(share / 100, currency)}</span> : null}
                      </span>
                    </button>
                    {on && method !== "even" ? (
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-foreground-muted">{unit}</span>
                        <input
                          value={values[member.id] ?? ""}
                          onChange={(event) => typeValue(member.id, event.target.value)}
                          inputMode="decimal"
                          aria-label={t("split.valueFor", { name: member.name })}
                          className="h-10 w-[84px] rounded-[12px] border border-border bg-background-subtle px-2.5 text-right text-[15px] font-bold outline-none focus:border-primary tabular"
                        />
                      </span>
                    ) : null}
                    {on && method === "even" ? <span className="shrink-0 text-right text-[14px] font-bold text-foreground-soft tabular">{money(share / 100, currency)}</span> : null}
                  </li>
                );
              })}
            </ul>
            {ordered.filter((member) => member.userId).length < 2 ? <p className="px-4 pb-3 pt-1 text-[13px] text-foreground-muted">{t("split.nobodyElse")}</p> : null}
          </div>

          {payments.length ? (
            <div className="rounded-[22px] border border-border bg-card px-4 py-3">
              <p className="mb-1.5 text-[13px] font-bold text-foreground-soft">{t("bill.payments")}</p>
              <ul className="flex flex-col">
                {payments.map((payment) => (
                  <li key={payment.id} className="flex items-center gap-3 py-1.5">
                    <span className="min-w-0 flex-1 text-[14px]">
                      <span className="font-semibold">{t("bill.paymentLine", { from: nameOf(payment.fromMember), to: nameOf(payment.toMember), amount: money(payment.amount, payment.currency) })}</span>
                      <span className="block text-[12.5px] text-foreground-muted">{day(payment.date)}</span>
                    </span>
                    {!readOnly ? (
                      <button type="button" onClick={() => void undoPayment(payment.id)} className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-bold text-primary hover:bg-primary-soft">
                        {t("undo")}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </fieldset>
      </form>
    </Sheet>
  );
}
