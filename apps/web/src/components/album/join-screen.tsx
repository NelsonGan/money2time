"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { cleanName, MAX_NAME } from "@/lib/album/group";
import { EVENTS, track } from "@/lib/analytics";

import { useSite } from "./site";
import { AlbumApiError, api, type InvitePreview } from "./api";
import { GetTheApp, appInviteLink } from "./get-app";
import { SignIn } from "./sign-in";
import { Avatar, Button, Mascot, Spinner, Wordmark } from "./ui";

/**
 * An album's invite link: who invited whom to what, then sign in, choose the
 * name the group sees, join, and pick the web or the app. Someone with the
 * app can open the link there instead at any point.
 */
export function JoinScreen({ code }: { code: string }) {
  const t = useTranslations("album");
  const { user, setUser, signOut, go } = useSite();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [problem, setProblem] = useState<"expired" | "ledger" | "network" | null>(null);
  const [joinedId, setJoinedId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .invite(code)
      .then((value) => {
        if (!live) return;
        setPreview(value);
        // A full album still lets its own people back in: joining says when it is full.
        if (value.kind !== "album") setProblem("ledger");
      })
      .catch((error: unknown) => live && setProblem(error instanceof AlbumApiError && error.status === 404 ? "expired" : "network"));
    return () => {
      live = false;
    };
  }, [code]);

  if (joinedId && preview) return <Joined preview={preview} onWeb={() => go({ name: "album", shareId: joinedId, tab: "transactions" }, { replace: true })} code={code} />;

  // On a computer the invite and the way in sit side by side.
  return (
    <Page wide>
      {problem ? (
        <div className="mx-auto w-full max-w-[428px]">
          <InviteProblem problem={problem} code={code} ownerName={preview?.ownerName ?? null} />
        </div>
      ) : !preview ? (
        <div className="flex justify-center py-24 text-primary">
          <Spinner size={28} />
        </div>
      ) : (
        <div className="flex flex-col lg:my-auto lg:grid lg:grid-cols-[minmax(0,1fr)_440px] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-12 lg:pb-12">
          <div className="lg:col-start-1 lg:row-start-1">
            <InviteCard preview={preview} />
          </div>
          <section className="mt-7 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:rounded-[28px] lg:border lg:border-border lg:bg-card lg:px-8 lg:py-8 lg:shadow-[var(--shadow-soft)]">
            {user ? (
              <JoinForm
                code={code}
                preview={preview}
                defaultName={defaultMemberName(user)}
                email={user.email}
                onSignOut={() => void signOut()}
                onSignedOut={() => setUser(null)}
                onJoined={(shareId) => setJoinedId(shareId)}
                onOpen={(shareId) => go({ name: "album", shareId, tab: "transactions" }, { replace: true })}
              />
            ) : (
              <>
                <h2 className="mb-1 text-[24px] font-extrabold tracking-[-0.03em]">{t("join.signInTitle")}</h2>
                <p className="mb-5 text-[14.5px] text-foreground-soft">{t("join.signInBody")}</p>
                <SignIn context="join" onSignedIn={setUser} />
              </>
            )}
          </section>
          <div className="lg:col-start-1 lg:row-start-2">
            <AppCallout code={code} />
          </div>
        </div>
      )}
    </Page>
  );
}

/** The name a new member starts with: their account's, else their address's first part, capitalised ("tess" → "Tess"). */
export function defaultMemberName(user: { name: string; email: string }): string {
  const fromEmail = cleanName(user.email.split("@")[0]?.replace(/[._-]+/g, " "));
  return cleanName(user.name) ?? (fromEmail ? fromEmail.charAt(0).toLocaleUpperCase() + fromEmail.slice(1) : "");
}

/**
 * A page under the wordmark, which stays in one place on every page: the
 * wordmark spans a computer's window (up to 1120 pixels), and the page below
 * keeps a phone's column unless it is `wide` (laid out in columns there).
 */
