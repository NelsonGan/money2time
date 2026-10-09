import fs from 'node:fs';
import path from 'node:path';

import { normalizeAlertText } from '~/features/autoLog/lib/text';

const localeDir = path.resolve(__dirname, '../../../lib/i18n/locales');
const locales = fs.readdirSync(localeDir).filter((name) => name.endsWith('.ts'));

describe('localized setup notification input', () => {
  it.each(locales)(
    'preserves the localized payment body and amount for the scanner in %s',
    (file) => {
      const locale = require(path.join(localeDir, file)).default;
      const body = locale.payment_alerts.test_alert_body.replace('%{amount}', 'MYR 1.00');
      const text = normalizeAlertText([locale.payment_alerts.test_alert_title, body]).text;
      expect(text).toContain('MYR 1.00');
      expect(text).toContain(locale.payment_alerts.test_alert_title);
    },
  );
  it('preserves a late failure condition rather than truncating the input', () => {
    const text = normalizeAlertText(['Paid MYR 25', 'x'.repeat(2500), 'This payment failed.']).text;
    expect(text).toContain('This payment failed.');
  });
  it('normalizes full-width numbers and markup without extracting a transaction', () => {
    expect(normalizeAlertText(['<b>Card</b>', 'Paid<br>MYR２５']).text).toBe('Card\nPaid\nMYR25');
  });
});
