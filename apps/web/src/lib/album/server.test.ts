import assert from "node:assert/strict";
import { test } from "node:test";

import { CSRF_HEADER } from "./csrf.ts";
import { handleAlbumApi, SESSION_COOKIE, type Upstream } from "./server.ts";

const ORIGIN = "https://album.money2time.com";
const CODE = "AbCdEfGhIjKlMnOpQrSt_-12";

/** A stand-in for the cloud-sync Worker that records every call. */
function worker(answer: (path: string, init: RequestInit) => Response = () => Response.json({ ok: true })) {
  const calls: { path: string; init: RequestInit; body: unknown; auth: string | null }[] = [];
  const upstream: Upstream = async (path, init) => {
    const headers = new Headers(init.headers);
    calls.push({ path, init, body: init.body ? JSON.parse(String(init.body)) : null, auth: headers.get("authorization") });
    return answer(path, init);
  };
  return { calls, upstream };
}

const request = (path: string, init: { method?: string; body?: unknown; cookie?: string | null; csrf?: boolean; origin?: string } = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.cookie === null ? {} : { cookie: `${SESSION_COOKIE}=${init.cookie ?? "tok"}` }),
      ...(init.csrf === false || !init.method || init.method === "GET" ? {} : { [CSRF_HEADER]: "1" }),
      ...(init.origin ? { origin: init.origin } : {}),
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

test("a write without the site's header, or from another origin, is refused before the Worker", async () => {
  const { calls, upstream } = worker();
  const noHeader = await handleAlbumApi(request("/api/albums/abcdef123456/write", { method: "POST", body: { rows: [] }, csrf: false }), upstream);
  assert.equal(noHeader.status, 403);
  const elsewhere = await handleAlbumApi(request("/api/albums/abcdef123456/write", { method: "POST", body: { rows: [] }, origin: "https://evil.example" }), upstream);
  assert.equal(elsewhere.status, 403);
  assert.equal(calls.length, 0);
});

test("signing in keeps the Worker's token in an HttpOnly cookie, never in the answer", async () => {
  const { calls, upstream } = worker(() => Response.json({ token: "secret-token", user: { id: "u1", email: "a@b.c", name: "Ann" } }));
  const res = await handleAlbumApi(request("/api/session/email", { method: "POST", body: { email: "a@b.c", otp: "123456" }, cookie: null }), upstream);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.ok(!body.includes("secret-token"));
  const cookie = res.headers.get("set-cookie") ?? "";
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=secret-token;`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.equal(calls[0].path, "/api/auth/sign-in/email-otp");
  assert.equal(calls[0].auth, null);
});

test("calls carry the cookie's session as a bearer token, and writes are stamped as the website's", async () => {
  const { calls, upstream } = worker();
  await handleAlbumApi(request("/api/albums/abcdef123456/write", { method: "POST", body: { rows: [{ table: "album_expenses", row: {} }], via: "phone", action: "join" } }), upstream);
  assert.equal(calls[0].path, "/v1/ledgers/abcdef123456/album");
  assert.equal(calls[0].auth, "Bearer tok");
  assert.deepEqual(calls[0].body, { action: "write", rows: [{ table: "album_expenses", row: {} }], via: "web" });
});

test("only the album routes reach the Worker", async () => {
  const { calls, upstream } = worker();
  for (const [method, path] of [
    ["POST", "/api/albums/abcdef123456/credentials"],
    ["DELETE", "/api/albums/abcdef123456"],
    ["GET", "/api/account"],
    ["POST", "/api/sync/credentials"],
    ["GET", "/api/albums/abcdef123456/media/receipts/x.jpg"],
    ["GET", "/api/albums/abcdef123456/media/album-covers/%E0%A4%A.jpg"],
  ]) {
    const res = await handleAlbumApi(request(path, { method, body: method === "GET" ? undefined : {} }), upstream);
    assert.equal(res.status, 404, `${method} ${path}`);
  }
  assert.equal(calls.length, 0);
});

test("joining checks the link is an album's, accepts it, then joins under the chosen name", async () => {
  const { calls, upstream } = worker((path) =>
    path === `/v1/invites/${CODE}` ? Response.json({ kind: "album" }) : path.endsWith("/accept") ? Response.json({ ledger: { id: "abcdef123456" } }) : Response.json({ rows: [] }),
  );
  const res = await handleAlbumApi(request(`/api/invites/${CODE}/join`, { method: "POST", body: { name: "Tess" } }), upstream);
  assert.deepEqual(await res.json(), { album: { id: "abcdef123456" } });
  assert.deepEqual(
    calls.map((call) => call.path),
    [`/v1/invites/${CODE}`, `/v1/invites/${CODE}/accept`, "/v1/ledgers/abcdef123456/album"],
  );
  assert.deepEqual(calls[1].body, { albums: true });
  assert.deepEqual(calls[2].body, { action: "join", name: "Tess", via: "web" });

  const ledger = worker((path) => (path === `/v1/invites/${CODE}` ? Response.json({ kind: "ledger" }) : Response.json({})));
  const refused = await handleAlbumApi(request(`/api/invites/${CODE}/join`, { method: "POST", body: { name: "Tess" } }), ledger.upstream);
  assert.equal(refused.status, 409);
  assert.equal(ledger.calls.length, 1);
});

test("a session the Worker no longer knows clears the cookie", async () => {
  const { upstream } = worker(() => Response.json({ error: "unauthorized" }, { status: 401 }));
  const res = await handleAlbumApi(request("/api/albums"), upstream);
  assert.equal(res.status, 401);
  assert.match(res.headers.get("set-cookie") ?? "", /Max-Age=0/);
});
