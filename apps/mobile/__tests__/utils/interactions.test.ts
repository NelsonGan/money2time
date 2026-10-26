import { runAfterInteractions, runAfterInteractionsCapped } from '~/utils/interactions';

describe('runAfterInteractions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs the task on the next turn, not synchronously', () => {
    const task = jest.fn();
    runAfterInteractions(task);

    expect(task).not.toHaveBeenCalled();
    jest.runOnlyPendingTimers();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('never runs a cancelled task', () => {
    const task = jest.fn();
    runAfterInteractions(task).cancel();

    jest.runAllTimers();
    expect(task).not.toHaveBeenCalled();
  });
});

describe('runAfterInteractionsCapped', () => {
  let immediateCallback: (() => void) | null;
  let clearImmediateSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    immediateCallback = null;
    // Hold the after-interactions slot so each test decides when it "settles".
    jest.spyOn(global, 'setImmediate').mockImplementation(((cb: () => void) => {
      immediateCallback = cb;
      return 1 as unknown as NodeJS.Immediate;
    }) as unknown as typeof setImmediate);
    clearImmediateSpy = jest.spyOn(global, 'clearImmediate').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('runs the task when interactions settle before the cap', () => {
    const task = jest.fn();
    runAfterInteractionsCapped(task, 300);

    expect(task).not.toHaveBeenCalled();
    immediateCallback?.();
    expect(task).toHaveBeenCalledTimes(1);

    // The fallback timer must not run the task a second time.
    jest.advanceTimersByTime(1000);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('forces the task through at the cap when interactions never settle', () => {
    const task = jest.fn();
    runAfterInteractionsCapped(task, 300);

    jest.advanceTimersByTime(299);
    expect(task).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);
    // The pending after-interactions slot is cancelled so it can't double-fire.
    expect(clearImmediateSpy).toHaveBeenCalledTimes(1);
  });

  it('runs the task exactly once when interactions settle after the cap fired', () => {
    const task = jest.fn();
    runAfterInteractionsCapped(task, 300);

    jest.advanceTimersByTime(300);
    immediateCallback?.();
    expect(task).toHaveBeenCalledTimes(1);
  });
});
