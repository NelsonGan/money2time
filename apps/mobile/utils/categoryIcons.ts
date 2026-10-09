function normalizeIcon(icon?: string | null): string | null {
  if (!icon) return null;
  const trimmed = icon.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveCategoryIcon(
  icon?: string | null,
  parentIcon?: string | null,
  fallbackIcon = '',
): string {
  return normalizeIcon(icon) ?? normalizeIcon(parentIcon) ?? fallbackIcon;
}
