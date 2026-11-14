"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import type { AlbumView } from "@/lib/album/group";

import { useSite } from "./site";
import { api } from "./api";
import { GetTheApp } from "./get-app";
import { Page } from "./join-screen";
import { SignIn } from "./sign-in";
import { Button, Icon, Mascot, Spinner } from "./ui";

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
      <Page>
        <section className="flex flex-col items-center px-2 pt-4 text-center">
          <Mascot pose="presenting" size={140} />
          <h1 className="mt-3 text-[30px] font-extrabold leading-[1.1] tracking-[-0.035em] text-balance">{t("home.landingTitle")}</h1>
          <p className="mt-2.5 max-w-[340px] text-[15px] text-foreground-soft text-pretty">{t("home.landingBody")}</p>
        </section>
        <section className="mt-7">
          <SignIn context="home" onSignedIn={setUser} />
        </section>
      </Page>
    );
  }
  return (
    <Page
      action={
        <Button tone="plain" size="sm" onClick={() => void signOut()}>
          <Icon name="logout" size={16} />
          {t("signOut")}
        </Button>
      }
    >
      <AlbumList />
    </Page>
  );
}

function AlbumList() {
  const t = useTranslations("album");
  const { user, go } = useSite();
  const [albums, setAlbums] = useState<AlbumView[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .albums()
      .then((list) => live && setAlbums(list))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">{t("home.title")}</h1>
      <p className="mb-5 mt-0.5 text-[14px] text-foreground-soft">{t("home.signedInAs", { email: user?.email ?? "" })}</p>
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
        <ul className="flex flex-col gap-3">
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
