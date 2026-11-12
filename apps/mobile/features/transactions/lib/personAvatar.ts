/** The coloured initial a person gets across Balances: one colour per name. */

const AVATAR_COLORS = [
  '#C2604A',
  '#4A78C2',
  '#8A5AC2',
  '#3E9A78',
  '#C28A3E',
  '#B94A78',
  '#4AA5C2',
  '#7A7A3E',
];

/** A stable colour for a person's grouping key. */
export function avatarColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

/** The first letter of a name, or "?" for someone never named. */
export function personInitial(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed[0]!.toUpperCase() : '?';
}
