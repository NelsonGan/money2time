import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// A shared album's group is written on the phone in one place,
// features/albums/services/albumGroupWrites.ts, which plans every change by
// the album's rules and logs it (README: Album members and shared albums).
// Writing a group table anywhere else would skip the rules and the activity
// log, so no app code names one in a write. (Cloud Sync applies pulled rows
// and drops a group's rows by table list, never by name.)

const ROOT = path.resolve(__dirname, '../..');
const SOURCES = [
  'components',
  'context',
  'features',
  'hooks',
  'lib',
  'navigation',
  'services',
  'utils',
];
const GROUP_WRITE =
  /(INSERT(\s+OR\s+[A-Z]+)?\s+INTO|UPDATE|DELETE\s+FROM)\s+"?album_(members|expenses|settlements|groups|activity)\b|\.(insert|update|delete)\(\s*album(Members|Expenses|Settlements|Groups|Activity)Table/;

function files(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(files(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

it('writes a shared album group only through its planner', () => {
  const offenders = SOURCES.flatMap((dir) => files(path.join(ROOT, dir)))
    // Migrations made the tables.
    .filter((file) => !file.includes(`${path.sep}migrations${path.sep}`))
    .filter((file) => GROUP_WRITE.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(ROOT, file));
  expect(offenders).toEqual([]);
});
