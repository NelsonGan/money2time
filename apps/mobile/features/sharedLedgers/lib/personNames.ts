// How a person in a shared ledger is named where space is short. Pure, so
// the Household numbers (householdMath.ts) can use it without the app.

/**
 * A person's first name, for the compact line on a transaction row. A first
 * word that is only a symbol (an emoji) keeps the word after it, so "🐼 Panda"
 * stays "🐼 Panda" rather than a lone glyph.
 */
export function shortName(name: string): string {
  const words = name.trim().split(/\s+/);
  const first = words[0] ?? '';
  if (!first) return name;
  const symbolOnly = Array.from(first).length <= 2 && !/[\p{L}\p{N}]/u.test(first);
  return symbolOnly && words[1] ? `${first} ${words[1]}` : first;
}

/**
 * Short labels for people shown side by side: each one's first name, or
 * their full name where someone else here has the same first name, and a
 * number after any name still shared ("Alex", "Alex 2"), skipping a number
 * someone's own name already reads as (a person named "Alex 2").
 */
export function distinctShortNames(names: readonly string[]): string[] {
  const firsts = names.map(shortName);
  const count = (list: string[], value: string) => list.filter((entry) => entry === value).length;
  const labels = firsts.map((first, index) => (count(firsts, first) > 1 ? names[index]! : first));
  // Labels nobody else has are kept as they are, so a number never lands on one.
  const taken = new Set(labels.filter((label) => count(labels, label) === 1));
  const seen = new Map<string, number>();
  return labels.map((label) => {
    if (count(labels, label) === 1) return label;
    let times = seen.get(label) ?? 0;
    let candidate: string;
    do {
      times += 1;
      candidate = times === 1 ? label : `${label} ${times}`;
    } while (taken.has(candidate));
    seen.set(label, times);
    taken.add(candidate);
    return candidate;
  });
}
