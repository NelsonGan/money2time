"use client";

import { useTranslations } from "next-intl";
import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";

import { CATEGORY_ICON_GROUPS, CATEGORY_ICON_META } from "@/lib/backup/category-icon-groups.generated";

import { CategoryGlyph } from "../ui";
import { INPUT, Sheet } from "./kit";

/*
 * The app's category icon picker on the web: its Icons tab (the default pack,
 * by section, with search) and its Emoji tab (the app's catalog, with search). The app's other packs and its
 * Custom uploads are Pro and live on the phone, so they are not offered here;
 * the phone refuses them from the web anyway.
 */

type Tab = "icons" | "emoji";

/** What the picker shows for an icon: the app's name for it, else its id in words. */
function iconName(id: string): string {
  const name = CATEGORY_ICON_META[id]?.name;
  if (name) return name;
  const words = id.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

type Icon = { id: string; name: string; group: string; words: string };

const ICONS: Icon[] = CATEGORY_ICON_GROUPS.flatMap(({ group, ids }) =>
  ids.map((id) => {
    const name = iconName(id);
    return { id, name, group, words: ` ${`${name} ${id.replace(/-/g, " ")} ${CATEGORY_ICON_META[id]?.keywords ?? ""}`.toLowerCase()}` };
  }),
);

/** The app's search: a name or id that starts with it first, then a word that does, then anywhere. */
function searchIcons(query: string): Icon[] {
  const q = query.trim().toLowerCase();
  const scored: { icon: Icon; score: number }[] = [];
  for (const icon of ICONS) {
    const score = icon.name.toLowerCase().startsWith(q) || icon.id.startsWith(q) ? 3 : icon.words.includes(` ${q}`) ? 2 : icon.words.includes(q) ? 1 : 0;
    if (score) scored.push({ icon, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.icon.name.localeCompare(b.icon.name)).map((entry) => entry.icon);
}

type Emoji = { e: string; n: string; g: number; k?: string };
type EmojiModule = typeof import("@/lib/backup/emoji-catalog.generated");

/** The app's emoji search: the glyph itself, then name prefix, name word, keyword, anywhere in the name. */
function searchEmoji(catalog: readonly Emoji[], query: string): Emoji[] {
  const q = query.trim().toLowerCase();
  const scored: { entry: Emoji; score: number }[] = [];
  for (const entry of catalog) {
    const score =
      entry.e === q ? 5 : entry.n.startsWith(q) ? 4 : entry.n.includes(` ${q}`) ? 3 : entry.k && (entry.k.startsWith(q) || entry.k.includes(` ${q}`)) ? 2 : entry.n.includes(q) ? 1 : 0;
    if (score) scored.push({ entry, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.entry.n.localeCompare(b.entry.n)).map((item) => item.entry);
}

/**
 * Picks a category icon: an id of the default pack, `emoji:<glyph>`, or none
 * (`""`, from Clear). Each pick closes the picker, as the app's does.
 */
export function CategoryIconPickerSheet({ value, onChange, onClose }: { value: string; onChange: (value: string) => void; onClose: () => void }) {
  const t = useTranslations("dashboard.edit.category");
  const id = useId();
  const [tab, setTab] = useState<Tab>(() => (value.startsWith("emoji:") ? "emoji" : "icons"));
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const results = useMemo(() => (tab === "icons" && deferred.trim() ? searchIcons(deferred) : null), [deferred, tab]);
  // The app's whole emoji catalog (about 100 KB), fetched when the tab first opens.
  const [emoji, setEmoji] = useState<EmojiModule | null>(null);
  useEffect(() => {
    if (tab !== "emoji" || emoji) return;
    let live = true;
    void import("@/lib/backup/emoji-catalog.generated").then((module) => live && setEmoji(module));
    return () => {
      live = false;
    };
  }, [tab, emoji]);
  const emojiSections = useMemo(() => {
    if (!emoji) return null;
    if (deferred.trim()) return [{ group: null, items: searchEmoji(emoji.EMOJI_CATALOG, deferred) }];
    return emoji.EMOJI_GROUPS.map((group, index) => ({ group, items: emoji.EMOJI_CATALOG.filter((entry) => entry.g === index) })).filter((section) => section.items.length);
  }, [emoji, deferred]);

  const pick = (next: string) => {
    onChange(next);
    onClose();
  };

  const iconCell = (icon: Icon) => {
    const active = value === icon.id;
    return (
      <button
        key={icon.id}
        type="button"
        onClick={() => pick(icon.id)}
        aria-pressed={active}
        aria-label={icon.name}
        title={icon.name}
        className={`flex aspect-square items-center justify-center rounded-2xl border-2 p-1 transition-colors ${
          active ? "border-primary bg-primary/15" : "border-transparent hover:bg-background-subtle"
        }`}
      >
        <CategoryGlyph icon={icon.id} name={icon.name} size={38} />
      </button>
    );
  };

  return (
    <Sheet
      title={t("chooseIcon")}
      onClose={onClose}
      headerAction={
        value ? (
          <button type="button" onClick={() => pick("")} className="rounded-full px-3 py-1.5 text-[12.5px] font-bold text-foreground-soft hover:bg-background-subtle">
            {t("clear")}
          </button>
        ) : null
      }
    >
      <div role="tablist" aria-label={t("chooseIcon")} className="mb-3 flex rounded-full border border-border bg-background-subtle/60 p-1">
        {(["icons", "emoji"] as const).map((key) => (
          <button
            key={key}
            id={`${id}-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`${id}-panel`}
            onClick={() => {
              setTab(key);
              setQuery("");
            }}
            className={`flex-1 rounded-full px-4 py-2 text-[13.5px] font-extrabold transition-colors ${tab === key ? "bg-card text-foreground shadow-[var(--shadow-soft)]" : "text-foreground-muted hover:text-foreground"}`}
          >
            {key === "icons" ? t("tabIcons") : t("tabEmoji")}
          </button>
        ))}
      </div>

      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`}>
        {tab === "icons" ? (
          <>
            <label className="mb-3 block">
              <span className="sr-only">{t("searchIcons")}</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchIcons")} className={INPUT} data-autofocus />
            </label>
            {results ? (
              results.length ? (
                <div className="grid grid-cols-6 gap-1">{results.map(iconCell)}</div>
              ) : (
                <p className="py-8 text-center text-[13px] text-foreground-muted">{t("noResults")}</p>
              )
            ) : (
              <div className="space-y-3">
                {CATEGORY_ICON_GROUPS.map(({ group }) => (
                  <section key={group}>
                    <h3 className="mb-1.5 px-1 text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-foreground-muted">{t(`groups.${group.replace(/-/g, "_")}`)}</h3>
                    <div className="grid grid-cols-6 gap-1">{ICONS.filter((icon) => icon.group === group).map(iconCell)}</div>
                  </section>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <label className="mb-3 block">
              <span className="sr-only">{t("searchEmoji")}</span>
              {/* Focus starts here, not on Clear, where Enter would remove the icon. */}
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchEmoji")} className={INPUT} data-autofocus />
            </label>
            {!emojiSections ? (
              <p role="status" className="py-8 text-center text-[13px] text-foreground-muted">
                …
              </p>
            ) : !emojiSections[0]?.items.length ? (
              <p className="py-8 text-center text-[13px] text-foreground-muted">{t("noResults")}</p>
            ) : (
              <div className="space-y-3">
                {emojiSections.map(({ group, items }) => (
                  <section key={group ?? "results"}>
                    {group ? <h3 className="mb-1.5 px-1 text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-foreground-muted">{t(`groups.${group}`)}</h3> : null}
                    <div className="grid grid-cols-8 gap-1">
                      {items.map((entry) => {
                        const stored = `emoji:${entry.e}`;
                        const active = value === stored;
                        return (
                          <button
                            key={entry.e}
                            type="button"
                            onClick={() => pick(stored)}
                            aria-pressed={active}
                            aria-label={entry.n}
                            title={entry.n}
                            className={`flex aspect-square items-center justify-center rounded-xl border-2 text-[26px] leading-none transition-colors ${
                              active ? "border-primary bg-primary/15" : "border-transparent hover:bg-background-subtle"
                            }`}
                          >
                            {entry.e}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
