import {
  getActivationError,
  setActivationError,
  subscribeToActivationState,
} from '~/features/ai-chat/services/aiActivationService';

describe('aiActivationService', () => {
  afterEach(() => {
    setActivationError(null);
  });

  it('reports null when no error has been set', () => {
    expect(getActivationError()).toBeNull();
  });

  it('stores and retrieves the current activation error', () => {
    setActivationError('model not found');
    expect(getActivationError()).toBe('model not found');
  });

  it('notifies subscribers when the error changes', () => {
    const listener = jest.fn();
    const unsub = subscribeToActivationState(listener);
    setActivationError('boom');
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('does not emit when setting the same value twice', () => {
    setActivationError('repeat');
    const listener = jest.fn();
    const unsub = subscribeToActivationState(listener);
    setActivationError('repeat');
    expect(listener).not.toHaveBeenCalled();
    unsub();
  });

  it('stops notifying after unsubscribe', () => {
    const listener = jest.fn();
    const unsub = subscribeToActivationState(listener);
    unsub();
    setActivationError('new error');
    expect(listener).not.toHaveBeenCalled();
  });
});
