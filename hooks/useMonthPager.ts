import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

interface UseMonthPagerParams {
  listRef: React.RefObject<FlatList<number> | null>;
  pageWidth: number;
  totalSlots: number;
  initialIndex: number;
}

interface UseMonthPagerResult {
  activeIndex: number;
  activeIndexRef: React.MutableRefObject<number>;
  slots: number[];
  clampIndex: (index: number) => number;
  setActiveIndex: (index: number) => void;
  handleMomentumEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  handleScrollEndDrag: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  handleScrollToIndexFailed: (info: { index: number }) => void;
  getItemLayout: (
    data: ArrayLike<number> | null | undefined,
    index: number,
  ) => { length: number; offset: number; index: number };
  keyExtractor: (item: number) => string;
  scrollToRelative: (direction: 1 | -1) => void;
}

const monthPagerSlotsCache = new Map<number, number[]>();

function getMonthPagerSlots(totalSlots: number): number[] {
  const cached = monthPagerSlotsCache.get(totalSlots);
  if (cached) return cached;

  const generated = Array.from({ length: totalSlots }, (_, index) => index);
  monthPagerSlotsCache.set(totalSlots, generated);
  return generated;
}

export function useMonthPager({
  listRef,
  pageWidth,
  totalSlots,
  initialIndex,
}: UseMonthPagerParams): UseMonthPagerResult {
  const [activeIndex, setActiveIndexState] = useState(initialIndex);
  const activeIndexRef = useRef(initialIndex);

  const slots = useMemo<number[]>(() => getMonthPagerSlots(totalSlots), [totalSlots]);

  const clampIndex = useCallback(
    (index: number) => Math.max(0, Math.min(index, totalSlots - 1)),
    [totalSlots],
  );

  const setActiveIndex = useCallback(
    (nextIndex: number) => {
      const clampedIndex = clampIndex(nextIndex);
      if (clampedIndex === activeIndexRef.current) return;
      activeIndexRef.current = clampedIndex;
      setActiveIndexState(clampedIndex);
    },
    [clampIndex],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        index: activeIndexRef.current,
        animated: false,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [listRef, pageWidth]);

  const commitOffsetToIndex = useCallback(
    (offsetX: number) => {
      const rawIndex = Math.round(offsetX / pageWidth);
      setActiveIndex(rawIndex);
    },
    [pageWidth, setActiveIndex],
  );

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      commitOffsetToIndex(event.nativeEvent.contentOffset.x);
    },
    [commitOffsetToIndex],
  );

  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const velocityX = event.nativeEvent.velocity?.x ?? 0;
      if (Math.abs(velocityX) <= 0.05) {
        commitOffsetToIndex(event.nativeEvent.contentOffset.x);
      }
    },
    [commitOffsetToIndex],
  );

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number }) => {
      const clampedIndex = clampIndex(info.index);
      activeIndexRef.current = clampedIndex;
      setActiveIndexState(clampedIndex);
      listRef.current?.scrollToOffset({
        offset: clampedIndex * pageWidth,
        animated: false,
      });
    },
    [clampIndex, listRef, pageWidth],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<number> | null | undefined, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth],
  );

  const keyExtractor = useCallback((item: number) => String(item), []);

  const scrollToRelative = useCallback(
    (direction: 1 | -1) => {
      const nextIndex = clampIndex(activeIndexRef.current + direction);
      if (nextIndex === activeIndexRef.current) return;
      activeIndexRef.current = nextIndex;
      setActiveIndexState(nextIndex);
      listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    },
    [clampIndex, listRef],
  );

  return {
    activeIndex,
    activeIndexRef,
    slots,
    clampIndex,
    setActiveIndex,
    handleMomentumEnd,
    handleScrollEndDrag,
    handleScrollToIndexFailed,
    getItemLayout,
    keyExtractor,
    scrollToRelative,
  };
}
