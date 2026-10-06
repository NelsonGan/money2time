import type { AutoLogCaptureRow } from '~/lib/db/schema';
import { toPaymentAlertCapture } from '~/lib/repositories/mappers';

function row(resolution: Record<string, unknown>): AutoLogCaptureRow {
  return {
    id: 'capture',
    channel: 'android_notification',
    sourceKey: 'bank',
    sourceLabel: null,
    capturedAt: '2026-10-06T00:00:00Z',
    nativeKey: null,
    title: null,
    body: null,
    status: 'failed',
    reason: 'auto',
    resolutionJson: JSON.stringify(resolution),
    parserVersion: 4,
    transactionId: null,
    duplicateOf: null,
    dedupeKey: null,
    createdAt: '2026-10-06T00:00:00Z',
    updatedAt: '2026-10-06T00:00:00Z',
    deletedAt: null,
  };
}
it('retains inference currency so failed saves can reuse a parse safely', () => {
  expect(
    toPaymentAlertCapture(
      row({ scanCurrency: 'MYR', parse: { kind: 'spend', amount: 25, currency: 'USD' } }),
    ).resolution?.scanCurrency,
  ).toBe('MYR');
});
it('leaves legacy or malformed inference currency unset so a retry reparses', () => {
  expect(
    toPaymentAlertCapture(row({ parse: { kind: 'spend', amount: 25 } })).resolution?.scanCurrency,
  ).toBeUndefined();
  expect(
    toPaymentAlertCapture(row({ scanCurrency: 123, parse: { kind: 'spend', amount: 25 } }))
      .resolution?.scanCurrency,
  ).toBeUndefined();
});
