// A tiny hook runner: state, refs and effects with dependency checks and
// cleanups, enough to drive useRootScreenSettled without a React renderer.
jest.mock('react', () => {
  type Slot = { value?: unknown; current?: unknown; deps?: unknown[]; cleanup?: () => void };
  const slots: Slot[] = [];
  let cursor = 0;
  let pending: { slot: Slot; effect: () => void | (() => void) }[] = [];
  return {
    ...jest.requireActual('react'),
    __hookTest: {
      reset() {
        slots.forEach((slot) => slot.cleanup?.());
        slots.length = 0;
        cursor = 0;
        pending = [];
      },
      render<T>(hook: () => T): T {
        cursor = 0;
        pending = [];
        const result = hook();
        const effects = pending;
        effects.forEach(({ slot, effect }) => {
          slot.cleanup?.();
          const cleanup = effect();
          slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
        });
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
      const state = slots[slot];
      return [state.value, (value: unknown) => (state.value = value)];
    },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const index = cursor++;
      if (!slots[index]) slots[index] = {};
      const slot = slots[index];
      const changed =
        !slot.deps || slot.deps.length !== deps.length || slot.deps.some((d, i) => d !== deps[i]);
      if (!changed) return;
      slot.deps = deps;
      pending.push({ slot, effect });
    },
  };
});

import React from 'react';

import { ROOT_SCREEN_SETTLE_MS, useRootScreenSettled } from '~/hooks/useRootScreenSettled';

const hookTest = (
  React as typeof React & {
    __hookTest: { reset: () => void; render: <T>(hook: () => T) => T };
  }
).__hookTest;

const render = (screen: string) => hookTest.render(() => useRootScreenSettled(screen));

describe('useRootScreenSettled', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    hookTest.reset();
  });

  afterEach(() => {
    hookTest.reset();
    jest.useRealTimers();
  });

  it('is settled on the first screen without waiting', () => {
    expect(render('Main')).toBe(true);
  });

  it('holds overlays from the render where a modal route closes until the dismiss is over', () => {
    render('Main');
    expect(render('AddTransaction')).toBe(false);
    jest.advanceTimersByTime(ROOT_SCREEN_SETTLE_MS);
    expect(render('AddTransaction')).toBe(true);

    // Saving closes the sheet: the state is back on Main at once, but the
    // native dismiss is still running, so a queued announcement must wait.
    expect(render('Main')).toBe(false);
    jest.advanceTimersByTime(ROOT_SCREEN_SETTLE_MS - 1);
    expect(render('Main')).toBe(false);
    jest.advanceTimersByTime(1);
    expect(render('Main')).toBe(true);
  });

  it('restarts the wait when the screen changes again before it settles', () => {
    render('Main');
    render('AddTransaction');
    jest.advanceTimersByTime(ROOT_SCREEN_SETTLE_MS / 2);
    // Opened and closed quickly: back on the screen it started from, but a
    // second dismiss is now running.
    expect(render('Main')).toBe(false);
    jest.advanceTimersByTime(ROOT_SCREEN_SETTLE_MS - 1);
    expect(render('Main')).toBe(false);
    jest.advanceTimersByTime(1);
    expect(render('Main')).toBe(true);
  });
});
