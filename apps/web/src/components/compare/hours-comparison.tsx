"use client";

import { useMemo, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";

import { CategoryIcon } from "@/components/clay-icon";
import {
  BIG_MAC_DATE,
  BIG_MAC_SOURCE,
  BIG_MAC_SOURCE_URL,
} from "@/lib/bigmac.generated";
import {
  ELECTRICITY_DATE,
  ENERGY_SOURCE,
  ENERGY_SOURCE_URL,
  KWH_UNIT,
  PETROL_DATE,
} from "@/lib/energy.generated";
import { Dropdown } from "@/components/dropdown";
import { EVENTS, track } from "@/lib/analytics";
import { countryNamer, flagFor, type CountryCode } from "@/lib/countries";
import type { CategoryIconName } from "@/lib/icons.generated";
import { currencyOptions } from "@/lib/money";
import {
  COMPARABLE_MARKETS,
  comparableMarket,
  type ComparableMarket,
} from "@/lib/wages";

type MetricKey =
  | "workPerBigMac"
  | "workPerLitre"
  | "workPer100kWh"
  | "payPerHour"
  | "payPerHourUsd"
  | "bigMacsPerMonth";

/**
 * Each row is either a figure from a source or arithmetic on two of them.
 * The three priced rows lead with the work they cost and carry the price
 * underneath, because the time is the point and the money is the evidence.
 */
const METRICS: {
  key: MetricKey;
  icon: CategoryIconName;
  lead?: true;
  priced?: true;
}[] = [
  { key: "workPerBigMac", icon: "burger", lead: true, priced: true },
  { key: "workPerLitre", icon: "gas-pump", lead: true, priced: true },
  { key: "workPer100kWh", icon: "light-bulb", lead: true, priced: true },
  { key: "payPerHour", icon: "cash" },
  { key: "payPerHourUsd", icon: "globe-money" },
  { key: "bigMacsPerMonth", icon: "grocery-basket" },
];

export function HoursComparison({
  baseCode,
  initialCompareCode,
}: {
  baseCode: CountryCode;
  initialCompareCode: CountryCode;
}) {
  const locale = useLocale();
  const format = useFormatter();
  const t = useTranslations("costInHours");
  const units = useTranslations("home.units");
  const [compareCode, setCompareCode] = useState<CountryCode>(initialCompareCode);

  const nameOf = useMemo(() => countryNamer(locale), [locale]);
  const base = comparableMarket(baseCode) as ComparableMarket;
  const compare = comparableMarket(compareCode) as ComparableMarket;
  const columns = [base, compare];

  const money = (value: number, of: { currency: string; decimals: 0 | 2 }) =>
    format.number(value, currencyOptions(of, value));

  const usd = (value: number) =>
    format.number(value, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });

  const duration = (minutes: number) =>
    minutes < 60
      ? units("min", { value: format.number(Math.round(minutes)) })
      : units("hours", {
          value: format.number(minutes / 60, { maximumFractionDigits: 1 }),
        });

  /** Anything the sources do not cover reads as a gap, never as a zero. */
  const NONE = "—";

  const metricValue = (key: MetricKey, column: ComparableMarket) => {
    if (key === "workPerBigMac") {
      return column.minutesPerBigMac ? duration(column.minutesPerBigMac) : NONE;
    }
    if (key === "workPerLitre") return duration(column.minutesPerLitre);
    if (key === "workPer100kWh") return duration(column.minutesPerKwhUnit);
    if (key === "payPerHour") return money(column.hourly, column.country);
    if (key === "payPerHourUsd") {
      return column.hourlyUsd ? usd(column.hourlyUsd) : NONE;
    }
    return column.bigMacsPerMonth
      ? format.number(Math.round(column.bigMacsPerMonth))
      : NONE;
  };

  /** The price behind a work-time figure, shown under it as the evidence. */
  const metricPrice = (key: MetricKey, column: ComparableMarket) => {
    if (key === "workPerBigMac") {
      return column.bigMac ? money(column.bigMac, column.country) : null;
    }
    if (key === "workPerLitre") return money(column.petrol, column.country);
    if (key === "workPer100kWh") return money(column.electricity, column.country);
    return null;
  };

  const options = COMPARABLE_MARKETS.map(({ country }) => ({
    flag: flagFor(country.code),
    label: nameOf(country.code),
    value: country.code,
  }));

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-surface">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">{t("compare.caption")}</caption>
        {/* One table rather than a header grid above a body table, so the
            columns line up to the pixel at every width. */}
        <colgroup>
          <col className="w-[38%] sm:w-[36%]" />
          <col className="w-[31%] sm:w-[32%]" />
          <col className="w-[31%] sm:w-[32%]" />
        </colgroup>

        <thead>
          <tr className="align-top">
            <th scope="col" className="px-4 pt-4 pb-3 sm:px-6">
              <span className="eyebrow">{t("compare.measure")}</span>
              <span className="mt-3 block text-[11px] leading-snug font-normal text-foreground-muted">
                {t("compare.priceSource")}{" "}
                <a
                  href={BIG_MAC_SOURCE_URL}
                  rel="nofollow noopener"
                  target="_blank"
                  className="underline decoration-border underline-offset-2 hover:text-primary"
                >
                  {BIG_MAC_SOURCE}
                </a>
                , {BIG_MAC_DATE}.{" "}
                <a
                  href={ENERGY_SOURCE_URL}
                  rel="nofollow noopener"
                  target="_blank"
                  className="underline decoration-border underline-offset-2 hover:text-primary"
                >
                  {ENERGY_SOURCE}
                </a>
                , {PETROL_DATE} / {ELECTRICITY_DATE}.
              </span>
            </th>
            {columns.map((column, index) => {
              const isCompare = index === 1;
              return (
                <th
                  key={column.country.code}
                  scope="col"
                  className={`border-l border-border/60 px-3 pt-4 pb-3 font-normal sm:px-5 ${
                    isCompare ? "bg-background-subtle/50" : ""
                  }`}
                >
                  <span className="eyebrow block">
                    {isCompare ? t("compare.with") : t("compare.base")}
                  </span>

                  {isCompare ? (
                    <Dropdown
                      ariaLabel={t("compare.with")}
                      className="-ml-2 mt-1"
                      options={options}
                      value={compareCode}
                      onChange={(nextCode) => {
                        if (nextCode === compareCode) return;
                        track(EVENTS.costComparisonChanged, {
                          baseCountry: baseCode,
                          fromCountry: compareCode,
                          toCountry: nextCode,
                        });
                        setCompareCode(nextCode);
                      }}
                    />
                  ) : (
                    <span className="mt-2 flex items-center gap-2 text-sm font-bold sm:text-[15px]">
                      <span aria-hidden="true">{flagFor(column.country.code)}</span>
                      <span className="min-w-0 truncate">
                        {nameOf(column.country.code)}
                      </span>
                    </span>
                  )}

                  <span className="mt-3 block font-mono text-[13px] font-medium tabular sm:text-[15px]">
                    {money(column.wage.amount, column.country)}
                  </span>
                  <span className="block text-[11px] leading-snug text-foreground-muted">
                    {t(`periods.${column.wage.period}`)}
                  </span>
                  <span className="mt-1.5 block text-[11px] leading-snug text-foreground-soft">
                    {t(`measures.${column.wage.measure}`)} ·{" "}
                    {t(`scopes.${column.wage.scope}`)}
                  </span>
                  <span className="mt-1 block text-[11px] leading-snug text-foreground-muted">
                    <a
                      href={column.wage.sourceUrl}
                      rel="nofollow noopener"
                      target="_blank"
                      className="underline decoration-border underline-offset-2 hover:text-primary"
                    >
                      {column.wage.source}
                    </a>
                    , {column.wage.year}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {METRICS.map(({ icon, key, lead, priced }) => (
            <tr key={key} className="border-t border-border/50">
              <th
                scope="row"
                className="px-4 py-3 text-left align-middle font-semibold sm:px-6"
              >
                <span className="flex items-center gap-2.5 sm:gap-3">
                  <CategoryIcon name={icon} size={24} className="hidden sm:block" />
                  <span
                    className={`text-[13px] leading-snug sm:text-sm ${
                      lead ? "text-foreground" : "text-foreground-soft"
                    }`}
                  >
                    {t(`metrics.${key}`, { kwh: KWH_UNIT })}
                  </span>
                </span>
              </th>
              {columns.map((column, index) => (
                <td
                  key={column.country.code}
                  className={`border-l border-border/50 px-3 py-3 align-middle sm:px-5 ${
                    index === 1 ? "bg-background-subtle/50" : ""
                  }`}
                >
                  <span
                    className={`block font-mono tabular ${
                      lead
                        ? "text-[15px] font-semibold text-primary sm:text-base"
                        : "text-[13px] sm:text-sm"
                    }`}
                  >
                    {metricValue(key, column)}
                  </span>
                  {priced ? (
                    <span className="mt-0.5 block font-mono text-[11px] tabular text-foreground-muted">
                      {metricPrice(key, column)}
                    </span>
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
