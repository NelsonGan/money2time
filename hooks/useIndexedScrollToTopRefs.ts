import { type MutableRefObject,useCallback, useRef } from 'react';

type ScrollToTopHandler = (() => void) | null;

export function useIndexedScrollToTopRefs(): (
  index: number,
) => MutableRefObject<ScrollToTopHandler> {
  const refsByIndex = useRef(new Map<number, MutableRefObject<ScrollToTopHandler>>());

  return useCallback((index: number) => {
    const existing = refsByIndex.current.get(index);
    if (existing) return existing;

    const nextRef: MutableRefObject<ScrollToTopHandler> = { current: null };
    refsByIndex.current.set(index, nextRef);
    return nextRef;
  }, []);
}
