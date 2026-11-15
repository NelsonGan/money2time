import { readFileSync } from 'node:fs';
import path from 'node:path';

// The cloud-sync Worker writes shared albums by a copy of the app's planner
// (scripts/sync-group-plan.mjs). Run `npm run sync:group-plan` when this fails.
it("keeps the Worker's copy of the shared album planner identical to the app's", () => {
  const root = path.resolve(__dirname, '../..');
  const source = readFileSync(path.join(root, 'features/albums/lib/groupPlan.ts'), 'utf8');
  const copy = readFileSync(
    path.join(root, '../cloudflare/workers/cloud-sync/src/groupPlan.generated.ts'),
    'utf8',
  );
  expect(copy.startsWith('// Generated from apps/mobile/features/albums/lib/groupPlan.ts')).toBe(
    true,
  );
  expect(copy.slice(copy.indexOf('\n\n') + 2)).toBe(source);
});
