"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { EVENTS, track } from "@/lib/analytics";

import { AlbumApiError, api, type SessionUser } from "./api";
import { Button, Icon } from "./ui";

/**
 * Signing in on the website, with the same account the app uses (the
 * cloud-sync Worker's): Google, or a code sent by email. Signing in later in
 * the app with the same Google account or address brings the albums along.
 */

/** The Google OAuth client the Worker accepts web ID tokens from (also Android's `webClientId`). */
const GOOGLE_CLIENT_ID = "229377044166-862vte0l859hsifla83k0q1rhjtcs9h0.apps.googleusercontent.com";
/** The Turnstile widget the app's email sign-in uses; its domain covers album.money2time.com. */
const TURNSTILE_SITE_KEY = "0x4AAAAAAFqdQg_MRfc4cWPB";
/** Cloudflare's test key that always passes, for `*.localhost` (the local Worker skips the check). */
const TURNSTILE_TEST_KEY = "1x00000000000000000000AA";
const TURNSTILE_TIMEOUT_MS = 45_000;

type GoogleId = {
  initialize: (options: Record<string, unknown>) => void;
  renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
};
type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  execute: (widget: string) => void;
  reset: (widget: string) => void;
  remove: (widget: string) => void;
};
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
    turnstile?: Turnstile;
  }
}

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  let loading = scripts.get(src);
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scripts.delete(src);
        reject(new Error("script"));
      };
      document.head.appendChild(script);
    });
    scripts.set(src, loading);
  }
  return loading;
}

export function signInErrorKey(error: unknown): string {
  const code = error instanceof AlbumApiError ? error.code : "";
  if (code === "network") return "errors.network";
  if (code === "rate_limited") return "errors.rateLimited";
  if (code === "captcha_failed") return "errors.captcha";
  if (/OTP|INVALID|EXPIRED|TOO_MANY/i.test(code)) return "signIn.wrongCode";
  return "errors.generic";
}

export function SignIn({ onSignedIn, context }: { onSignedIn: (user: SessionUser) => void; context: "join" | "home" | "album" }) {
  const t = useTranslations("album");
  const [mode, setMode] = useState<"choose" | "email">("choose");
  const [error, setError] = useState<string | null>(null);

  const done = (user: SessionUser, method: "google" | "email") => {
    track(EVENTS.albumSignedIn, { method, context });
    onSignedIn(user);
  };

  return (
    <div className="flex flex-col gap-3">
      {mode === "choose" ? (
        <>
          <GoogleButton onToken={(token) => api.signInWithGoogle(token).then((user) => done(user, "google"), (err: unknown) => setError(t(signInErrorKey(err))))} />
          <Button tone="plain" className="h-11 w-full !text-[15px] !font-semibold" onClick={() => setMode("email")}>
            <span className="text-primary">
              <Icon name="mail" />
            </span>
            {t("signIn.email")}
          </Button>
          {error ? (
            <p role="alert" className="text-center text-[13.5px] font-semibold text-error">
              {error}
            </p>
          ) : null}
        </>
      ) : (
        <EmailSignIn onSignedIn={(user) => done(user, "email")} onBack={() => setMode("choose")} />
      )}
    </div>
  );
}

/** Google's own button (Google Identity Services), in the page's language, the width of the column. */
function GoogleButton({ onToken }: { onToken: (idToken: string) => void }) {
  const locale = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const tokenRef = useRef(onToken);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    tokenRef.current = onToken;
  });
  useEffect(() => {
    let live = true;
    loadScript("https://accounts.google.com/gsi/client")
      .then(() => {
        const id = window.google?.accounts?.id;
        const element = ref.current;
        if (!live || !id || !element) return;
        id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response: { credential?: string }) => response.credential && tokenRef.current(response.credential),
          ux_mode: "popup",
          auto_select: false,
          use_fedcm_for_button: true,
        });
        id.renderButton(element, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          logo_alignment: "center",
          width: Math.min(400, Math.max(240, Math.round(element.getBoundingClientRect().width))),
          locale,
        });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [locale]);
  if (failed) return null;
  return <div ref={ref} className="flex min-h-[44px] w-full justify-center [color-scheme:light]" />;
}

