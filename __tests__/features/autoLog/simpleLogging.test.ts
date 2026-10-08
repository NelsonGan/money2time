import type { CaptureInput } from '~/features/autoLog/lib/captureQueue';
import {
  analyzeCapture,
  finalizeCapture,
  type PipelineContext,
} from '~/features/autoLog/lib/pipeline';
import { parsePaymentAlertPrefs, withAlertSource } from '~/features/autoLog/lib/prefs';

import { account, alertParse, category, prefs, source } from './helpers';

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
  defaultIncomeCategoryId: null,
});
const capture = (body: string): CaptureInput => ({
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
  return finalizeCapture(analyzeCapture(capture(body), ctx, alertParse()), ctx, {
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

  it('ignores a medium-confidence classification', () => {
    const ctx = context();
    expect(
      finalizeCapture(
        analyzeCapture(capture('Paid MYR25'), ctx, alertParse({ confidence: 'medium' })),
        ctx,
        { duplicate: { kind: 'none', supersedesCaptureId: null }, autoLogsRemaining: null },
      ).decision.reason,
    ).toBe('low_confidence');
  });

  it('does not guess an account when the app has no selected account', () => {
    const ctx = context();
    ctx.prefs = withAlertSource(prefs(), source());
    expect(outcome('You spent RM25.00 at SHELL.', ctx).decision).toEqual({
      action: 'ignore',
      reason: 'account_uncertain',
    });
  });

  it('uses the scanner category, and a type-specific default when it finds none', () => {
    const ctx = context();
    expect(outcome('Paid MYR25', ctx).resolution).toMatchObject({
      categoryId: 'food',
      categoryOrigin: 'scanner',
    });
    const analysis = analyzeCapture(capture('Paid MYR25'), ctx, alertParse({ category: null }));
    expect(
      finalizeCapture(analysis, ctx, {
        duplicate: { kind: 'none', supersedesCaptureId: null },
        autoLogsRemaining: null,
      }).resolution.categoryId,
    ).toBe('default');
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
  it('does not log queued Android alerts after the master switch is turned off', () => {
    const ctx = context();
    ctx.prefs.alertsEnabled = false;
    expect(outcome('You spent RM25.00 at SHELL.', ctx).decision).toEqual({
      action: 'ignore',
      reason: 'source_disabled',
    });
  });

  it('uses the iOS action account even when obsolete source settings are disabled', () => {
    const ctx = context();
    ctx.prefs = withAlertSource(
      prefs({ alertsEnabled: false }),
      source({ channel: 'ios_alert', sourceKey: 'bank', enabled: false, accountId: 'other' }),
    );
    const input = {
      ...capture('You spent RM25.00 at SHELL.'),
      channel: 'ios_alert' as const,
      sourceKey: 'bank',
      presetAccountId: 'selected',
    };
    const result = finalizeCapture(analyzeCapture(input, ctx, alertParse()), ctx, {
      duplicate: { kind: 'none', supersedesCaptureId: null },
      autoLogsRemaining: null,
    });
    expect(result.decision).toEqual({ action: 'log', reason: 'auto' });
    expect(result.draft?.accountId).toBe('selected');
  });

  it('does not use an obsolete iOS source account when the action has no selected account', () => {
    const ctx = context();
    ctx.prefs = withAlertSource(
      prefs(),
      source({ channel: 'ios_alert', sourceKey: 'bank', accountId: 'selected' }),
    );
    const input = {
      ...capture('You spent RM25.00 at SHELL.'),
      channel: 'ios_alert' as const,
      sourceKey: 'bank',
    };
    const result = finalizeCapture(analyzeCapture(input, ctx, alertParse()), ctx, {
      duplicate: { kind: 'none', supersedesCaptureId: null },
      autoLogsRemaining: null,
    });
    expect(result.decision.action).toBe('ignore');
    expect(result.resolution.accountId).toBeNull();
  });
});
