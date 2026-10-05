import fs from 'node:fs';
import path from 'node:path';

import { parsePaymentAlert } from '~/features/autoLog/lib/parser';

const localeDir = path.resolve(__dirname, '../../../lib/i18n/locales');
const locales = fs.readdirSync(localeDir).filter((name) => name.endsWith('.ts'));

describe('the localized Android setup test alert', () => {
  it.each(locales)('recognizes the spending preview in %s', (file) => {
    const locale = require(path.join(localeDir, file)).default as {
      payment_alerts: { test_alert_body: string; test_alert_title: string };
    };
    const body = locale.payment_alerts.test_alert_body.replace('%{amount}', 'MYR 1.00');
    expect(
      parsePaymentAlert({ title: locale.payment_alerts.test_alert_title, body }),
    ).toMatchObject({ kind: 'spend', amount: 1, currency: 'MYR' });
  });
  it.each([
    'Du har betalt MYR 1.00. Betalingen blev afvist.',
    'Du har betalt MYR 1.00. Betalingen ble avvist.',
    'Du har betalat MYR 1.00. Betalningen nekades.',
    'Zapłacono MYR 1.00. Transakcja odrzucona.',
    'MYR 1.00 harcadınız. İşlem reddedildi.',
    'Покупка MYR 1.00 отклонена.',
    'Покупка MYR 1.00 відхилена.',
    'Возврат: покупка MYR 1.00.',
    'Повернення: покупка MYR 1.00.',
    'Покупка MYR 1.00 со скидкой.',
    'Покупка MYR 1.00 зі знижкою.',
    'Berbelanja MYR 50.00 dan dapatkan cashback.',
    '消費滿 MYR 50.00 可享優惠。',
    'Покупка MYR 1.00: скидка 20%.',
    'Покупка MYR 1.00: знижка 20%.',
  ])(
    'does not turn a localized failed, refunded or promotional payment into an expense: %s',
    (body) => {
      expect(parsePaymentAlert({ body }).kind).not.toBe('spend');
    },
  );
});
