import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AlbumApp } from "@/components/album/album-app";
import { isLocale } from "@/i18n/routing";
import { ALBUM_ORIGIN } from "@/lib/platform";
import { pageOpenGraph, pageTwitter, SITE_METADATA_BASE } from "@/lib/seo";

/**
 * Served at album.money2time.com, which `src/proxy.ts` rewrites to this route:
 * shared albums for friends without the app. Invites and albums are private,
 * so the page is out of every index.
 */
export async function generateMetadata({ params }: PageProps<"/[locale]/album">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "metadata.album" });
  const title = t("title");
  const description = t("description");
  // What a chat app shows for an invite link: the site's card, worded for an invite.
  return {
    title,
    description,
    metadataBase: SITE_METADATA_BASE,
    alternates: { canonical: ALBUM_ORIGIN },
    robots: { index: false, follow: false },
    openGraph: { ...pageOpenGraph({ description, locale, path: "", title }), url: ALBUM_ORIGIN },
    twitter: pageTwitter({ description, locale, title }),
  };
}

export default async function AlbumPage({ params }: PageProps<"/[locale]/album">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AlbumApp />;
}
