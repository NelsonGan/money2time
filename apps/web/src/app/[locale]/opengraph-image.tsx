import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";

import { isLocale, routing } from "@/i18n/routing";
import { formatAmount, marketFor, WORK_HOURS_PER_MONTH } from "@/lib/money";
import {
  categoryIconAsset,
  clayIconAsset,
  fitHeadline,
  OG_COLORS,
  OG_CONTENT_TYPE,
  OG_SIZE,
  ogFonts,
  OgBackdrop,
  OgWordmark,
} from "@/lib/og";

export const alt = "Money2Time expense tracker app preview";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/** The same three claims the hero puts under the download buttons. */
const BADGES = [
  { icon: "settings/app-lock", key: "onDevice" },
  { icon: "money-time/bank", key: "noBank" },
  { icon: "entry/quick-timer", key: "quick" },
] as const;

/** The card prices a weekly grocery run: big enough to be worth a few hours. */
const SUBJECT = { icon: "grocery-basket", key: "groceries" } as const;

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : routing.defaultLocale;

  const [hero, ticker, units] = await Promise.all([
    getTranslations({ locale, namespace: "home.hero" }),
    getTranslations({ locale, namespace: "home.ticker" }),
    getTranslations({ locale, namespace: "home.units" }),
  ]);

  const market = marketFor(locale);
  const price = market.prices[SUBJECT.key];
  const hours = price / (market.takeHome / WORK_HOURS_PER_MONTH);

  const title = hero("title");
  const subtitle = hero("subtitle");
  const subject = ticker(SUBJECT.key);
  const amount = formatAmount(locale, price);
  const duration = units("hours", {
    value: new Intl.NumberFormat(locale, {
      maximumFractionDigits: hours < 10 ? 1 : 0,
    }).format(hours),
  });
  const badges = BADGES.map((badge) => hero(`badges.${badge.key}`));

  const [fonts, subjectIcon, badgeIcons] = await Promise.all([
    ogFonts(
      [title, subtitle, subject, amount, duration, ...badges].join(""),
      locale,
    ),
    categoryIconAsset(SUBJECT.icon),
    Promise.all(BADGES.map((badge) => clayIconAsset(badge.icon))),
  ]);

  return new ImageResponse(
    (
      <OgBackdrop>
        <OgWordmark />

        <div
          style={{
            alignItems: "center",
            display: "flex",
            flex: 1,
            gap: 48,
            paddingTop: 26,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", width: 626 }}>
            <div
              style={{
                display: "flex",
                fontSize: fitHeadline({
                  lines: 2,
                  max: 64,
                  min: 40,
                  text: title,
                  width: 626,
                }),
                fontWeight: 800,
                letterSpacing: -2.2,
                lineHeight: 1.04,
              }}
            >
              {title}
            </div>

            <div
              style={{
                color: OG_COLORS.foregroundSoft,
                display: "flex",
                fontSize: 23,
                lineHeight: 1.42,
                marginTop: 18,
              }}
            >
              {subtitle}
            </div>
          </div>

          {/*
            The conversion card from `components/home/how-it-works.tsx`, set
            upright rather than side by side: at the size a link preview is
            actually shown, one number under another is the only way both stay
            readable.
          */}
          <div
            style={{
              backgroundColor: OG_COLORS.card,
              borderColor: OG_COLORS.border,
              borderRadius: 42,
              borderStyle: "solid",
              borderWidth: 2,
              boxShadow:
                "0 8px 20px rgba(74,56,40,0.06), 0 30px 70px rgba(74,56,40,0.13)",
              display: "flex",
              flexDirection: "column",
              padding: "34px 34px 38px",
              width: 350,
            }}
          >
            <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
              <img src={subjectIcon} alt="" width={44} height={44} />
              <span style={{ fontSize: 21, fontWeight: 700 }}>{subject}</span>
            </div>

            <div
              style={{
                color: OG_COLORS.foregroundMuted,
                display: "flex",
                fontSize: 44,
                fontWeight: 800,
                letterSpacing: -1.8,
                marginTop: 26,
              }}
            >
              {amount}
            </div>

            <svg
              width="24"
              height="30"
              viewBox="0 0 24 30"
              fill="none"
              style={{ marginTop: 10 }}
            >
              <path
                d="M12 2v24M3 18l9 9 9-9"
                stroke={OG_COLORS.border}
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            <div
              style={{
                color: OG_COLORS.primary,
                display: "flex",
                fontSize: fitHeadline({
                  lines: 1,
                  max: 78,
                  min: 44,
                  text: duration,
                  width: 282,
                }),
                fontWeight: 800,
                letterSpacing: -3,
                marginTop: 8,
              }}
            >
              {duration}
            </div>
          </div>
        </div>

        {/*
          The badges run the full width rather than sitting under the headline:
          the same three claims are half again as long in German or Russian,
          and a second row would push the card off the bottom edge.
        */}
        <div style={{ display: "flex", gap: 34 }}>
          {BADGES.map((badge, index) => (
            <div
              key={badge.key}
              style={{ alignItems: "center", display: "flex", gap: 9 }}
            >
              <img src={badgeIcons[index]} alt="" width={30} height={30} />
              <span
                style={{
                  color: OG_COLORS.foregroundSoft,
                  fontSize: 18,
                  fontWeight: 700,
                }}
              >
                {badges[index]}
              </span>
            </div>
          ))}
        </div>
      </OgBackdrop>
    ),
    { ...size, fonts },
  );
}