export function Page({ children, action, wide = false }: { children: ReactNode; action?: ReactNode; wide?: boolean }) {
  const t = useTranslations("album");
  const { go } = useSite();
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col px-4 pb-10 pt-5 sm:px-6 lg:px-10 lg:pt-7">
      <header className="mb-5 flex items-center justify-between gap-3">
        <button type="button" onClick={() => go({ name: "home" })} aria-label={t("home.title")}>
          <Wordmark />
        </button>
        {action}
      </header>
      <div className={`flex w-full flex-1 flex-col ${wide ? "" : "mx-auto max-w-[428px]"}`}>{children}</div>
    </div>
  );
}

function InviteCard({ preview }: { preview: InvitePreview }) {
  const t = useTranslations("album");
  const name = preview.name || t("untitled");
  return (
    <section className="overflow-hidden rounded-[28px] border border-border bg-card shadow-[var(--shadow-soft)]">
      <div className="relative flex h-[150px] items-center justify-center bg-[linear-gradient(160deg,#F8E7EA_0%,#EED3D8_55%,#E4C3CA_100%)]">
        <span className="text-[64px] font-extrabold leading-none tracking-[-0.04em] text-[#5E7D6E]/85">{Array.from(name)[0]?.toUpperCase()}</span>
        <Mascot pose="waving" size={88} className="absolute bottom-0 right-4" />
      </div>
      <div className="px-5 pb-5 pt-4">
        <p className="eyebrow">{t("join.eyebrow")}</p>
        <h1 className="mt-1 text-[28px] font-extrabold leading-tight tracking-[-0.03em] [overflow-wrap:anywhere]">{name}</h1>
        <p className="mt-1 text-[15px] text-foreground-soft">{t("join.invitedBy", { name: preview.ownerName || t("someone") })}</p>
        <div className="mt-3 flex items-center gap-2.5">
          {/* The owner, and how many more: the others' names are for the people in it. */}
          <span className="flex items-center">
            <Avatar name={preview.ownerName || "?"} color="#4E7BD1" size={30} ring />
            {preview.memberCount > 0 ? (
              <span className="-ml-2 inline-flex h-[30px] min-w-[30px] items-center justify-center rounded-full bg-background-subtle px-1.5 text-[12px] font-bold text-foreground-soft ring-2 ring-card">
                +{preview.memberCount}
              </span>
            ) : null}
          </span>
          <span className="text-[14px] font-semibold text-foreground-soft">{t("people.count", { count: preview.memberCount + 1 })}</span>
        </div>
      </div>
    </section>
  );
}

function JoinForm({
  code,
  preview,
  defaultName,
  email,
  onSignOut,
  onSignedOut,
  onJoined,
  onOpen,
}: {
  code: string;
  preview: InvitePreview;
  defaultName: string;
  email: string;
  onSignOut: () => void;
  onSignedOut: () => void;
  onJoined: (shareId: string) => void;
  onOpen: (shareId: string) => void;
}) {
  const t = useTranslations("album");
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async (event: FormEvent) => {
    event.preventDefault();
    const chosen = cleanName(name);
    if (!chosen || busy) return;
    setBusy(true);
    setError(null);
    try {
      const shareId = await api.join(code, chosen);
      track(EVENTS.albumJoined, { result: "joined" });
      onJoined(shareId);
    } catch (err) {
      const code = err instanceof AlbumApiError ? err.code : "";
      if (code === "own_ledger") {
        // The owner opening their own link: their album is already here.
        const own = (await api.albums().catch(() => [])).find((album) => album.ledgerId === preview.ledgerId);
        if (own) {
          onOpen(own.id);
          return;
        }
      }
      track(EVENTS.albumJoined, { result: code === "full" ? "full" : code === "invite_not_found" ? "expired" : "failed" });
      // A session the Worker no longer knows (the server has cleared its cookie): sign in again.
      if (code === "unauthorized") {
        onSignedOut();
        return;
      }
      setError(
        code === "full"
          ? t("join.full")
          : code === "invite_not_found"
            ? t("join.expiredBody", { name: preview.ownerName || t("someone") })
            : code === "network"
              ? t("errors.network")
              : t("errors.generic"),
      );
      setBusy(false);
    }
  };

  return (
    <form onSubmit={join} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="px-1 text-[13px] font-bold text-foreground-soft">{t("join.nameLabel")}</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_NAME}
          autoComplete="nickname"
          className="h-14 rounded-[18px] border border-border bg-card px-5 text-[17px] font-semibold text-foreground outline-none focus:border-primary"
        />
      </label>
      <Button type="submit" size="lg" busy={busy} disabled={!cleanName(name)} className="w-full">
        {t("join.join")}
      </Button>
      {error ? (
        <p role="alert" className="text-center text-[13.5px] font-semibold text-error">
          {error}
        </p>
      ) : null}
      <p className="text-center text-[13px] text-foreground-muted">
        {t("join.signedInAs", { email })}{" "}
        <button type="button" onClick={onSignOut} className="font-semibold text-foreground-soft underline-offset-2 hover:underline">
          {t("signOut")}
        </button>
      </p>
    </form>
  );
}

