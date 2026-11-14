"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState, type FormEvent } from "react";

import { albumGroupOf, billPeople, cents, type AlbumGroup, type AlbumGroupBill } from "@/lib/backup/album-group";
import type { Model, Tx } from "@/lib/backup/model";
import type { EditOp, Sentiment } from "@/lib/cloud/edits";

import { useDashboard, useFormat } from "../state";
import { NoAccountMark, Select } from "../ui";
import {
  AccountChip,
  AccountPickerSheet,
  CategoryGrid,
  Confirm,
  DAY_MAX,
  DAY_MIN,
  DeleteButton,
  EditBlocked,
  EditError,
  INPUT,
  SaveButton,
  SentimentButton,
  Sheet,
  currencyAmount,
  evaluateAmount,
  formatAmountInput,
  isDayKey,
  useEditRun,
} from "./kit";
import { distributeEvenly } from "./split-ops";

/**
 * A shared album's bill and its group, when this phone lets the page change it
 * (`link.sharedAlbums`) and sent the group: else null, and the bill stays as
 * an older phone keeps it (changed in the app).
 */
export function editableGroupBill(model: Model, sharedAlbums: boolean, tx: Tx | null): { group: AlbumGroup; bill: AlbumGroupBill } | null {
  if (!sharedAlbums || !tx?.albumGroupId) return null;
  const group = albumGroupOf(model.raw, tx.albumGroupId);
  const bill = group?.bills.get(tx.id);
  // The user is no longer in the album: nothing of it can change.
  if (!group?.selfId || !bill || bill.deleted) return null;
  return { group, bill };
}

/**
 * A shared album's bill, as the app's editor changes one (anyone in the album
 * can): its day, title, currency, who paid and how it is split are the
 * group's, saved for everyone (`module:albumbill` update); its category,
 * longer note, mood and account are the user's own and stay on their phone.
 * The account is offered only when the user paid it, as a bill someone else
 * paid is their share owed, on no account until they pay it back.
 */
