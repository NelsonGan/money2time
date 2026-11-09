#!/usr/bin/env node
/**
 * What the SERVER actually sent, checked against the SEO gate.
 *
 * The point of this script is the gap it exists to catch: an implementation
 * can be correct in `lib/seo.ts` and wrong in the response. A canonical built
 * from the wrong `SITE_URL`, a title the layout template appended to twice, a
 * `noindex` inherited from a spread — none of those are visible in the source
 * of the page that produced them, and all of them are visible here.
 *
 * So this reads raw HTML over the wire. No Playwright, no JS execution: what a
 * crawler is handed on the first response is the thing being audited, and a
 * page whose title only appears after hydration has already failed.
 *
 *     node ../../.claude/skills/seo-loop/scripts/seo-check.mjs                              # dev
 *     node ../../.claude/skills/seo-loop/scripts/seo-check.mjs https://www.money2time.com    # production
 *     node ../../.claude/skills/seo-loop/scripts/seo-check.mjs https://www.money2time.com /en-my
 *     node ../../.claude/skills/seo-loop/scripts/seo-check.mjs https://www.money2time.com --sitemap=40
 *
 * NOTE the host. `www.money2time.com` answers 200; the apex 308s to it, while
 * `SITE_URL` in `src/lib/seo.ts` is the apex. Google has consolidated onto the
 * apex and reports it as indexed with a matching canonical, so this is a
 * warning here and not a failure — see the host section in `SKILL.md` before
 * deciding it needs fixing.
 *
 * FAIL blocks a deploy. WARN is a judgement call — read it, then decide.
 * Exit code is 1 if anything failed, so it can gate a script or a CI step.
 */

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith("--"));
const positional = argv.filter((a) => !a.startsWith("--"));

const BASE = (positional.find((a) => a.startsWith("http")) ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * The 32 routing locales, so a locale-prefixed path can be reduced to the page
 * it is a translation OF. `en` is unprefixed (`localePrefix: "as-needed"`), so
 * `/cost-in-hours` and `/de/cost-in-hours` both reduce to `/cost-in-hours`.
 */
const LOCALES = new Set([
  "da", "de", "en", "en-au", "en-ca", "en-gb", "en-in", "en-my", "en-nz",
  "en-ph", "en-sg", "en-za", "es", "fil", "fr", "hi", "id", "it", "ja", "ko",
  "ms", "nb", "nl", "pl", "pt", "ru", "sv", "th", "tr", "uk", "vi", "zh",
]);

/** `/en-my/cost-in-hours` → `/cost-in-hours`. */
function pageOf(route) {
  const [, first, ...rest] = route.split("/");
  return LOCALES.has(first) ? `/${rest.join("/")}` : route;
}
const explicit = positional.filter((a) => a.startsWith("/"));
const sitemapFlag = flags.find((f) => f.startsWith("--sitemap"));
const SITEMAP_LIMIT = sitemapFlag ? Number(sitemapFlag.split("=")[1] ?? 25) : 0;

/**
 * ASK FOR THE PAGE GOOGLE IS ASKED FOR.
 *
 * A site that varies by locale varies on the request, and the request this
 * script makes from a laptop is not the request Googlebot makes. Run from
 * Kuala Lumpur without this, a locale-detecting site answers in `en-MY` and
 * every canonical it reports is a canonical Googlebot never sees — which is an
 * audit of the auditor's IP address, not of the site.
 *
 * Googlebot crawls predominantly from the US and sends no `Accept-Language` at
 * all; `en-US` is the closest a client can get to that on purpose. Override
 * with `--lang=de` to audit one locale deliberately.
 */
const langFlag = flags.find((f) => f.startsWith("--lang"));
const LANG = langFlag ? langFlag.split("=")[1] : "en-US,en;q=0.9";
const HEADERS = { "accept-language": LANG };

/** A dev server serves production canonicals; only paths compare there. */
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(BASE);

/** The routes worth checking when nobody named any: a page, its locales, a translation. */
const DEFAULT_ROUTES = [
  "/",
  "/cost-in-hours",
  "/statements-import",
  "/en-my",
  "/en-my/cost-in-hours",
  "/de/cost-in-hours",
  "/contact",
];

/* ---------------------------------------------------------------- helpers */

const strip = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const decode = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

/** Every `<tag ...>` whose attributes match, as attribute maps. */
function tags(html, name) {
  const out = [];
  const re = new RegExp(`<${name}\\b([^>]*)>`, "gi");
  for (const m of html.matchAll(re)) {
    const attrs = {};
    for (const a of m[1].matchAll(/([a-zA-Z:-]+)\s*=\s*"([^"]*)"/g)) {
      attrs[a[1].toLowerCase()] = decode(a[2]);
    }
    out.push(attrs);
  }
  return out;
}

