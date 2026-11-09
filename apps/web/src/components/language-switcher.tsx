"use client";

import { useLocale, useTranslations } from "next-intl";

import { Dropdown } from "@/components/dropdown";
import {
  localeFlags,
  localeLabels,
  routing,
  type Locale,
} from "@/i18n/routing";
import { usePathname, useRouter } from "@/i18n/navigation";
import { EVENTS, track } from "@/lib/analytics";

export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("common.language");
  const options = routing.locales.map((item) => ({
    flag: localeFlags[item],
    label: localeLabels[item],
    value: item,
  }));

  return (
    <Dropdown
      ariaLabel={t("label")}
      className="ml-auto"
      compact
      options={options}
      value={locale}
      onChange={(nextLocale) => {
        if (nextLocale === locale) return;
        track(EVENTS.languageChanged, {
          fromLocale: locale,
          toLocale: nextLocale,
        });
        router.replace(pathname, { locale: nextLocale as Locale });
      }}
    />
  );
}
