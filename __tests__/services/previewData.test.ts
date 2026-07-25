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

const accountKeys = new Set(['checking', 'savings', 'travel', 'card', 'cash', 'brokerage']);

describe('preview profiles', () => {
  it('covers all five locale profiles', () => {
    expect(PROFILE_KEYS.sort()).toEqual(
      ['american', 'chinese', 'taiwanese', 'malaysian_en', 'malaysian_zh'].sort(),
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

    it('changes wage exactly once per job over the tracked span', () => {
      // The seeder writes a wage entry only when the config changes (walking
      // oldest -> newest), so the number of entries equals the number of jobs
      // that fall in the 48-month window.
      let previous: ReturnType<typeof wageConfigForMonthsAgo> | null = null;
      let changePoints = 0;
      for (let monthsAgo = 47; monthsAgo >= 0; monthsAgo -= 1) {
        const config = wageConfigForMonthsAgo(profile.career, monthsAgo);
        const changed =
          !previous ||
          previous.wageAmount !== config.wageAmount ||
          previous.commuteMinutesPerWorkday !== config.commuteMinutesPerWorkday ||
          previous.hoursWorkedPerWeek !== config.hoursWorkedPerWeek;
        if (changed) changePoints += 1;
        previous = config;
      }
      // Every job in these profiles has a distinct salary, so all of them show
      // up as change points within the window.
      expect(changePoints).toBe(profile.career.length);
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

    it('has a display profile name', () => {
      expect(typeof profile.profileName).toBe('string');
      expect(profile.profileName.trim().length).toBeGreaterThan(0);
    });

    it('seeds split bills against valid categories and accounts', () => {
      expect(profile.splits.length).toBeGreaterThan(0);
      // At least one split should still have an unpaid participant, so the
      // split-bill "owed" summary is non-empty in screenshots.
      const hasOutstanding = profile.splits.some((split) =>
        split.participants.some((person) => !person.paid),
      );
      expect(hasOutstanding).toBe(true);
      profile.splits.forEach((split) => {
        expect(allCategoryKeys.has(split.categoryKey)).toBe(true);
        expect(accountKeys.has(split.account)).toBe(true);
        expect(split.selfShare).toBeGreaterThan(0);
        expect(split.participants.length).toBeGreaterThan(0);
        split.participants.forEach((person) => {
          expect(person.name.trim().length).toBeGreaterThan(0);
          expect(person.share).toBeGreaterThan(0);
        });
      });
    });

    it('keeps the optional second budget on real root categories', () => {
      if (!profile.secondBudget) return;
      profile.secondBudget.allocations.forEach((allocation) => {
        expect(rootExpenseKeys.has(allocation.categoryKey)).toBe(true);
        expect(allocation.amount).toBeGreaterThan(0);
      });
      // Not frozen into any month — it only populates the template picker.
      expect(profile.secondBudget.monthsToSeed).toBe(0);
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
