/**
 * Mirrors `media/` into the `money2time-assets` R2 bucket under `web/`, where
 * the site serves every picture and video from (`src/lib/media.ts`).
 *
 *   media/screenshots/en/01-home.webp
 *     -> r2://money2time-assets/web/screenshots/en/01-home.webp
 *     -> https://media.money2time.com/web/screenshots/en/01-home.webp
 *
 * Only files whose bytes differ from the bucket's copy are uploaded (an R2
 * object's ETag is the MD5 of a single-part upload). A replaced object is also
 * purged from Cloudflare's cache, which purges its resized variants with it,
 * so a new picture shows without waiting out the edge's year-long TTL.
 *
 *   node scripts/upload-media.mjs            # upload what changed
 *   node scripts/upload-media.mjs --dry-run  # say what would change
 *   node scripts/upload-media.mjs --check    # exit 1 if anything would change
 *   node scripts/upload-media.mjs --check --touched <file>
 *                                            # exit 1 if a picture is missing, or
 *                                            # one the change touched differs
 *   node scripts/upload-media.mjs --prune    # also delete bucket objects under
 *                                            # web/ that media/ no longer has
 *
 * Credentials: `CLOUDFLARE_API_TOKEN` (R2 write and cache purge on the
 * account), or else the `cf` CLI's own login (`npx cf auth login`).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";

const ACCOUNT_ID = "1807480618facf8aedfbbe714a0707b7";
const BUCKET = "money2time-assets";
const ZONE_ID = "8403f59088c31d802ac9854a3154e8a5"; // money2time.com
const PUBLIC_ORIGIN = "https://media.money2time.com";
const PREFIX = "web/";

/*
 * Browsers recheck once a day (a 304 when nothing changed); the edge keeps a
 * copy for a year, because this script purges anything it replaces.
 */
const CACHE_CONTROL = "public, max-age=86400, s-maxage=31536000";

const CONTENT_TYPES = {
  jpg: "image/jpeg",
  mp4: "video/mp4",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

const ROOT = new URL("..", import.meta.url).pathname;
const MEDIA_DIR = join(ROOT, "media");
const API = "https://api.cloudflare.com/client/v4";

const argv = process.argv.slice(2);
const args = new Set(argv);
const dryRun = args.has("--dry-run") || args.has("--check");

/*
 * `--touched <file>`: the repository paths the change being checked touched,
 * one per line (the workflow lists a pull request's files, or a push's). A
 * picture that differs from the bucket's copy then fails the check only when
 * the change touched it. Another branch can publish its pictures before it
 * merges, as it should, and its copies must not fail every other merge in the
 * meantime. A picture missing from the bucket always fails.
 */
const touchedAt = argv.indexOf("--touched");
const touchedFile = touchedAt >= 0 ? argv[touchedAt + 1] : undefined;
const touched =
  touchedFile && existsSync(touchedFile)
    ? new Set(
        readFileSync(touchedFile, "utf8")
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.startsWith("apps/web/media/"))
          .map((line) => line.slice("apps/web/media/".length)),
      )
    : null;

function apiToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  if (process.env.CI) {
    console.error("CLOUDFLARE_API_TOKEN is not set. In GitHub Actions it is a repository secret.");
    process.exit(1);
  }

  // `cf auth whoami` refreshes an expired login before we read it.
  execFileSync("npx", ["cf", "auth", "whoami"], { cwd: ROOT, stdio: "ignore" });
  const configDir =
    process.platform === "darwin"
      ? join(homedir(), "Library/Preferences/cloudflare")
      : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "cloudflare");
  return JSON.parse(readFileSync(join(configDir, "config/default.json"), "utf8")).oauth_token;
}

const token = apiToken();

