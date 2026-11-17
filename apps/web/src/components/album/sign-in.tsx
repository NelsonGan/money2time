"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { AppleIcon } from "@/components/icons";
import { EVENTS, track } from "@/lib/analytics";

import { AlbumApiError, api, type SessionUser } from "./api";
import { Button, Icon, Mascot } from "./ui";

/**
 * Signing in on the website, with the same account the app uses (the
 * cloud-sync Worker's): Google, Apple, or a code sent by email. Signing in
 * later in the app with the same Google or Apple account, or address, brings
 * the albums along.
 */

/** The Google OAuth client the Worker accepts web ID tokens from (also Android's `webClientId`). */
const GOOGLE_CLIENT_ID = "229377044166-862vte0l859hsifla83k0q1rhjtcs9h0.apps.googleusercontent.com";
/**
 * The Services ID the Worker accepts Apple's web ID tokens from. Its only
 * domain and return URL are album.money2time.com's, so Apple refuses every
 * other host and the button shows there only.
 */
const APPLE_SERVICES_ID = "com.nelsongan.money2time.web";
const APPLE_HOST = "album.money2time.com";
/**
 * Apple's script comes in one build per language, which is the language of
 * its popup; a website locale Apple has no build for gets the US English one.
 */
const APPLE_LOCALES: Record<string, string> = {
  da: "da_DK",
  de: "de_DE",
  "en-au": "en_GB",
  "en-gb": "en_GB",
  "en-nz": "en_GB",
  es: "es_ES",
  fr: "fr_FR",
  hi: "hi_IN",
  id: "id_ID",
  it: "it_IT",
  ja: "ja_JP",
  ko: "ko_KR",
  ms: "ms_MY",
  nb: "no_NO",
  nl: "nl_NL",
  pl: "pl_PL",
  pt: "pt_BR",
  ru: "ru_RU",
  sv: "sv_SE",
  th: "th_TH",
  tr: "tr_TR",
  uk: "uk_UA",
  vi: "vi_VN",
  zh: "zh_CN",
};
const appleScript = (locale: string) => `https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/${APPLE_LOCALES[locale] ?? "en_US"}/appleid.auth.js`;
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
type AppleId = {
  auth: {
    init: (options: Record<string, unknown>) => void;
    signIn: () => Promise<{ authorization?: { id_token?: string }; user?: { name?: { firstName?: string; lastName?: string } } }>;
  };
};
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
    AppleID?: AppleId;
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

function signInErrorKey(error: unknown): string {
  const code = error instanceof AlbumApiError ? error.code : "";
  if (code === "network") return "errors.network";
  if (code === "rate_limited") return "errors.rateLimited";
  if (code === "captcha_failed") return "errors.captcha";
  if (/OTP|INVALID|EXPIRED|TOO_MANY/i.test(code)) return "signIn.wrongCode";
  return "errors.generic";
}

/**
 * The way in, with what it is for beside it: stacked and centred on a phone,
 * side by side on a computer, the buttons on a card of their own.
 */
export function SignInHero({
  pose,
  title,
  body,
  context,
  onSignedIn,
}: {
  pose: "presenting" | "waving";
  title: string;
  body: string;
  context: "home" | "album";
  onSignedIn: (user: SessionUser) => void;
}) {
  return (
    <div className="flex flex-col lg:my-auto lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:gap-16 lg:pb-16">
      <section className="flex flex-col items-center px-2 pt-4 text-center lg:items-start lg:px-0 lg:pt-0 lg:text-left">
        <Mascot pose={pose} size={140} className="lg:!h-[200px] lg:!w-[200px]" />
        <h1 className="mt-3 text-[30px] font-extrabold leading-[1.1] tracking-[-0.035em] text-balance lg:mt-5 lg:text-[52px] lg:leading-[1.04]">{title}</h1>
        <p className="mt-2.5 max-w-[340px] text-[15px] text-foreground-soft text-pretty lg:mt-4 lg:max-w-[480px] lg:text-[18px]">{body}</p>
      </section>
      <section className="mt-7 lg:mt-0 lg:rounded-[28px] lg:border lg:border-border lg:bg-card lg:px-8 lg:py-9 lg:shadow-[var(--shadow-soft)]">
        <SignIn context={context} onSignedIn={onSignedIn} />
      </section>
    </div>
  );
}

/**
 * The three providers' buttons share one outline and one height, so Google's
 * own button, Apple's and email's line up as a set.
 */
const PROVIDER_BUTTON =
  "flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[#dadce0] bg-white px-3 text-[14px] font-medium text-[#1f1f1f] [color-scheme:light] transition-colors hover:bg-[#f7f8f8] disabled:opacity-60";

