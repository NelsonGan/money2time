import {
  buildFairShare,
  buildHouseholdIndex,
  buildHouseholdMonth,
  buildPeopleStyles,
  HOUSEHOLD_UNCATEGORIZED,
  householdPagerMonths,
  OWNER_KEY,
  personKey,
  shiftMonthKey,
} from '~/features/sharedLedgers/lib/householdMath';
import type { LedgerPeople, LedgerPerson } from '~/features/sharedLedgers/lib/ledgerPeople';
import {
  distinctSeedColors,
  PERSON_COLORS,
  seedColor,
} from '~/features/sharedLedgers/lib/personColors';
import type { TransactionType } from '~/types';

// The numbers behind the Household insights page (README: Shared ledgers >
// Household insights). Pure: no database, no React.

let nextId = 0;
function expense(
  date: string,
  amount: number,
  memberId: string | null,
  extra: Partial<{
    type: TransactionType;
    reportingAmount: number | null;
    categoryId: string | null;
    deletedAt: string | null;
    id: string;
  }> = {},
) {
  nextId += 1;
  return {
    id: extra.id ?? `t${nextId}`,
    type: extra.type ?? ('expense' as TransactionType),
    amount,
    reportingAmount: extra.reportingAmount ?? null,
    date,
    categoryId: extra.categoryId ?? null,
    memberId,
    deletedAt: extra.deletedAt ?? null,
  };
}

const keyOf = (memberId: string | null) => memberId ?? OWNER_KEY;
const CATEGORIES = [
  { id: 'food', parentId: null },
  { id: 'groceries', parentId: 'food' },
  { id: 'dining', parentId: 'food' },
  { id: 'rent', parentId: null },
  { id: 'transport', parentId: null },
  { id: 'kids', parentId: null },
  { id: 'health', parentId: null },
  { id: 'fun', parentId: null },
];

function person(memberId: string | null, name: string, color = '#4F8A8B'): LedgerPerson {
  return {
    color,
    memberId,
    name,
    named: true,
    avatarUri: null,
    avatarFileUri: null,
    role: memberId ? 'member' : 'owner',
    isSelf: false,
  };
}

function peopleOf(list: LedgerPerson[]): LedgerPeople {
  return {
    ledgerId: 'home',
    people: list,
    personFor: (memberId) =>
      list.find((entry) => entry.memberId === (memberId ?? null)) ??
      person(memberId ?? null, 'Member'),
  };
}

describe('buildFairShare', () => {
  it('evens a couple out with one payment from the one behind', () => {
    const share = buildFairShare([
      { personKey: 'aisha', amount: 3759.8 },
      { personKey: 'daniel', amount: 2722.6 },
    ]);
    expect(share?.each).toBeCloseTo(3241.2, 2);
    expect(share?.balances.map((balance) => Math.round(balance.difference * 100))).toEqual([
      51860, -51860,
    ]);
    expect(share?.transfers).toEqual([{ fromKey: 'daniel', toKey: 'aisha', amount: 518.6 }]);
  });

  it('settles three people in at most two payments that add up', () => {
    const share = buildFairShare([
      { personKey: 'a', amount: 90 },
      { personKey: 'b', amount: 60 },
      { personKey: 'c', amount: 0 },
    ]);
    // Each owes 50: C is 50 behind, A 40 ahead, B 10 ahead.
    expect(share?.transfers).toEqual([
      { fromKey: 'c', toKey: 'a', amount: 40 },
      { fromKey: 'c', toKey: 'b', amount: 10 },
    ]);
  });

  it('counts someone who spent nothing as owing their share', () => {
    const share = buildFairShare([
      { personKey: 'a', amount: 100 },
      { personKey: 'b', amount: 0 },
    ]);
    expect(share?.transfers).toEqual([{ fromKey: 'b', toKey: 'a', amount: 50 }]);
  });

  it('has no payments when everyone is already even, and none for one person', () => {
    expect(
      buildFairShare([
        { personKey: 'a', amount: 40 },
        { personKey: 'b', amount: 40 },
      ])?.transfers,
    ).toEqual([]);
    expect(buildFairShare([{ personKey: 'a', amount: 40 }])).toBeNull();
    expect(
      buildFairShare([
        { personKey: 'a', amount: 0 },
        { personKey: 'b', amount: 0 },
      ]),
    ).toBeNull();
  });

  it('pays in whole cents when a share does not divide evenly', () => {
    const share = buildFairShare([
      { personKey: 'a', amount: 100 },
      { personKey: 'b', amount: 0 },
      { personKey: 'c', amount: 0 },
    ]);
    expect(share?.transfers).toEqual([
      { fromKey: 'b', toKey: 'a', amount: 33.33 },
      { fromKey: 'c', toKey: 'a', amount: 33.33 },
    ]);
  });
});

