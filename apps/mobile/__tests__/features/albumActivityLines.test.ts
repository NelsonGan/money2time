import { describeActivity, groupActivityByDay } from '~/features/albums/lib/activityLines';
import type { AlbumActivity, AlbumBillSnapshot } from '~/types';

// The Activity tab's lines in English, with the app's real strings.
jest.mock('~/lib/i18n', () => {
  const strings = jest.requireActual('~/lib/i18n/locales/en').default;
  return {
    I18n: {
      t: (key: string, options: Record<string, unknown> = {}) => {
        const template = key
          .split('.')
          .reduce(
            (node: Record<string, unknown> | undefined, part) => node?.[part] as never,
            strings,
          );
        return String(template).replace(/\{\{(\w+)\}\}/g, (_, name) => String(options[name]));
      },
    },
  };
});

const names: Record<string, string> = { me: 'Nelson', tess: 'Tess', ben: 'Ben' };
const ctx = {
  selfId: 'me',
  nameOf: (id: string | null) => (id ? names[id] : 'Someone'),
  money: (amount: number) => `RM${amount}`,
  day: (date: string) => date,
  needsAccount: () => false,
  isDeleted: () => true,
};

const dinner = (amount: number, paidBy = 'tess', share = amount / 3): AlbumBillSnapshot => ({
  note: 'Dinner',
  amount,
  currency: 'MYR',
  date: '2026-11-14',
  paidBy,
  shares: ['me', 'tess', 'ben'].map((memberId) => ({ memberId, amount: share })),
});

function entry(partial: Partial<AlbumActivity>): AlbumActivity {
  return {
    id: 'a1',
    groupId: 'bali',
    kind: 'bill_edited',
    actorMemberId: 'tess',
    expenseId: 'dinner',
    memberId: null,
    bill: null,
    rename: null,
    payment: null,
    simplify: null,
    sortOrder: 0,
    createdAt: '2026-11-14T13:41:00.000Z',
    ...partial,
  };
}

describe('the activity log, one line each', () => {
  it('says what changed, and how it moved the user’s own money when someone else did it', () => {
    const line = describeActivity(entry({ bill: { before: dinner(90), after: dinner(120) } }), ctx);
    expect(line.text).toBe('Tess changed Dinner: RM90 → RM120');
    expect(line.mine).toBe('Your share RM30 → RM40');
    expect(line.billId).toBe('dinner');
  });

  it('never highlights the user’s own change', () => {
    const line = describeActivity(
      entry({ actorMemberId: 'me', bill: { before: dinner(90), after: dinner(120) } }),
      ctx,
    );
    expect(line.text).toBe('You changed Dinner: RM90 → RM120');
    expect(line.mine).toBeNull();
  });

  it('says when someone else said the user paid, and asks for the account while there is none', () => {
    const added = entry({
      kind: 'bill_added',
      actorMemberId: 'ben',
      bill: { before: null, after: dinner(60, 'me') },
    });
    expect(describeActivity(added, ctx)).toMatchObject({
      text: 'Ben said you paid Dinner · RM60',
      mine: 'Your share RM20',
    });
    expect(describeActivity(added, { ...ctx, needsAccount: () => true }).mine).toBe(
      'Choose the account',
    );
    const changed = entry({
      actorMemberId: 'ben',
      bill: { before: dinner(60), after: dinner(60, 'me') },
    });
    expect(describeActivity(changed, ctx)).toMatchObject({
      text: 'Ben changed who paid Dinner: Tess → you',
      mine: 'Says you paid',
    });
  });

  it('offers Restore on a bill that is still deleted', () => {
    const deleted = entry({ kind: 'bill_deleted', bill: { before: dinner(360), after: null } });
    expect(describeActivity(deleted, ctx)).toMatchObject({
      text: 'Tess deleted Dinner · RM360',
      mine: 'Your share of RM120 is gone',
      restorable: true,
    });
    expect(describeActivity(deleted, { ...ctx, isDeleted: () => false }).restorable).toBe(false);
  });

  it('reads payments, members and settings', () => {
    const paid = entry({
      kind: 'payment_recorded',
      actorMemberId: 'tess',
      payment: {
        from: 'ben',
        to: 'tess',
        currency: 'MYR',
        amount: 45,
        bills: ['dinner'],
        even: false,
      },
    });
    expect(describeActivity(paid, ctx)).toMatchObject({ text: 'Ben paid Tess RM45', mine: null });
    const mine = entry({
      kind: 'payment_recorded',
      actorMemberId: 'tess',
      payment: { from: 'me', to: 'ben', currency: 'MYR', amount: 10, bills: [], even: false },
    });
    expect(describeActivity(mine, ctx)).toMatchObject({
      text: 'You paid Ben RM10',
      mine: 'Recorded by Tess',
    });
    expect(
      describeActivity(entry({ kind: 'member_joined', memberId: 'ben', expenseId: null }), ctx)
        .text,
    ).toBe('Ben joined the album');
    expect(
      describeActivity(
        entry({ kind: 'member_renamed', rename: { before: 'Ben', after: 'Benjamin' } }),
        ctx,
      ).text,
    ).toBe('Ben is now Benjamin');
    expect(describeActivity(entry({ kind: 'simplify_changed', simplify: true }), ctx).text).toBe(
      'Tess turned on Simplify group debts',
    );
  });

  it('groups the lines by day, newest first as they come', () => {
    const lines = [
      { ...describeActivity(entry({ id: 'a', createdAt: '2026-11-14T10:00:00.000Z' }), ctx) },
      { ...describeActivity(entry({ id: 'b', createdAt: '2026-11-14T09:00:00.000Z' }), ctx) },
      { ...describeActivity(entry({ id: 'c', createdAt: '2026-11-13T09:00:00.000Z' }), ctx) },
    ];
    expect(
      groupActivityByDay(lines, (iso) => iso.slice(0, 10)).map((day) => [
        day.day,
        day.lines.map((line) => line.id),
      ]),
    ).toEqual([
      ['2026-11-14', ['a', 'b']],
      ['2026-11-13', ['c']],
    ]);
  });
});
