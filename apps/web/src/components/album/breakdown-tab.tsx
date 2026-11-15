"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Donut } from "@/components/dashboard/charts/donut";
import { cents } from "@/lib/backup/album-group";
import { albumCategory } from "@/lib/album/categories";
import type { Group } from "@/lib/album/group";

import { CategoryIcon, Mascot, currencyOrder, useCategoryLabel, useMoney } from "./ui";

const SLICE_COLORS = ["#B1525F", "#F37D57", "#F6B750", "#1E9468", "#4E7BD1", "#8E6FD8", "#2E9AA8", "#C8579A", "#94A39F"];
const EVERYONE = "";

/**
 * Where the album's money went, by category, as the app's Breakdown tab:
 * for Everyone (each bill's whole amount) or one person (each bill by their
 * share of it). One ring per currency; nothing is converted.
 */
export function BreakdownTab({ group }: { group: Group }) {
  const t = useTranslations("album");
  const locale = useLocale();
  const money = useMoney();
  const label = useCategoryLabel();
  const [person, setPerson] = useState<string>(EVERYONE);
  const percent = (ratio: number) => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(ratio);

  const sections = useMemo(() => {
    const byCurrency = new Map<string, Map<string, { name: string; icon: string | null; cents: number; count: number }>>();
    const counts = new Map<string, number>();
    for (const bill of group.bills) {
      if (bill.deleted) continue;
      const value = person === EVERYONE ? cents(bill.amount) : bill.shares.filter((share) => share.memberId === person).reduce((sum, share) => sum + cents(share.amount), 0);
      if (value <= 0) continue;
      // By the album's categories: the same for everyone in it.
      const key = bill.category;
      const categories = byCurrency.get(bill.currency) ?? new Map();
      const entry = categories.get(key) ?? { name: label(key), icon: albumCategory(key).icon, cents: 0, count: 0 };
      entry.cents += value;
      entry.count += 1;
      categories.set(key, entry);
      byCurrency.set(bill.currency, categories);
      counts.set(bill.currency, (counts.get(bill.currency) ?? 0) + 1);
    }
    return currencyOrder(byCurrency.keys(), counts).map((currency) => {
      const list = [...byCurrency.get(currency)!.entries()].map(([key, entry]) => ({ key, ...entry })).sort((a, b) => b.cents - a.cents);
      return { currency, list, total: list.reduce((sum, entry) => sum + entry.cents, 0) };
    });
  }, [group.bills, label, person]);

  const people = group.members.filter((member) => member.userId || group.bills.some((bill) => !bill.deleted && bill.shares.some((share) => share.memberId === member.id)));

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 self-start rounded-full border border-border bg-card py-1.5 pl-4 pr-2 text-[14.5px] shadow-[var(--shadow-soft)]">
        <span className="text-foreground-soft">{t("breakdown.showing")}</span>
        <select value={person} onChange={(event) => setPerson(event.target.value)} className="max-w-[180px] cursor-pointer appearance-none bg-transparent pr-1 font-bold text-foreground outline-none">
          <option value={EVERYONE}>{t("breakdown.everyone")}</option>
          {people.map((member) => (
            <option key={member.id} value={member.id}>
              {member.id === group.selfId ? t("people.you") : member.name}
            </option>
          ))}
        </select>
        <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.4} className="text-foreground-soft" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </label>

      {!sections.length ? (
        <section className="flex flex-col items-center px-6 py-10 text-center">
          <Mascot pose="sleeping" size={120} />
          <h2 className="mt-2 text-[19px] font-extrabold">{t("breakdown.emptyTitle")}</h2>
        </section>
      ) : (
        sections.map(({ currency, list, total }) => (
          <section key={currency} className="rounded-[24px] border border-border bg-card px-5 py-5 shadow-[var(--shadow-soft)]">
            <div className="flex justify-center">
              <Donut
                size={210}
                thickness={28}
                percent={percent}
                format={(value) => money(value / 100, currency)}
                slices={list.map((entry, index) => ({ key: entry.key, label: entry.name, value: entry.cents, color: SLICE_COLORS[index % SLICE_COLORS.length] }))}
                center={
                  <span className="flex flex-col items-center">
                    <span className="text-[12.5px] font-semibold text-foreground-soft">{t("breakdown.total")}</span>
                    <span className="text-[19px] font-extrabold tracking-[-0.02em] tabular">{money(total / 100, currency)}</span>
                  </span>
                }
              />
            </div>
            <ul className="mt-4">
              {list.map((entry, index) => (
                <li key={entry.key} className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SLICE_COLORS[index % SLICE_COLORS.length] }} />
                  <CategoryIcon icon={entry.icon} name={entry.name} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{entry.name}</span>
                    <span className="text-[12.5px] text-foreground-muted">{t("breakdown.bills", { count: entry.count })}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[15px] font-extrabold tabular">{money(entry.cents / 100, currency)}</span>
                    <span className="text-[12.5px] font-semibold text-foreground-muted">{percent(total ? entry.cents / total : 0)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
