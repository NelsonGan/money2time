export function getDb(): any {
  throw new Error('getDb() should not be called in tests');
}

export function getSQLite(): any {
  throw new Error('getSQLite() should not be called in tests');
}

export const SIMPLE_WALLET_NAME = 'Wallet';
