import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PRO_LIMITS } from '../../constants/proLimits';

it('syncs tutorials with shared plan limits and their actual images to the website', () => {
  const root = path.resolve(__dirname, '../..');
  const web = mkdtempSync(path.join(tmpdir(), 'money2time-tutorial-sync-'));

  try {
    mkdirSync(path.join(web, 'src/lib'), { recursive: true });
    mkdirSync(path.join(web, 'media'), { recursive: true });
    writeFileSync(path.join(web, 'package.json'), '{}');
    writeFileSync(path.join(web, 'media/keep.txt'), 'outside the generated tutorial directory');

    const result = spawnSync(
      process.execPath,
      [path.join(root, 'scripts/sync-tutorials-web.mjs'), '--web', web],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(0);

    const catalog = readFileSync(path.join(web, 'src/lib/tutorials.generated.ts'), 'utf8');
    expect(catalog).toContain(`The free plan includes ${PRO_LIMITS.FREE_MAX_ACCOUNTS} accounts.`);
    expect(catalog).toContain('Add the calendar');
    expect(readFileSync(path.join(web, 'media/tutorials/widgets-4.png'))).toEqual(
      readFileSync(path.join(root, 'assets/tutorials/widgets-4.png')),
    );
    expect(readFileSync(path.join(web, 'media/keep.txt'), 'utf8')).toBe(
      'outside the generated tutorial directory',
    );
  } finally {
    rmSync(web, { recursive: true, force: true });
  }
});