export function GroupBillForm({ tx, group, bill, onClose }: { tx: Tx; group: AlbumGroup; bill: AlbumGroupBill; onClose: () => void }) {
  const t = useTranslations("dashboard.edit");
  const ts = useTranslations("dashboard.edit.split");
  const tg = useTranslations("dashboard.edit.sharedBill");
  const { fullModel: model } = useDashboard();
  const f = useFormat();
  const { run, busy, error, ready, clear, reload } = useEditRun();
  const formId = useId();
  const selfId = group.selfId!;
  const people = useMemo(() => billPeople(group, bill), [group, bill]);
  const album = model.trips.find((trip) => trip.id === group.albumId)?.name ?? ts("sharedAlbum");
  const nameOf = (id: string) => (id === selfId ? ts("me") : (group.members.find((member) => member.id === id)?.name ?? ts("someone")));

  const initialShares = useMemo(() => {
    const byMember = new Map<string, number>();
    for (const share of bill.shares) byMember.set(share.memberId, (byMember.get(share.memberId) ?? 0) + share.amount);
    return byMember;
  }, [bill]);
  const evenAtStart = useMemo(() => {
    const on = [...initialShares.values()].filter((amount) => amount > 0);
    return on.length > 0 && Math.max(...on.map(cents)) - Math.min(...on.map(cents)) <= 1;
  }, [initialShares]);

  const [date, setDate] = useState(bill.date);
  const [note, setNote] = useState(bill.note ?? "");
  const [currency, setCurrency] = useState(bill.currency);
  const [paidBy, setPaidBy] = useState(bill.paidBy);
  const [evenly, setEvenly] = useState(evenAtStart);
  const [total, setTotal] = useState(formatAmountInput(bill.amount, f.locale));
  const [included, setIncluded] = useState<ReadonlySet<string>>(() => new Set([...initialShares].filter(([, amount]) => amount > 0).map(([id]) => id)));
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(people.map((member) => [member.id, formatAmountInput(initialShares.get(member.id) ?? 0, f.locale)])));
  const [categoryId, setCategoryId] = useState(tx.categoryId);
  const [details, setDetails] = useState(tx.details);
  const [sentiment, setSentiment] = useState<Sentiment>(tx.sentiment);
  const [accountId, setAccountId] = useState(tx.accountId);
  const [picker, setPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [touched, setTouched] = useState(false);
  const touch = <T,>(setter: (value: T) => void) => (value: T) => {
    clear();
    setter(value);
  };

  // The shares as the group keeps them: everyone ticked, evenly or as typed.
  const on = people.filter((member) => included.has(member.id));
  const typedTotal = evaluateAmount(total, f.locale);
  const shares = evenly
    ? distributeEvenly(typedTotal ?? 0, on.length).map((amount, index) => ({ memberId: on[index].id, amount }))
    : on.map((member) => ({ memberId: member.id, amount: Math.max(0, evaluateAmount(amounts[member.id] ?? "", f.locale) ?? 0) }));
  const sum = shares.reduce((acc, share) => acc + cents(share.amount), 0) / 100;
  const account = accountId ? (model.accountById.get(accountId) ?? null) : null;
  const userPays = paidBy === selfId;

  const missing = {
    amount: !(sum > 0) || (evenly && (typedTotal === null || typedTotal < 0)),
    // Split with nobody else, it would no longer be the album's.
    nobody: userPays && shares.every((share) => share.memberId === selfId || !share.amount),
    category: !categoryId,
    date: !isDayKey(date),
  };
  const invalid = Object.values(missing).some(Boolean);

  const sharesChanged = (() => {
    const next = new Map(shares.filter((share) => cents(share.amount) > 0).map((share) => [share.memberId, cents(share.amount)]));
    const before = new Map([...initialShares].filter(([, amount]) => cents(amount) > 0).map(([id, amount]) => [id, cents(amount)]));
    return next.size !== before.size || [...next].some(([id, amount]) => before.get(id) !== amount);
  })();

  const save = async () => {
    setTouched(true);
    if (invalid || !ready || busy) return;
    const set: Record<string, unknown> = {};
    if (date !== bill.date) set.date = date;
    if (note.trim() !== (bill.note ?? "").trim()) set.note = note.trim();
    if (currency !== bill.currency) set.currency = currency;
    if (paidBy !== bill.paidBy || sharesChanged) {
      set.paidBy = paidBy;
      set.shares = shares.filter((share) => cents(share.amount) > 0).map((share) => ({ memberId: share.memberId, amount: cents(share.amount) / 100 }));
    }
    if (categoryId !== tx.categoryId) set.categoryId = categoryId;
    if (details.trim() !== tx.details.trim()) set.details = details.trim();
    if (sentiment !== tx.sentiment) set.sentiment = sentiment;
    if (userPays && accountId !== tx.accountId) set.accountId = accountId;
    if (!Object.keys(set).length) {
      onClose();
      return;
    }
    const op: EditOp = { entity: "module:albumbill", op: "update", id: tx.id, at: tx.updatedAt, set };
    if (await run([op], "albumbill_update")) onClose();
  };

  const remove = async () => {
    if (!ready || busy) return;
    if (await run([{ entity: "module:albumbill", op: "delete", rows: [{ id: tx.id, at: tx.updatedAt }] }], "albumbill_delete")) onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save();
  };

  const currencies = model.currencies.includes(currency) ? model.currencies : [currency, ...model.currencies];

  return (
    <Sheet
      wide
      busy={busy}
      onClose={onClose}
      title={<span className="text-[15px] font-extrabold text-error">{t("expense")}</span>}
      headerAction={<DeleteButton label={t("deleteTransaction")} onClick={() => setConfirmDelete(true)} disabled={busy} />}
      footer={<SaveButton label={t("update")} busy={busy} disabled={!ready || confirmDelete} form={formId} />}
    >
      <form id={formId} onSubmit={submit} className="grid gap-5 md:grid-cols-[1fr_minmax(0,330px)]">
        <div className="min-w-0 space-y-3">
          {confirmDelete ? (
            <Confirm
              title={t("deleteTransaction")}
              body={tg("deleteBody")}
              actions={[
                { label: t("cancel"), onClick: () => setConfirmDelete(false) },
                { label: t("delete"), tone: "danger", onClick: () => void remove(), disabled: !ready || busy },
              ]}
            />
          ) : null}
          <p className="rounded-2xl bg-primary-soft/50 px-4 py-2.5 text-[12.5px] leading-snug text-foreground-soft">{tg("intro", { album })}</p>
          <CategoryGrid type="expense" value={categoryId} keep={tx.categoryId} onChange={touch(setCategoryId)} />
          {touched && missing.category ? <p className="px-1 text-[12px] font-semibold text-error">{t("required")}</p> : null}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {userPays ? (
              <span className="inline-flex items-center gap-2">
                {account ? null : <NoAccountMark size={16} />}
                <AccountChip account={account} placeholder={ts("noAccount")} onClick={() => setPicker(true)} />
              </span>
            ) : null}
            <SentimentButton value={sentiment} onChange={touch(setSentiment)} />
          </div>

          <div className={`rounded-2xl border bg-background-subtle/50 px-4 py-3 ${touched && missing.amount ? "border-error/60" : "border-border/60"}`}>
            <div className="flex items-start gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">{t("amount")}</span>
                <span className="flex items-baseline gap-1 text-[30px] font-extrabold tracking-[-0.02em] text-error">
                  <span className="shrink-0">{currency === model.currency ? model.symbol : currency}</span>
                  <input
                    data-autofocus
                    inputMode="decimal"
                    autoComplete="off"
                    value={evenly ? total : formatAmountInput(sum, f.locale)}
                    readOnly={!evenly}
                    aria-invalid={touched && missing.amount}
                    onChange={(event) => touch(setTotal)(event.target.value)}
                    className="tabular w-full min-w-0 bg-transparent outline-none read-only:opacity-80"
                  />
                </span>
              </label>
              {currencies.length > 1 ? (
                <Select aria-label={t("currencyLabel")} value={currency} onChange={(event) => touch(setCurrency)(event.target.value)} className="w-[104px] shrink-0">
                  {currencies.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
            <label className="mt-2 flex items-center gap-2 border-t border-border/50 pt-2">
              <span className="sr-only">{t("note")}</span>
              <input value={note} maxLength={500} placeholder={t("optional")} onChange={(event) => touch(setNote)(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-foreground-muted" />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block px-1 text-[12.5px] font-bold text-foreground-soft">{tg("paidBy")}</span>
            <Select value={paidBy} onChange={(event) => touch(setPaidBy)(event.target.value)} className="w-full">
              {people.map((member) => (
                <option key={member.id} value={member.id}>
                  {nameOf(member.id)}
                </option>
              ))}
            </Select>
          </label>

          <div className="rounded-2xl border border-border/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <span className="text-[12.5px] font-bold text-foreground-soft">{tg("splitBetween")}</span>
              <label className="inline-flex items-center gap-2 text-[12.5px] font-bold text-foreground-soft">
                <input
                  type="checkbox"
                  checked={evenly}
                  onChange={(event) => {
                    clear();
                    // Leaving even shares keeps them as typed amounts, and back again the total stays.
                    if (!event.target.checked) setAmounts(Object.fromEntries(people.map((member) => [member.id, formatAmountInput(shares.find((share) => share.memberId === member.id)?.amount ?? 0, f.locale)])));
                    else setTotal(formatAmountInput(sum, f.locale));
                    setEvenly(event.target.checked);
                  }}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                {ts("evenly")}
              </label>
            </div>
            <ul className="space-y-1.5">
              {people.map((member) => {
                const ticked = included.has(member.id);
                const share = shares.find((item) => item.memberId === member.id)?.amount ?? 0;
                return (
                  <li key={member.id} className="flex items-center gap-2 rounded-xl bg-background-subtle/50 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={ticked}
                      aria-label={nameOf(member.id)}
                      onChange={() => {
                        clear();
                        setIncluded((current) => {
                          const next = new Set(current);
                          if (next.has(member.id)) next.delete(member.id);
                          else next.add(member.id);
                          return next;
                        });
                      }}
                      className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                    />
                    <span className={`min-w-0 flex-1 truncate text-[13.5px] font-bold ${ticked ? "text-foreground" : "text-foreground-muted"}`}>{nameOf(member.id)}</span>
                    {evenly || !ticked ? (
                      <span className="tabular text-[13.5px] font-semibold text-foreground-soft">{ticked ? currencyAmount(share, currency, f.locale) : ""}</span>
                    ) : (
                      <input
                        inputMode="decimal"
                        aria-label={`${nameOf(member.id)}: ${t("amount")}`}
                        value={amounts[member.id] ?? ""}
                        onChange={(event) => {
                          clear();
                          setAmounts((current) => ({ ...current, [member.id]: event.target.value }));
                        }}
                        className="tabular h-8 w-24 rounded-lg border border-border bg-card px-2 text-right text-[13.5px] outline-none focus:border-primary"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
            {touched && missing.nobody ? <p className="mt-2 px-1 text-[12px] font-semibold text-error">{tg("nobodyElse")}</p> : null}
          </div>

          <label className="block">
            <span className="mb-1.5 block px-1 text-[12.5px] font-bold text-foreground-soft">{t("date")}</span>
            <input
              type="date"
              required
              min={DAY_MIN}
              max={DAY_MAX}
              value={date}
              aria-invalid={touched && missing.date}
              onChange={(event) => touch(setDate)(event.target.value)}
              className={`${INPUT} ${touched && missing.date ? "border-error/60" : ""}`}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block px-1 text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-foreground-muted">{t("details")}</span>
            <textarea
              value={details}
              maxLength={2000}
              rows={2}
              placeholder={t("detailsPlaceholder")}
              onChange={(event) => touch(setDetails)(event.target.value)}
              className="w-full resize-y rounded-2xl border border-border bg-background-subtle/60 px-4 py-3 text-[14px] text-foreground outline-none focus:border-primary"
            />
          </label>

          <EditError message={error} onReload={reload} />
          <EditBlocked />
        </div>
      </form>
      {picker ? <AccountPickerSheet value={accountId} onClose={() => setPicker(false)} onChange={(id) => touch(setAccountId)(id)} /> : null}
    </Sheet>
  );
}
