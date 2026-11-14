"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { cents } from "@/lib/album/debts";
import type { Bill, Group } from "@/lib/album/group";

import { Button, CategoryIcon, Icon, Mascot, useCategoryLabel, useDay, useMoney } from "./ui";

/** A bill's line under its title, as the user's own part of it reads. */
export function useBillLine(group: Group) {
  const t = useTranslations("album");
  const money = useMoney();
  return (bill: Bill): { text: string; tone: "lent" | "owe" | "none" } => {
    const self = group.selfId;
    const mine = bill.shares.filter((share) => share.memberId === self).reduce((sum, share) => sum + cents(share.amount), 0);
    const payer = group.members.find((member) => member.id === bill.paidBy)?.name ?? t("someone");
    if (bill.paidBy === self) {
      const lent = cents(bill.amount) - mine;
      return lent > 0 ? { text: t("bill.youLent", { amount: money(lent / 100, bill.currency) }), tone: "lent" } : { text: t("bill.youPaid"), tone: "none" };
    }
    if (mine > 0) return { text: t("bill.theyPaidYourShare", { name: payer, amount: money(mine / 100, bill.currency) }), tone: "owe" };
    return { text: t("bill.notInvolved", { name: payer }), tone: "none" };
  };
}

/** The album's bills by day, newest first, as the app's Transactions tab lists them. */
export function TransactionsTab({ group, onOpen, onAdd }: { group: Group; onOpen: (bill: Bill) => void; onAdd: () => void }) {
  const t = useTranslations("album");
  const locale = useLocale();
  const money = useMoney();
  const day = useDay();
  const label = useCategoryLabel();
  const line = useBillLine(group);
  const days = useMemo(() => {
    const live = group.bills.filter((bill) => !bill.deleted).sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
    const out: { date: string; bills: Bill[]; totals: Map<string, number> }[] = [];
    for (const bill of live) {
      let current = out.at(-1);
      if (current?.date !== bill.date) {
        current = { date: bill.date, bills: [], totals: new Map() };
        out.push(current);
      }
      current.bills.push(bill);
      current.totals.set(bill.currency, (current.totals.get(bill.currency) ?? 0) + cents(bill.amount));
    }
    return out;
  }, [group.bills]);

  if (!days.length) {
    return (
      <section className="flex flex-col items-center px-6 py-10 text-center">
        <Mascot pose="sleeping" size={120} />
        <h2 className="mt-2 text-[19px] font-extrabold">{t("bill.emptyTitle")}</h2>
        <p className="mt-1 max-w-[300px] text-[14px] text-foreground-soft">{t("bill.emptyBody")}</p>
        {group.selfId ? (
          <Button className="mt-5" onClick={onAdd}>
            <Icon name="plus" size={18} />
            {t("bill.add")}
          </Button>
        ) : null}
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {days.map(({ date, bills, totals }) => (
        <section key={date} aria-label={day(date)}>
          <header className="mb-2 flex items-center justify-between gap-3 px-1">
            <span className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-foreground-soft">{day(date)}</span>
              <span className="rounded-full bg-background-subtle px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-foreground-soft">
                {new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(`${date}T12:00:00`))}
              </span>
            </span>
            <span className="text-right text-[14px] font-bold text-error tabular">{[...totals].map(([currency, total]) => money(total / 100, currency)).join(" · ")}</span>
          </header>
          <ul className="flex flex-col gap-2">
            {bills.map((bill) => {
              const sub = line(bill);
              const category = label(bill.categoryName, bill.categoryIcon);
              const title = bill.note?.trim() || category || t("bill.untitled");
              return (
                <li key={bill.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(bill)}
                    className="flex w-full items-center gap-3 rounded-[20px] border border-border bg-card px-3.5 py-3 text-left shadow-[var(--shadow-soft)] transition-transform hover:bg-[#FFFDFB] active:scale-[0.99]"
                  >
                    <CategoryIcon icon={bill.categoryIcon} name={category} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[15.5px] font-bold">{title}</span>
                        <span className="shrink-0 text-foreground-muted" aria-label={t("bill.shared")}>
                          <Icon name="people" size={15} />
                        </span>
                      </span>
                      {bill.note?.trim() && category ? <span className="block truncate text-[13px] text-foreground-soft">{category}</span> : null}
                      <span className={`block truncate text-[13px] font-semibold ${sub.tone === "lent" ? "text-success" : sub.tone === "owe" ? "text-primary" : "text-foreground-muted"}`}>{sub.text}</span>
                    </span>
                    <span className="shrink-0 text-right text-[15.5px] font-extrabold text-error tabular">{money(bill.amount, bill.currency)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
