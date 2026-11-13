/**
 * Shared panorama for the opening scenes (01 Home, 02 Privacy, 03 Accounts,
 * 04 Budgeting).
 *
 * The four screenshots are designed as ONE continuous 5136×2778 composition.
 * Each scene renders the same full-width background, offset by its panel index,
 * so the gradient and organic shapes line up pixel-perfect across the cuts when
 * the screenshots sit side by side in the store gallery.
 *
 * One warm cream/coral family across the whole panorama — the same palette
 * every other scene uses, with peachy blobs and branches flowing across seams.
 */

import type { ReactNode } from 'react';
import { Blob, Branch } from './flora';

export const PANEL_W = 1284;
export const PANEL_H = 2778;
const PANO_W = PANEL_W * 4;

const FLORA_A = '#EFA48B';
const FLORA_B = '#E77F6C';

function Pano({ panel, zIndex, children }: {
  panel: number; zIndex: number; children: ReactNode;
}) {
  return (
    <div style={{
      position: 'absolute', top: 0, left: -panel * PANEL_W,
      width: PANO_W, height: PANEL_H,
      zIndex, pointerEvents: 'none',
    }}>{children}</div>
  );
}

export function TriptychBackground({ panel }: { panel: number }) {
  return (
    <Pano panel={panel} zIndex={1}>
      {/* One warm hue, drifting gently light → peachy across the four panels */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(95deg,
          #FBF2EA 0%, #FAEFE4 25%,
          #F9ECDF 50%, #F8E9DA 75%, #F7E6D5 100%)`,
      }} />
      {/* Airy top light for vertical depth, uniform across cuts */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 32%)',
      }} />

      {/* ── Organic flow, placed in panorama coordinates ── */}

      {/* Home — warm blobs rising from the bottom-left */}
      <Blob x={-200} y={2080} size={640} color={FLORA_A} opacity={0.5} rotate={14} />
      <Blob x={90} y={2400} size={520} color={FLORA_B} opacity={0.42} rotate={-18} />
      <Blob x={1080} y={340} size={300} color="#F2C9A8" opacity={0.4} rotate={30} />

      {/* Seam Home→Privacy — branch reaching across */}
      <Branch x={1150} y={2300} size={330} color={FLORA_A} opacity={0.5} rotate={-30} flip />

      {/* Seam Privacy→Accounts — a sprig over the top corner, clear of both headlines */}
      <Branch x={2440} y={-40} size={250} color={FLORA_B} opacity={0.4} rotate={200} />

      {/* Accounts — leaves in the bottom-right, echoing the reference */}
      <Branch x={3554} y={2280} size={360} color={FLORA_A} opacity={0.55} rotate={18} />
      <Branch x={3684} y={2510} size={230} color={FLORA_B} opacity={0.42} rotate={-24} flip />

      {/* Budgeting — blob clear of the Accounts branches */}
      <Blob x={3964} y={2400} size={460} color={FLORA_A} opacity={0.38} rotate={22} />
      <Branch x={4884} y={220} size={300} color={FLORA_A} opacity={0.45} rotate={168} />
      <Blob x={4844} y={2350} size={420} color={FLORA_B} opacity={0.32} rotate={-15} />
    </Pano>
  );
}
