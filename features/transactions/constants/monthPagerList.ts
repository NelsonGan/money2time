export const MONTH_PAGER_LIST_CONFIG = {
  horizontal: true,
  pagingEnabled: true,
  disableIntervalMomentum: true,
  bounces: false,
  directionalLockEnabled: true,
  decelerationRate: 'fast',
  showsHorizontalScrollIndicator: false,
  overScrollMode: 'never',
  nestedScrollEnabled: true,
  // Every page is a month of transaction rows, so each extra mounted page is
  // a list's worth of views. The pagers open at `initialScrollIndex`, where the
  // first render covers that index and the ones after it (months in the
  // future, next to empty), so render only the page on screen first; the
  // window then fills in the visible page plus one neighbour either side
  // (windowSize counts viewports: 3 = one each side, 7 would be three), one
  // page per batch so no single frame has to build two months of rows.
  initialNumToRender: 1,
  maxToRenderPerBatch: 1,
  windowSize: 3,
  // No removeClippedSubviews: each page nests a vertical FlashList inside this
  // horizontal pager, and that shape is where RN's clipping recalculation can
  // hang the main thread walking the whole subtree on every scroll/mount
  // (MONEY2TIME-G, MONEY2TIME-1R, MONEY2TIME-1K) or drop a page's native views
  // without React noticing (MONEY2TIME blank-page bug fixed in #401). windowSize
  // already caps the pager at the visible page plus one neighbour either side,
  // so clipping isn't buying anything worth that risk. Do not re-add it.
} as const;
