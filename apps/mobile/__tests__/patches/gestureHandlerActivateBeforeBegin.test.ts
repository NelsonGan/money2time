import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * A manual gesture activated from `onTouchesDown`, against
 * react-native-gesture-handler 3.3.0 on iOS.
 *
 * `setGestureStateSync` ignores ACTIVE while the handler's last state is still
 * UNDETERMINED, and a handler touched for the first time leaves UNDETERMINED
 * only after `onTouchesDown` returns. The transaction reorder grip's
 * `activate()` was dropped on each row's first touch, so the list scrolled
 * instead of the row moving. `claimTouch` in transactionReorder.tsx calls
 * `begin()` first. 3.5.0 begins the gesture inside `activate()` itself.
 *
 * This reads the installed iOS source, so an upgrade fails here: then make
 * `claimTouch` a plain `activate()`, delete this test, and update the README's
 * drag-to-reorder note.
 */

const RNGH = path.resolve(__dirname, '../../node_modules/react-native-gesture-handler');
const MODULE = path.join(RNGH, 'apple/RNGestureHandlerModule.mm');
const REORDER = path.resolve(
  __dirname,
  '../../features/transactions/components/transactionReorder.tsx',
);

function activeBranch(source: string): string {
  const start = source.indexOf('} else if (state == 4) { // ACTIVE');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('} else if (state == 5)', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('react-native-gesture-handler activation before begin on iOS', () => {
  it('still drops ACTIVE for a handler that has not begun', () => {
    const branch = activeBranch(readFileSync(MODULE, 'utf8'));

    expect(branch).toMatch(
      /if \(handler\.lastState == RNGestureHandlerStateUndetermined\) \{\s*return;\s*\}/,
    );
    expect(branch).not.toContain('inState:RNGestureHandlerStateBegan');
  });

  it('has the reorder grip begin its gesture before activating it', () => {
    const source = readFileSync(REORDER, 'utf8');
    const start = source.indexOf('function claimTouch(');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('\n}\n', start));

    expect(body.indexOf('manager.begin()')).toBeGreaterThan(-1);
    expect(body.indexOf('manager.activate()')).toBeGreaterThan(body.indexOf('manager.begin()'));
  });
});
