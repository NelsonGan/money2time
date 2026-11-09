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
  OgPhone,
  OgWordmark,
  tutorialShotAsset,
} from "@/lib/og";
import { getTutorial, TUTORIALS, tutorialIcon } from "@/lib/tutorials";

export const alt = "Money2Time tutorial";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * Only the default locale is prerendered. The catalog is written once, in
 * English, so all 32 locales point at this one image rather than at 32
 * identical copies of it — see `tutorialImage` in `lib/seo.ts`.
 */
export function generateStaticParams() {
  return TUTORIALS.map((tutorial) => ({
    locale: routing.defaultLocale,
    slug: tutorial.id,
  }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: raw, slug } = await params;
  const locale = isLocale(raw) ? raw : routing.defaultLocale;
  const tutorial = getTutorial(slug);

  if (!tutorial) {
    return new Response("Not found", { status: 404 });
  }

  const t = await getTranslations({ locale, namespace: "tutorials" });
  const eyebrow = `${t("title")} · ${t("stepCount", { count: tutorial.steps.length })}`;

  const cover = tutorial.steps.find((step) => step.image)?.image;

  const [fonts, icon, screenshot] = await Promise.all([
    ogFonts([eyebrow, tutorial.title, tutorial.summary].join(""), locale),
    clayIconAsset(tutorialIcon(tutorial.id)),
    cover ? tutorialShotAsset(cover) : undefined,
  ]);

  return new ImageResponse(
    (
      <OgBackdrop>
        <OgWordmark />

        <div style={{ display: "flex", flex: 1, gap: 56, paddingTop: 24 }}>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: 26,
              width: screenshot ? 668 : 1072,
            }}
          >
            <img src={icon} alt="" width={88} height={88} />

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minWidth: 0,
              }}
            >
              <OgEyebrow>{eyebrow}</OgEyebrow>

              <div
                style={{
                  display: "flex",
                  fontSize: fitHeadline({
                    lines: 2,
                    max: 60,
                    min: 38,
                    text: tutorial.title,
                    width: screenshot ? 554 : 958,
                  }),
                  fontWeight: 800,
                  letterSpacing: -2,
                  lineHeight: 1.05,
                  marginTop: 14,
                }}
              >
                {tutorial.title}
              </div>

              <div
                style={{
                  color: OG_COLORS.foregroundSoft,
                  display: "flex",
                  fontSize: 25,
                  lineHeight: 1.4,
                  marginTop: 20,
                }}
              >
                {tutorial.summary}
              </div>
            </div>
          </div>

          {/*
            The first screenshot of the walkthrough, rising off the bottom
            edge the way the hero crops its phone — the tutorial pages are
            almost entirely screenshots, so the card should look like one.
          */}
          {screenshot ? (
            <div style={{ display: "flex", paddingTop: 6 }}>
              <OgPhone height={560} screenshot={screenshot} width={286} />
            </div>
          ) : null}
        </div>
      </OgBackdrop>
    ),
    { ...size, fonts },
  );
}
