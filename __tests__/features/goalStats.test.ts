import {
  addDaysToDayKey,
  computeGoalStats,
  daysBetweenDayKeys,
  type GoalStatsInput,
} from '~/features/goals/utils';

function makeInput(overrides: Partial<GoalStatsInput> = {}): GoalStatsInput {
  return {
    targetReportingAmount: 1000,
    startingReportingAmount: 0,
    contributions: [],
    createdAtDayKey: '2026-01-01',
    deadline: null,
    todayDayKey: '2026-02-01',
    hourlyRate: 0,
    ...overrides,
  };
}

describe('addDaysToDayKey', () => {
  it('adds and subtracts days across month boundaries (UTC)', () => {
    expect(addDaysToDayKey('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysToDayKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysToDayKey('2026-01-01', 7)).toBe('2026-01-08');
  });
});

describe('computeGoalStats — progress', () => {
  it('sums starting amount and contributions in the reporting currency', () => {
    const stats = computeGoalStats(
      makeInput({
        startingReportingAmount: 200,
        contributions: [
          { date: '2026-01-10', reportingAmount: 300 },
          { date: '2026-01-20', reportingAmount: 100 },
        ],
      }),
    );
    expect(stats.savedAmount).toBe(600);
    expect(stats.remainingAmount).toBe(400);
    expect(stats.percentComplete).toBeCloseTo(0.6);
    expect(stats.isComplete).toBe(false);
    expect(stats.contributionCount).toBe(2);
  });

  it('ignores contributions dated after today', () => {
    const stats = computeGoalStats(
      makeInput({
        todayDayKey: '2026-01-15',
        contributions: [
          { date: '2026-01-10', reportingAmount: 300 },
          { date: '2026-01-20', reportingAmount: 500 }, // future — excluded
        ],
      }),
    );
    expect(stats.savedAmount).toBe(300);
    expect(stats.contributionCount).toBe(1);
  });

  it('marks a goal complete at or above target and allows over-saving', () => {
    const stats = computeGoalStats(
      makeInput({ contributions: [{ date: '2026-01-10', reportingAmount: 1200 }] }),
    );
    expect(stats.isComplete).toBe(true);
    expect(stats.remainingAmount).toBe(0);
    expect(stats.percentComplete).toBeCloseTo(1.2);
    expect(stats.forecastDate).toBeNull();
  });

  it('clamps negative net savings to zero progress without a negative percent', () => {
    const stats = computeGoalStats(
      makeInput({
        startingReportingAmount: 100,
        contributions: [{ date: '2026-01-10', reportingAmount: -300 }],
      }),
    );
    expect(stats.savedAmount).toBe(-200);
    expect(stats.remainingAmount).toBe(1000);
    expect(stats.percentComplete).toBe(0);
  });
});

describe('computeGoalStats — pace & forecast', () => {
  it('averages pace over the trailing window and projects a completion date', () => {
    // 100/week for 4 weeks, 600 remaining -> 6 weeks -> 42 days out.
    const stats = computeGoalStats(
      makeInput({
        createdAtDayKey: '2025-12-01',
        todayDayKey: '2026-01-29',
        paceWindowDays: 28,
        contributions: [
          { date: '2026-01-01', reportingAmount: 100 },
          { date: '2026-01-08', reportingAmount: 100 },
          { date: '2026-01-15', reportingAmount: 100 },
          { date: '2026-01-22', reportingAmount: 100 },
        ],
      }),
    );
    // Window is the last 28 days; 400 saved in window over 28 days = 100/week.
    expect(stats.weeklyPace).toBeCloseTo(100);
    expect(stats.savedAmount).toBe(400);
    expect(stats.forecastDate).toBe(addDaysToDayKey('2026-01-29', 42));
  });

  it('does not dilute pace for a goal younger than the window', () => {
    // Created 7 days ago, one 140 contribution -> 140/week, not 140/4wk.
    const stats = computeGoalStats(
      makeInput({
        createdAtDayKey: '2026-01-25',
        todayDayKey: '2026-02-01',
        contributions: [{ date: '2026-01-25', reportingAmount: 140 }],
      }),
    );
    expect(stats.weeklyPace).toBeCloseTo(140);
  });

  it('suppresses the forecast when pace is zero or negative', () => {
    const zero = computeGoalStats(makeInput({ contributions: [] }));
    expect(zero.weeklyPace).toBe(0);
    expect(zero.forecastDate).toBeNull();

    const negative = computeGoalStats(
      makeInput({
        startingReportingAmount: 500,
        contributions: [{ date: '2026-01-28', reportingAmount: -50 }],
      }),
    );
    expect(negative.forecastDate).toBeNull();
  });
});

describe('computeGoalStats — deadline status', () => {
  it('is "none" without a deadline', () => {
    expect(computeGoalStats(makeInput()).deadlineStatus).toBe('none');
  });

  it('is "met" once complete even if the deadline passed', () => {
    const stats = computeGoalStats(
      makeInput({
        deadline: '2026-01-01',
        contributions: [{ date: '2026-01-10', reportingAmount: 1000 }],
      }),
    );
    expect(stats.deadlineStatus).toBe('met');
  });

  it('is "pastDue" when the deadline passed unmet', () => {
    const stats = computeGoalStats(makeInput({ deadline: '2026-01-15' }));
    expect(stats.deadlineStatus).toBe('pastDue');
  });

  it('is "behind" with a future deadline but no pace', () => {
    const stats = computeGoalStats(makeInput({ deadline: '2026-06-01' }));
    expect(stats.deadlineStatus).toBe('behind');
    expect(stats.requiredWeeklyRate).toBeGreaterThan(0);
  });

  it('is "onTrack" when the forecast lands on or before the deadline', () => {
    const stats = computeGoalStats(
      makeInput({
        createdAtDayKey: '2025-12-01',
        todayDayKey: '2026-01-29',
        deadline: '2026-12-31',
        contributions: [
          { date: '2026-01-01', reportingAmount: 100 },
          { date: '2026-01-08', reportingAmount: 100 },
          { date: '2026-01-15', reportingAmount: 100 },
          { date: '2026-01-22', reportingAmount: 100 },
        ],
      }),
    );
    expect(stats.deadlineStatus).toBe('onTrack');
  });
});

describe('computeGoalStats — work-hours', () => {
  it('returns null hours when no wage is configured', () => {
    const stats = computeGoalStats(makeInput({ hourlyRate: 0 }));
    expect(stats.savedHours).toBeNull();
    expect(stats.remainingHours).toBeNull();
    expect(stats.targetHours).toBeNull();
  });

  it('expresses saved, remaining, and target amounts in work-hours', () => {
    const stats = computeGoalStats(
      makeInput({
        hourlyRate: 20,
        contributions: [{ date: '2026-01-10', reportingAmount: 400 }],
      }),
    );
    expect(stats.savedHours).toBeCloseTo(20); // 400 / 20
    expect(stats.remainingHours).toBeCloseTo(30); // 600 / 20
    expect(stats.targetHours).toBeCloseTo(50); // 1000 / 20
  });

  it('keeps target-hours fixed at the target even when over-saved', () => {
    const stats = computeGoalStats(
      makeInput({
        hourlyRate: 20,
        contributions: [{ date: '2026-01-10', reportingAmount: 1400 }],
      }),
    );
    expect(stats.savedHours).toBeCloseTo(70); // 1400 / 20
    expect(stats.remainingHours).toBeCloseTo(0);
    expect(stats.targetHours).toBeCloseTo(50); // still 1000 / 20, not saved
  });
});

describe('daysBetweenDayKeys', () => {
  it('counts whole days and floors inverted ranges at zero', () => {
    expect(daysBetweenDayKeys('2026-01-01', '2026-01-08')).toBe(7);
    expect(daysBetweenDayKeys('2026-02-01', '2026-01-01')).toBe(0);
  });
});