export function SignIn({ onSignedIn, context }: { onSignedIn: (user: SessionUser) => void; context: "join" | "home" | "album" }) {
  const t = useTranslations("album");
  const [mode, setMode] = useState<"choose" | "email">("choose");
  const [error, setError] = useState<string | null>(null);

  const done = (user: SessionUser, method: "google" | "apple" | "email") => {
    track(EVENTS.albumSignedIn, { method, context });
    onSignedIn(user);
  };

  // One column, no wider than Google draws its button, for every step.
  return (
    <div className="mx-auto flex w-full max-w-[400px] flex-col gap-3">
      {mode === "choose" ? (
        <>
          <GoogleButton onToken={(token) => api.signInWithGoogle(token).then((user) => done(user, "google"), (err: unknown) => setError(t(signInErrorKey(err))))} />
          <AppleButton
            onCredential={(credential) => {
              setError(null);
              return api.signInWithApple(credential).then((user) => done(user, "apple"), (err: unknown) => setError(t(signInErrorKey(err))));
            }}
            onError={() => setError(t("errors.generic"))}
          />
          <button type="button" className={PROVIDER_BUTTON} onClick={() => setMode("email")}>
            <span className="text-primary">
              <Icon name="mail" size={18} />
            </span>
            {t("signIn.email")}
          </button>
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

/**
 * Google's own button (Google Identity Services), in the page's language, the
 * width of the column: drawn again when the column changes width (a phone
 * turned, a window resized), since Google draws it at a fixed width.
 */
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
    let observer: ResizeObserver | null = null;
    let timer = 0;
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
        let drawn = 0;
        const draw = () => {
          // Google draws 200 to 400 pixels wide; the column's layout width, whatever transform it is under.
          const width = Math.min(400, Math.max(200, element.clientWidth));
          if (width === drawn) return;
          drawn = width;
          id.renderButton(element, { type: "standard", theme: "outline", size: "large", shape: "pill", text: "continue_with", logo_alignment: "center", width, locale });
        };
        draw();
        // Each draw loads Google's frame again: once the resize has settled, not on every step of it.
        observer = new ResizeObserver(() => {
          window.clearTimeout(timer);
          timer = window.setTimeout(draw, 150);
        });
        observer.observe(element);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      observer?.disconnect();
      window.clearTimeout(timer);
    };
  }, [locale]);
  if (failed) return null;
  return <div ref={ref} className="flex min-h-[44px] w-full justify-center [color-scheme:light]" />;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type AppleCredential = { idToken: string; nonce: string; firstName?: string; lastName?: string };

/** Points Apple's script at a fresh nonce for the next sign-in; returns the raw nonce. */
async function prepareApple(): Promise<string> {
  const raw = crypto.randomUUID();
  window.AppleID?.auth.init({ clientId: APPLE_SERVICES_ID, scope: "name email", redirectURI: `${window.location.origin}/`, nonce: await sha256Hex(raw), usePopup: true });
  return raw;
}

/**
 * Sign in with Apple in Apple's popup, drawn like Google's outline button
 * beside it. Apple puts the SHA-256 of a fresh nonce in its ID token and the
 * Worker gets the raw one, as in the app. The nonce is ready before the click,
 * because a popup opened after an await is blocked.
 */
function AppleButton({ onCredential, onError }: { onCredential: (credential: AppleCredential) => Promise<void>; onError: () => void }) {
  const t = useTranslations("album");
  const locale = useLocale();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const nonce = useRef<string | null>(null);

  useEffect(() => {
    if (window.location.hostname !== APPLE_HOST) return;
    let live = true;
    // The page's language, else English: a missing build must not hide the button.
    loadScript(appleScript(locale))
      .catch(() => loadScript(appleScript("en")))
      .then(prepareApple)
      .then((raw) => {
        nonce.current = raw;
        if (live) setReady(true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [locale]);

  if (!ready) return null;

  const signIn = async () => {
    const raw = nonce.current;
    const apple = window.AppleID;
    if (!raw || !apple || busy) return;
    setBusy(true);
    nonce.current = null;
    try {
      const response = await apple.auth.signIn();
      const idToken = response.authorization?.id_token;
      if (!idToken) throw new Error("no token");
      const name = response.user?.name;
      await onCredential({ idToken, nonce: raw, firstName: name?.firstName || undefined, lastName: name?.lastName || undefined });
    } catch (err) {
      // Closing Apple's popup or pressing Cancel there is not an error.
      const code = (err as { error?: unknown } | null)?.error;
      if (code !== "popup_closed_by_user" && code !== "user_cancelled_authorize") onError();
    } finally {
      nonce.current = await prepareApple().catch(() => null);
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={() => void signIn()} disabled={busy} className={PROVIDER_BUTTON}>
      <AppleIcon className="h-[18px] w-[18px] shrink-0" />
      {t("signIn.apple")}
    </button>
  );
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
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
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
