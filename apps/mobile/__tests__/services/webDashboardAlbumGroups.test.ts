import type { BackupData } from '~/services/dataManagementService';
import { withWebDashboardAlbumGroups } from '~/services/webDashboardAlbumGroups';
import type { AlbumActivity, AlbumExpense, AlbumMember } from '~/types';

const AT = '2026-10-01T10:00:00.000Z';

const data = (albums: Record<string, unknown>[]): BackupData =>
  ({
    version: 5,
    exportedAt: AT,
    tables: { accounts: [], transactions: [], albums },
  }) as unknown as BackupData;

const member = (
  id: string,
  userId: string | null,
  patch: Partial<AlbumMember> = {},
): AlbumMember => ({
  id,
  groupId: 'bali',
  name: id,
  userId,
  sortOrder: 0,
  createdAt: AT,
  updatedAt: AT,
  deletedAt: null,
  ...patch,
});

const bill: AlbumExpense = {
  id: 'b1',
  groupId: 'bali',
  date: '2026-10-01',
  note: 'Dinner',
  amount: 30,
  currency: 'MYR',
  categoryName: 'Food',
  categoryIcon: 'meal',
  paidBy: 'me',
  shares: [
    { memberId: 'me', amount: 15 },
    { memberId: 'tess', amount: 15 },
  ],
  createdBy: 'user-me',
  createdAt: AT,
  updatedAt: AT,
  deletedAt: AT,
};

const entry: AlbumActivity = {
  id: 'a1',
  groupId: 'bali',
  kind: 'bill_deleted',
  actorMemberId: 'tess',
  expenseId: 'b1',
  memberId: null,
  bill: {
    before: {
      note: 'Dinner',
      amount: 30,
      currency: 'MYR',
      date: '2026-10-01',
      paidBy: 'me',
      shares: bill.shares,
    },
    after: null,
  },
  rename: null,
  payment: null,
  simplify: null,
  sortOrder: 0,
  createdAt: AT,
};

describe('withWebDashboardAlbumGroups', () => {
  it('adds each shared album of the data with its members, bills and activity, and no accounts', () => {
    const out = withWebDashboardAlbumGroups(data([{ id: 'bali' }]), [
      {
        albumId: 'bali',
        selfId: 'me',
        members: [
          member('me', 'user-me'),
          member('tess', 'user-tess'),
          member('left', null),
          member('gone', 'x', { deletedAt: AT }),
        ],
        bills: [bill],
        activity: [entry],
      },
    ]);
    expect(out.tables.web_album_members).toEqual([
      { id: 'me', album_id: 'bali', name: 'me', is_self: 1, current: 1, sort_order: 0 },
      { id: 'tess', album_id: 'bali', name: 'tess', is_self: 0, current: 1, sort_order: 0 },
      { id: 'left', album_id: 'bali', name: 'left', is_self: 0, current: 0, sort_order: 0 },
    ]);
    expect(out.tables.web_album_bills).toEqual([
      {
        id: 'b1',
        album_id: 'bali',
        date: '2026-10-01',
        note: 'Dinner',
        amount: 30,
        currency: 'MYR',
        paid_by: 'me',
        shares: bill.shares,
        deleted: 1,
        updated_at: AT,
      },
    ]);
    expect(out.tables.web_album_activity).toEqual([
      expect.objectContaining({
        id: 'a1',
        album_id: 'bali',
        kind: 'bill_deleted',
        actor_member_id: 'tess',
        expense_id: 'b1',
      }),
    ]);
    expect(JSON.stringify(out.tables)).not.toContain('user-');
  });

  it('leaves out albums the data does not hold', () => {
    const out = withWebDashboardAlbumGroups(data([{ id: 'ski', deleted_at: AT }]), [
      {
        albumId: 'ski',
        selfId: null,
        members: [member('me', 'u')],
        bills: [bill],
        activity: [entry],
      },
    ]);
    expect(out.tables.web_album_members).toEqual([]);
    expect(out.tables.web_album_bills).toEqual([]);
    expect(out.tables.web_album_activity).toEqual([]);
  });
});
