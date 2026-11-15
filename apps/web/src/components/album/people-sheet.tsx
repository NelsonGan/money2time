"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";

import { cleanName, MAX_NAME, type Group, type Member } from "@/lib/album/group";
import { renameRow, simplifyRow } from "@/lib/album/writes";

import { useSite } from "./site";
import { writeErrorKey, type AlbumActions } from "./album-screen";
import { api } from "./api";
import { Avatar, Button, Confirm, Icon, InfoTip, Sheet, Switch, personColor } from "./ui";

/**
 * The album's People, as the app's page: the user (whose name the others see,
 * theirs to change), everyone who joined, Joined or Left; the owner's invite
 * link; Simplify group debts; and Leave. The owner can take someone out.
 */
export function PeopleSheet({ group, actions, onClose, onLeft }: { group: Group; actions: AlbumActions; onClose: () => void; onLeft: () => void }) {
  const t = useTranslations("album");
  const { user, signOut } = useSite();
  const owner = group.album.role === "owner";
  const self = group.members.find((member) => member.id === group.selfId) ?? null;
  const others = group.members.filter((member) => member.id !== group.selfId).sort((a, b) => Number(!!b.userId) - Number(!!a.userId));
  const [confirm, setConfirm] = useState<{ kind: "leave" } | { kind: "remove"; member: Member } | null>(null);
  const [busy, setBusy] = useState(false);
  // Off while it saves: a second tap would be planned from the same read and refused as stale.
  async function toggleSimplify(on: boolean) {
    setBusy(true);
    try {
      await actions.write([simplifyRow(group, on)], "simplify");
    } finally {
      setBusy(false);
    }
  }
  const [error, setError] = useState<string | null>(null);

  const leave = async () => {
    setBusy(true);
    try {
      await api.leave(group.album.id);
      onLeft();
    } catch (err) {
      setError(t(writeErrorKey(err)));
      setBusy(false);
    }
  };
  const remove = async (member: Member) => {
    if (!member.userId) return;
    setBusy(true);
    try {
      await api.removeMember(group.album.id, member.userId);
      setConfirm(null);
      await actions.reload();
    } catch (err) {
      setError(t(writeErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={t("people.title")} onClose={onClose} busy={busy}>
      <div className="flex flex-col gap-4">
        {confirm?.kind === "leave" ? (
          <Confirm
            title={t("people.leaveTitle", { name: group.album.name || t("untitled") })}
            body={t("people.leaveBody")}
            actions={[
              { label: t("cancel"), onClick: () => setConfirm(null) },
              { label: t("people.leave"), tone: "danger", onClick: () => void leave(), disabled: busy },
            ]}
          />
        ) : null}
        {confirm?.kind === "remove" ? (
          <Confirm
            title={t("people.removeTitle", { name: confirm.member.name })}
            body={t("people.removeBody")}
            actions={[
              { label: t("cancel"), onClick: () => setConfirm(null) },
              { label: t("people.remove"), tone: "danger", onClick: () => void remove(confirm.member), disabled: busy },
            ]}
          />
        ) : null}
        {error ? (
          <p role="alert" className="rounded-[16px] bg-error-soft px-4 py-2.5 text-[13.5px] font-semibold text-error">
            {error}
          </p>
        ) : null}

        <ul className="rounded-[22px] border border-border bg-card">
          {self ? <SelfRow group={group} self={self} actions={actions} /> : null}
          {others.map((member) => (
            <li key={member.id} className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0">
              <Avatar name={member.name} color={personColor(group.members, member.id, group.selfId)} size={36} />
              <span className="min-w-0 flex-1 truncate text-[15.5px] font-semibold">{member.name}</span>
              <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${member.userId ? "bg-success-soft text-success" : "bg-background-subtle text-foreground-muted"}`}>
                {member.userId ? t("people.joined") : t("people.left")}
              </span>
              {owner && member.userId ? (
                <button type="button" onClick={() => setConfirm({ kind: "remove", member })} aria-label={t("people.removeTitle", { name: member.name })} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-foreground-muted hover:bg-error-soft hover:text-error">
                  <Icon name="close" size={16} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {owner ? <InviteLink shareId={group.album.id} /> : null}

        <div className="flex items-center justify-between gap-3 rounded-[22px] border border-border bg-card px-4 py-3">
          <span className="flex items-center gap-1 text-[15px] font-bold">
            {t("people.simplify")}
            <InfoTip label={t("people.simplify")} text={t("people.simplifyInfo")} />
          </span>
          <Switch checked={group.simplify} disabled={!group.selfId || busy} label={t("people.simplify")} onChange={(on) => void toggleSimplify(on)} />
        </div>

        {!owner && group.selfId ? (
          <Button tone="danger" className="w-full" onClick={() => setConfirm({ kind: "leave" })}>
            {t("people.leave")}
          </Button>
        ) : null}

        <p className="pb-1 text-center text-[13px] text-foreground-muted">
          {t("join.signedInAs", { email: user?.email ?? "" })}{" "}
          <button type="button" onClick={() => void signOut()} className="font-semibold text-foreground-soft hover:underline">
            {t("signOut")}
          </button>
        </p>
      </div>
    </Sheet>
  );
}

/** The user's own row: the name the others see, theirs to change. */
function SelfRow({ group, self, actions }: { group: Group; self: Member; actions: AlbumActions }) {
  const t = useTranslations("album");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(self.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const cleaned = cleanName(name);
    if (!cleaned || busy) return;
    if (cleaned === self.name) {
      setEditing(false);
      return;
    }
    const key = cleaned.toLocaleLowerCase();
    if (group.members.some((member) => member.id !== self.id && member.userId && member.name.toLocaleLowerCase() === key)) {
      setError(t("people.nameTaken"));
      return;
    }
    setBusy(true);
    const ok = await actions.write([renameRow(self.id, cleaned)], "rename");
    setBusy(false);
    if (ok) {
      setEditing(false);
      setError(null);
    }
  };

  return (
    <li className="px-4 py-3">
      {editing ? (
        <form onSubmit={save} className="flex items-center gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={MAX_NAME}
            autoFocus
            aria-label={t("people.yourName")}
            className="h-11 min-w-0 flex-1 rounded-[14px] border border-border bg-background-subtle px-3.5 text-[15.5px] font-semibold outline-none focus:border-primary"
          />
          <Button type="submit" size="sm" busy={busy} disabled={!cleanName(name)}>
            {t("save")}
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <Avatar name={self.name} color={null} size={36} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15.5px] font-bold">{self.name}</span>
            <span className="text-[12.5px] font-semibold text-primary">{t("people.you")}</span>
          </span>
          <Button tone="plain" size="sm" onClick={() => setEditing(true)}>
            {t("people.rename")}
          </Button>
        </div>
      )}
      {error ? <p className="mt-1.5 text-[13px] font-semibold text-error">{error}</p> : null}
    </li>
  );
}

/** The owner's invite link: the same 24-hour link the app hands out, copied or shared. */
function InviteLink({ shareId }: { shareId: string }) {
  const t = useTranslations("album");
  const [link, setLink] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "copied" | "failed" | "busy">("idle");

  useEffect(() => {
    let live = true;
    api.inviteLink(shareId).then(
      (value) => live && setLink(value.url),
      () => live && setState("failed"),
    );
    return () => {
      live = false;
    };
  }, [shareId]);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setState("copied");
      window.setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("failed");
    }
  };
  const share = async () => {
    if (!link) return;
    if (navigator.share) {
      await navigator.share({ url: link, title: t("people.inviteShareTitle") }).catch(() => undefined);
    } else {
      await copy();
    }
  };
  const rotate = async () => {
    setState("busy");
    try {
      setLink((await api.inviteLink(shareId, true)).url);
      setState("idle");
    } catch {
      setState("failed");
    }
  };

  return (
    <div className="rounded-[22px] border border-border bg-card px-4 py-3.5">
      <p className="flex items-center gap-1 text-[15px] font-bold">
        {t("people.invite")}
        <InfoTip label={t("people.invite")} text={t("people.inviteInfo")} />
      </p>
      <p className="mt-1 truncate rounded-[12px] bg-background-subtle px-3 py-2 font-mono text-[12.5px] text-foreground-soft">{link ?? "…"}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void share()} disabled={!link}>
          <Icon name="share" size={16} />
          {t("people.share")}
        </Button>
        <Button size="sm" tone="plain" onClick={() => void copy()} disabled={!link}>
          <Icon name={state === "copied" ? "check" : "copy"} size={16} />
          {state === "copied" ? t("people.copied") : t("people.copy")}
        </Button>
        <Button size="sm" tone="plain" onClick={() => void rotate()} busy={state === "busy"}>
          {t("people.newLink")}
        </Button>
      </div>
      {state === "failed" ? <p className="mt-2 text-[13px] font-semibold text-error">{t("errors.generic")}</p> : null}
    </div>
  );
}
