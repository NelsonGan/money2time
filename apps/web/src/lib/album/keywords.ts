/**
 * The app's Quick Entry keywords for the page's language (`keywords/*.json`,
 * copied from the app by its `npm run sync:category-keywords`), loaded the
 * first time a bill editor needs them and kept: the English core, and what
 * the language adds.
 */

import { compileKeywords, type KeywordTable } from "./categories.ts";

/** The languages with keywords of their own (the app's `categoryKeywords/<locale>.ts`). */
const OWN = new Set(["da", "de", "es", "fil", "fr", "hi", "id", "it", "ja", "ko", "ms", "nb", "nl", "pl", "pt", "ru", "sv", "th", "tr", "uk", "vi"]);

const loaded = new Map<string, Promise<ReturnType<typeof compileKeywords>>>();

export function loadKeywords(locale: string): Promise<ReturnType<typeof compileKeywords>> {
  const language = locale.toLowerCase().split("-")[0] ?? "en";
  const key = OWN.has(language) ? language : "en";
  let keywords = loaded.get(key);
  if (!keywords) {
    keywords = Promise.all([
      import("./keywords/core.json").then((module) => module.default as KeywordTable),
      key === "en" ? null : import(`./keywords/${key}.json`).then((module) => module.default as KeywordTable),
    ]).then((tables) => compileKeywords(tables.filter((table): table is KeywordTable => table !== null)));
    // A failed download is asked for again next time.
    keywords.catch(() => loaded.delete(key));
    loaded.set(key, keywords);
  }
  return keywords;
}
