import { addColumnsIfMissing } from './helpers';
import type { DbMigration } from './types';

// Where a transaction happened (README: Transaction locations). Set only when
// the user turns on Settings > Personalize > Save locations and tags the
// entry: the current location from the phone, or a place from Apple Maps
// search. All NULL otherwise.
// - latitude / longitude: the point (WGS84).
// - place_name: what the row and the map show ("Starbucks", or a street).
// - place_address: the address under it, one line, without the country.
// - place_id: Apple's place id for a searched place; NULL for a spot.
// - place_category: Apple's PoiCategory ("Cafe"), for its icon; NULL if none.
// Sent to shared-ledger members and the Web Dashboard with the rest of the row.
//
// settings.transaction_locations_enabled: the Save locations switch, off for
// everyone until they turn it on. settings.transaction_location_auto_tag: when
// it is on, a new expense starts tagged with where the phone is.
export const migration098TransactionLocations: DbMigration = {
  version: 98,
  name: '098_transaction_locations',
  up(db) {
    addColumnsIfMissing(db, 'transactions', [
      ['latitude', 'REAL'],
      ['longitude', 'REAL'],
      ['place_name', 'TEXT'],
      ['place_address', 'TEXT'],
      ['place_id', 'TEXT'],
      ['place_category', 'TEXT'],
    ]);
    addColumnsIfMissing(db, 'settings', [
      ['transaction_locations_enabled', 'INTEGER NOT NULL DEFAULT 0'],
      ['transaction_location_auto_tag', 'INTEGER NOT NULL DEFAULT 1'],
    ]);
  },
};

export default migration098TransactionLocations;
