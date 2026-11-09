import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";

import { isLocale, type Locale } from "./routing";

type Messages = Record<string, unknown>;

const messageLoaders: Record<Locale, () => Promise<Messages>> = {
  da: () => import("../../messages/da.json").then((module) => module.default),
  de: () => import("../../messages/de.json").then((module) => module.default),
  en: () => import("../../messages/en.json").then((module) => module.default),
  "en-au": () =>
    import("../../messages/en-au.json").then((module) => module.default),
  "en-ca": () =>
    import("../../messages/en-ca.json").then((module) => module.default),
  "en-gb": () =>
    import("../../messages/en-gb.json").then((module) => module.default),
  "en-in": () =>
    import("../../messages/en-in.json").then((module) => module.default),
  "en-my": () =>
    import("../../messages/en-my.json").then((module) => module.default),
  "en-nz": () =>
    import("../../messages/en-nz.json").then((module) => module.default),
  "en-ph": () =>
    import("../../messages/en-ph.json").then((module) => module.default),
  "en-sg": () =>
    import("../../messages/en-sg.json").then((module) => module.default),
  "en-za": () =>
    import("../../messages/en-za.json").then((module) => module.default),
  es: () => import("../../messages/es.json").then((module) => module.default),
  fil: () => import("../../messages/fil.json").then((module) => module.default),
  fr: () => import("../../messages/fr.json").then((module) => module.default),
  hi: () => import("../../messages/hi.json").then((module) => module.default),
  id: () => import("../../messages/id.json").then((module) => module.default),
  it: () => import("../../messages/it.json").then((module) => module.default),
  ja: () => import("../../messages/ja.json").then((module) => module.default),
  ko: () => import("../../messages/ko.json").then((module) => module.default),
  ms: () => import("../../messages/ms.json").then((module) => module.default),
  nb: () => import("../../messages/nb.json").then((module) => module.default),
  nl: () => import("../../messages/nl.json").then((module) => module.default),
  pl: () => import("../../messages/pl.json").then((module) => module.default),
  pt: () => import("../../messages/pt.json").then((module) => module.default),
  ru: () => import("../../messages/ru.json").then((module) => module.default),
  sv: () => import("../../messages/sv.json").then((module) => module.default),
  th: () => import("../../messages/th.json").then((module) => module.default),
  tr: () => import("../../messages/tr.json").then((module) => module.default),
  uk: () => import("../../messages/uk.json").then((module) => module.default),
  vi: () => import("../../messages/vi.json").then((module) => module.default),
  zh: () => import("../../messages/zh.json").then((module) => module.default),
};

function isPlainObject(value: unknown): value is Messages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Falls back to the English string for any key a translation file has not
 * caught up with yet, so a partially translated locale renders real copy
 * instead of a raw message key.
 */
function withFallback(messages: Messages, fallback: Messages): Messages {
  const merged: Messages = { ...fallback };

  for (const [key, value] of Object.entries(messages)) {
    const fallbackValue = merged[key];
    merged[key] =
      isPlainObject(value) && isPlainObject(fallbackValue)
        ? withFallback(value, fallbackValue)
        : value;
  }

  return merged;
}

const mergedMessages = new Map<Locale, Promise<Messages>>();

function localeMessages(locale: Locale) {
  if (locale === "en") {
    return messageLoaders.en();
  }

  let messages = mergedMessages.get(locale);
  if (!messages) {
    messages = Promise.all([messageLoaders[locale](), messageLoaders.en()]).then(
      ([translated, english]) => withFallback(translated, english),
    );
    mergedMessages.set(locale, messages);
  }

  return messages;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested ?? "en";

  if (!isLocale(locale)) {
    notFound();
  }

  return {
    locale,
    messages: await localeMessages(locale),
  };
});
