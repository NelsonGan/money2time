import { ACCOUNT_FAQ_KEYS, CLOUD_SYNC_FAQ_KEYS } from '~/features/cloudSync/lib/faq';
import en from '~/lib/i18n/locales/en';

type Items = Record<string, { q: string; a: string }>;

function expectComplete(items: Items, keys: readonly string[]) {
  expect(Object.keys(items)).toEqual([...keys]);
  for (const key of keys) {
    expect(items[key].q.trim()).not.toBe('');
    expect(items[key].a.trim()).not.toBe('');
  }
}

describe('Cloud Sync FAQ', () => {
  it('has a question and an answer for every item, and nothing extra', () => {
    const items = (en as unknown as { cloud_sync: { faq: { items: Items } } }).cloud_sync.faq.items;
    expectComplete(items, CLOUD_SYNC_FAQ_KEYS);
  });
});

describe('Account FAQ', () => {
  it('has a question and an answer for every item, and nothing extra', () => {
    const items = (en as unknown as { settings: { account_faq: Items } }).settings.account_faq;
    expectComplete(items, ACCOUNT_FAQ_KEYS);
  });

  it('asks nothing the Cloud Sync FAQ already asks', () => {
    const cloud = (en as unknown as { cloud_sync: { faq: { items: Items } } }).cloud_sync.faq.items;
    const account = (en as unknown as { settings: { account_faq: Items } }).settings.account_faq;
    const cloudQuestions = new Set(Object.values(cloud).map((item) => item.q));
    for (const item of Object.values(account)) expect(cloudQuestions.has(item.q)).toBe(false);
  });
});
