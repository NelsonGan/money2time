import corpus from '~/__tests__/fixtures/payment-alerts/alerts.json';
import { ALERT_PARSER_VERSION, parsePaymentAlert } from '~/features/autoLog/lib/parser';
import { findMoneyCandidates } from '~/features/autoLog/lib/parser/amounts';
import { normalizeAlertText } from '~/features/autoLog/lib/parser/text';

interface Expected {
  kind: string;
  amount?: number;
  currency?: string | null;
  counterparty?: string;
  confidence?: string;
  secondary?: { amount: number; currency: string };
}

interface Fixture {
  id: string;
  lang: string;
  app: string;
  title: string | null;
  body: string;
  expected: Expected;
}

const alerts = (corpus as { alerts: Fixture[] }).alerts;

describe('parsePaymentAlert against the fixture corpus', () => {
  it.each(alerts.map((alert) => [alert.id, alert] as const))('%s', (_id, alert) => {
    const result = parsePaymentAlert({ title: alert.title, body: alert.body });
    const { expected } = alert;
    expect(result.kind).toBe(expected.kind);
    if (expected.amount !== undefined) expect(result.amount).toBeCloseTo(expected.amount, 2);
    if (expected.currency !== undefined) expect(result.currency).toBe(expected.currency);
    if (expected.counterparty !== undefined)
      expect(result.counterparty).toBe(expected.counterparty);
    if (expected.confidence !== undefined) expect(result.confidence).toBe(expected.confidence);
    if (expected.secondary !== undefined) {
      expect(result.secondary?.currency).toBe(expected.secondary.currency);
      expect(result.secondary?.amount).toBeCloseTo(expected.secondary.amount, 2);
    }
    expect(result.parserVersion).toBe(ALERT_PARSER_VERSION);
  });

  it('meets the quality bar: every high-confidence alert is a correctly read spend', () => {
    // §8.7: a wrong auto-log costs more than a missed one, so anything the
    // parser is sure of must be a spend with the exact amount.
    const confident = alerts.filter(
      (alert) => parsePaymentAlert({ title: alert.title, body: alert.body }).confidence === 'high',
    );
    expect(confident.length).toBeGreaterThan(0);
    for (const alert of confident) {
      const result = parsePaymentAlert({ title: alert.title, body: alert.body });
      expect(`${alert.id}:${result.kind}`).toBe(`${alert.id}:spend`);
      expect(alert.expected.kind).toBe('spend');
      expect(result.amount).toBeCloseTo(alert.expected.amount ?? Number.NaN, 2);
    }
  });

  it('never reads a non-transaction alert as a confident spend', () => {
    const nonSpends = alerts.filter((alert) => alert.expected.kind !== 'spend');
    for (const alert of nonSpends) {
      const result = parsePaymentAlert({ title: alert.title, body: alert.body });
      expect(`${alert.id}:${result.kind === 'spend' && result.confidence === 'high'}`).toBe(
        `${alert.id}:false`,
      );
    }
  });
});

describe('parsePaymentAlert edge cases', () => {
  it('returns unknown with no amount for empty input rather than throwing', () => {
    const result = parsePaymentAlert({ body: '' });
    expect(result.kind).toBe('unknown');
    expect(result.amount).toBeNull();
    expect(result.confidence).toBe('low');
  });

  it('reads full-width digits in CJK alerts', () => {
    const result = parsePaymentAlert({ body: '您在星巴克消费人民币２５.００元' });
    expect(result.amount).toBeCloseTo(25, 2);
  });

  it('never treats a percentage as money', () => {
    expect(findMoneyCandidates('Get 10% off')).toEqual([]);
  });

  it('does not read a token glued to a word as a currency', () => {
    // "FROM 25" must not become RM 25.
    expect(findMoneyCandidates('Transfer FROM 25 friends')).toEqual([]);
  });

  it('keeps the richest description when two patterns see the same number', () => {
    const [candidate] = findMoneyCandidates('人民币25.00元');
    expect(candidate?.currency).toBe('CNY');
  });

  it('never logs a balance as the payment when a debit message omits its amount', () => {
    const result = parsePaymentAlert({
      body: 'Your card was used at SHELL. Available balance RM980.00.',
    });
    expect(result.amount).toBeNull();
    expect(result.kind).toBe('unknown');
  });

  it('prefers the payment over the balance that follows it', () => {
    const result = parsePaymentAlert({
      body: 'Available balance RM980.00. You spent RM20.00 at MYDIN.',
    });
    expect(result.amount).toBe(20);
    expect(result.counterparty).toBe('MYDIN');
  });

  it('strips HTML and joins title, subtitle and body', () => {
    const { text } = normalizeAlertText(['<b>Card</b>', null, 'You spent<br>RM5']);
    expect(text).toBe('Card\nYou spent\nRM5');
  });
});
