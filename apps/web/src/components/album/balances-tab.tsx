"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { describeActivity, groupActivityByDay, MINE_CHIP_CLASS } from "@/lib/backup/album-group";
import { groupTotals, type GroupDebt } from "@/lib/album/debts";
import { cents } from "@/lib/backup/album-group";
import type { Group } from "@/lib/album/group";
import { groupDebts } from "@/lib/album/writes";

import { Avatar, Icon, Mascot, currencyOrder, currencySymbol, personColor, useCategoryLabel, useDay, useDefaultCategoryLabel, useMoney } from "./ui";

export type SettleTarget = GroupDebt;

/** The newest activity lines shown before Show all, as in the app. */
const ACTIVITY_SHOWN = 5;

/**
 * The album's Balances, as the app's tab lays them out: what the user owes or
 * is owed, Who owes whom (each debt with its action), who is settled up, the
 * group's spending, and every change anyone made. Never converted: each
 * currency stands on its own.
 */
export function BalancesTab({ group, onSettle }: { group: Group; onSettle: (target: SettleTarget) => void }) {
  const t = useTranslations("album");
  const money = useMoney();
  const selfId = group.selfId;
  const nameOf = (id: string) => group.members.find((member) => member.id === id)?.name ?? t("someone");
  const colorOf = (id: string) => personColor(group.members, id, selfId);

  const { debts, order, spending, nets } = useMemo(() => {
    const debts = groupDebts(group);
    const counts = new Map<string, number>();
    for (const bill of group.bills) if (!bill.deleted) counts.set(bill.currency, (counts.get(bill.currency) ?? 0) + 1);
    for (const debt of debts) counts.set(debt.currency, counts.get(debt.currency) ?? 0);
    const nets = new Map<string, number>();
    for (const debt of debts) {
      if (debt.to === selfId) nets.set(debt.currency, (nets.get(debt.currency) ?? 0) + cents(debt.amount));
      if (debt.from === selfId) nets.set(debt.currency, (nets.get(debt.currency) ?? 0) - cents(debt.amount));
    }
    return { debts, order: currencyOrder(counts.keys(), counts), spending: groupTotals(group.bills, selfId), nets };
  }, [group, selfId]);

  if (!order.length) {
    return (
      <section className="flex flex-col items-center px-6 py-10 text-center">
        <Mascot pose="sleeping" size={120} />
        <h2 className="mt-2 text-[19px] font-extrabold">{t("balances.emptyTitle")}</h2>
        <p className="mt-1 max-w-[300px] text-[14px] text-foreground-soft">{t("balances.emptyBody")}</p>
        <Activity group={group} />
      </section>
    );
  }

  const multi = order.length > 1;
  const settledPeople = (currency: string) =>
    group.members.filter((member) => member.userId && member.id !== selfId && !debts.some((debt) => debt.currency === currency && (debt.from === member.id || debt.to === member.id)));

  return (
    <div className="flex flex-col gap-4">
      {/* The hero, as the app's: one figure per currency, under what it is. */}
      <section className="flex flex-wrap justify-center gap-x-10 gap-y-3 py-4 text-center">
        {order.map((currency) => {
          const net = nets.get(currency) ?? 0;
          return (
            <div key={currency} className="min-w-0">
              <p className="text-[15px] font-semibold text-foreground-soft">{net < 0 ? t("balances.youOwe") : net > 0 ? t("balances.youAreOwed") : t("balances.settled")}</p>
              <p className={`mt-0.5 text-[38px] font-extrabold leading-tight tracking-[-0.03em] tabular ${net < 0 ? "text-primary" : "text-success"}`}>
                {net === 0 ? <span className="inline-flex items-center gap-1.5">{multi ? currency : null}<Icon name="check" size={32} /></span> : money(Math.abs(net) / 100, currency)}
              </p>
            </div>
          );
        })}
      </section>

      {/* Who owes whom, per currency, the user's own lines first. */}
      {debts.length ? (
        <section className="rounded-[24px] border border-border bg-card px-5 pb-2 pt-4 shadow-[var(--shadow-soft)]">
          <h2 className="mb-1 text-[18px] font-extrabold tracking-[-0.01em]">{t("balances.whoOwesWhom")}</h2>
          {order.map((currency) => {
            const lines = debts
              .filter((debt) => debt.currency === currency)
              .sort((a, b) => Number(b.from === selfId || b.to === selfId) - Number(a.from === selfId || a.to === selfId));
            if (!lines.length) return null;
            return (
              <div key={currency}>
                {multi ? <CurrencyChip currency={currency} /> : null}
                <ul>
                  {lines.map((debt) => {
                    const mine = debt.from === selfId || debt.to === selfId;
                    const sentence =
                      debt.from === selfId ? t("balances.youOweName", { name: nameOf(debt.to) }) : debt.to === selfId ? t("balances.owesYou", { name: nameOf(debt.from) }) : t("balances.owes", { from: nameOf(debt.from), to: nameOf(debt.to) });
                    return (
                      <li key={`${debt.from}-${debt.to}-${debt.currency}`} className="border-b border-border last:border-b-0">
                        {/* As in the app: the whole line opens it (here, recording the payment), the amount at its end. */}
                        <button
                          type="button"
                          disabled={!selfId}
                          onClick={() => onSettle(debt)}
                          className="-mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-[14px] px-2 py-3 text-left transition-colors hover:bg-background-subtle disabled:hover:bg-transparent"
                        >
                          <span className="flex shrink-0 items-center gap-1 text-foreground-muted">
                            <Avatar name={nameOf(debt.from)} color={colorOf(debt.from)} size={28} />
                            <Icon name="arrow" size={14} />
                            <Avatar name={nameOf(debt.to)} color={colorOf(debt.to)} size={28} />
                          </span>
                          <span className={`line-clamp-2 min-w-0 flex-1 text-[15px] leading-snug ${mine ? "font-bold text-foreground" : "font-semibold text-foreground-soft"}`}>{sentence}</span>
                          <span className={`shrink-0 text-[15px] font-extrabold tabular ${debt.from === selfId ? "text-primary" : debt.to === selfId ? "text-success" : "text-foreground-soft"}`}>
                            {money(debt.amount, debt.currency)}
                          </span>
                          {selfId ? (
                            <span className="shrink-0 text-foreground-muted">
                              <Icon name="chevron" size={16} />
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
      ) : null}

      {/* Everyone with nothing to pay either way. */}
      {order.some((currency) => settledPeople(currency).length) ? (
        <section className="rounded-[24px] border border-border bg-background-subtle px-5 py-3.5">
          <p className="eyebrow !text-foreground-soft">{t("balances.settledUp")}</p>
          {order.map((currency) => {
            const people = settledPeople(currency);
            if (!people.length) return null;
            return (
              <div key={currency}>
                {multi ? <CurrencyChip currency={currency} /> : null}
                <ul>
                  {people.map((member) => (
                    <li key={member.id} className="flex items-center gap-3 py-2">
                      <Avatar name={member.name} color={colorOf(member.id)} size={30} />
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground-soft">{member.name}</span>
                      <span className="text-success">
                        <Icon name="check" size={18} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      ) : null}

      {/* What the group spent, what the user paid, and their share. */}
      <section className="rounded-[24px] border border-border bg-card px-5 pb-5 pt-4 shadow-[var(--shadow-soft)]">
        <h2 className="mb-3 text-[18px] font-extrabold tracking-[-0.01em]">{t("balances.groupSpending")}</h2>
        {order.map((currency) => {
          const entry = spending.get(currency);
          if (!entry) return null;
          return (
            <div key={currency} className="mb-2 last:mb-0">
              {multi ? <CurrencyChip currency={currency} /> : null}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: t("balances.total"), value: entry.total },
                  { label: t("balances.youPaid"), value: entry.selfPaid },
                  { label: t("balances.yourShare"), value: entry.selfShare },
                ].map((tile) => (
                  <div key={tile.label} className="min-w-0 rounded-[16px] bg-background-subtle px-2.5 py-2.5">
                    <p className="truncate text-[12.5px] font-semibold text-foreground-soft">{tile.label}</p>
                    <TileFigure text={money(tile.value, currency)} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <Activity group={group} />
    </div>
  );
}

function CurrencyChip({ currency }: { currency: string }) {
  const symbol = currencySymbol(useLocale(), currency);
  return (
    <div className="mb-1 mt-3 flex items-center gap-2">
      <span className="rounded-full bg-background-subtle px-2.5 py-0.5 text-[11.5px] font-bold text-foreground-soft">
        {currency}
        {symbol !== currency ? ` · ${symbol}` : ""}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Every change anyone made, newest first, by day: plain history (the app's Activity card). */
function Activity({ group }: { group: Group }) {
  const t = useTranslations("dashboard.trips.activity");
  const ta = useTranslations("album");
  const category = useCategoryLabel(group.categories);
  const defaultCategory = useDefaultCategoryLabel();
  const locale = useLocale();
  const money = useMoney();
  const day = useDay();
  const [all, setAll] = useState(false);
  const lines = useMemo(() => {
    const nameOf = (id: string | null | undefined) => group.members.find((member) => member.id === id)?.name ?? ta("someone");
    return group.activity.map((entry) => describeActivity(entry, { t: (key, values) => t(key, values), selfId: group.selfId, nameOf, money, day: (date) => day(date), category, defaultCategory }));
  }, [category, day, defaultCategory, group, money, t, ta]);
  if (!lines.length) return null;
  const shown = all ? lines : lines.slice(0, ACTIVITY_SHOWN);
  const dayOf = (iso: string) => {
    const date = new Date(iso);
    const local = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return local === todayKey ? ta("today") : day(local);
  };
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
  return (
    <section className="mt-4 w-full rounded-[24px] border border-border bg-card px-5 pb-3 pt-4 text-left shadow-[var(--shadow-soft)]">
      <h2 className="text-[18px] font-extrabold tracking-[-0.01em]">{t("title")}</h2>
      {groupActivityByDay(shown, dayOf).map((group_) => (
        <div key={group_.day}>
          <p className="mb-1 mt-3 text-[13.5px] font-semibold text-foreground-soft">{group_.day}</p>
          <ul>
            {group_.lines.map((line) => (
              <li key={line.id} className="flex items-start gap-3 border-b border-border py-2.5 last:border-b-0">
                <Avatar
                  name={group.members.find((member) => member.id === line.actorId)?.name ?? "?"}
                  color={line.actorId ? personColor(group.members, line.actorId, group.selfId) : "#94A39F"}
                  size={28}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] leading-snug [overflow-wrap:anywhere]">
                    <BoldLead text={line.text} lead={line.actorId === group.selfId ? t("you") : (group.members.find((member) => member.id === line.actorId)?.name ?? null)} />
                  </span>
                  {line.mine ? <span className={`mt-1 inline-block max-w-full rounded-xl px-2 py-0.5 align-top text-[12.5px] font-bold ${MINE_CHIP_CLASS[line.tone]}`}>{line.mine}</span> : null}
                </span>
                <span className="shrink-0 pt-0.5 text-[12.5px] font-semibold text-foreground-muted">{time.format(new Date(line.createdAt))}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {lines.length > ACTIVITY_SHOWN ? (
        <button type="button" onClick={() => setAll((value) => !value)} className="mt-1 w-full py-2.5 text-center text-[14px] font-bold text-primary">
          {all ? ta("activity.showLess") : ta("activity.showAll", { count: lines.length })}
        </button>
      ) : null}
    </section>
  );
}

/** A line with the person who did it in bold, as the app's Activity writes it ("**Tess** paid you RM40.00"). */
function BoldLead({ text, lead }: { text: string; lead: string | null }) {
  if (!lead || !text.startsWith(lead)) return <>{text}</>;
  return (
    <>
      <strong className="font-bold">{lead}</strong>
      {text.slice(lead.length)}
    </>
  );
}

/** A tile's figure on one line, a little smaller the longer it is, so three fit side by side on a phone as in the app. */
function TileFigure({ text }: { text: string }) {
  const size = text.length > 11 ? 11.5 : text.length > 9 ? 13 : 15.5;
  return (
    <p className="truncate whitespace-nowrap font-extrabold tracking-[-0.01em] tabular" style={{ fontSize: size }} title={text}>
      {text}
    </p>
  );
}