function EmailSignIn({ onSignedIn, onBack }: { onSignedIn: (user: SessionUser) => void; onBack: () => void }) {
  const t = useTranslations("album");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const waiting = useRef<{ resolve: (token: string | null) => void } | null>(null);

  useEffect(
    () => () => {
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
    },
    [],
  );

  /** A fresh Turnstile answer; null when the widget will not load (the Worker then refuses, and says so). */
  const captcha = async (): Promise<string | null> => {
    try {
      await loadScript("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
    } catch {
      return null;
    }
    const turnstile = window.turnstile;
    if (!turnstile || !widgetRef.current) return null;
    return new Promise<string | null>((resolve) => {
      const timer = window.setTimeout(() => finish(null), TURNSTILE_TIMEOUT_MS);
      const finish = (token: string | null) => {
        window.clearTimeout(timer);
        waiting.current = null;
        setChallenge(false);
        resolve(token);
      };
      waiting.current = { resolve: finish };
      if (!widgetId.current) {
        const local = window.location.hostname === "localhost" || window.location.hostname.endsWith(".localhost");
        widgetId.current = turnstile.render(widgetRef.current!, {
          sitekey: local ? TURNSTILE_TEST_KEY : TURNSTILE_SITE_KEY,
          execution: "execute",
          appearance: "interaction-only",
          callback: (token: string) => waiting.current?.resolve(token),
          "error-callback": () => waiting.current?.resolve(null),
          "before-interactive-callback": () => setChallenge(true),
        });
      } else {
        turnstile.reset(widgetId.current);
      }
      turnstile.execute(widgetId.current);
    });
  };

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || busy) {
      setError(t("signIn.badEmail"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.sendEmailCode(address, await captcha());
      setSentTo(address);
      setCode("");
    } catch (err) {
      setError(t(signInErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (entered = code) => {
    if (!sentTo || entered.trim().length < 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await api.signInWithEmail(sentTo, entered.trim()));
    } catch (err) {
      setError(t(signInErrorKey(err)));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {sentTo ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void verify();
          }}
          className="flex flex-col gap-3"
        >
          <p className="text-center text-[14px] text-foreground-soft">{t.rich("signIn.codeSent", { email: sentTo, strong: (chunks) => <strong className="text-foreground">{chunks}</strong> })}</p>
          <input
            value={code}
            onChange={(event) => {
              const next = event.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(next);
              // The sixth digit signs in, as the app's code field does.
              if (next.length === 6 && code.length < 6) void verify(next);
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label={t("signIn.codeLabel")}
            placeholder="••••••"
            autoFocus
            className="h-14 rounded-[18px] border border-border bg-card text-center text-[26px] font-bold tracking-[0.35em] text-foreground outline-none tabular focus:border-primary"
          />
          <Button type="submit" size="lg" busy={busy} disabled={code.length < 6} className="w-full">
            {t("signIn.verify")}
          </Button>
          <div className="flex justify-center gap-4 text-[13.5px] font-semibold">
            <button type="button" onClick={() => void send()} disabled={busy} className="text-primary hover:underline disabled:opacity-50">
              {t("signIn.resend")}
            </button>
            <button type="button" onClick={() => setSentTo(null)} className="text-foreground-soft hover:text-foreground">
              {t("signIn.otherEmail")}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={send} className="flex flex-col gap-3">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            inputMode="email"
            autoComplete="email"
            aria-label={t("signIn.emailLabel")}
            placeholder={t("signIn.emailPlaceholder")}
            autoFocus
            className="h-14 rounded-[18px] border border-border bg-card px-5 text-[16px] text-foreground outline-none placeholder:text-foreground-muted focus:border-primary"
          />
          <Button type="submit" size="lg" busy={busy} className="w-full">
            {t("signIn.sendCode")}
          </Button>
          <button type="button" onClick={onBack} className="mx-auto text-[13.5px] font-semibold text-foreground-soft hover:text-foreground">
            {t("signIn.otherWays")}
          </button>
        </form>
      )}
      <div ref={widgetRef} className={challenge ? "flex justify-center" : "h-0 overflow-hidden"} />
      {error ? (
        <p role="alert" className="text-center text-[13.5px] font-semibold text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
