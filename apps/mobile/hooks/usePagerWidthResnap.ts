import type React from 'react';
import { useLayoutEffect, useRef } from 'react';
import type { FlatList } from 'react-native';

/**
 * Keeps a horizontal month pager on its page when the page width changes
 * after mount (iPhone Duo folding or unfolding). The list keeps its old pixel
 * offset, which at the new width is a page far away, and a distant month
 * would flash until the pager's own settle runs. This re-snaps before paint.
 * Never runs on a device whose width does not change.
 */
export function usePagerWidthResnap(
  listRef: React.RefObject<FlatList<number> | null>,
  pageWidth: number,
  activeIndexRef: React.RefObject<number>,
) {
  const laidOutWidthRef = useRef(pageWidth);
  useLayoutEffect(() => {
    if (laidOutWidthRef.current === pageWidth) return;
    laidOutWidthRef.current = pageWidth;
    listRef.current?.scrollToOffset({
      offset: activeIndexRef.current * pageWidth,
      animated: false,
    });
  }, [listRef, pageWidth, activeIndexRef]);
}