describe('buildHouseholdIndex', () => {
  it('buckets live expenses by month and person, in the reporting currency', () => {
    const index = buildHouseholdIndex(
      [
        expense('2026-10-03T10:00:00', 50, null),
        expense('2026-10-04T10:00:00', 20, 'user-d', { reportingAmount: 80 }),
        expense('2026-09-30T10:00:00', 10, 'user-d'),
        expense('2026-10-05T10:00:00', 999, null, { type: 'income' }),
        expense('2026-10-06T10:00:00', 999, null, { deletedAt: '2026-10-07' }),
      ],
      keyOf,
      1,
    );
    const october = index.months.get('2026-10');
    expect(october?.total).toBe(130);
    expect(october?.byPerson.get(OWNER_KEY)).toBe(50);
    expect(october?.byPerson.get('user-d')).toBe(80);
    expect(index.months.get('2026-09')?.total).toBe(10);
    expect(index.firstMonthKey).toBe('2026-09');
  });
});

describe('buildHouseholdMonth', () => {
  const rows = [
    expense('2026-10-01T09:00:00', 2200, 'user-d', { categoryId: 'rent', id: 'rent' }),
    expense('2026-10-12T09:00:00', 486.2, null, { categoryId: 'groceries', id: 'aeon' }),
    expense('2026-10-14T09:00:00', 100, 'user-d', { categoryId: 'dining' }),
    expense('2026-10-18T09:00:00', 380, 'user-d', { categoryId: 'transport', id: 'car' }),
    expense('2026-10-19T09:00:00', 30, null),
    expense('2026-10-20T09:00:00', 20, null, { categoryId: 'kids' }),
    expense('2026-10-21T09:00:00', 15, null, { categoryId: 'health' }),
    expense('2026-10-22T09:00:00', 5, null, { categoryId: 'fun' }),
    expense('2026-10-23T09:00:00', 40, 'user-gone', { categoryId: 'groceries' }),
    expense('2026-09-10T09:00:00', 1000, null),
    expense('2026-07-10T09:00:00', 500, 'user-d'),
  ];
  const index = buildHouseholdIndex(rows, keyOf, 1);
  const month = buildHouseholdMonth({
    index,
    monthKey: '2026-10',
    monthCycle: 1,
    peopleOrder: [OWNER_KEY, 'user-d', 'user-kid'],
    categories: CATEGORIES,
    personKeyOf: keyOf,
  });

  it('lists everyone in order, then anyone else with an entry that month', () => {
    expect(month.people.map((entry) => [entry.personKey, entry.amount])).toEqual([
      [OWNER_KEY, 556.2],
      ['user-d', 2680],
      ['user-kid', 0],
      ['user-gone', 40],
    ]);
    expect(month.total).toBeCloseTo(3276.2, 5);
    // The change from September's 1000.
    expect(month.changeRatio).toBeCloseTo(2.2762, 4);
    // Split between all four, the one with nothing included.
    expect(month.fairShare?.balances).toHaveLength(4);
  });

  it('rolls categories up to their root and keeps the five biggest', () => {
    expect(month.categories.map((category) => category.id)).toEqual([
      'rent',
      'food',
      'transport',
      HOUSEHOLD_UNCATEGORIZED,
      'kids',
    ]);
    const food = month.categories[1]!;
    expect(food.amount).toBeCloseTo(626.2, 5);
    // Only the people who spent on it, in the page's order.
    expect(food.byPerson.map((part) => part.personKey)).toEqual([OWNER_KEY, 'user-d', 'user-gone']);
    expect(food.transactionIds).toHaveLength(3);
  });

  it('charts six months ending at the shown one, empty months at zero', () => {
    expect(month.trend.map((entry) => [entry.monthKey, entry.total])).toEqual([
      ['2026-05', 0],
      ['2026-06', 0],
      ['2026-07', 500],
      ['2026-08', 0],
      ['2026-09', 1000],
      ['2026-10', month.total],
    ]);
  });

  it('picks the three biggest entries and keeps each person’s entries', () => {
    expect(month.biggest.map((entry) => entry.transactionId)).toEqual(['rent', 'aeon', 'car']);
    expect(month.biggest[0]).toMatchObject({ personKey: 'user-d', dayKey: '2026-10-01' });
    expect(month.transactionIdsByPerson.get('user-d')).toHaveLength(3);
  });

  it('has no change without a month before, and is empty with no entries', () => {
    const empty = buildHouseholdMonth({
      index,
      monthKey: '2026-11',
      monthCycle: 1,
      peopleOrder: [OWNER_KEY, 'user-d'],
      categories: CATEGORIES,
      personKeyOf: keyOf,
    });
    expect(empty.isEmpty).toBe(true);
    expect(empty.fairShare).toBeNull();
    const july = buildHouseholdMonth({
      index,
      monthKey: '2026-07',
      monthCycle: 1,
      peopleOrder: [OWNER_KEY, 'user-d'],
      categories: CATEGORIES,
      personKeyOf: keyOf,
    });
    expect(july.changeRatio).toBeNull();
  });
});