async function api(path, init = {}) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...init.headers },
    });
    if (response.ok) return response;
    // The API allows about 1,200 requests per five minutes, which a first
    // upload of the whole tree exceeds; wait the limit out rather than fail.
    if (attempt < 10 && (response.status === 429 || response.status >= 500)) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const seconds = retryAfter > 0 ? retryAfter : Math.min(60, 5 * attempt);
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      continue;
    }
    throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} ${await response.text()}`);
  }
}

function localFiles(dir = MEDIA_DIR) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return localFiles(path);
    if (entry.name.startsWith(".")) return [];
    return [relative(MEDIA_DIR, path).split(sep).join("/")];
  });
}

async function remoteObjects() {
  const objects = new Map();
  let cursor;
  do {
    const query = new URLSearchParams({ prefix: PREFIX, per_page: "1000" });
    if (cursor) query.set("cursor", cursor);
    const body = await (await api(`/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects?${query}`)).json();
    for (const object of body.result) objects.set(object.key, object.etag);
    cursor = body.result_info?.is_truncated ? body.result_info.cursor : undefined;
  } while (cursor);
  return objects;
}

/** An object key as a URL path, each segment encoded. */
const keyPath = (key) => key.split("/").map(encodeURIComponent).join("/");

/** Runs `task` over `items`, `limit` at a time. */
async function pool(items, limit, task) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await task(items[next++]);
    }),
  );
}

const files = localFiles();
const remote = await remoteObjects();

const unknown = files.filter((file) => !CONTENT_TYPES[file.split(".").pop()]);
if (unknown.length) {
  console.error(`No content type for: ${unknown.join(", ")}. Add it to CONTENT_TYPES.`);
  process.exit(1);
}

const added = [];
const changed = [];
for (const file of files) {
  const etag = remote.get(PREFIX + file);
  if (etag === undefined) {
    added.push(file);
  } else if (etag !== createHash("md5").update(readFileSync(join(MEDIA_DIR, file))).digest("hex")) {
    changed.push(file);
  }
}
const local = new Set(files.map((file) => PREFIX + file));
const stale = [...remote.keys()].filter((key) => !local.has(key));

console.log(
  `${files.length} files in media/: ${added.length} new, ${changed.length} changed. ` +
    `${stale.length} bucket object(s) under ${PREFIX} not in media/.`,
);
for (const file of [...added, ...changed]) console.log(`  ${added.includes(file) ? "+" : "~"} ${file}`);
for (const key of stale) console.log(`  ${args.has("--prune") ? "-" : "?"} ${key.slice(PREFIX.length)}`);

if (args.has("--check")) {
  const failing = touched ? changed.filter((file) => touched.has(file)) : changed;
  const elsewhere = changed.filter((file) => !failing.includes(file));
  if (elsewhere.length) {
    console.log(
      `::warning::${elsewhere.length} picture(s) in the bucket differ from this checkout but this change ` +
        `does not touch them (another branch published its own, or main's were never uploaded): ` +
        elsewhere.join(", "),
    );
  }
  process.exit(added.length || failing.length ? 1 : 0);
}
if (dryRun) process.exit(0);

let done = 0;
await pool([...added, ...changed], 16, async (file) => {
  const body = readFileSync(join(MEDIA_DIR, file));
  await api(`/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${keyPath(PREFIX + file)}`, {
    method: "PUT",
    body,
    headers: {
      "Cache-Control": CACHE_CONTROL,
      "Content-Type": CONTENT_TYPES[file.split(".").pop()],
    },
  });
  if (++done % 250 === 0) console.log(`  uploaded ${done}`);
});

if (args.has("--prune")) {
  await pool(stale, 16, (key) =>
    api(`/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${keyPath(key)}`, { method: "DELETE" }),
  );
}

// New objects were never cached; only replaced and deleted ones need purging.
const purge = [...changed.map((file) => PREFIX + file), ...(args.has("--prune") ? stale : [])].map(
  (key) => `${PUBLIC_ORIGIN}/${keyPath(key)}`,
);
for (let i = 0; i < purge.length; i += 30) {
  await api(`/zones/${ZONE_ID}/purge_cache`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: purge.slice(i, i + 30) }),
  });
}

console.log(`Uploaded ${done}; purged ${purge.length} URL(s).`);
