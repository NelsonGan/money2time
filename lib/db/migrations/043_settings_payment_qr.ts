import type { DbMigration } from './types';

export const migration043SettingsPaymentQr: DbMigration = {
  version: 43,
  name: '043_settings_payment_qr',
  up(db) {
    // Relative path (within the user-assets store) of the user's own payment QR
    // image (PayNow / PromptPay / UPI / PayPal.me / etc.), attached once and
    // shared onto split-bill payback receipts. Optional label shown beneath it.
    db.execSync(`ALTER TABLE settings ADD COLUMN payment_qr_uri TEXT;`);
    db.execSync(`ALTER TABLE settings ADD COLUMN payment_qr_label TEXT;`);
  },
};

export default migration043SettingsPaymentQr;
