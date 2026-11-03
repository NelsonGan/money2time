// The colour each person in a shared ledger is drawn in: the disc behind
// their initial on every row, and their part of the Household charts. Picked
// from their account id, so it is the same on every phone.

// Soft, mid-tone discs that keep a white initial readable in both themes.
export const PERSON_COLORS = ['#4F8A8B', '#B0505F', '#7A6FB0', '#C07A3A', '#5C8A5A', '#4E78A8'];

function colorIndexFor(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % PERSON_COLORS.length;
}

/** The colour `seed` (an account id) hashes to. */
export function seedColor(seed: string): string {
  return PERSON_COLORS[colorIndexFor(seed)] ?? PERSON_COLORS[0];
}

/**
 * A colour for each seed that no seed before it has, so a chart can tell the
 * people apart: each keeps the colour it hashes to (`seedColor`) unless one
 * earlier in the list has it, then takes the next free one. Past six the
 * colours repeat.
 */
export function distinctSeedColors(seeds: readonly string[]): string[] {
  const taken = new Set<number>();
  return seeds.map((seed) => {
    let index = colorIndexFor(seed);
    for (let step = 0; step < PERSON_COLORS.length && taken.has(index); step += 1) {
      index = (index + 1) % PERSON_COLORS.length;
    }
    taken.add(index);
    return PERSON_COLORS[index] ?? PERSON_COLORS[0];
  });
}

/**
 * The colour `seed` hashes to, or the next one after it that is not in
 * `taken` (all taken: its own).
 */
export function freeSeedColor(seed: string, taken: ReadonlySet<string>): string {
  const start = colorIndexFor(seed);
  for (let step = 0; step < PERSON_COLORS.length; step += 1) {
    const color = PERSON_COLORS[(start + step) % PERSON_COLORS.length]!;
    if (!taken.has(color)) return color;
  }
  return seedColor(seed);
}
