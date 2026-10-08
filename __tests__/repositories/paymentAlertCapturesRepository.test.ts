import { getDb } from '~/lib/db/client';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';

describe('payment alert retention on retry', () => {
  const set = jest.fn();
  beforeEach(() => {
    const builder = { update: () => builder, set, where: () => builder, run: jest.fn() };
    set.mockReset().mockReturnValue(builder);
    jest.mocked(getDb).mockReturnValue(builder as never);
  });
  it('removes original text immediately when an existing failed capture is discarded', () => {
    paymentAlertCapturesRepository.update('retry', {
      status: 'ignored',
      reason: 'source_disabled',
    });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ title: null, body: null }));
  });
  it('preserves receipt text when a successful retry stores its transaction link', () => {
    paymentAlertCapturesRepository.update('retry', {
      status: 'logged',
      transactionId: 'transaction',
    });
    expect(set.mock.calls[0]![0]).not.toHaveProperty('body');
    expect(set.mock.calls[0]![0]).not.toHaveProperty('title');
  });
});
jest.mock('~/lib/db/client', () => ({ getDb: jest.fn() }));
