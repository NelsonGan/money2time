"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { albumGroupOf, describeActivity, groupActivityByDay } from "@/lib/backup/album-group";
import { dayKeyOf, parseLocalDate } from "@/lib/backup/dates";

import { EditError, useEditRun } from "../edit/kit";
import { offersEdits, useDashboard, useFormat } from "../state";
import { Card, Empty } from "../ui";

/**
 * A shared album's Activity, as the app's Activity tab shows it
 * (features/albums/components/AlbumActivity.tsx): every change anyone made,
 * newest first, by day, one line each. A change someone else made to the
 * user's own money is tinted, with a second line saying how, and a deleted
 * bill offers Restore while the phone takes it (`link.sharedAlbums`). Shown
 * only when the phone sent the album's group (an app that names
 * `shared-albums`); nothing otherwise.
 */
/** The newest this many changes show until View all. */
const COLLAPSED_ROWS = 5;

export function AlbumActivity({ albumId }: { albumId: string }) {
  const t = useTranslations("dashboard.trips.activity");
  const ts = useTranslations("dashboard.edit.split");
  const { fullModel: model, link } = useDashboard();
  const f = useFormat();
  const { run, busy, error, ready } = useEditRun();
  const [restoring, setRestoring] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const tc = useTranslations("dashboard.common");
  const group = useMemo(() => albumGroupOf(model.raw, albumId), [model, albumId]);

  const days = useMemo(() => {
    if (!group) return [];
    const names = new Map(group.members.map((member) => [member.id, member.name]));
    const lines = group.activity.map((entry) =>
      describeActivity(entry, {
        t: (key, values) => t(key, values),
        selfId: group.selfId,
        nameOf: (id) => (id ? names.get(id) : null) || ts("someone"),
        money: (amount, currency) => f.moneyIn(amount, currency),
        day: (date) => f.day(date, "medium"),
        // As the app: a bill the user paid that someone else entered has no account yet.
        needsAccount: (billId) => {
          const tx = model.txById.get(billId);
          return !!tx?.albumGroupId && !tx.accountId && tx.paidBy === undefined;
        },
        isDeleted: (billId) => !!group.bills.get(billId)?.deleted,
      }),
    );
    return groupActivityByDay(lines, (iso) => {
      const date = parseLocalDate(iso);
      return date ? dayKeyOf(date) : iso.slice(0, 10);
    });
  }, [group, model, f, t, ts]);

  if (!group) return null;
  const canRestore = link.sharedAlbums && offersEdits(link.editing) && !!group.selfId;
  const restore = async (billId: string) => {
    if (!ready || busy) return;
    setRestoring(billId);
    await run([{ entity: "module:albumbill", op: "restore", albumId, billId }], "albumbill_restore");
    setRestoring(null);
  };

  // The newest few until the user asks for all, as the app's card does.
  const total = days.reduce((sum, day) => sum + day.lines.length, 0);
  const shown = expanded
    ? days
    : days.reduce<typeof days>((kept, day) => {
        const room = COLLAPSED_ROWS - kept.reduce((sum, d) => sum + d.lines.length, 0);
        return room > 0 ? [...kept, { ...day, lines: day.lines.slice(0, room) }] : kept;
      }, []);

  return (
    <Card title={t("title")}>
      {days.length === 0 ? (
        <Empty title={t("empty_title")} body={t("empty_message")} mascot="thinking" />
      ) : (
        <div>
          <EditError message={error} />
          {shown.map((day) => (
            <div key={day.day}>
              <p className="px-1 pb-1 pt-2 text-[12px] font-semibold text-foreground-muted">{f.day(day.day, "long")}</p>
              <ul className="divide-y divide-border/40">
                {day.lines.map((line) => {
                  const actor = line.actorId === group.selfId ? ts("me") : (group.members.find((member) => member.id === line.actorId)?.name ?? ts("someone"));
                  const at = parseLocalDate(line.createdAt);
                  return (
                    <li key={line.id} className="relative flex items-center gap-2.5 py-2 pl-3 pr-1">
                      {line.mine !== null ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-primary" /> : null}
                      <span aria-hidden="true" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background-subtle text-[11px] font-extrabold text-foreground-soft">
                        {actor.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] text-foreground">{line.text}</span>
                        {line.mine ? <span className="block truncate text-[12px] font-semibold text-primary">{line.mine}</span> : null}
                      </span>
                      {line.restorable && line.billId && canRestore ? (
                        <button
                          type="button"
                          onClick={() => void restore(line.billId!)}
                          disabled={!ready || busy}
                          className="shrink-0 text-[13px] font-bold text-primary hover:underline disabled:opacity-50"
                        >
                          {restoring === line.billId ? t("restoring") : t("restore")}
                        </button>
                      ) : at ? (
                        <span className="shrink-0 text-[12px] text-foreground-muted">{f.time(at)}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {!expanded && total > COLLAPSED_ROWS ? (
            <button type="button" onClick={() => setExpanded(true)} className="mt-1 w-full border-t border-border/40 pt-2.5 text-center text-[13px] font-bold text-primary hover:underline">
              {tc("viewAll")}
            </button>
          ) : null}
        </div>
      )}
    </Card>
  );
}
