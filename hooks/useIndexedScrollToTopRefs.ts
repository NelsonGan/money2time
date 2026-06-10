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
