"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { ClayIcon } from "@/components/clay-icon";
import { Link } from "@/i18n/navigation";
import { EVENTS, track } from "@/lib/analytics";
import {
  groupByCategory,
  searchTutorials,
  tutorialIcon,
  type Tutorial,
} from "@/lib/tutorials";

function Badges({ tutorial }: { tutorial: Tutorial }) {
  const t = useTranslations("tutorials");

  return (
    <>
      {tutorial.pro ? (
        <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold tracking-wide text-card">
          {t("badgePro")}
        </span>
      ) : null}
      {tutorial.platform === "ios" ? (
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold tracking-wide text-primary">
          {t("badgeIos")}
        </span>
      ) : null}
    </>
  );
}

export function TutorialCard({
  tutorial,
  source,
  results,
}: {
  tutorial: Tutorial;
  source: "browse" | "search";
  results?: number;
}) {
  const t = useTranslations("tutorials");

  return (
    <Link
      href={`/tutorials/${tutorial.id}`}
      onClick={() =>
        track(EVENTS.tutorialSelected, {
          tutorial: tutorial.id,
          source,
          ...(results === undefined ? {} : { results }),
        })
      }
      className="card-surface card-lift flex gap-4 rounded-[var(--radius-card)] p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <ClayIcon name={tutorialIcon(tutorial.id)} size={40} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[17px] font-bold tracking-tight text-foreground">
            {tutorial.title}
          </span>
          <Badges tutorial={tutorial} />
        </span>
        <span className="mt-1 block text-[14px] leading-relaxed text-foreground-soft">
          {tutorial.summary}
        </span>
        <span className="mt-2 block text-[13px] font-semibold text-primary">
          {t("stepCount", { count: tutorial.steps.length })}
        </span>
      </span>
    </Link>
  );
}

/**
 * The tutorial index. Search runs in the browser over the whole catalog, which
 * is a few dozen entries shipped with the page, so there is no request to make
 * and results come back as the user types.
 */
export function TutorialBrowser() {
  const t = useTranslations("tutorials");
  const [query, setQuery] = useState("");

  const results = useMemo(() => searchTutorials(query), [query]);
  // Category sections are for browsing. Once there is a query they would fight
  // the ranking, pushing a title match below a category that happens to sort
  // earlier, so a search flattens to one relevance-ordered grid.
  const searching = query.trim().length > 0;
  const sections = useMemo(
    () => (searching ? [] : groupByCategory(results)),
    [results, searching],
  );

  return (
    <>
      <div className="sticky top-[72px] z-20 -mx-5 mb-10 bg-background/85 px-5 py-4 backdrop-blur-xl sm:-mx-8 sm:px-8">
        <div className="card-surface flex h-14 items-center gap-3 rounded-full px-5">
          <svg
            viewBox="0 0 24 24"
            width={18}
            height={18}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="shrink-0 text-foreground-muted"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            // Safari draws its own clear button on a search input, which would
            // sit beside the one below.
            className="h-full w-full bg-transparent text-[16px] font-medium text-foreground outline-none placeholder:text-foreground-muted [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("clear")}
              className="shrink-0 rounded-full p-1 text-foreground-muted transition-colors hover:text-foreground"
            >
              <svg
                viewBox="0 0 24 24"
                width={18}
                height={18}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      {results.length === 0 ? (
        <div className="card-surface rounded-[var(--radius-card)] px-6 py-14 text-center">
          <p className="text-[19px] font-bold tracking-tight">{t("emptyTitle")}</p>
          <p className="mt-2 text-[15px] text-foreground-soft">{t("emptyDescription")}</p>
        </div>
      ) : searching ? (
        <div className="grid gap-4 md:grid-cols-2">
          {results.map((tutorial) => (
            <TutorialCard
              key={tutorial.id}
              tutorial={tutorial}
              source="search"
              results={results.length}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-12">
          {sections.map((section) => (
            <section key={section.category}>
              <h2 className="eyebrow mb-4">{t(`category.${section.category}`)}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {section.tutorials.map((tutorial) => (
                  <TutorialCard
                    key={tutorial.id}
                    tutorial={tutorial}
                    source="browse"
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
