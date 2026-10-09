import { normalizeIconColumns } from '../normalizeIcons';
import type { DbMigration } from './types';

export const migration050RetireClayIconPack: DbMigration = {
  version: 50,
  name: '050_retire_clay_icon_pack',
  up(db) {
    // Data-only: the Clay artwork became the free default pack, so the separate
    // `clay` pack is gone and its ids lost their qualifier. A row that stored
    // `clay/meal` has to become `meal` or the picker shows the icon as missing
    // and every render site draws the placeholder.
    //
    // The rewrite itself lives in normalizeIconValue (see
    // RETIRED_ICON_PACK_PREFIXES), so the same mapping applies at the other two
    // ingress points as well: a backup restore and a Money Manager import both
    // call normalizeIconColumns already.
    //
    // Not wrapped in an explicit transaction, for the reason spelled out in
    // migration 048: runMigrations supplies one and only bumps user_version on
    // commit, and normalizeIconValue is a fixpoint, so a replay is a no-op.
    normalizeIconColumns(db);
  },
};

export default migration050RetireClayIconPack;