/** For someone who already has the app: the same link, opened there. */
function AppCallout({ code }: { code: string }) {
  const t = useTranslations("album");
  return (
    <a
      href={appInviteLink(code)}
      onClick={() => track(EVENTS.albumOpenInApp, { placement: "join_page" })}
      className="mt-8 flex items-center justify-between gap-3 rounded-[22px] lg:mt-5 border border-border bg-card px-5 py-4 text-[14.5px] font-semibold shadow-[var(--shadow-soft)] hover:bg-background-subtle"
    >
      <span>{t("join.haveApp")}</span>
      <span className="shrink-0 rounded-full bg-primary-soft px-3.5 py-1.5 text-[13px] font-bold text-primary">{t("join.openInApp")}</span>
    </a>
  );
}

function InviteProblem({ problem, code, ownerName }: { problem: "expired" | "ledger" | "network"; code: string; ownerName: string | null }) {
  const t = useTranslations("album");
  const { go } = useSite();
  const copy = {
    expired: { title: t("join.expiredTitle"), body: t("join.expiredBody", { name: ownerName || t("someone") }) },
    ledger: { title: t("join.ledgerTitle"), body: t("join.ledgerBody") },
    network: { title: t("errors.networkTitle"), body: t("errors.network") },
  }[problem];
  return (
    <section className="mt-6 flex flex-col items-center rounded-[28px] border border-border bg-card px-6 pb-7 pt-6 text-center shadow-[var(--shadow-soft)]">
      <Mascot pose="thinking" size={120} />
      <h1 className="mt-2 text-[22px] font-extrabold tracking-[-0.02em]">{copy.title}</h1>
      <p className="mt-1.5 max-w-[320px] text-[14.5px] text-foreground-soft">{copy.body}</p>
      {problem === "ledger" ? (
        <a href={appInviteLink(code, "ledger")} className="mt-5 inline-flex h-12 items-center rounded-full bg-primary px-6 text-[15px] font-bold text-card">
          {t("join.openInApp")}
        </a>
      ) : problem === "network" ? (
        <Button className="mt-5" onClick={() => window.location.reload()}>
          {t("retry")}
        </Button>
      ) : (
        <button type="button" onClick={() => go({ name: "home" })} className="mt-5 text-[14px] font-bold text-primary hover:underline">
          {t("home.title")}
        </button>
      )}
    </section>
  );
}

/** After joining: the album on the web now, or the app. */
function Joined({ preview, onWeb, code }: { preview: InvitePreview; onWeb: () => void; code: string }) {
  const t = useTranslations("album");
  return (
    <Page>
      <section className="flex flex-col items-center rounded-[28px] border border-border bg-card px-6 pb-7 pt-6 text-center shadow-[var(--shadow-soft)]">
        <Mascot pose="love" size={128} />
        <p className="eyebrow mt-2">{t("joined.eyebrow")}</p>
        <h1 className="mt-1 text-[26px] font-extrabold leading-tight tracking-[-0.03em] [overflow-wrap:anywhere]">{t("joined.title", { name: preview.name || t("untitled") })}</h1>
        <p className="mt-2 max-w-[330px] text-[14.5px] text-foreground-soft">{t("joined.body")}</p>
        <Button size="lg" className="mt-6 w-full" onClick={onWeb}>
          {t("joined.web")}
        </Button>
      </section>
      <GetTheApp code={code} placement="album_joined" />
    </Page>
  );
}
