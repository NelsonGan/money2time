import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration043SettingsPaymentQr: DbMigration = {
  version: 43,
  name: '043_settings_payment_qr',
  up(db) {
    // Relative path (within the user-assets store) of the user's own payment QR
    // image (PayNow / PromptPay / UPI / PayPal.me / etc.), attached once and
    // shared onto split-bill payback receipts.
    addColumnIfMissing(db, 'settings', 'payment_qr_uri', 'TEXT');
  },
};

export default migration043SettingsPaymentQr;
