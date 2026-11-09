"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import type { Model } from "@/lib/backup/model";

import { usePaywall } from "../paywall";
import { FREE_MAX_SUBCURRENCIES } from "../pro-limits";
import { useDashboard, useFormat } from "../state";
import { ClayImg } from "../ui";
import { EditBlocked, EditError, formatDecimal, INPUT, parseDecimal, Sheet, useEditRun } from "./kit";
import { SortableList } from "./sortable";

/*
 * The app's Multi currency screen on the web: the currencies tracked beside
 * the main one, their order and their rates. Saved through the phone as
 * `module:currency` ops, checked like the app's screen
 * (services/webDashboardEditModules/currency.ts). Changing the main currency
 * wipes everything and fetching rates needs the phone online, so both stay in
 * the app.
 */

/** The ops the phone's currency module reads. */
type CurrencyOp =
  | { entity: "module:currency"; op: "add" | "remove"; code: string }
  | { entity: "module:currency"; op: "reorder"; codes: string[] }
  | { entity: "module:currency"; op: "rate"; code: string; rate: number };

/**
 * The currencies the app's picker offers: every one its rate feed quotes
 * (ALL_CURRENCIES less BGN, see the app's utils/currency.ts).
 */
const PICKER_CODES =
  "USD EUR GBP JPY CNY INR KRW HKD MOP SGD TWD THB MYR IDR PHP VND PKR BDT CAD AUD NZD CHF SEK NOK DKK MXN BRL ZAR AED RUB TRY PLN UAH AFN ALL AMD AOA ARS AWG AZN BAM BBD BHD BIF BMD BND BOB BSD BTN BWP BYN BZD CDF CLP COP CRC CUP CVE CZK DJF DOP DZD EGP ERN ETB FJD FKP GEL GGP GHS GIP GMD GNF GTQ GYD HNL HTG HUF ILS IMP IQD IRR ISK JEP JMD JOD KES KGS KHR KMF KPW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MRU MUR MVR MWK MZN NAD NGN NIO NPR OMR PAB PEN PGK PYG QAR RON RSD RWF SAR SBD SCR SDG SHP SLE SOS SRD SSP STN SVC SYP SZL TJS TMT TND TOP TTD TZS UGX UYU UZS VES VUV WST XAF XCD XCG XOF XPF YER ZMW ZWG".split(
    " ",
  );

