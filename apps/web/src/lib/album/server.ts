/**
 * The shared-album website's API (`/api/*` on album.money2time.com): a thin,
 * allowlisted front for the cloud-sync Worker, which holds the accounts and
 * the albums. The browser never sees a session token: signing in stores the
 * Worker's token in an HttpOnly cookie on this host, and every call here
 * turns that cookie back into `Authorization: Bearer …`. Only the routes
 * below go through, each with only the fields it needs, so the page cannot
 * reach anything else of the Worker's (a ledger's database token, account
 * deletion, …). README: Website > Shared albums on the web.
 *
 * Writes are stamped `via: 'web'`: the Worker then names their writer
 * `web:<account>`, and a phone puts such a bill on no account (README: Album
 * members and shared albums > Which account).
 */

import { CSRF_HEADER } from "./csrf.ts";
import { COVER_PATH } from "./group.ts";

/** How this server reaches the Worker: a service binding in production. */
export type Upstream = (path: string, init: RequestInit) => Promise<Response>;

export const SESSION_COOKIE = "m2t_album_session";
/** As long as the Worker's session (a year), renewed with each sign-in. */
const SESSION_MAX_AGE = 60 * 60 * 24 * 365;
/** Request bodies here are a few fields, or a bill's rows (the Worker caps those at 512 KB). */
const MAX_BODY_BYTES = 256 * 1024;
const INVITE_CODE = /^[A-Za-z0-9_-]{20,64}$/;
const SHARE_ID = /^[A-Za-z0-9-]{8,64}$/;
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** A cover's type by its extension, the only types it is served as. Never SVG, which can run script. */
const IMAGE_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", gif: "image/gif" };

type Json = Record<string, unknown>;

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

/** A ledger's change stamp (the Worker's `ledger_changes`): a count of milliseconds. */
const STAMP = /^\d{1,20}$/;
/** The money stamp a payment is sent back with (the Worker's `moneyRev`). */
const MONEY_REV = /^[0-9a-f]{32}$/;

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      // A malformed value is no session: signed out, rather than every call failing.
      return null;
    }
  }
  return null;
}

