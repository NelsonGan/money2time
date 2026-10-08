// Shared builders for the payment-alert tests. Not a test file itself (no
// `.test.ts`), so Jest only runs it through the imports below it.

import type {
  Account,
  Category,
  PaymentAlertParse,
  PaymentAlertPrefs,
  PaymentAlertSource,
} from '~/types';

export function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    name: 'Main',
    sortOrder: 0,
    type: 'debit',
    accountGroup: null,
    logoId: null,
    creditStatementDay: null,
    creditDueDay: null,
    currency: 'MYR',
    startingBalance: 0,
    includeInTotals: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

export function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'c1',
    name: 'Food',
    sortOrder: 0,
    type: 'expense',
    parentId: null,
    icon: 'meal',
    isDefault: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

export function source(overrides: Partial<PaymentAlertSource> = {}): PaymentAlertSource {
  return {
    channel: 'android_notification',
    sourceKey: 'com.example.bank',
    label: 'Example Bank',
    enabled: true,
    accountId: null,
    ignorePhrases: [],
    addedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

export function prefs(overrides: Partial<PaymentAlertPrefs> = {}): PaymentAlertPrefs {
  return {
    version: 1,
    alertsEnabled: true,
    notificationScanningEnabled: true,
    sources: {},
    ignorePhrases: [],
    ...overrides,
  };
}

export function alertParse(overrides: Partial<PaymentAlertParse> = {}): PaymentAlertParse {
  return {
    kind: 'spend',
    amount: 25,
    currency: 'MYR',
    currencyToken: null,
    secondary: null,
    counterparty: 'SHELL',
    counterpartyLeadIn: null,
    confidence: 'high',
    signals: ['notification_scanner'],
    parserVersion: 4,
    category: 'Food',
    ...overrides,
  };
}
