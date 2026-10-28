import { ledgerLock } from '~/features/ledgers/lib/ledgerAccess';

describe('ledgerLock', () => {
  it('never locks the default ledger', () => {
    expect(ledgerLock('default', false, null)).toBeNull();
  });

  it('locks the user’s own extra ledgers without Pro', () => {
    expect(ledgerLock('work', false, null)).toBe('pro');
    expect(ledgerLock('work', true, null)).toBeNull();
    expect(ledgerLock('work', false, { role: 'owner', active: false })).toBe('pro');
  });

  it('lets a member open a joined ledger without Pro, unless its owner’s Pro ended', () => {
    expect(ledgerLock('home', false, { role: 'member', active: true })).toBeNull();
    expect(ledgerLock('home', true, { role: 'member', active: false })).toBe('paused');
  });
});
