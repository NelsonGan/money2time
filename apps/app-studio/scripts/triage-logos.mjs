// Triage helper: for each "folder/Name (curated=domain)" no-match line on stdin,
// search Brandfetch and print the top candidate hits so we can pick correct domains.
//
//   grep "  - " /tmp/bf-expand.log | node scripts/triage-logos.mjs
//
// Output: one block per brand with up to 4 ranked hits (name, domain, verified, quality).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(name) {
  for (let a = 0; a < 6; a++) {
    const r = await fetch(`https://api.brandfetch.io/v2/search/${encodeURIComponent(name)}`);
    if (r.status === 429) { await sleep(15000 * (a + 1)); continue; }
    if (!r.ok) return [];
    return r.json();
  }
  return [];
}

import { readFileSync } from "node:fs";
const lines = readFileSync(0, "utf8").split("\n")
  .map((l) => l.trim())
  .filter((l) => l.startsWith("- "))
  .map((l) => l.replace(/^- /, ""));

// parse "folder/Brand Name (curated=domain)"
const parsed = lines.map((l) => {
  const m = l.match(/^([a-z-]+)\/(.+?) \(curated=(.+)\)$/);
  if (!m) return null;
  return { folder: m[1], name: m[2], domain: m[3] };
}).filter(Boolean);

// de-dupe identical brand names (global brands repeat across countries)
const byName = new Map();
for (const p of parsed) if (!byName.has(p.name)) byName.set(p.name, p);

for (const { folder, name, domain } of byName.values()) {
  const hits = await search(name);
  const top = (hits || []).slice(0, 4)
    .map((h) => `${h.domain}${h.verified ? "✓" : ""}(${(h.qualityScore || 0).toFixed(2)})`)
    .join("  ");
  console.log(`${folder.padEnd(13)} ${name.padEnd(28)} curated=${domain.padEnd(22)} => ${top || "(none)"}`);
  await sleep(1300);
}
