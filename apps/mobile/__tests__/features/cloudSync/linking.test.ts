import { decideLink } from '~/features/cloudSync/lib/linking';
import { rowKey } from '~/features/cloudSync/lib/rowCodec';
import { shapeAdditions, type SyncedShape } from '~/features/cloudSync/lib/syncTables';

const data = { hasMeaningfulData: true };
const empty = { hasMeaningfulData: false };

describe('decideLink', () => {
  it('uploads to an empty cloud copy, whatever the phone has', () => {
    expect(decideLink(empty, data)).toBe('upload');
    expect(decideLink(empty, empty)).toBe('upload');
  });

  it('downloads to an empty phone', () => {
    expect(decideLink(data, empty)).toBe('download');
  });

  it('asks when both have data', () => {
    expect(decideLink(data, data)).toBe('choose');
  });
});

describe('shapeAdditions', () => {
  const v1: SyncedShape = {
    tables: ['settings', 'transactions'],
    assets: { transactions: ['receipt_uri'] },
  };

  it('finds nothing for a phone that never saved a shape', () => {
    expect(shapeAdditions(null, v1)).toEqual({ newTables: [], assetsChanged: false });
  });

  it('finds nothing when the shape is unchanged', () => {
    expect(shapeAdditions(v1, v1)).toEqual({ newTables: [], assetsChanged: false });
  });

  it('finds tables an update started syncing', () => {
    const v2 = { ...v1, tables: [...v1.tables, 'albums'] };
    expect(shapeAdditions(v1, v2).newTables).toEqual(['albums']);
  });

  it('notices a new image column', () => {
    const v2 = { ...v1, assets: { ...v1.assets, albums: ['cover_photo_uri'] } };
    expect(shapeAdditions(v1, v2).assetsChanged).toBe(true);
  });

  it('ignores a removed table or column', () => {
    const v2: SyncedShape = { tables: ['settings'], assets: {} };
    expect(shapeAdditions(v1, v2)).toEqual({ newTables: [], assetsChanged: false });
  });
});

describe('rowKey', () => {
  it('keeps table and id apart', () => {
    expect(rowKey('a', 'bc')).not.toBe(rowKey('ab', 'c'));
  });
});
