import { type MutableRefObject, useCallback, useRef } from 'react';

/** Lazily creates and memoizes one nullable handler ref per integer index. */
export function useIndexedHandlerRefs<T>(): (index: number) => MutableRefObject<T | null> {
  const refsByIndex = useRef(new Map<number, MutableRefObject<T | null>>());

  return useCallback((index: number) => {
    const existing = refsByIndex.current.get(index);
    if (existing) return existing;

    const nextRef: MutableRefObject<T | null> = { current: null };
    refsByIndex.current.set(index, nextRef);
    return nextRef;
  }, []);
}

export function useIndexedScrollToTopRefs(): (
  index: number,
) => MutableRefObject<(() => void) | null> {
  return useIndexedHandlerRefs<() => void>();
}

/**
 * Like {@link useIndexedHandlerRefs}, but each slot also lets a caller register
 * work to run the moment the handler is set (`whenReady`). The child still
 * assigns `slot.current = handler` (and `= null` on unmount) exactly as with a
 * plain ref — the setter fans out to any pending waiters when a truthy handler
 * lands. This replaces polling for a not-yet-mounted target (e.g. a pager page
 * that has to render after a jump) with an exact, single-fire notification, and
 * because waiters are per-index, an unrelated request for a different index can
 * never cancel this one.
 */
export interface NotifyingHandlerSlot<T> {
  current: T | null;
  /** Run `fn` now if a handler is already registered, else once it next is. */
  whenReady: (fn: (handler: T) => void) => void;
}

export function useIndexedNotifyingHandlerRefs<T>(): (index: number) => NotifyingHandlerSlot<T> {
  const slotsByIndex = useRef(new Map<number, NotifyingHandlerSlot<T>>());

  return useCallback((index: number) => {
    const existing = slotsByIndex.current.get(index);
    if (existing) return existing;

    let value: T | null = null;
    let waiters: ((handler: T) => void)[] = [];
    const slot: NotifyingHandlerSlot<T> = {
      get current() {
        return value;
      },
      set current(next: T | null) {
        value = next;
        if (next && waiters.length > 0) {
          const pending = waiters;
          waiters = [];
          pending.forEach((fn) => fn(next));
        }
      },
      whenReady(fn) {
        if (value) fn(value);
        else waiters.push(fn);
      },
    };
    slotsByIndex.current.set(index, slot);
    return slot;
  }, []);
}
