import {
  AUTO_LOG_LIMIT_PROMPT_INTERVAL_MS,
  decideAutoLogLimitPrompt,
  parseAutoLogLimitBlockedJson,
} from '~/features/autoLog/lib/limitPrompt';

const plugin = require('../../plugins/withMoney2TimeAutoLog.js') as {
  LIMIT_BLOCKED_KEY: string;
  LOG_CARD_PAYMENT_INTENT_SWIFT: string;
  AUTO_LOG_STORE_SWIFT: string;
  AUTO_LOG_MODULE_SWIFT: string;
  AUTO_LOG_MODULE_OBJC: string;
};

const NOW = Date.parse('2026-11-20T09:00:00.000Z');
const blocked = { count: 2, lastAt: '2026-11-20T08:00:00.000Z' };

describe('parseAutoLogLimitBlockedJson', () => {
  it('reads the record the App Intent writes', () => {
    expect(parseAutoLogLimitBlockedJson(JSON.stringify(blocked))).toEqual(blocked);
  });

  it('treats a missing or unreadable record as none', () => {
    expect(parseAutoLogLimitBlockedJson(null)).toBeNull();
    expect(parseAutoLogLimitBlockedJson('')).toBeNull();
    expect(parseAutoLogLimitBlockedJson('{not json')).toBeNull();
    expect(parseAutoLogLimitBlockedJson('[]')).toBeNull();
    expect(parseAutoLogLimitBlockedJson('{"count":0,"lastAt":"2026-11-20T08:00:00Z"}')).toBeNull();
    expect(
      parseAutoLogLimitBlockedJson('{"count":"2","lastAt":"2026-11-20T08:00:00Z"}'),
    ).toBeNull();
    expect(parseAutoLogLimitBlockedJson('{"count":2,"lastAt":"yesterday"}')).toBeNull();
  });
});

describe('decideAutoLogLimitPrompt', () => {
  it('does nothing when no payment was refused', () => {
    expect(
      decideAutoLogLimitPrompt({ isPro: false, blocked: null, lastPromptAt: null, now: NOW }),
    ).toBe('none');
  });

  it('opens the paywall for a free member the first time', () => {
    expect(decideAutoLogLimitPrompt({ isPro: false, blocked, lastPromptAt: null, now: NOW })).toBe(
      'prompt',
    );
  });

  it('never shows it to a Pro member, and drops the stale record', () => {
    expect(decideAutoLogLimitPrompt({ isPro: true, blocked, lastPromptAt: null, now: NOW })).toBe(
      'clear',
    );
  });

  it('shows it at most once per interval', () => {
    const recent = NOW - AUTO_LOG_LIMIT_PROMPT_INTERVAL_MS + 1;
    expect(
      decideAutoLogLimitPrompt({ isPro: false, blocked, lastPromptAt: recent, now: NOW }),
    ).toBe('wait');
    const old = NOW - AUTO_LOG_LIMIT_PROMPT_INTERVAL_MS;
    expect(decideAutoLogLimitPrompt({ isPro: false, blocked, lastPromptAt: old, now: NOW })).toBe(
      'prompt',
    );
  });

  it('does not wait on a last-shown time in the future (a clock change)', () => {
    expect(
      decideAutoLogLimitPrompt({ isPro: false, blocked, lastPromptAt: NOW + 60_000, now: NOW }),
    ).toBe('prompt');
  });
});

describe('Log Card Payment at the free limit (withMoney2TimeAutoLog)', () => {
  const intent = plugin.LOG_CARD_PAYMENT_INTENT_SWIFT;

  it('records a refused real payment before throwing the localized error', () => {
    const gate = intent.indexOf('if !isRerun, AutoLogStore.remaining(catalog: catalog) <= 0 {');
    expect(gate).toBeGreaterThan(-1);
    const record = intent.indexOf('AutoLogStore.recordLimitBlocked()', gate);
    const thrown = intent.indexOf(
      'throw AutoLogError.limitReached(catalog.limitReachedMessage)',
      gate,
    );
    expect(record).toBeGreaterThan(gate);
    expect(thrown).toBeGreaterThan(record);
  });

  it('records nothing for a Play test run, which is not a payment', () => {
    expect(intent.match(/recordLimitBlocked\(\)/g)).toHaveLength(1);
    const testRun = intent.indexOf('if AutoLogStore.isTestRun(merchant, card) {');
    const gate = intent.indexOf('if !isRerun, AutoLogStore.remaining');
    expect(intent.slice(testRun, gate)).not.toContain('recordLimitBlocked');
    expect(intent.slice(testRun, gate)).toContain(
      'throw AutoLogError.limitReached(catalog.limitReachedMessage)',
    );
  });

  it('keeps the record under the key the app reads and lets the app read and clear it', () => {
    expect(plugin.LIMIT_BLOCKED_KEY).toBe('autolog_limit_blocked');
    expect(plugin.AUTO_LOG_STORE_SWIFT).toContain(
      `static let limitBlockedKey = "${plugin.LIMIT_BLOCKED_KEY}"`,
    );
    // The record is { count, lastAt }, the shape parseAutoLogLimitBlockedJson reads.
    expect(plugin.AUTO_LOG_STORE_SWIFT).toContain('let count: Int');
    expect(plugin.AUTO_LOG_STORE_SWIFT).toContain('let lastAt: String');
    expect(plugin.AUTO_LOG_STORE_SWIFT).toContain('let limitReachedMessage: String?');
    for (const method of ['readLimitBlocked', 'clearLimitBlocked']) {
      expect(plugin.AUTO_LOG_MODULE_SWIFT).toContain(`@objc(${method}:rejecter:)`);
      expect(plugin.AUTO_LOG_MODULE_OBJC).toContain(`RCT_EXTERN_METHOD(${method}:`);
    }
  });
});
