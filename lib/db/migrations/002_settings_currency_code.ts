import type { DbMigration } from './types';

function inferCurrencyCodeFromSymbol(symbol: string, locale: string): string {
  const normalizedSymbol = symbol.trim();
  const normalizedLocale = locale.trim().toLowerCase();

  if (normalizedSymbol === '¥') {
    if (normalizedLocale.startsWith('zh')) return 'CNY';
    return 'JPY';
  }

  if (normalizedSymbol === 'kr') {
    if (normalizedLocale.startsWith('da')) return 'DKK';
    if (
      normalizedLocale.startsWith('nb') ||
      normalizedLocale.startsWith('nn') ||
      normalizedLocale.startsWith('no')
    ) {
      return 'NOK';
    }
    return 'SEK';
  }

  const direct: Record<string, string> = {
    $: 'USD',
    '€': 'EUR',
    '£': 'GBP',
    '₹': 'INR',
    '₩': 'KRW',
    'HK$': 'HKD',
    'S$': 'SGD',
    'NT$': 'TWD',
    '฿': 'THB',
    RM: 'MYR',
    Rp: 'IDR',
    '₱': 'PHP',
    '₫': 'VND',
    '₨': 'PKR',
    '৳': 'BDT',
    'C$': 'CAD',
    'A$': 'AUD',
    'NZ$': 'NZD',
    CHF: 'CHF',
    'MX$': 'MXN',
    'R$': 'BRL',
    R: 'ZAR',
    AED: 'AED',
  };

  return direct[normalizedSymbol] ?? 'USD';
}

export const migration002SettingsCurrencyCode: DbMigration = {
  version: 2,
  name: '002_settings_currency_code',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const hasCurrencyCode = columns.some((column) => column.name === 'currency_code');

    if (!hasCurrencyCode) {
      db.execSync(
        "ALTER TABLE settings ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'USD';",
      );
    }

    const rows = db.getAllSync<{ id: string; locale: string; currency_symbol: string }>(
      'SELECT id, locale, currency_symbol FROM settings;',
    );

    rows.forEach((row) => {
      const nextCode = inferCurrencyCodeFromSymbol(row.currency_symbol ?? '', row.locale ?? '');
      const escapedCode = nextCode.replace(/'/g, "''");
      const escapedId = row.id.replace(/'/g, "''");
      db.execSync(
        `UPDATE settings SET currency_code = '${escapedCode}' WHERE id = '${escapedId}';`,
      );
    });
  },
};

export default migration002SettingsCurrencyCode;