describe('householdPagerMonths', () => {
  it('runs from the first month with spending to this one', () => {
    expect(householdPagerMonths('2026-08', '2026-11', 1)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(householdPagerMonths('2025-12', '2026-01', 1)).toEqual(['2025-12', '2026-01']);
  });

  it('is just this month with no spending, or only future spending', () => {
    expect(householdPagerMonths(null, '2026-11', 1)).toEqual(['2026-11']);
    expect(householdPagerMonths('2027-01', '2026-11', 1)).toEqual(['2026-11']);
  });

  it('steps by financial month', () => {
    expect(shiftMonthKey('2026-01', -1, 25)).toBe('2025-12');
    expect(shiftMonthKey('2026-12', 1, 25)).toBe('2027-01');
  });
});

describe('person colours', () => {
  it('gives six people six different colours, the first its own', () => {
    const seeds = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => `user-${id}`);
    const colors = distinctSeedColors(seeds);
    expect(new Set(colors).size).toBe(PERSON_COLORS.length);
    expect(colors[0]).toBe(seedColor(seeds[0]!));
  });

  it('moves the second of two accounts that hash to one colour', () => {
    const target = seedColor('user-a');
    let clash: string | null = null;
    for (let index = 0; index < 500 && !clash; index += 1) {
      if (seedColor(`user-x${index}`) === target) clash = `user-x${index}`;
    }
    expect(clash).not.toBeNull();
    const [a, b] = distinctSeedColors(['user-a', clash!]);
    expect(a).toBe(target);
    expect(b).not.toBe(target);
  });
});

describe('buildPeopleStyles', () => {
  it('styles the ledger’s people and anyone else found on an entry', () => {
    const owner = person(null, 'Aisha', PERSON_COLORS[1]);
    const daniel = person('user-d', 'Daniel', PERSON_COLORS[2]);
    const { peopleOrder, styleByKey } = buildPeopleStyles(peopleOf([owner, daniel]), [
      { byPerson: new Map([[OWNER_KEY, 10]]) },
      { byPerson: new Map([['user-gone', 5]]) },
    ]);
    expect(peopleOrder).toEqual([OWNER_KEY, 'user-d']);
    expect([...styleByKey.keys()]).toEqual([OWNER_KEY, 'user-d', 'user-gone']);
    expect(styleByKey.get(OWNER_KEY)?.person.name).toBe('Aisha');
    expect(personKey(styleByKey.get('user-gone')!.person)).toBe('user-gone');
    // The ledger's people keep the colour their rows show; the stranger takes
    // the first one nobody has.
    expect(styleByKey.get(OWNER_KEY)?.color).toBe(PERSON_COLORS[1]);
    expect(styleByKey.get('user-d')?.color).toBe(PERSON_COLORS[2]);
    expect(styleByKey.get('user-gone')?.color).toBe(PERSON_COLORS[0]);
  });

  it('is empty outside a shared ledger', () => {
    expect(buildPeopleStyles(null, []).styleByKey.size).toBe(0);
  });
});