const meta = (html, name) =>
  tags(html, "meta").find((t) => t.name?.toLowerCase() === name.toLowerCase())?.content;

const og = (html, property) =>
  tags(html, "meta").find((t) => t.property?.toLowerCase() === property.toLowerCase())?.content;

const links = (html, rel) =>
  tags(html, "link").filter((t) => t.rel?.toLowerCase() === rel);

function headings(html, level) {
  const out = [];
  for (const m of html.matchAll(new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)</h${level}>`, "gi"))) {
    out.push(strip(m[1]));
  }
  return out;
}

/**
 * How WIDE a string is, not how many characters it has.
 *
 * Google truncates a result by pixel width, and this script was counting
 * characters — which reports every Chinese, Japanese and Korean description on
 * the site as "too short" while it is in fact the right length, because a CJK
 * glyph carries roughly twice the width and several times the meaning of a
 * Latin one. Counting characters there is measuring the wrong thing and then
 * asking somebody to pad out copy that is already full.
 *
 * Full-width and CJK ranges count double; everything else counts one.
 */
function width(text) {
  let total = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    const wide =
      (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
      (code >= 0x2e80 && code <= 0xa4cf) || // CJK radicals … Yi
      (code >= 0xac00 && code <= 0xd7a3) || // Hangul syllables
      (code >= 0xf900 && code <= 0xfaff) || // CJK compatibility ideographs
      (code >= 0xfe30 && code <= 0xfe6f) || // CJK compatibility forms
      (code >= 0xff00 && code <= 0xff60) || // full-width forms
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x3fffd); // CJK extensions
    total += wide ? 2 : 1;
  }
  return total;
}

/**
 * How much a page SAYS, in a unit that survives leaving English.
 *
 * Counting space-separated tokens is the obvious way to size a page and it is
 * wrong for half this site's locales: Chinese, Japanese and Thai do not put
 * spaces between words, so a full page of them arrives as a handful of very
 * long tokens and reads as thin. Three complete legal pages were reported that
 * way — 109 "words" for a Japanese terms page that says everything its
 * thousand-word English twin does.
 *
 * The conversion is measured, not guessed: this site's Chinese privacy policy
 * carries 1,418 CJK characters against 842 English words for the same
 * document, so a word is worth about two characters in those scripts. A token
 * containing them is counted by its characters; everything else counts one.
 */
function contentWords(text) {
  const WIDE = /[\u2e80-\ua4cf\uac00-\ud7a3\u3040-\u30ff\u0e00-\u0e7f]/;
  let total = 0;
  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    const wide = [...token].filter((c) => WIDE.test(c)).length;
    total += wide ? wide / 2 : 1;
  }
  return Math.round(total);
}

const norm = (url) => url.replace(/\/$/, "").toLowerCase();

/** The site a URL belongs to, ignoring a `www.` that is only a host choice. */
const site = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url;
  }
};

/* ------------------------------------------------------------ site fetches */

async function siteFile(path) {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: HEADERS, redirect: "follow" });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

const sitemapXml = await siteFile("/sitemap.xml");
const sitemapUrls = sitemapXml
  ? [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  : [];

const robotsTxt = await siteFile("/robots.txt");

/**
 * The `Disallow` rules that apply to US, which is not every `Disallow` in the
 * file.
 *
 * robots.txt is a list of GROUPS, each opened by one or more `User-agent`
 * lines, and a rule belongs only to its own group. Reading every `Disallow`
 * in the file as though it applied to `*` is wrong the moment a site carries
 * per-crawler blocks — and both of these sites do, because Cloudflare injects
 * a managed block that disallows everything to a dozen AI crawlers. Taken
 * flat, that says the whole site is closed to Googlebot.
 */
function disallowRules(text) {
  const rules = [];
  let appliesToUs = false;
  let openingGroup = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const match = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();

    if (field === "user-agent") {
      // Consecutive User-agent lines open one group together; a User-agent
      // after a rule starts a new one.
      if (!openingGroup) appliesToUs = false;
      openingGroup = true;
      if (value === "*") appliesToUs = true;
      continue;
    }
    openingGroup = false;
    if (field === "disallow" && value && appliesToUs) rules.push(value);
  }
  return rules;
}

const disallowed = robotsTxt ? disallowRules(robotsTxt) : [];

/** robots.txt path matching: `*` is any run of characters, a trailing `$` anchors. */
function disallows(rule, path) {
  const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const pattern = escaped.endsWith("\\$") ? `^${escaped.slice(0, -2)}$` : `^${escaped}`;
  try {
    return new RegExp(pattern).test(path);
  } catch {
    return path.startsWith(rule);
  }
}

let routes = explicit.length ? explicit : [];
if (!routes.length && SITEMAP_LIMIT) {
  /*
   * SPREAD THE SAMPLE, do not take the first N.
   *
   * A sitemap is written in route order, so the front of it is all one kind of
   * page: on a site with 32 locales the first sixty URLs are the home page
   * sixty times over, and a clean run across them says nothing about the rest.
   * That is how a sweep of "60 URLs, 0 warnings" managed never to look at the
   * thin page or a single legal page.
   *
   * Evenly spaced indices cover every route family the sitemap contains, and
   * always include the last URL — the one a truncating sample never reaches.
   */
  const total = sitemapUrls.length;
  const take = Math.min(SITEMAP_LIMIT, total);
  const picked =
    take >= total
      ? sitemapUrls
      : Array.from({ length: take }, (_, i) =>
          sitemapUrls[take === 1 ? 0 : Math.round((i * (total - 1)) / (take - 1))],
        );
  routes = picked.map((u) => new URL(u).pathname || "/");
  if (take < total) {
    console.log(`Sampling ${take} of ${total} sitemap URLs, evenly spaced.`);
  }
}
if (!routes.length) routes = DEFAULT_ROUTES;

/*
 * What this site's "not found" page looks like, so a SOFT 404 can be spotted.
 *
 * A 200 that renders the not-found page is worse than a 404: Google indexes
 * it, and nothing in the response says anything is wrong. The only way to
 * recognise one without hard-coding a site's wording is to ask for a URL that
 * cannot exist and remember what comes back.
 */
const probe = await (async () => {
  try {
    const res = await fetch(`${BASE}/__seo-check-nonexistent-9d41__`, {
      headers: HEADERS,
      redirect: "follow",
    });
    const html = await res.text();
    return {
      ok: res.ok,
      title: decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? ""),
    };
  } catch {
    return null;
  }
})();

if (probe?.ok) {
  console.log("⚠️  a URL that cannot exist returned 200 — every page here may be a soft 404");
}

if (!sitemapXml) console.log("⚠️  no /sitemap.xml — sitemap-inclusion checks skipped");
if (!robotsTxt) console.log("⚠️  no /robots.txt — robots checks skipped");
console.log(`Checking ${routes.length} route(s) on ${BASE}  (accept-language: ${LANG})\n`);

/* --------------------------------------------------------------- the gate */

const seen = { descriptions: new Map(), h1s: new Map(), titles: new Map() };
const report = [];

for (const route of routes) {
  const url = `${BASE}${route === "/" ? "" : route}`;
  const issues = [];
  const fail = (m) => issues.push(["FAIL", m]);
  const warn = (m) => issues.push(["WARN", m]);

  /*
   * Follow a redirect that stays on this site, and keep checking.
   *
   * Stopping at the hop was the wrong call: a host that redirects to its own
   * www (or back) still has a page at the end of it, and that page is the
   * thing being audited. What the hop deserves is a note — a permanent one is
   * a design decision, a temporary one is a signal that Google is told not to
   * consolidate, and a sitemap that lists the pre-redirect URL is asking for a
   * crawl of a URL that is not the page. None of those is a reason to stop
   * looking at the head.
   */
  let res;
  let finalUrl = url;
  const hops = [];
  let crossSite = false;

  try {
    for (let hop = 0; hop < 4; hop += 1) {
      res = await fetch(finalUrl, { headers: HEADERS, redirect: "manual" });
      if (res.status < 300 || res.status >= 400) break;
      const location = res.headers.get("location");
      if (!location) break;
      const next = new URL(location, finalUrl).toString();
      if (site(next) !== site(url)) {
        crossSite = true;
        hops.push(`${res.status} → ${next}`);
        break;
      }
      hops.push(`${res.status} → ${next}`);
      finalUrl = next;
    }
  } catch (error) {
    report.push({ issues: [["FAIL", `unreachable: ${error.message}`]], route });
    continue;
  }

  if (hops.length >= 4 && res.status >= 300 && res.status < 400) {
    fail(`redirect chain did not settle after 4 hops: ${hops.join(", ")}`);
    report.push({ issues, route });
    continue;
  }

  if (hops.length) {
    const inSitemap = sitemapUrls.some((u) => norm(u) === norm(url));
    const temporary = hops.some((h) => h.startsWith("302") || h.startsWith("307"));
    const note = [
      inSitemap ? "the sitemap lists the pre-redirect URL" : null,
      temporary ? "and it is temporary, so Google is told NOT to consolidate onto the target" : null,
    ]
      .filter(Boolean)
      .join(", ");
    (crossSite ? fail : warn)(`${hops.join(", ")}${note ? ` — ${note}` : ""}`);
  }

  // A redirect this script chose not to follow ends the check here. Anything
  // else that is not a 200 is a failure and must say so — `>= 300` swallowed
  // 404s into the redirect branch and reported a missing page as clean.
  if (crossSite || (res.status >= 300 && res.status < 400)) {
    report.push({ issues, route });
    continue;
  }
  if (res.status !== 200) {
    issues.push(["FAIL", `HTTP ${res.status}`]);
    report.push({ issues, route });
    continue;
  }

  /*
   * Everything below inspects the page that ANSWERED. Where that came after a
   * redirect, the title and description belong to the destination route, so
   * this route must not be entered into the cross-page duplicate maps — doing
   * that reported `/download` as duplicating the home page it redirects to,
   * which is not a defect, it is the redirect working.
   */
  const redirected = hops.length > 0;
  const html = await res.text();
  const head = html.slice(0, html.indexOf("</head>") + 7 || html.length);

  // — title —
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "");
  if (!title) fail("no <title>");
  else {
    const titleWidth = width(title);
    if (titleWidth > 60) {
      warn(
        `title is ${titleWidth} wide, Google truncates near 60 — "${title}"` +
          (titleWidth === title.length ? "" : ` (${title.length} chars)`),
      );
    }
    if (probe && !probe.ok && probe.title && title === probe.title) {
      fail(`soft 404 — 200 OK, but this is the not-found page ("${title}")`);
    }
    const owner = redirected ? undefined : seen.titles.get(title);
    if (owner) {
      const sibling = pageOf(owner) === pageOf(route);
      (sibling ? warn : fail)(
        `title duplicates ${owner}${sibling ? " (same page, another locale — translated?)" : ""} — "${title}"`,
      );
    } else if (!redirected) seen.titles.set(title, route);
  }

  // — meta description —
  const description = meta(head, "description");
  if (!description) fail("no meta description");
  else {
    const descWidth = width(description);
    if (descWidth > 165) warn(`description is ${descWidth} wide, cut near 160`);
    if (descWidth < 70) warn(`description is only ${descWidth} wide — a wasted result line`);
    const owner = redirected ? undefined : seen.descriptions.get(description);
    if (owner) {
      const sibling = pageOf(owner) === pageOf(route);
      (sibling ? warn : fail)(
        `description duplicates ${owner}${sibling ? " (same page, another locale — translated?)" : ""}`,
      );
    } else if (!redirected) seen.descriptions.set(description, route);
  }

  // — canonical —
  const canonicals = links(head, "canonical");
  const canonicalHref = canonicals[0]?.href ?? "";
  if (!canonicals.length) fail("no canonical");
  else if (canonicals.length > 1) fail(`${canonicals.length} canonicals — Google ignores all of them`);
  else if (!/^https?:\/\//.test(canonicalHref)) {
    fail(`canonical is not absolute: "${canonicalHref}"`);
  } else if (LOCAL) {
    // A local build emits the production canonical, which is right. Only the
    // path is meaningful here.
    const path = (u) => new URL(u, BASE).pathname.replace(/\/$/, "");
    if (path(canonicalHref) !== path(finalUrl)) {
      warn(`canonical names a different page: ${canonicalHref}`);
    }
  } else if (norm(canonicalHref) !== norm(url) && norm(canonicalHref) !== norm(finalUrl)) {
    /*
     * Agreeing with EITHER the URL asked for or the URL that answered is
     * enough — a page reached through this site's own host redirect still
     * declares one of the two, and calling that "points elsewhere" is how a
     * checker teaches people to ignore it.
     *
     * What is left over is worth two different sentences: the same path on
     * another host is a host-canonicalisation choice, while a different path
     * is this page saying it is a different page.
     */
    const path = (u) => new URL(u).pathname.replace(/\/$/, "");
    const samePath = path(canonicalHref) === path(finalUrl);
    warn(
      samePath
        ? `canonical is the same page on another host: ${canonicalHref}`
        : `canonical names a different page: ${canonicalHref}`,
    );
  }

  // — robots —
  const robotsMeta = meta(head, "robots") ?? "";
  const googlebotMeta = meta(head, "googlebot") ?? "";
  if (/noindex/i.test(robotsMeta) || /noindex/i.test(googlebotMeta)) {
    fail(`noindex in the markup ("${robotsMeta || googlebotMeta}")`);
  }
  const blocked = disallowed.find((rule) => disallows(rule, route));
  if (blocked) fail(`robots.txt disallows ${blocked}, which covers this route`);

  // — H1 —
  const h1s = headings(html, 1);
  if (!h1s.length) fail("no <h1>");
  else if (h1s.length > 1) fail(`${h1s.length} <h1>s: ${h1s.map((h) => `"${h}"`).join(", ")}`);
  else {
    const owner = redirected ? undefined : seen.h1s.get(h1s[0]);
    if (owner && pageOf(owner) !== pageOf(route)) warn(`h1 duplicates ${owner} — "${h1s[0]}"`);
    else if (!owner && !redirected) seen.h1s.set(h1s[0], route);
  }
  if (!headings(html, 2).length) warn("no <h2> — one flat block of text");

  // — hreflang: a cluster that does not name itself is a cluster Google drops —
  const alternates = links(head, "alternate").filter((t) => t.hreflang);
  if (alternates.length) {
    /*
     * The self-reference is checked against the page's own CANONICAL, not
     * against the URL that was requested. A cluster is built out of canonical
     * URLs, so on a site whose canonical host differs from the host being
     * fetched, comparing to the request reports a broken cluster that is not
     * broken. What must be true is that the URL this page declares itself to
     * be is one of the alternates.
     */
    const self = alternates.some((t) => norm(t.href ?? "") === norm(canonicalHref || url));
    if (!self) {
      fail(
        `${alternates.length} hreflang alternates and no self-reference` +
          (canonicalHref ? ` (canonical is ${canonicalHref})` : ""),
      );
    }
    if (!alternates.some((t) => t.hreflang?.toLowerCase() === "x-default")) {
      warn("no x-default in the hreflang set");
    }
    const seenLang = new Set();
    for (const alt of alternates) {
      if (seenLang.has(alt.hreflang)) fail(`hreflang "${alt.hreflang}" listed twice`);
      seenLang.add(alt.hreflang);
    }
  }

  // — social —
  for (const [prop, value] of [
    ["og:title", og(head, "og:title")],
    ["og:description", og(head, "og:description")],
    ["og:image", og(head, "og:image")],
    ["og:url", og(head, "og:url")],
  ]) {
    if (!value) warn(`no ${prop}`);
  }

  // — structured data —
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      JSON.parse(m[1]);
    } catch (error) {
      fail(`JSON-LD does not parse: ${error.message}`);
    }
  }

  // — substance —
  const words = contentWords(strip(html));
  if (words < 250) warn(`${words} words of text — thin`);

  // — internal links: an orphan is a page nothing points at, and a page that
  //   points nowhere is the other half of the same problem —
  const internal = new Set(
    tags(html, "a")
      .map((a) => a.href ?? "")
      .filter((href) => href.startsWith("/") && !href.startsWith("//"))
      .map((href) => href.split(/[?#]/)[0]),
  );
  internal.delete(route);
  if (internal.size < 3) warn(`only ${internal.size} distinct internal links`);

  // — sitemap —
  if (sitemapXml) {
    const inSitemap = sitemapUrls.some(
      (u) => norm(u) === norm(url) || (canonicalHref && norm(u) === norm(canonicalHref)),
    );
    if (!inSitemap && !blocked) warn("neither this URL nor its canonical is in sitemap.xml");
  }

  report.push({ h1: h1s[0], issues, route, title });
}

/* ---------------------------------------------------------------- results */

let fails = 0;
let warns = 0;

for (const page of report) {
  const bad = page.issues.filter(([level]) => level === "FAIL").length;
  const meh = page.issues.length - bad;
  fails += bad;
  warns += meh;
  const mark = bad ? "❌" : meh ? "⚠️ " : "✅";
  console.log(`${mark} ${page.route}${page.title ? `  — ${page.title}` : ""}`);
  for (const [level, message] of page.issues) {
    console.log(`     ${level === "FAIL" ? "FAIL" : "warn"}  ${message}`);
  }
}

console.log(
  `\n${report.length} route(s): ${fails} failure(s), ${warns} warning(s).` +
    (fails ? "\nThe gate is closed — do not deploy these pages." : ""),
);

process.exit(fails ? 1 : 0);
