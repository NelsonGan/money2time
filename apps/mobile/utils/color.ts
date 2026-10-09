/**
 * Returns an `rgba(...)` string for a 6-digit hex color at the given alpha.
 * Falls back to the original value when it isn't a 6-digit hex. Alpha is
 * clamped to [0, 1].
 */
export function withColorAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const normalizedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
}

/**
 * Darkens a 6-digit hex color by the given factor (0–1). Used to derive the
 * darker bottom "ledge" of 3D / fat buttons. Returns the input unchanged when
 * it isn't a 6-digit hex.
 */
export function darkenColor(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex;
  const int = Number.parseInt(value, 16);
  const f = Math.max(0, 1 - amount);
  const r = Math.round(((int >> 16) & 0xff) * f);
  const g = Math.round(((int >> 8) & 0xff) * f);
  const b = Math.round((int & 0xff) * f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
