/**
 * Copies the shared album planner into the cloud-sync Worker, so the app and
 * the Worker write a shared album's group by one set of rules.
 *
 *   features/albums/lib/groupPlan.ts
 *     -> ../cloudflare/workers/cloud-sync/src/groupPlan.generated.ts
 *
 * The app's file is the source; never edit the Worker's copy. The Worker's CI
 * checks out apps/cloudflare alone, hence a copy rather than an import.
 * `__tests__/features/groupPlanCopy.test.ts` fails while the two differ.
 *
 *   npm run sync:group-plan
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = path.join(ROOT, 'features/albums/lib/groupPlan.ts');
export const TARGET = path.join(
  ROOT,
  '../cloudflare/workers/cloud-sync/src/groupPlan.generated.ts',
);
export const HEADER =
  '// Generated from apps/mobile/features/albums/lib/groupPlan.ts by\n' +
  '// `npm run sync:group-plan` in apps/mobile. Do not edit: change the app file.\n\n';

export async function generated() {
  return HEADER + (await fs.readFile(SOURCE, 'utf8'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await fs.writeFile(TARGET, await generated());
  console.log(`Wrote ${path.relative(process.cwd(), TARGET)}`);
}
