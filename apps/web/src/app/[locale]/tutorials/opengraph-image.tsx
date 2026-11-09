import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";

import { isLocale, routing } from "@/i18n/routing";
import {
  clayIconAsset,
  fitHeadline,
  OG_COLORS,
  OG_CONTENT_TYPE,
  OG_SIZE,
  ogFonts,
  OgBackdrop,
  OgEyebrow,
  OgWordmark,
} from "@/lib/og";
import { TUTORIALS, tutorialIcon } from "@/lib/tutorials";

export const alt = "Money2Time tutorials";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Nine icons spread evenly across the catalog rather than the first nine,
 * which would all come from the "Get started" category and make the shelf
 * look narrower than it is.
 */
const SHELF = Array.from({ length: 9 }, (_, index) =>
  tutorialIcon(TUTORIALS[Math.floor((index * TUTORIALS.length) / 9)].id),
);

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : routing.defaultLocale;

  const t = await getTranslations({ locale, namespace: "tutorials" });
  const eyebrow = t("eyebrow");
  const title = t("title");
  const intro = t("intro");

  const [fonts, icons] = await Promise.all([
    ogFonts([eyebrow, title, intro].join(""), locale),
    Promise.all(SHELF.map((icon) => clayIconAsset(icon))),
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
            gap: 56,
            paddingTop: 26,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <OgEyebrow>{eyebrow}</OgEyebrow>

            <div
              style={{
                display: "flex",
                fontSize: fitHeadline({
                  lines: 1,
                  max: 74,
                  min: 44,
                  text: title,
                  width: 640,
                }),
                fontWeight: 800,
                letterSpacing: -2.6,
                lineHeight: 1.04,
                marginTop: 14,
              }}
            >
              {title}
            </div>

            <div
              style={{
                color: OG_COLORS.foregroundSoft,
                display: "flex",
                fontSize: 24,
                lineHeight: 1.42,
                marginTop: 20,
              }}
            >
              {intro}
            </div>
          </div>

          {/* The shelf of guides, as the catalog page lays them out. */}
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 18, width: 372 }}
          >
            {icons.map((icon, index) => (
              <div
                key={SHELF[index]}
                style={{
                  alignItems: "center",
                  backgroundColor: OG_COLORS.card,
                  borderColor: OG_COLORS.border,
                  borderRadius: 28,
                  borderStyle: "solid",
                  borderWidth: 2,
                  boxShadow:
                    "0 1px 2px rgba(74,56,40,0.04), 0 6px 18px rgba(74,56,40,0.05)",
                  display: "flex",
                  height: 112,
                  justifyContent: "center",
                  width: 112,
                }}
              >
                <img src={icon} alt="" width={60} height={60} />
              </div>
            ))}
          </div>
        </div>
      </OgBackdrop>
    ),
    { ...size, fonts },
  );
}
