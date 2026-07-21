import type { Account } from '~/types';

/**
 * A fixed catalog of premium "payment card" color themes.
 *
 * Each entry is a self-contained gradient designed to read the same in light and
 * dark app modes (like a physical card, it does not re-theme). All figures/labels
 * sit on top in light foreground tones, so the shared `CARD_FOREGROUND` set below
 * works for every gradient — keep gradients deep enough for white text.
 */
export interface CardColorDef {
  id: string;
  /** English proper name — accessibility labels only, never displayed as text. */
  name: string;
  /** Diagonal gradient stops, top-left → bottom-right. */
  gradient: readonly [string, string, string];
  /** A single representative swatch color (for the picker dot). */
  swatch: string;
}

/** Shared light-on-dark foreground tokens used across every card gradient. */
export const CARD_FOREGROUND = {
  /** Primary figures + names. */
  strong: 'rgba(255,255,255,0.98)',
  /** Secondary values. */
  soft: 'rgba(255,255,255,0.74)',
  /** Faint uppercase labels. */
  faint: 'rgba(255,255,255,0.52)',
  /** Frosted tile / chip fill. */
  frost: 'rgba(255,255,255,0.14)',
  /** Frosted tile / chip fill, stronger. */
  frostStrong: 'rgba(255,255,255,0.2)',
  /** Hairline dividers + card border. */
  hairline: 'rgba(255,255,255,0.16)',
  /** Brighter decorative gloss line. */
  sheen: 'rgba(255,255,255,0.18)',
  /** Fainter decorative gloss line. */
  sheenSoft: 'rgba(255,255,255,0.08)',
  /** Negative / amount-owed figures (light red, readable on dark). */
  negative: '#FF9B8F',
} as const;

export const CARD_COLORS: readonly CardColorDef[] = [
  {
    id: 'graphite',
    name: 'Graphite',
    gradient: ['#3C424C', '#262A31', '#181A1F'],
    swatch: '#2B2F36',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    gradient: ['#2E5286', '#1E3A5F', '#142743'],
    swatch: '#204070',
  },
  { id: 'ocean', name: 'Ocean', gradient: ['#1B7C86', '#0F565C', '#0A3A3F'], swatch: '#116068' },
  { id: 'forest', name: 'Forest', gradient: ['#2F7355', '#1C513B', '#123527'], swatch: '#1E5940' },
  {
    id: 'emerald',
    name: 'Emerald',
    gradient: ['#1F9B76', '#127055', '#0B4A38'],
    swatch: '#149060',
  },
  { id: 'teal', name: 'Teal', gradient: ['#2C8F9B', '#1A6470', '#103F49'], swatch: '#1F7684' },
  { id: 'indigo', name: 'Indigo', gradient: ['#4F53A8', '#363A82', '#242760'], swatch: '#3A3E8A' },
  { id: 'plum', name: 'Plum', gradient: ['#71508F', '#4D3670', '#33234E'], swatch: '#553B78' },
  { id: 'rose', name: 'Rose', gradient: ['#9A4064', '#732C48', '#4F1E33'], swatch: '#7C3352' },
  {
    id: 'crimson',
    name: 'Crimson',
    gradient: ['#AE3F42', '#832E30', '#5C2022'],
    swatch: '#8E3234',
  },
  { id: 'bronze', name: 'Bronze', gradient: ['#A0713E', '#7C542A', '#573A1B'], swatch: '#835A2E' },
  { id: 'cocoa', name: 'Cocoa', gradient: ['#5F4B3A', '#413227', '#2B211A'], swatch: '#463629' },
];

export const DEFAULT_CARD_COLOR_ID = 'graphite';

const CARD_COLOR_MAP: Record<string, CardColorDef> = Object.fromEntries(
  CARD_COLORS.map((c) => [c.id, c]),
);

export function getCardColorById(id: string | null | undefined): CardColorDef | null {
  if (!id) return null;
  return CARD_COLOR_MAP[id] ?? null;
}

/** Deterministic, stable index into the color list from an arbitrary seed. */
function hashSeedToIndex(seed: string, mod: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % mod;
}

/**
 * The default card color assigned when a preset logo is applied. Stable per logo
 * so the same bank always maps to the same color, and the user can override it.
 */
export function getDefaultCardColorForLogo(logoId: string): string {
  return CARD_COLORS[hashSeedToIndex(logoId, CARD_COLORS.length)]!.id;
}

/**
 * Resolve the effective card color for an account:
 * - an explicit, still-valid `cardColor` wins;
 * - otherwise "auto": derive a stable color from the logo (so it matches the
 *   applied brand) or, lacking a logo, from the account id.
 */
export function resolveCardColor(
  account: Pick<Account, 'cardColor' | 'logoId' | 'id'>,
): CardColorDef {
  const explicit = getCardColorById(account.cardColor);
  if (explicit) return explicit;
  const seed = account.logoId || account.id;
  return CARD_COLORS[hashSeedToIndex(seed, CARD_COLORS.length)]!;
}
