"use client";

// Only the encoder: the package's main entry also loads renderers this does not use.
import { create } from "qrcode/lib/core/qrcode";
import { useMemo } from "react";

/**
 * A QR code as one SVG path, dark modules on white with the quiet zone the
 * spec asks for, so any phone camera reads it in either theme.
 */
export function QrCode({ value, size = 264, label }: { value: string; size?: number; label: string }) {
  const { path, cells } = useMemo(() => {
    const modules = create(value, { errorCorrectionLevel: "M" }).modules;
    const quiet = 4;
    let d = "";
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (modules.get(row, col)) d += `M${col + quiet} ${row + quiet}h1v1h-1z`;
      }
    }
    return { path: d, cells: modules.size + quiet * 2 };
  }, [value]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${cells} ${cells}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={cells} height={cells} fill="#FFFFFF" />
      <path d={path} fill="#1A2E2A" />
    </svg>
  );
}
