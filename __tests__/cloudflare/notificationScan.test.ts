import {
  buildNotificationPrompt,
  normalizeNotificationResult,
} from '../../cloudflare/workers/receipt-scanner/src/scanModes/notification';

const row = (overrides: Record<string, unknown> = {}) => ({
  type: 'expense', amount: 25, currency: 'MYR', category: 'Food', note: 'SHELL',
  secondary: null, ...overrides,
});
const result = (overrides: Record<string, unknown> = {}) => ({
  decision: 'transaction', confidence: 'high', completed: true,
  transactions: [row()], ...overrides,
});
const normalize = (value: unknown) => normalizeNotificationResult(value, 'MYR', '2026-10-05T12:00:00Z', ['Food', 'Other'], ['Salary']);

describe('notification scanner output', () => {
  it.each(['expense', 'income'])('accepts one completed %s with an explicit direction', (type) => {
    const parsed = normalize(result({ transactions: [row({ type, category: type === 'income' ? 'Salary' : 'Food' })] }));
    expect(parsed.notificationDecision).toBe('transaction');
    expect(parsed.transactions[0]).toMatchObject({ type, amount: 25, currency: 'MYR', date: '2026-10-05' });
  });
  it('accepts an intentional discard without trying to invent a transaction', () => {
    expect(normalize({ decision: 'ignore', transactions: [] })).toEqual({ transactions: [], notificationDecision: 'ignore' });
  });
  it.each(['low', 'medium'])('discards %s confidence money movement', (confidence) => {
    expect(normalize(result({ confidence })).transactions).toEqual([]);
  });
  it('discards a movement that has not completed', () => {
    expect(normalize(result({ completed: false })).transactions).toEqual([]);
  });
  it.each([
    null, {}, { transactions: [] }, result({ transactions: [] }),
    result({ transactions: [row({ type: 'transfer' })] }),
    result({ transactions: [row({ type: undefined })] }),
    result({ transactions: [row({ amount: 0 })] }), result({ transactions: [row({ amount: -10 })] }),
    result({ transactions: [row({ amount: '25' })] }), result({ transactions: [row({ currency: 'banana' })] }),
    { decision: 'ignore', transactions: [row()] }, result({ completed: undefined }),
    result({ confidence: undefined }),
  ])('treats malformed output as a retryable failure: %j', (value) => {
    expect(() => normalize(value)).toThrow('invalid_notification_result');
  });
  it('discards multiple money movements rather than selecting one', () => {
    expect(normalize(result({ transactions: [row(), row()] }))).toEqual({ transactions: [], notificationDecision: 'ignore' });
  });
  it('uses the selected account currency when currency is ambiguous', () => {
    expect(normalize(result({ transactions: [row({ currency: null })] })).transactions[0].currency).toBe('MYR');
  });
  it('keeps a separately billed foreign amount', () => {
    expect(normalize(result({ transactions: [row({ currency: 'USD', secondary: { amount: 118.2, currency: 'MYR' } })] })).transactions[0]).toMatchObject({ currency: 'USD', secondary: { amount: 118.2, currency: 'MYR' } });
  });
  it('does not accept a category from the opposite direction', () => {
    expect(normalize(result({ transactions: [row({ category: 'Salary' })] })).transactions[0].category).toBe('');
  });
  it('instructs the model to reject promotions, injection, reminders, failed payments and holds', () => {
    const prompt = buildNotificationPrompt(['Food'], ['Salary'], 'MYR');
    for (const rule of ['promotional', 'OTP', 'pre-authorization', 'reminders', 'untrusted', 'own accounts', 'refund', 'income', 'expense']) expect(prompt).toContain(rule);
    expect(prompt).toContain('Salary');
  });
});