/** The app's formatRate, in this browser's decimal mark. */
function formatRate(rate: number, locale: string): string {
  if (rate >= 100) return formatDecimal(rate, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (rate >= 1) return formatDecimal(rate, locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return formatDecimal(rate, locale, { minimumSignificantDigits: 4, maximumSignificantDigits: 4 });
}

function currencyName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The currencies the app's settings have added, in their saved order. */
export function addedCurrencies(model: Model): string[] {
  const settings = (model.raw.settings ?? []).find((row) => !row.deleted_at) ?? model.raw.settings?.[0];
  try {
    const parsed = JSON.parse(settings?.fx_currencies_json ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((code): code is string => typeof code === "string" && /^[A-Z]{3}$/.test(code)) : [];
  } catch {
    return [];
  }
}

/** The screen's state, from the data the phone sent. */
function currencyState(model: Model) {
  const reporting = model.currency;
  const fx = addedCurrencies(model);
  const inUse = new Set(model.accounts.map((account) => account.currency).filter((code) => code && code !== reporting));
  // The added ones in their saved order, then any account currency not added yet.
  const shown: string[] = [];
  for (const code of [...fx, ...inUse]) if (code !== reporting && !shown.includes(code)) shown.push(code);
  const rates = new Map<string, { rate: number; manual: boolean; asOf: string | null }>();
  let asOf: string | null = null;
  for (const row of model.raw.exchange_rates ?? []) {
    if (row.deleted_at || row.base_currency !== reporting) continue;
    const day = row.as_of_date ?? null;
    if (day && (!asOf || day > asOf)) asOf = day;
    const known = rates.get(row.quote_currency);
    if (known && (known.asOf ?? "") >= (day ?? "")) continue;
    rates.set(row.quote_currency, { rate: row.rate, manual: (row as { source?: string }).source === "manual", asOf: day });
  }
  const added = fx.filter((code) => code !== reporting && !inUse.has(code)).length;
  return { reporting, fx, inUse, shown, rates, asOf, added };
}

/**
 * The Multi currency sheet: the main currency, the date of the rates, and the
 * tracked currencies in order, each with its rate. A currency opens its rate
 * editor (and, unless an account uses it, Remove); arrows move it.
 */
export function CurrenciesSheet({ onClose }: { onClose: () => void }) {
  const t = useTranslations("dashboard.edit.currency");
  const te = useTranslations("dashboard.edit");
  const paywall = usePaywall();
  const { fullModel: model, link } = useDashboard();
  const f = useFormat();
  const { run, busy, error, ready, clear } = useEditRun();
  const state = useMemo(() => currencyState(model), [model]);
  const [editCode, setEditCode] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  // The order being arranged, saved in one go as the app saves when a drag ends.
  const [order, setOrder] = useState<string[] | null>(null);
  const shown = order ?? state.shown;
  const reordered = order !== null && order.some((code, i) => code !== state.shown[i]);
  const can = ready && !busy;

  const send = async (op: CurrencyOp, action: `currency_${string}`) => run([op], action);

  const openRate = (code: string) => {
    clear();
    setAdding(false);
    if (editCode === code) {
      setEditCode(null);
      return;
    }
    const known = state.rates.get(code);
    // Every digit the rate has, so saving it untouched sends it back unchanged.
    setDraft(known ? formatDecimal(known.rate, f.locale) : "");
    setEditCode(code);
  };

  const saveRate = async (code: string) => {
    const rate = parseDecimal(draft, f.locale);
    // As the app's rate editor: a rate that is not above zero is not saved.
    // Nor is one left as it was.
    if (rate === null || !(rate > 0) || rate === state.rates.get(code)?.rate) {
      setEditCode(null);
      return;
    }
    if (await send({ entity: "module:currency", op: "rate", code, rate }, "currency_rate")) setEditCode(null);
  };

  const saveOrder = async () => {
    if (!order || !reordered) return;
    if (await send({ entity: "module:currency", op: "reorder", codes: order }, "currency_reorder")) setOrder(null);
  };

  const startAdd = () => {
    clear();
    setEditCode(null);
    // As the screen's Add button: the free plan's limit before the picker.
    if (!link.pro && state.added >= FREE_MAX_SUBCURRENCIES) {
      paywall("subcurrencies");
      return;
    }
    setQuery("");
    setAdding((value) => !value);
  };

  const choices = useMemo(() => {
    const exclude = new Set([state.reporting, ...state.shown]);
    const q = query.trim().toLowerCase();
    return PICKER_CODES.filter((code) => !exclude.has(code))
      .map((code) => ({ code, name: currencyName(code, f.locale) }))
      .filter((item) => !q || item.code.toLowerCase().includes(q) || item.name.toLowerCase().includes(q))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [f.locale, query, state.reporting, state.shown]);

  const add = async (code: string) => {
    if (await send({ entity: "module:currency", op: "add", code }, "currency_add")) setAdding(false);
  };

  return (
    <Sheet busy={busy} onClose={onClose} title={t("title")}>
      <div className="space-y-4">
        <div className="space-y-2 rounded-[20px] border border-border bg-card p-4">
          <p className="text-[12px] font-bold text-foreground-muted">{t("mainCurrency")}</p>
          <p className="text-[15px] font-extrabold text-foreground">
            {state.reporting} · {currencyName(state.reporting, f.locale)}
          </p>
          <p className="text-[12px] leading-snug text-foreground-muted">{t("mainInApp")}</p>
          <p className="border-t border-border pt-2 text-[12.5px] text-foreground-soft">{state.asOf ? t("asOf", { date: f.day(state.asOf) }) : t("neverUpdated")}</p>
        </div>

        <div className="flex items-center gap-2 px-1">
          <p className="text-[12px] font-extrabold uppercase tracking-widest text-foreground-muted">{t("subcurrencies")}</p>
          <button
            type="button"
            onClick={startAdd}
            disabled={!can || reordered}
            aria-expanded={adding}
            className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-[12.5px] font-extrabold text-primary-dark hover:bg-primary/20 disabled:opacity-50"
          >
            <ClayImg name="ui/plus" size={14} />
            {t("add")}
          </button>
        </div>

        {adding ? (
          <div className="space-y-2 rounded-[20px] border border-border bg-background-subtle/60 p-3">
            <p className="px-1 text-[13px] font-extrabold text-foreground">{t("addCurrency")}</p>
            <input
              data-autofocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
              className={INPUT}
            />
            <ul className="max-h-[260px] space-y-0.5 overflow-y-auto">
              {choices.length ? (
                choices.map((item) => (
                  <li key={item.code}>
                    <button
                      type="button"
                      onClick={() => void add(item.code)}
                      disabled={!can}
                      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-card disabled:opacity-50"
                    >
                      <span className="w-12 shrink-0 text-[14px] font-extrabold text-foreground">{item.code}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground-soft">{item.name}</span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-2.5 py-2 text-[13px] text-foreground-muted">{t("noMatch")}</li>
              )}
            </ul>
          </div>
        ) : null}

        {reordered ? (
          <div className="flex items-center gap-2 rounded-2xl bg-primary/10 px-3 py-2">
            <p className="min-w-0 flex-1 text-[13px] font-bold text-foreground">{t("orderChanged")}</p>
            <button type="button" onClick={() => setOrder(null)} disabled={busy} className="inline-flex h-9 items-center rounded-full px-3 text-[13px] font-extrabold text-foreground-soft hover:bg-card disabled:opacity-50">
              {te("cancel")}
            </button>
            <button type="button" onClick={() => void saveOrder()} disabled={!can} className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-extrabold text-card hover:bg-primary-dark disabled:opacity-50">
              {busy ? te("statusSaving") : t("saveOrder")}
            </button>
          </div>
        ) : null}

        {shown.length ? (
          <SortableList
            ids={shown}
            onChange={(codes) => {
              clear();
              setEditCode(null);
              setAdding(false);
              setOrder(codes);
            }}
            label={(code) => code}
            disabled={!can}
            className="space-y-2"
            itemClassName="rounded-2xl"
            renderItem={(code, grip) => {
              const known = state.rates.get(code);
              const open = editCode === code;
              return (
                <div className={`rounded-2xl border bg-card ${open ? "border-primary/40" : "border-border"}`}>
                  <div className="flex items-center gap-1 py-1 pl-1.5 pr-2">
                    {grip}
                    <button
                      type="button"
                      onClick={() => openRate(code)}
                      disabled={(!can || reordered) && !open}
                      aria-expanded={open}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-background-subtle"
                    >
                      <span className="w-12 shrink-0 text-[14.5px] font-extrabold text-foreground">{code}</span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground-soft">{currencyName(code, f.locale)}</span>
                      {known?.manual ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#C99A3A]" title={t("manual")} aria-label={t("manual")} /> : null}
                      <span className="tabular shrink-0 text-[14px] font-bold text-foreground">{known ? formatRate(known.rate, f.locale) : "–"}</span>
                    </button>
                  </div>
                  {open ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveRate(code);
                      }}
                      className="space-y-3 border-t border-border px-3.5 py-3"
                    >
                      <p className="text-[12.5px] font-bold text-foreground-soft">{t("editRate")}</p>
                      <div className="flex items-center gap-2 text-[14px] text-foreground-soft">
                        <span className="shrink-0">1 {state.reporting} =</span>
                        <input
                          data-autofocus
                          inputMode="decimal"
                          value={draft}
                          placeholder="0"
                          aria-label={`${t("editRate")}: ${code}`}
                          onChange={(event) => {
                            clear();
                            setDraft(event.target.value);
                          }}
                          className={`${INPUT} text-right`}
                        />
                        <span className="shrink-0">{code}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {!state.inUse.has(code) && state.fx.includes(code) ? (
                          <button
                            type="button"
                            onClick={() => void send({ entity: "module:currency", op: "remove", code }, "currency_remove").then((ok) => ok && setEditCode(null))}
                            disabled={!can}
                            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-error-soft px-4 text-[13px] font-extrabold text-error hover:bg-error/15 disabled:opacity-50"
                          >
                            <ClayImg name="ui/trash" size={15} />
                            {t("remove")}
                          </button>
                        ) : null}
                        <span className="flex-1" />
                        <button type="button" onClick={() => setEditCode(null)} disabled={busy} className="inline-flex h-10 items-center rounded-full px-4 text-[13px] font-extrabold text-foreground-soft hover:bg-background-subtle disabled:opacity-50">
                          {te("cancel")}
                        </button>
                        <button type="submit" disabled={!can} className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-[13px] font-extrabold text-card hover:bg-primary-dark disabled:opacity-50">
                          {busy ? te("statusSaving") : t("save")}
                        </button>
                      </div>
                    </form>
                  ) : null}
                </div>
              );
            }}
          />
        ) : (
          <p className="rounded-2xl border border-border bg-card px-4 py-3 text-[13px] text-foreground-muted">{t("empty")}</p>
        )}

        <EditError message={error} />
        <EditBlocked />
      </div>
    </Sheet>
  );
}
