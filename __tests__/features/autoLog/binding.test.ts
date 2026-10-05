import { bindAccount } from '~/features/autoLog/lib/binding';

import { account, source } from './helpers';

describe('explicit payment-alert accounts', () => {
  const accounts = [account({ id: 'app' }), account({ id: 'automation' })];
  it('uses the account selected for the app', () => {
    expect(
      bindAccount({ accounts, source: source({ accountId: 'app' }), presetAccountId: null }),
    ).toMatchObject({ accountId: 'app', certainty: 'certain', reason: 'source_single' });
  });
  it('honors an explicit automation account ahead of its source setting', () => {
    expect(
      bindAccount({
        accounts,
        source: source({ accountId: 'app' }),
        presetAccountId: 'automation',
      }),
    ).toMatchObject({ accountId: 'automation', certainty: 'certain', reason: 'preset' });
  });
  it('does not choose the first account or guess from its bank logo', () => {
    expect(
      bindAccount({
        accounts: [account({ logoId: 'malaysia/maybank' })],
        source: source(),
        presetAccountId: null,
      }),
    ).toMatchObject({ accountId: null, certainty: 'none' });
  });
  it.each(['goal', 'loan', 'deleted', 'missing'])(
    'does not bind an unavailable %s account',
    (kind) => {
      const unavailable = account({
        id: 'unavailable',
        ...(kind === 'goal' || kind === 'loan' ? { type: kind } : {}),
        deletedAt: kind === 'deleted' ? '2026-10-01' : null,
      });
      expect(
        bindAccount({
          accounts: kind === 'missing' ? [] : [unavailable],
          source: source({ accountId: 'unavailable' }),
          presetAccountId: 'unavailable',
        }).accountId,
      ).toBeNull();
    },
  );
});
