import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { gunzipInSlices } from '~/lib/db/citiesDb';

describe('gunzipInSlices', () => {
  it('unpacks input spanning many slices', async () => {
    const original = Buffer.alloc(3 * 1024 * 1024);
    for (let i = 0; i < original.length; i += 1) original[i] = (i * 31) % 251;
    const unpacked = await gunzipInSlices(gzipSync(original));
    expect(Buffer.from(unpacked).equals(original)).toBe(true);
  });

  // The bundled asset must unpack to a SQLite database, or the city picker
  // degrades to no results on every fresh install.
  it('unpacks the bundled cities database', async () => {
    const gz = readFileSync(path.resolve(__dirname, '../../assets/db/cities.db.gz'));
    const unpacked = Buffer.from(await gunzipInSlices(gz));
    expect(unpacked.subarray(0, 16).toString('latin1')).toBe('SQLite format 3\0');
    expect(unpacked.length % 4096).toBe(0);
  });
});
