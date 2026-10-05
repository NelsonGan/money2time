import {
  analyzeCapture,
  finalizeCapture,
  type PipelineContext,
} from '~/features/autoLog/lib/pipeline';
import { parsePaymentAlertPrefs, withAlertSource } from '~/features/autoLog/lib/prefs';

import { account, category, prefs, source } from './helpers';

const selected = account({ id: 'selected' });
const other = Object.assign(account({ id: 'other' }), {
  autoLogIdentifiers: { last4: ['1234'], names: ['Visa'] },
});
const context = (): PipelineContext => ({
  accounts: [selected, other],
  categories: [category({ id: 'food' }), category({ id: 'default', name: 'Other' })],
  prefs: withAlertSource(prefs(), source({ accountId: selected.id })),
  reportingCurrency: 'MYR',
  defaultExpenseCategoryId: 'default',
  autoCategorizeByMerchant: true,
  lookups: { keyword: () => 'food' },
});
const capture = (body: string) => ({
  id: 'alert',
  channel: 'android_notification' as const,
  sourceKey: 'com.example.bank',
  sourceLabel: 'Bank',
  capturedAt: '2026-10-05T12:00:00.000Z',
  title: null,
  subtitle: null,
  body,
  extra: [],
  nativeKey: null,
  presetAccountId: null,
  presetCategoryId: null,
});
function outcome(body: string, ctx = context()) {
  return finalizeCapture(analyzeCapture(capture(body), ctx), ctx, {
    duplicate: { kind: 'none', supersedesCaptureId: null },
    autoLogsRemaining: null,
  });
}

describe('simple automatic payment logging', () => {
  it('logs into the selected app account even when card digits match another account', () => {
    const result = outcome('You spent RM25.00 at SHELL with card ending 1234.');
    expect(result.decision).toEqual({ action: 'log', reason: 'auto' });
    expect(result.draft?.accountId).toBe('selected');
  });

  it('automatically logs a medium-confidence spend without a review prompt', () => {
    expect(outcome('You have sent MYR 25.00 to JAMIE.').decision).toEqual({
      action: 'log',
      reason: 'auto',
    });
  });

  it('does not guess an account when the app has no selected account', () => {
    const ctx = context();
    ctx.prefs = withAlertSource(prefs(), source());
    expect(outcome('You spent RM25.00 at SHELL.', ctx).decision).toEqual({
      action: 'ignore',
      reason: 'account_uncertain',
    });
  });

  it('uses the same merchant keyword lookup and default fallback as Apple Pay', () => {
    const ctx = context();
    const lookup = jest.fn(() => 'food');
    ctx.lookups.keyword = lookup;
    expect(outcome('You spent RM25.00 at SHELL.', ctx).resolution).toMatchObject({
      categoryId: 'food',
      categoryOrigin: 'keyword',
    });
    expect(lookup).toHaveBeenCalledWith('SHELL', ctx.categories);
    ctx.autoCategorizeByMerchant = false;
    expect(outcome('You spent RM25.00 at SHELL.', ctx).resolution).toMatchObject({
      categoryId: 'default',
      categoryOrigin: 'default',
    });
  });

  it('drops removed modes and AI settings when reading older preferences', () => {
    const value = parsePaymentAlertPrefs(
      JSON.stringify({
        ...context().prefs,
        defaultMode: 'review',
        smartCategories: true,
        smartLimitReachedAt: '2026-10-05',
        sources: {
          old: { ...source({ accountId: 'selected' }), mode: 'review', accountMode: 'by_card' },
        },
      }),
    );
    expect(value).not.toHaveProperty('smartCategories');
    expect(value).not.toHaveProperty('defaultMode');
    expect(Object.values(value.sources)[0]).not.toHaveProperty('mode');
    expect(Object.values(value.sources)[0]).not.toHaveProperty('accountMode');
  });
});
