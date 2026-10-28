import { CLOUD_SYNC_FAQ_KEYS } from '~/features/cloudSync/lib/faq';
import en from '~/lib/i18n/locales/en';

describe('Cloud Sync FAQ', () => {
  it('has a question and an answer for every item, and nothing extra', () => {
    const items = (
      en as { cloud_sync: { faq: { items: Record<string, { q: string; a: string }> } } }
    ).cloud_sync.faq.items;
    expect(Object.keys(items)).toEqual([...CLOUD_SYNC_FAQ_KEYS]);
    for (const key of CLOUD_SYNC_FAQ_KEYS) {
      expect(items[key].q.trim()).not.toBe('');
      expect(items[key].a.trim()).not.toBe('');
    }
  });
});
