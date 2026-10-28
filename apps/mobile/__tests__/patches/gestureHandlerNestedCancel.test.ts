import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * A manual gesture that fails itself from its touch-cancel callback, against
 * react-native-gesture-handler 3.3.0 on Android.
 *
 * `GestureHandler.moveToState` sends the touch-cancel event (`cancelPointers`)
 * before it sets the new state, and the event runs synchronously. The
 * transaction reorder grip (and react-native-sortables, on the settings lists)
 * calls `manager.fail()` from `onTouchesCancelled`, which finishes the handler
 * and lets the orchestrator reset it (`orchestrator = null`) mid-transition.
 * The outer transition then throws "Manually handled gesture had not been
 * assigned to any detector" and the app crashes. A scroll that takes the touch
 * from a grip that still tracks a pointer (after a drag and drop) is enough
 * (PostHog 01a17dd3, Android 1.6.2).
 *
 * patches/react-native-gesture-handler+3.3.0.patch backports upstream #4584
 * (released in 3.4.0): the transition stops if the callback already finished
 * the handler. This reads the installed Kotlin source, which the Android build
 * compiles, so an upgrade or reinstall that drops the patch fails here.
 */

const RNGH = path.resolve(__dirname, '../../node_modules/react-native-gesture-handler');

const GESTURE_HANDLER = path.join(
  RNGH,
  'android/src/main/java/com/swmansion/gesturehandler/core/GestureHandler.kt',
);

function moveToStateBody(source: string): string {
  const start = source.indexOf('private fun moveToState(newState: Int)');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('fun wantsEvent(', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('react-native-gesture-handler nested state change on Android', () => {
  it('stops a transition that a touch-cancel callback already finished', () => {
    const body = moveToStateBody(readFileSync(GESTURE_HANDLER, 'utf8'));

    const cancel = body.indexOf('cancelPointers()');
    const earlyReturn = body.search(/if \(isFinished\(state\)\) \{\s*return\s*\}/);
    const assign = body.indexOf('state = newState');

    expect(cancel).toBeGreaterThan(-1);
    // The guard sits between the callback and the state assignment.
    expect(earlyReturn).toBeGreaterThan(cancel);
    expect(assign).toBeGreaterThan(earlyReturn);
  });

  it('is still the version the patch was written for', () => {
    const { version } = JSON.parse(readFileSync(path.join(RNGH, 'package.json'), 'utf8')) as {
      version: string;
    };

    // 3.4.0 ships the fix: drop the patch (and this test's version check) on upgrade.
    expect(version).toBe('3.3.0');
  });
});
