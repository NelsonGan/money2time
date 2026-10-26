import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * EXTaskService (expo-task-manager) keeps its registered tasks and in-flight
 * execution requests in plain NSMutableDictionary / NSMutableArray fields with
 * no locking, and the app drives it from three places: the main thread at
 * launch, the BGTaskScheduler launch handler that expo-background-task
 * registers, and JavaScript calls (auto-backup's `registerTaskAsync` on every
 * launch, `notifyTaskFinished` when the task body resolves). Upstream runs the
 * last two on background queues, so a background launch could mutate those
 * collections from two threads at once and crash with EXC_BAD_ACCESS inside
 * EXTaskService (Sentry MONEY2TIME-3G, MONEY2TIME-5Z, MONEY2TIME-23).
 *
 * SDK 58 (expo-task-manager 58.0.7) added @synchronized locking to
 * EXTaskService's own collections, but EXTaskExecutionRequest and the task
 * consumers are still unlocked, so the main-queue serialization stays.
 *
 * patches/expo-background-task+58.0.11.patch and
 * patches/expo-task-manager+58.0.12.patch put every entry point on the main
 * queue. This reads the installed modules so an upgrade that drops a patch
 * fails here instead of quietly bringing the crash back. Upstream still uses a
 * nil launch queue as of SDK 58.
 */

const modulePath = (...segments: string[]) =>
  path.resolve(__dirname, '../../node_modules', ...segments);

describe('EXTaskService runs on the main queue only', () => {
  it('registers the background task launch handler on the main queue', () => {
    const source = readFileSync(
      modulePath('expo-background-task/ios/BackgroundTaskAppDelegate.swift'),
      'utf8',
    );
    expect(source).toMatch(
      /register\(forTaskWithIdentifier: BackgroundTaskConstants\.BackgroundWorkerIdentifier, using: \.main\)/,
    );
  });

  it('registers and unregisters background tasks on the main queue', () => {
    const source = readFileSync(
      modulePath('expo-background-task/ios/BackgroundTaskModule.swift'),
      'utf8',
    );
    for (const name of ['registerTaskAsync', 'unregisterTaskAsync']) {
      const start = source.indexOf(`AsyncFunction("${name}")`);
      expect(start).toBeGreaterThanOrEqual(0);
      const next = source.indexOf('AsyncFunction(', start + 1);
      expect(source.slice(start, next)).toContain('.runOnQueue(.main)');
    }
  });

  it('runs the task manager module functions on the main queue', () => {
    const source = readFileSync(
      modulePath('expo-task-manager/ios/TaskManagerModule.swift'),
      'utf8',
    );
    for (const name of [
      'notifyTaskFinishedAsync',
      'isTaskRegisteredAsync',
      'getRegisteredTasksAsync',
      'getTaskOptionsAsync',
      'unregisterTaskAsync',
      'unregisterAllTasksAsync',
    ]) {
      const start = source.indexOf(`AsyncFunction("${name}")`);
      expect(start).toBeGreaterThanOrEqual(0);
      const next = source.indexOf('AsyncFunction(', start + 1);
      const end = next === -1 ? source.indexOf('// MARK:', start) : next;
      expect(source.slice(start, end)).toContain('.runOnQueue(.main)');
    }
  });
});
