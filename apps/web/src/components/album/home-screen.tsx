"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import type { AlbumView } from "@/lib/album/group";

import { useSite } from "./site";
import { AlbumApiError, api } from "./api";
import { GetTheApp } from "./get-app";
import { Page } from "./join-screen";
import { SignInHero } from "./sign-in";
import { Icon, Mascot, Spinner } from "./ui";

/**
 * album.money2time.com on its own: the visitor's shared albums once signed
 * in, else what the site is for and the way in. Albums are started in the
 * app; here they are joined with a link and used.
 */
export function HomeScreen() {
  const t = useTranslations("album");
  const { user, setUser, signOut } = useSite();
  if (!user) {
    return (
      <Page wide="lg">
        <SignInHero pose="presenting" title={t("home.landingTitle")} body={t("home.landingBody")} context="home" onSignedIn={setUser} />
      </Page>
    );
  }
  return <SignedInHome email={user.email} onSignOut={() => void signOut()} />;
}

/** The albums as a grid from a tablet's width; no albums yet, or none read, stays in the phone's column. */
function SignedInHome({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const t = useTranslations("album");
  const [albums, setAlbums] = useState<AlbumView[] | null>(null);
  return (
    <Page wide={albums?.length ? "sm" : undefined}>
      <AlbumList albums={albums} setAlbums={setAlbums} />
      <p className="mt-6 text-center text-[13px] text-foreground-muted">
        {t("join.signedInAs", { email })}{" "}
        <button type="button" onClick={onSignOut} className="font-semibold text-foreground-soft hover:underline">
          {t("signOut")}
        </button>
      </p>
    </Page>
  );
}

function AlbumList({ albums, setAlbums }: { albums: AlbumView[] | null; setAlbums: (albums: AlbumView[]) => void }) {
  const t = useTranslations("album");
  const { go, setUser } = useSite();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .albums()
      .then((list) => live && setAlbums(list))
      .catch((error: unknown) => {
        if (!live) return;
        // A session the Worker no longer knows: sign in again.
        if (error instanceof AlbumApiError && error.code === "unauthorized") setUser(null);
        else setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [setAlbums, setUser]);

  return (
    <>
      <h1 className="mb-5 text-[28px] font-extrabold tracking-[-0.03em]">{t("home.title")}</h1>
      {failed ? (
        <p role="alert" className="rounded-[20px] bg-error-soft px-4 py-3 text-[14px] font-semibold text-error">
          {t("errors.network")}
        </p>
      ) : !albums ? (
        <div className="flex justify-center py-16 text-primary">
          <Spinner size={26} />
        </div>
      ) : albums.length === 0 ? (
        <section className="flex flex-col items-center rounded-[28px] border border-border bg-card px-6 pb-7 pt-5 text-center shadow-[var(--shadow-soft)]">
          <Mascot pose="searching" size={120} />
          <h2 className="mt-2 text-[19px] font-extrabold">{t("home.emptyTitle")}</h2>
          <p className="mt-1 max-w-[320px] text-[14px] text-foreground-soft">{t("home.emptyBody")}</p>
        </section>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {albums.map((album) => (
            <li key={album.id}>
              <button
                type="button"
                onClick={() => go({ name: "album", shareId: album.id, tab: "transactions" })}
                className="flex w-full items-center gap-4 rounded-[24px] border border-border bg-card p-3 pr-4 text-left shadow-[var(--shadow-soft)] transition-transform active:scale-[0.99]"
              >
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] bg-[linear-gradient(160deg,#F8E7EA_0%,#E4C3CA_100%)] text-[28px] font-extrabold text-[#5E7D6E]/85">
                  {Array.from(album.name || t("untitled"))[0]?.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] font-bold">{album.name || t("untitled")}</span>
                  <span className="block truncate text-[13.5px] text-foreground-soft">
                    {album.role === "owner" ? `${t("home.yours")} · ` : ""}
                    {t("people.count", { count: album.memberCount + 1 })}
                  </span>
                </span>
                <span className="text-foreground-muted">
                  <Icon name="chevron" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <GetTheApp placement="album_home" />
    </>
  );
}
