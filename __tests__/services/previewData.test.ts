import {
  CATEGORY_BLUEPRINT,
  PREVIEW_PROFILES,
  type PreviewSeedProfile,
  wageConfigForMonthsAgo,
} from '~/services/previewData';

const PROFILE_KEYS = Object.keys(PREVIEW_PROFILES) as PreviewSeedProfile[];

const rootExpenseKeys = new Set(
  CATEGORY_BLUEPRINT.filter((item) => item.type === 'expense' && !item.parentKey).map(
    (item) => item.key,
  ),
);

const allCategoryKeys = new Set(CATEGORY_BLUEPRINT.map((item) => item.key));

describe('preview profiles', () => {
  it('covers all four locale profiles', () => {
    expect(PROFILE_KEYS.sort()).toEqual(
      ['american', 'chinese', 'malaysian_en', 'malaysian_zh'].sort(),
    );
  });

  describe.each(PROFILE_KEYS)('%s', (key) => {
    const profile = PREVIEW_PROFILES[key];

    it('has a non-empty career whose salary steps up at every newer job', () => {
      expect(profile.career.length).toBeGreaterThanOrEqual(2);
      // jobs are newest-first, so each newer job must out-earn the older one.
      for (let i = 0; i < profile.career.length - 1; i += 1) {
        expect(profile.career[i].monthlySalary).toBeGreaterThan(
          profile.career[i + 1].monthlySalary,
        );
        // Commute never increases as the career progresses (newest <= older).
        expect(profile.career[i].commuteMinutesPerWorkday).toBeLessThanOrEqual(
          profile.career[i + 1].commuteMinutesPerWorkday,
        );
      }
    });

    it('produces a monotonic, stepping wage history', () => {
      const salaries: number[] = [];
      for (let monthsAgo = 0; monthsAgo < 48; monthsAgo += 1) {
        salaries.push(wageConfigForMonthsAgo(profile.career, monthsAgo).wageAmount);
      }
      // Newest month is the current (highest) salary.
      expect(salaries[0]).toBe(profile.career[0].monthlySalary);
      // Oldest month lands on the first job's salary.
      expect(salaries[47]).toBe(profile.career[profile.career.length - 1].monthlySalary);
      // Never increases as we look further back, and actually steps down.
      const distinct = new Set(salaries);
      expect(distinct.size).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < salaries.length; i += 1) {
        expect(salaries[i]).toBeLessThanOrEqual(salaries[i - 1]);
      }
    });

    it('budgets against real root expense categories within the cap', () => {
      const { budgets } = profile;
      expect(budgets.allocations.length).toBeGreaterThan(0);
      let sum = 0;
      budgets.allocations.forEach((allocation) => {
        expect(rootExpenseKeys.has(allocation.categoryKey)).toBe(true);
        expect(allocation.amount).toBeGreaterThan(0);
        sum += allocation.amount;
      });
      // The cap leaves room for the unbudgeted tail.
      expect(budgets.totalAmount).toBeGreaterThanOrEqual(sum);
      expect(budgets.monthsToSeed).toBeGreaterThan(0);
    });

    it('has albums with valid FX metadata', () => {
      expect(profile.albums.length).toBeGreaterThan(0);
      // At least one trip abroad, so multi-currency is actually exercised.
      const foreign = profile.albums.filter((a) => a.currencyCode !== profile.currencyCode);
      expect(foreign.length).toBeGreaterThan(0);
      profile.albums.forEach((album) => {
        expect(album.currencyCode).toMatch(/^[A-Z]{3}$/);
        expect(album.fxRate).toBeGreaterThan(0);
        if (album.currencyCode === profile.currencyCode) {
          expect(album.fxRate).toBe(1);
        }
      });
    });

    it('uses ISO currency codes, not symbols', () => {
      expect(profile.currencyCode).toMatch(/^[A-Z]{3}$/);
      expect(profile.currencyCode).not.toBe(profile.currencySymbol);
    });

    it('seeds items with sane pricing', () => {
      expect(profile.items.length).toBeGreaterThan(0);
      profile.items.forEach((item) => {
        expect(item.purchasePrice).toBeGreaterThan(0);
        if (item.retiredMonthsAgo != null) {
          // A retired item that was sold must carry its sale price.
          if (item.salePrice != null) {
            expect(item.salePrice).toBeGreaterThan(0);
          }
          expect(item.retiredMonthsAgo).toBeLessThan(item.purchaseMonthsAgo);
        }
      });
    });

    it('names a category for every blueprint entry', () => {
      allCategoryKeys.forEach((categoryKey) => {
        expect(typeof profile.categories[categoryKey as keyof typeof profile.categories]).toBe(
          'string',
        );
      });
    });
  });
});

describe('wageConfigForMonthsAgo', () => {
  const career = [
    {
      durationMonths: 10,
      monthlySalary: 6000,
      hoursWorkedPerWeek: 40,
      commuteMinutesPerWorkday: 20,
    },
    {
      durationMonths: 12,
      monthlySalary: 5000,
      hoursWorkedPerWeek: 40,
      commuteMinutesPerWorkday: 30,
    },
    {
      durationMonths: 99,
      monthlySalary: 4000,
      hoursWorkedPerWeek: 40,
      commuteMinutesPerWorkday: 40,
    },
  ];

  it('holds each salary flat within a job and steps at the boundary', () => {
    expect(wageConfigForMonthsAgo(career, 0).wageAmount).toBe(6000);
    expect(wageConfigForMonthsAgo(career, 9).wageAmount).toBe(6000);
    expect(wageConfigForMonthsAgo(career, 10).wageAmount).toBe(5000);
    expect(wageConfigForMonthsAgo(career, 21).wageAmount).toBe(5000);
    expect(wageConfigForMonthsAgo(career, 22).wageAmount).toBe(4000);
  });

  it('treats the oldest job as open-ended', () => {
    expect(wageConfigForMonthsAgo(career, 500).wageAmount).toBe(4000);
  });
});
