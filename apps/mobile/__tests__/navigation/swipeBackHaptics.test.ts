import { createNativeStackSwipeHapticListeners } from '~/navigation/swipeBackHaptics';

type ListenerCtx = {
  route: { key: string; name: string };
  navigation: { getState: () => { index: number; routes: { key: string }[] } };
};

function makeContext(routeKey: string, routeName: string, topKey = routeKey): ListenerCtx {
  return {
    route: { key: routeKey, name: routeName },
    navigation: {
      getState: () => ({ index: 0, routes: [{ key: topKey }] }),
    },
  };
}

function makeEvent(closing: boolean) {
  return { data: { closing } } as Parameters<
    ReturnType<ReturnType<typeof createNativeStackSwipeHapticListeners>>['transitionStart']
  >[0];
}

describe('createNativeStackSwipeHapticListeners', () => {
  it('does nothing when the transition is not closing', () => {
    const listeners = createNativeStackSwipeHapticListeners()(makeContext('a', 'Main'));
    expect(() => listeners.transitionStart(makeEvent(false))).not.toThrow();
  });

  it('skips routes named in skipRouteNames', () => {
    const listeners = createNativeStackSwipeHapticListeners({ skipRouteNames: ['Settings'] })(
      makeContext('a', 'Settings'),
    );
    expect(() => listeners.transitionStart(makeEvent(true))).not.toThrow();
  });

  it('skips when shouldSuppress returns true', () => {
    const suppress = jest.fn(() => true);
    const listeners = createNativeStackSwipeHapticListeners({ shouldSuppress: suppress })(
      makeContext('a', 'Main'),
    );
    listeners.transitionStart(makeEvent(true));
    expect(suppress).toHaveBeenCalled();
  });

  it('skips when the route is not the top of the stack', () => {
    const listeners = createNativeStackSwipeHapticListeners()(makeContext('a', 'Main', 'b'));
    expect(() => listeners.transitionStart(makeEvent(true))).not.toThrow();
  });

  it('runs without throwing on a normal closing transition', () => {
    const listeners = createNativeStackSwipeHapticListeners()(makeContext('a', 'Main'));
    expect(() => listeners.transitionStart(makeEvent(true))).not.toThrow();
  });
});
