import {
  axisLabelStep,
  bucketIndexAtX,
  buildAreaPath,
  buildClipMarkerPath,
  buildLinePath,
  buildPlotPoints,
  buildTrendLineScale,
  isAxisLabelShown,
  nearestValuedIndex,
  niceTicks,
} from '~/features/insights/lib/trendLineGeometry';

describe('niceTicks', () => {
  it('labels round values that cover the range', () => {
    expect(niceTicks(0, 2640)).toEqual([0, 1000, 2000, 3000]);
    expect(niceTicks(0, 95)).toEqual([0, 50, 100]);
  });

  it('handles negative ranges', () => {
    const ticks = niceTicks(-42_000, -35_000);
    expect(ticks[0]).toBeLessThanOrEqual(-42_000);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(-35_000);
  });
});

describe('buildTrendLineScale', () => {
  it('starts amounts at zero', () => {
    const scale = buildTrendLineScale([[1200, 2640, null]], { zeroBased: true });
    expect(scale.min).toBe(0);
    expect(scale.max).toBeGreaterThanOrEqual(2640);
  });

  it('keeps a balance in its own range with headroom', () => {
    const scale = buildTrendLineScale([[-38_000, -37_800, -37_500]], { zeroBased: false });
    expect(scale.min).toBeLessThan(-38_000);
    expect(scale.max).toBeGreaterThan(-37_500);
    expect(scale.max).toBeLessThan(0);
  });

  it('gives a flat or empty series a usable range', () => {
    const flat = buildTrendLineScale([[500, 500]], { zeroBased: true });
    expect(flat.max).toBeGreaterThan(flat.min);
    const empty = buildTrendLineScale([[null, null]], { zeroBased: true });
    expect(empty).toEqual({ min: 0, max: 1, ticks: [0, 1] });
  });
});

describe('rounded and nearly flat axes', () => {
  it('keeps steps whole when labels are rounded, so no label repeats', () => {
    expect(buildTrendLineScale([[0, 1, 0]], { zeroBased: true, minStep: 1 }).ticks).toEqual([0, 1]);
    expect(buildTrendLineScale([[0, 0]], { zeroBased: true, minStep: 1 }).ticks).toEqual([0, 1]);
  });

  it('treats float noise as a flat line', () => {
    const scale = buildTrendLineScale([[1500, 1500.0000000000002]], { zeroBased: false });
    expect(new Set(scale.ticks).size).toBe(scale.ticks.length);
    expect(scale.max - scale.min).toBeGreaterThan(100);
  });
});

describe('capped ranges', () => {
  // A year of savings rates with one month that spent ~4x its income.
  const rates = [46.4, 92.8, 45.7, 69.1, 63.6, 55.6, -357.3, 69.9, 45, 55, 4, 9];

  it('keeps one runaway month from flattening the rest', () => {
    const scale = buildTrendLineScale([rates], {
      zeroBased: true,
      minStep: 1,
      floor: -100,
      ceiling: 100,
    });
    expect(scale.min).toBe(-100);
    expect(scale.max).toBeGreaterThanOrEqual(92.8);
    expect(scale.max).toBeLessThanOrEqual(100);
    expect(scale.ticks).toContain(0);
  });

  it('pins a value past the cap to the edge and marks it', () => {
    const scale = buildTrendLineScale([rates], { zeroBased: true, floor: -100, ceiling: 100 });
    const points = buildPlotPoints(rates, scale, 1200, 0, 100);
    const july = points[6]!;
    expect(july.value).toBe(-357.3);
    expect(july.clipped).toBe('low');
    expect(july.y).toBe(100);
    expect(points.filter((point) => point.clipped)).toHaveLength(1);
  });

  it('leaves the range alone when nothing reaches a cap', () => {
    const capped = buildTrendLineScale([[20, 45, -30]], {
      zeroBased: true,
      floor: -100,
      ceiling: 100,
    });
    const uncapped = buildTrendLineScale([[20, 45, -30]], { zeroBased: true });
    expect(capped).toEqual(uncapped);
  });

  it('still draws a range when every value is past a cap', () => {
    const scale = buildTrendLineScale([[-250, -400]], { zeroBased: true, floor: -100 });
    expect(scale.min).toBe(-100);
    expect(scale.max).toBe(0);
  });

  it('does not let round ticks stretch the range past a cap', () => {
    const scale = buildTrendLineScale([[-400, -180, 20]], { zeroBased: true, floor: -150 });
    expect(scale.min).toBe(-150);
    expect(scale.ticks.every((tick) => tick >= -150)).toBe(true);
    const points = buildPlotPoints([-400, -180, 20], scale, 300, 0, 100);
    expect(points.map((point) => point.clipped)).toEqual(['low', 'low', null]);
  });

  it('points the marker off the chart', () => {
    const base = { index: 0, x: 50, y: 100, value: -357 };
    const low = buildClipMarkerPath({ ...base, clipped: 'low' }, 5);
    const high = buildClipMarkerPath({ ...base, y: 0, value: 400, clipped: 'high' }, 5);
    // The tip is the last vertex: below the point for low, above for high.
    expect(low).toMatch(/L 50 105\.5 Z$/);
    expect(high).toMatch(/L 50 -5\.5 Z$/);
    expect(buildClipMarkerPath({ ...base, clipped: null }, 5)).toBe('');
  });
});

describe('line paths', () => {
  const scale = { min: 0, max: 100 };

  it('places points at bucket centres and skips nulls', () => {
    const points = buildPlotPoints([0, 50, null, 100], scale, 400, 0, 100);
    expect(points.map((point) => point.index)).toEqual([0, 1, 3]);
    expect(points[0]).toMatchObject({ x: 50, y: 100 });
    expect(points[2]).toMatchObject({ x: 350, y: 0 });
  });

  it('breaks the line at a gap', () => {
    const points = buildPlotPoints([10, 20, null, 30], scale, 400, 0, 100);
    expect(buildLinePath(points)).toBe('M 50 90 L 150 80 M 350 70');
  });

  it('fills only runs of two or more points', () => {
    const points = buildPlotPoints([10, 20, null, 30], scale, 400, 0, 100);
    expect(buildAreaPath(points, 100)).toBe('M 50 90 L 150 80 L 150 100 L 50 100 Z');
  });
});

describe('axis labels', () => {
  it('shows every label when they fit and thins from the newest when not', () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    expect(axisLabelStep(months, 300)).toBe(1);
    const step = axisLabelStep([...months, ...months], 120);
    expect(step).toBeGreaterThan(1);
    expect(isAxisLabelShown(11, 12, step)).toBe(true);
  });
});

describe('scrubbing', () => {
  it('maps a finger position to a bucket, clamped', () => {
    expect(bucketIndexAtX(-10, 12, 240)).toBe(0);
    expect(bucketIndexAtX(125, 12, 240)).toBe(6);
    expect(bucketIndexAtX(999, 12, 240)).toBe(11);
  });

  it('snaps to the nearest bucket with a value', () => {
    const values = [5, 6, 7, null, null];
    expect(nearestValuedIndex(4, [values])).toBe(2);
    expect(nearestValuedIndex(1, [values])).toBe(1);
    expect(nearestValuedIndex(3, [values, [null, null, null, null, 9]])).toBe(2);
    expect(nearestValuedIndex(0, [[null, null]])).toBe(-1);
  });
});
