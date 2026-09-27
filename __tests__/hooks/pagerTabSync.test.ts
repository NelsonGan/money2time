jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

// Drive the hook's native callbacks before React commits the next render. This
// recreates the timing window behind the visible swipe-back flicker.
jest.mock('react', () => {
  const slots: unknown[] = [];
  let cursor = 0;
  let effects: (() => void)[] = [];
  return {
    ...jest.requireActual('react'),
    __pagerTest: {
      reset() {
        slots.length = 0;
        cursor = 0;
        effects = [];
      },
      render<T>(renderHook: () => T): T {
        cursor = 0;
        effects = [];
        const result = renderHook();
        effects.forEach((effect) => effect());
        return result;
      },
    },
    useRef(initial: unknown) {
      const slot = cursor++;
      if (!slots[slot]) slots[slot] = { current: initial };
      return slots[slot];
    },
    useState(initial: unknown) {
      const slot = cursor++;
      if (!slots[slot]) slots[slot] = { value: initial };
      const state = slots[slot] as { value: unknown };
      return [state.value, (value: unknown) => (state.value = value)];
    },
    useCallback(callback: unknown) {
      cursor++;
      return callback;
    },
    useEffect(effect: () => void) {
      cursor++;
      effects.push(effect);
    },
  };
});

import React from 'react';
import type PagerView from 'react-native-pager-view';

import { usePagerTabSync } from '~/hooks/usePagerTabSync';

const pagerTest = (
  React as typeof React & {
    __pagerTest: { reset: () => void; render: <T>(hook: () => T) => T };
  }
).__pagerTest;

function scrollEvent(pageScrollState: 'dragging' | 'settling' | 'idle') {
  return { nativeEvent: { pageScrollState } } as Parameters<
    ReturnType<typeof usePagerTabSync>['onPageScrollStateChanged']
  >[0];
}

describe('pager tab synchronization', () => {
  const pager = { setPage: jest.fn(), setPageWithoutAnimation: jest.fn() };
  const pagerRef = { current: pager as unknown as PagerView };

  beforeEach(() => {
    pagerTest.reset();
    pager.setPage.mockClear();
    pager.setPageWithoutAnimation.mockClear();
  });

  it('does not snap a native swipe back to stale tab state before React renders', () => {
    const hook = pagerTest.render(() => usePagerTabSync(pagerRef, 0));
    hook.onPageScrollStateChanged(scrollEvent('dragging'));
    hook.onPageScrollStateChanged(scrollEvent('settling'));
    hook.positionRef.current = 1; // onPageSelected(1) queues setTab(1).
    hook.onPageScrollStateChanged(scrollEvent('idle')); // React has not rendered 1 yet.

    expect(pager.setPage).not.toHaveBeenCalled();
    pagerTest.render(() => usePagerTabSync(pagerRef, 1));
    expect(pager.setPage).not.toHaveBeenCalled();
  });

  it('applies a tab tap queued while the pager is settling', () => {
    let hook = pagerTest.render(() => usePagerTabSync(pagerRef, 0));
    hook.onPageScrollStateChanged(scrollEvent('settling'));
    hook = pagerTest.render(() => usePagerTabSync(pagerRef, 1));
    expect(pager.setPage).not.toHaveBeenCalled();

    hook.onPageScrollStateChanged(scrollEvent('idle'));
    expect(pager.setPage).toHaveBeenCalledWith(1);
  });
});