function sessionCookie(request: Request, token: string | null): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const value = token ? encodeURIComponent(token) : "";
  const age = token ? SESSION_MAX_AGE : 0;
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure}`;
}

async function readBody(request: Request): Promise<Json | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return null;
    const value: unknown = text ? JSON.parse(text) : {};
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
  } catch {
    return null;
  }
}

const text = (value: unknown, max: number): string | null => (typeof value === "string" && value.length <= max ? value : null);

/**
 * A successful answer of the Worker's passed through as it came, without
 * reading it here (a whole album's group); a failed one as `relay` says.
 */
function pass(response: Response): Promise<Response> | Response {
  if (!response.ok) return relay(response);
  return new Response(response.body, { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

/** The Worker's JSON answer, passed on with its status; anything else is a server error. */
async function relay(response: Response, headers: HeadersInit = {}): Promise<Response> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = (body as { error?: unknown; code?: unknown } | null)?.code ?? (body as { error?: unknown } | null)?.error;
    return json({ error: typeof error === "string" ? error.slice(0, 80) : "server_error" }, response.status, headers);
  }
  return json(body ?? {}, 200, headers);
}

/**
 * One request to the website's API. `upstream` reaches the Worker; the
 * client's address goes with it, so the Worker's per-address limits on
 * sign-in still count each visitor on their own.
 */
export async function handleAlbumApi(request: Request, upstream: Upstream): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean).slice(1); // after "api"
  const method = request.method;

  // Writes come only from this site's own pages: a cross-site form or fetch
  // can send neither the header nor (SameSite=Lax) the cookie.
  if (method !== "GET" && method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (request.headers.get(CSRF_HEADER) !== "1" || (origin && origin !== url.origin)) {
      return json({ error: "forbidden" }, 403);
    }
  }

  const token = readCookie(request, SESSION_COOKIE);
  const ip = request.headers.get("cf-connecting-ip");
  const call = (path: string, init: { method?: string; body?: Json; auth?: boolean; headers?: Record<string, string> } = {}) =>
    upstream(path, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.auth !== false && token ? { Authorization: `Bearer ${token}` } : {}),
        ...(ip ? { "cf-connecting-ip": ip } : {}),
        ...init.headers,
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  const signedOut = () => json({ error: "unauthorized" }, 401, { "Set-Cookie": sessionCookie(request, null) });
  /** An authorized call; a session the Worker no longer knows clears the cookie. */
  const authed = async (path: string, init: Parameters<typeof call>[1] = {}, answer: (response: Response) => Promise<Response> | Response = relay) => {
    if (!token) return signedOut();
    const response = await call(path, init);
    return response.status === 401 ? signedOut() : answer(response);
  };
  /** Signing in: the token goes into the cookie, the user to the page. */
  const signIn = async (response: Response) => {
    if (!response.ok) return relay(response);
    const body = (await response.json().catch(() => null)) as { token?: unknown; user?: { id?: unknown; email?: unknown; name?: unknown } } | null;
    if (typeof body?.token !== "string" || typeof body.user?.id !== "string") return json({ error: "server_error" }, 502);
    const user = { id: body.user.id, email: typeof body.user.email === "string" ? body.user.email : "", name: typeof body.user.name === "string" ? body.user.name : "" };
    return json({ user }, 200, { "Set-Cookie": sessionCookie(request, body.token) });
  };

  // ------------------------------------------------------------ session --
  if (parts[0] === "session" && parts.length === 1) {
    if (method === "GET") {
      if (!token) return json({ user: null });
      const response = await call("/v1/account");
      if (response.status === 401) return json({ user: null }, 200, { "Set-Cookie": sessionCookie(request, null) });
      if (!response.ok) return relay(response);
      const body = (await response.json().catch(() => null)) as { user?: unknown } | null;
      return json({ user: body?.user ?? null });
    }
    if (method === "DELETE") {
      if (token) await call("/api/auth/sign-out", { method: "POST", body: {} }).catch(() => undefined);
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(request, null) });
    }
  }
  if (parts[0] === "session" && parts.length === 2 && method === "POST") {
    const body = await readBody(request);
    if (!body) return json({ error: "bad_request" }, 400);
    if (parts[1] === "google") {
      const idToken = text(body.idToken, 4096);
      if (!idToken) return json({ error: "bad_request" }, 400);
      return signIn(await call("/api/auth/sign-in/social", { method: "POST", auth: false, body: { provider: "google", idToken: { token: idToken } } }));
    }
    if (parts[1] === "email-code") {
      const email = text(body.email, 254);
      const captcha = text(body.captcha, 2048);
      if (!email) return json({ error: "bad_request" }, 400);
      return relay(
        await call("/api/auth/email-otp/send-verification-otp", {
          method: "POST",
          auth: false,
          body: { email, type: "sign-in" },
          headers: captcha ? { "x-turnstile-token": captcha } : {},
        }),
      );
    }
    if (parts[1] === "email") {
      const email = text(body.email, 254);
      const otp = text(body.otp, 12);
      if (!email || !otp) return json({ error: "bad_request" }, 400);
      return signIn(await call("/api/auth/sign-in/email-otp", { method: "POST", auth: false, body: { email, otp } }));
    }
  }

  // ------------------------------------------------------------ invites --
  if (parts[0] === "invites" && parts[1] && INVITE_CODE.test(parts[1])) {
    const code = parts[1];
    if (parts.length === 2 && method === "GET") return relay(await call(`/v1/invites/${code}`, { auth: false }));
    if (parts.length === 3 && parts[2] === "join" && method === "POST") {
      if (!token) return signedOut();
      const body = await readBody(request);
      const name = text(body?.name, 80) ?? "";
      // Only an album's link joins here: a shared ledger needs the app.
      const preview = await call(`/v1/invites/${code}`, { auth: false });
      if (!preview.ok) return relay(preview);
      const previewed = (await preview.json().catch(() => null)) as { kind?: unknown } | null;
      if (previewed?.kind !== "album") return json({ error: "not_album" }, 409);
      const accepted = await call(`/v1/invites/${code}/accept`, { method: "POST", body: { albums: true } });
      if (accepted.status === 401) return signedOut();
      if (!accepted.ok) return relay(accepted);
      const { ledger } = ((await accepted.json().catch(() => null)) ?? {}) as { ledger?: { id?: unknown } };
      if (typeof ledger?.id !== "string" || !SHARE_ID.test(ledger.id)) return json({ error: "server_error" }, 502);
      // On the album's list as themselves, under the name they chose.
      // The seat is taken by now, so a busy group is asked once more rather
      // than leaving them in without a name.
      const join = () => call(`/v1/ledgers/${ledger.id}/album`, { method: "POST", body: { action: "join", name, via: "web" } });
      let joined = await join();
      if (joined.status === 409 || joined.status >= 500) joined = await join();
      if (!joined.ok) return relay(joined);
      return json({ album: ledger });
    }
  }

  // ------------------------------------------------------------- albums --
  if (parts[0] === "albums") {
    if (parts.length === 1 && method === "GET") return authed("/v1/ledgers?albums=1");
    const id = parts[1];
    if (!id || !SHARE_ID.test(id)) return json({ error: "not_found" }, 404);
    const action = parts[2];
    if (parts.length === 2 && method === "GET") {
      // The stamp of the last read: the Worker then answers `unchanged` while nothing changed.
      const since = url.searchParams.get("since");
      return authed(`/v1/ledgers/${id}/album${since && STAMP.test(since) ? `?since=${since}` : ""}`, {}, pass);
    }
    if (parts.length === 3 && method === "POST") {
      const body = await readBody(request);
      if (!body) return json({ error: "bad_request" }, 400);
      if (action === "write") {
        if (!Array.isArray(body.rows)) return json({ error: "bad_request" }, 400);
        const reason = body.reason === "close_even" ? "close_even" : undefined;
        // Each row's `base` goes with it, and a payment's money stamp: the
        // Worker refuses the change as `stale` once the album moved on.
        const moneyBase = typeof body.moneyBase === "string" && MONEY_REV.test(body.moneyBase) ? body.moneyBase : undefined;
        return authed(`/v1/ledgers/${id}/album`, { method: "POST", body: { action: "write", rows: body.rows, reason, moneyBase, via: "web" } });
      }
      if (action === "join") {
        // The page putting someone on the list after a join that did not
        // finish: a join as the app makes it, under this name only if they
        // are not on it yet. Without `via: 'web'`, someone already on it
        // keeps their name (only the join screen's typed name renames).
        return authed(`/v1/ledgers/${id}/album`, { method: "POST", body: { action: "join", name: text(body.name, 80) ?? "" } });
      }
      if (action === "invite") return authed(`/v1/ledgers/${id}/invites`, { method: "POST", body: { rotate: body.rotate === true } });
      if (action === "leave") return authed(`/v1/ledgers/${id}/leave`, { method: "POST", body: {} });
    }
    if (action === "members" && parts.length === 4 && method === "DELETE" && USER_ID.test(parts[3])) {
      return authed(`/v1/ledgers/${id}/members/${parts[3]}`, { method: "DELETE" });
    }
    if (action === "media" && method === "GET") {
      let path = "";
      try {
        path = parts.slice(3).map(decodeURIComponent).join("/");
      } catch {
        // A malformed escape names no picture.
      }
      if (!COVER_PATH.test(path) || !token) return new Response(null, { status: 404 });
      const response = await call(`/v1/ledgers/${id}/media/${path.split("/").map(encodeURIComponent).join("/")}`);
      if (!response.ok) return new Response(null, { status: response.status === 401 ? 401 : 404 });
      // Served only as one of these pictures, by its extension (as the Worker
      // stores it), whatever type the stored copy claims.
      const type = IMAGE_TYPES[path.split(".").pop()!.toLowerCase()];
      if (!type) return new Response(null, { status: 404 });
      return new Response(response.body, {
        headers: {
          "Content-Type": type,
          // A cover's path changes with the picture, so a browser may keep it.
          "Cache-Control": "private, max-age=86400",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  }

  return json({ error: "not_found" }, 404);
}
