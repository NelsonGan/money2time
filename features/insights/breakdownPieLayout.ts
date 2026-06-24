// Shared geometry + collision-avoiding label layout for the category breakdown
// pie chart. Used by the insights breakdown, the drilldown, and the album
// breakdown so every pie renders labels identically (no overlap).

export const BREAKDOWN_PIE_LABEL_MIN_WIDTH = 72;
export const BREAKDOWN_PIE_LABEL_MAX_WIDTH = 88;
export const BREAKDOWN_PIE_LABEL_HEIGHT = 24;
export const BREAKDOWN_PIE_LABEL_LINE_LENGTH = 12;
export const BREAKDOWN_PIE_LABEL_TAIL_LENGTH = 10;
export const BREAKDOWN_PIE_LABEL_MARGIN = 4;
export const BREAKDOWN_PIE_MIN_RADIUS = 48;
export const BREAKDOWN_PIE_MAX_RADIUS = 108;

export type PieLabelLayout = {
  id: string;
  anchorX: number;
  anchorY: number;
  outerX: number;
  outerY: number;
  innerX: number;
  boxLeft: number;
  labelY: number;
};

/**
 * Label layout: anchor each label at its slice midpoint, split into left/right
 * halves, then relax each side vertically to a minimum gap so labels spread out
 * without overlapping. Each column's inner edge follows the pie's arc (labels
 * near the top/bottom hug closer to the center, labels near the middle sit
 * furthest out), and a short leader connects them. Keeps the chart compact
 * (cropped top/bottom).
 */
export function layoutBreakdownPieLabels(
  slices: { id: string; amount: number }[],
  opts: {
    cx: number;
    cy: number;
    radius: number;
    elbowLength: number;
    tailLength: number;
    labelWidth: number;
    labelHeight: number;
    labelGap: number;
    stageHeight: number;
    totalAmount: number;
  },
): PieLabelLayout[] {
  const {
    cx,
    cy,
    radius,
    elbowLength,
    tailLength,
    labelWidth,
    labelHeight,
    labelGap,
    stageHeight,
    totalAmount,
  } = opts;
  if (slices.length === 0 || totalAmount <= 0) return [];

  const TWO_PI = Math.PI * 2;
  const startAngle = -Math.PI / 2;
  let cursor = 0;
  const raw = slices.map((slice) => {
    const fraction = slice.amount / totalAmount;
    const midTheta = cursor + (fraction / 2) * TWO_PI;
    cursor += fraction * TWO_PI;
    const angle = startAngle + midTheta;
    const isRight = midTheta < Math.PI;
    return {
      id: slice.id,
      side: (isRight ? 'right' : 'left') as 'left' | 'right',
      anchorX: cx + radius * Math.cos(angle),
      anchorY: cy + radius * Math.sin(angle),
      outerX: cx + (radius + elbowLength) * Math.cos(angle),
      outerY: cy + (radius + elbowLength) * Math.sin(angle),
    };
  });

  const minY = labelHeight / 2;
  const maxY = Math.max(minY, stageHeight - labelHeight / 2);

  const place = (items: typeof raw, sign: 1 | -1): PieLabelLayout[] => {
    const sorted = [...items].sort((a, b) => a.outerY - b.outerY);
    const ys = sorted.map((item) => Math.min(maxY, Math.max(minY, item.outerY)));
    for (let i = 1; i < ys.length; i++) {
      if (ys[i] < ys[i - 1] + labelGap) ys[i] = ys[i - 1] + labelGap;
    }
    if (ys.length > 0 && ys[ys.length - 1] > maxY) {
      ys[ys.length - 1] = maxY;
      for (let i = ys.length - 2; i >= 0; i--) {
        if (ys[i] > ys[i + 1] - labelGap) ys[i] = ys[i + 1] - labelGap;
      }
    }
    const offset = elbowLength + tailLength;
    const radiusSq = radius * radius;
    return sorted.map((item, i) => {
      const labelY = ys[i];
      const dy = labelY - cy;
      const arcX = Math.sqrt(Math.max(0, radiusSq - dy * dy));
      const innerX = cx + sign * (arcX + offset);
      const boxLeft = sign === 1 ? innerX : innerX - labelWidth;
      return {
        id: item.id,
        anchorX: item.anchorX,
        anchorY: item.anchorY,
        outerX: item.outerX,
        outerY: item.outerY,
        innerX,
        boxLeft,
        labelY,
      };
    });
  };

  return [
    ...place(
      raw.filter((item) => item.side === 'right'),
      1,
    ),
    ...place(
      raw.filter((item) => item.side === 'left'),
      -1,
    ),
  ];
}
