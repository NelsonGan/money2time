jest.mock('react-native', () => ({
  InteractionManager: {
    runAfterInteractions: jest.fn(),
  },
}));

import { InteractionManager } from 'react-native';

import { runAfterInteractionsCapped } from '~/utils/interactions';

const runAfterInteractionsMock = InteractionManager.runAfterInteractions as jest.Mock;

describe('runAfterInteractionsCapped', () => {
  let interactionCallback: (() => void) | null;
  let cancelMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    interactionCallback = null;
    cancelMock = jest.fn();
    runAfterInteractionsMock.mockReset().mockImplementation((cb: () => void) => {
      interactionCallback = cb;
      return { cancel: cancelMock };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs the task when interactions settle before the cap', () => {
    const task = jest.fn();
    runAfterInteractionsCapped(task, 300);

    expect(task).not.toHaveBeenCalled();
    interactionCallback?.();
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
    // The pending interaction handle is cancelled so it can't double-fire.
    expect(cancelMock).toHaveBeenCalledTimes(1);
  });

  it('runs the task exactly once when interactions settle after the cap fired', () => {
    const task = jest.fn();
    runAfterInteractionsCapped(task, 300);

    jest.advanceTimersByTime(300);
    interactionCallback?.();
    expect(task).toHaveBeenCalledTimes(1);
  });
});
