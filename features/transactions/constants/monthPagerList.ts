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
  initialNumToRender: 5,
  maxToRenderPerBatch: 5,
  windowSize: 7,
  // No removeClippedSubviews: each page nests a vertical FlashList inside this
  // horizontal pager, and that shape is where RN's clipping recalculation can
  // hang the main thread walking the whole subtree on every scroll/mount
  // (MONEY2TIME-G, MONEY2TIME-1R, MONEY2TIME-1K) or drop a page's native views
  // without React noticing (MONEY2TIME blank-page bug fixed in #401). windowSize
  // already caps the pager at the visible page plus one neighbour either side,
  // so clipping isn't buying anything worth that risk. Do not re-add it.
} as const;
