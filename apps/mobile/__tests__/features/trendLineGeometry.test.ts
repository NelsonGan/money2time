import {
  axisLabelStep,
  bucketIndexAtX,
  buildAreaPath,
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
