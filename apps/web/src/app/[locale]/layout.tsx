import type { Metadata } from "next";
import { DM_Mono, DM_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Analytics } from "@/components/analytics";
import { isLocale, routing } from "@/i18n/routing";
import { htmlLang, SITE_METADATA_BASE, SITE_NAME } from "@/lib/seo";

import "../globals.css";
import { media } from "@/lib/media";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = isLocale(locale)
    ? await getTranslations({ locale, namespace: "metadata" })
    : null;

  return {
    applicationName: SITE_NAME,
    appleWebApp: {
      capable: true,
      title: SITE_NAME,
    },
    formatDetection: {
      telephone: false,
    },
    icons: {
      apple: media("/icon.png"),
      icon: "/favicon.png",
    },
    // Google ignores this tag, but Baidu, Naver and Yandex still read it —
    // exactly the engines behind the zh, ko and ru pages — so each locale
    // carries its own translated terms rather than one English list.
    keywords: t ? t.raw("keywords") : undefined,
    metadataBase: SITE_METADATA_BASE,
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html
      lang={htmlLang(locale)}
      data-scroll-behavior="smooth"
      className={`${dmSans.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <Analytics />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
