import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { LayoutChangeEvent, StyleProp, View as ViewType, ViewStyle } from 'react-native';
import { View } from 'react-native';
import type { GestureType } from 'react-native-gesture-handler';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { AnimatedRef, SharedValue } from 'react-native-reanimated';
import Animated, {
  makeMutable,
  measure,
  runOnJS,
  scrollTo,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  dragTargetIndex,
  dropOffset,
  makeRoomOffset,
  moveItem,
} from '~/features/transactions/lib/dragReorder';
import type { ReorderRow } from '~/features/transactions/lib/reorderTransactionDate';
import { triggerHaptic } from '~/services/haptics';

/**
 * Drag-to-reorder for the transaction list, done on the list itself.
 *
 * It used to hand selection mode over to a react-native-sortables overlay, and
 * scrolling that overlay dropped a frame in every few. Sortable cannot
 * virtualize, so it mounted every row of the month, each with an animated
 * style. Reanimated re-applies the last animated props of every such view on
 * each commit that is not its own, and a scrolling ScrollView commits its
 * offset on every frame: a month of rows was re-cloned, re-laid-out and
 * re-diffed sixty times a second.
 *
 * Here the list stays the virtualized FlashList it always is, so scrolling in
 * selection mode costs what it costs outside it. A drag lifts a copy of the row
 * (the ghost, one view) above the list, slides the rows it passes out of the
 * way, and scrolls the list when held near an edge, all on the UI thread. The
 * geometry is plain heights (see `dragReorder`), measured as rows lay out.
 */

// Rows and headers are pushed around with the same short slide Sortable used.
const SLIDE_MS = 160;
const DROP_MS = 180;
// Held within this distance of the top or bottom edge, the list scrolls, up to
// MAX_SCROLL_SPEED px/s right at the edge.
const AUTO_SCROLL_EDGE = 72;
const MAX_SCROLL_SPEED = 1100;
// Used for a row or header that has not been laid out yet (virtualized away).
const FALLBACK_ROW_HEIGHT = 64;
const FALLBACK_HEADER_HEIGHT = 36;
// Reset the drag anyway if a saved drop never re-renders the list.
const RESET_FALLBACK_MS = 600;

interface ReorderSharedValues {
  /** The row being dragged, from pick-up until the drop has re-rendered. */
  activeId: SharedValue<string | null>;
  /** Whether the ghost is on screen yet; the row itself hides only then. */
  ghostShown: SharedValue<boolean>;
  fromIndex: SharedValue<number>;
  toIndex: SharedValue<number>;
  /** Ids of every header and row, in list order, as of the drag's start. */
  order: SharedValue<string[]>;
  /** Height (margins included) of each item in `order`. */
  heights: SharedValue<number[]>;
  /**
   * Bumped by every drag. Until the first one, rows keep the style they would
   * have without this module, so merely rendering a list never has Reanimated
   * track its rows (see the note above).
   */
  dragEpoch: SharedValue<number>;
}

interface TransactionReorderContextValue extends ReorderSharedValues {
  begin: (id: string, absoluteY: number, yInRow: number) => boolean;
  move: (absoluteY: number) => void;
  end: (cancelled: boolean) => void;
  reportHeight: (id: string, height: number) => void;
  /** Follows the finger from the list's own container (see `ReorderGrip`). */
  trackingGesture: GestureType;
  /** Whether that gesture is seeing the current touch. */
  tracking: SharedValue<boolean>;
}

const TransactionReorderContext = createContext<TransactionReorderContextValue | null>(null);

export const TransactionReorderProvider = TransactionReorderContext.Provider;

// Stand-ins for rows rendered outside a reorderable list: never written, so a
// row's style there is exactly what it was before reordering existed.
const IDLE_VALUES: ReorderSharedValues = {
  activeId: makeMutable<string | null>(null),
  ghostShown: makeMutable(false),
  fromIndex: makeMutable(-1),
  toIndex: makeMutable(-1),
  order: makeMutable<string[]>([]),
  heights: makeMutable<number[]>([]),
  dragEpoch: makeMutable(0),
};

/**
 * The style that moves a header or row out of the dragged row's way, hides
 * the dragged row under its ghost, and (for rows) carries the press scale.
 */
export function useReorderItemStyle(id: string, scale?: SharedValue<number>) {
  const context = useContext(TransactionReorderContext);
  const { activeId, ghostShown, fromIndex, toIndex, order, heights, dragEpoch } =
    context ?? IDLE_VALUES;
  return useAnimatedStyle(() => {
    const pressScale = scale ? scale.value : 1;
    const active = activeId.value;
    if (active === null) {
      if (dragEpoch.value === 0) return scale ? { transform: [{ scale: pressScale }] } : {};
      return { opacity: 1, transform: [{ translateY: 0 }, { scale: pressScale }] };
    }
    if (active === id) {
      return {
        opacity: ghostShown.value ? 0 : 1,
        transform: [{ translateY: 0 }, { scale: pressScale }],
      };
    }
    const from = fromIndex.value;
    const shift = makeRoomOffset(
      order.value.indexOf(id),
      from,
      toIndex.value,
      heights.value[from] ?? 0,
    );
    return {
      opacity: 1,
      transform: [{ translateY: withTiming(shift, { duration: SLIDE_MS }) }, { scale: pressScale }],
    };
  });
}

/** Records how tall an item is, for the drag geometry. */
export function useReorderItemLayout(id: string) {
  const context = useContext(TransactionReorderContext);
  const reportHeight = context?.reportHeight;
  return useMemo(
    () =>
      reportHeight
        ? (event: LayoutChangeEvent) => reportHeight(id, event.nativeEvent.layout.height)
        : undefined,
    [id, reportHeight],
  );
}

/** A day header (or anything else) that makes room while a row is dragged. */
export function ReorderShiftView({ id, children }: { id: string; children: React.ReactNode }) {
  const style = useReorderItemStyle(id);
  const onLayout = useReorderItemLayout(id);
  return (
    <Animated.View style={style} onLayout={onLayout}>
      {children}
    </Animated.View>
  );
}

/**
 * The grip a row is dragged by. It takes the touch the moment it lands, as the
 * Sortable handle did, so it never starts a scroll instead.
 *
 * The grip only starts the drag. The list's container follows the finger from
 * then on (`trackingGesture`), because the row's own view does not last the
 * whole drag: scrolled far enough away, the list clips it or recycles its cell
 * for another day, and the touch on it is cancelled with the finger still down.
 */
export function ReorderGrip({
  id,
  style,
  children,
}: {
  id: string;
  style: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const context = useContext(TransactionReorderContext);
  const gesture = useMemo(() => {
    if (!context) return null;
    const { begin, move, end, trackingGesture, tracking } = context;
    return Gesture.Manual()
      .simultaneousWithExternalGesture(trackingGesture)
      .onTouchesDown((event, manager) => {
        const touch = event.allTouches[0];
        if (!touch || !begin(id, touch.absoluteY, touch.y)) {
          manager.fail();
          return;
        }
        manager.activate();
      })
      .onTouchesMove((event) => {
        const touch = event.allTouches[0];
        if (touch) move(touch.absoluteY);
      })
      .onTouchesUp((_event, manager) => {
        end(false);
        manager.end();
      })
      .onTouchesCancelled((_event, manager) => {
        // The row left the screen mid-drag; the container carries on with it.
        if (!tracking.value) end(true);
        manager.fail();
      });
  }, [context, id]);

  if (!gesture) return <View style={style}>{children}</View>;
  return (
    <GestureDetector gesture={gesture}>
      <View style={style}>{children}</View>
    </GestureDetector>
  );
}

interface DraggedStore {
  get: () => string | null;
  set: (id: string | null) => void;
  subscribe: (listener: () => void) => () => void;
}

function createDraggedStore(): DraggedStore {
  let current: string | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (id) => {
      if (id === current) return;
      current = id;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * The lifted copy of the dragged row, drawn over the list. `renderRow` draws
 * the row by id; the ghost positions and shows it.
 */
export function ReorderGhost({
  store,
  style,
  onLayout,
  renderRow,
}: {
  store: DraggedStore;
  style: StyleProp<ViewStyle>;
  onLayout: () => void;
  renderRow: (id: string) => React.ReactNode;
}) {
  const draggedId = useSyncExternalStore(store.subscribe, store.get);
  if (draggedId == null) return null;
  return (
    <Animated.View pointerEvents="none" style={style} onLayout={onLayout}>
      {renderRow(draggedId)}
    </Animated.View>
  );
}

interface UseTransactionReorderOptions {
  /** Selection mode on a list that may reorder: rows show a working grip. */
  enabled: boolean;
  /** Every day header and row, in list order. */
  items: readonly ReorderRow[];
  /** The list's scroll view, for scrolling near the edges. */
  scrollRef: AnimatedRef<any>;
  /** Save a drop. Returns whether anything was written (the list re-renders). */
  onDrop: (reordered: ReorderRow[], movedId: string) => boolean;
}

export function useTransactionReorder({
  enabled,
  items,
  scrollRef,
  onDrop,
}: UseTransactionReorderOptions) {
  const activeId = useSharedValue<string | null>(null);
  const ghostShown = useSharedValue(false);
  const fromIndex = useSharedValue(-1);
  const toIndex = useSharedValue(-1);
  const order = useSharedValue<string[]>([]);
  const heights = useSharedValue<number[]>([]);
  const dragEpoch = useSharedValue(0);

  // Ghost position: where the row sat when picked up, plus the finger's travel.
  const ghostTop = useSharedValue(0);
  const translate = useSharedValue(0);
  const startAbsoluteY = useSharedValue(0);
  const settling = useSharedValue(false);

  // Viewport and scroll, for scrolling near the edges.
  const rootRef = useAnimatedRef<ViewType>();
  const rootPageY = useSharedValue(0);
  const rootHeight = useSharedValue(0);
  const fingerY = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  /** The list's offset as last reported to JS; the drag takes over from it. */
  const scrollOffset = useSharedValue(0);
  const dragScroll = useSharedValue(0);
  const scrolledBy = useSharedValue(0);

  // The row under the ghost. Kept out of React state so picking a row up
  // re-renders only the ghost, not the list.
  const draggedStore = useState(createDraggedStore)[0];
  const measuredHeightsRef = useRef(new Map<string, number>());
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const draggingRef = useRef(false);
  const snapshotRef = useRef<ReorderRow[]>([]);
  const syncFrameRef = useRef<number | null>(null);
  const pendingResetRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Push the order and heights to the UI thread. Mid-drag the order stays as
  // it was at pick-up (the indices in flight refer to it); heights still update
  // as rows scrolled into view get measured.
  const syncGeometry = useCallback(() => {
    if (syncFrameRef.current != null) {
      cancelAnimationFrame(syncFrameRef.current);
      syncFrameRef.current = null;
    }
    if (!draggingRef.current) snapshotRef.current = [...itemsRef.current];
    const rows = snapshotRef.current;
    const measured = measuredHeightsRef.current;
    const typical = { day: [] as number[], transaction: [] as number[] };
    for (const row of rows) {
      const height = measured.get(row.id);
      if (height != null) typical[row.kind].push(height);
    }
    const median = (values: number[], fallback: number) => {
      if (values.length === 0) return fallback;
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] ?? fallback;
    };
    const dayHeight = median(typical.day, FALLBACK_HEADER_HEIGHT);
    const rowHeight = median(typical.transaction, FALLBACK_ROW_HEIGHT);
    heights.value = rows.map(
      (row) => measured.get(row.id) ?? (row.kind === 'day' ? dayHeight : rowHeight),
    );
    if (!draggingRef.current) order.value = rows.map((row) => row.id);
  }, [heights, order]);

  const scheduleSync = useCallback(() => {
    if (syncFrameRef.current != null) return;
    syncFrameRef.current = requestAnimationFrame(() => {
      syncFrameRef.current = null;
      syncGeometry();
    });
  }, [syncGeometry]);

  const reportHeight = useCallback(
    (id: string, height: number) => {
      const rounded = Math.round(height * 2) / 2;
      if (measuredHeightsRef.current.get(id) === rounded) return;
      measuredHeightsRef.current.set(id, rounded);
      if (enabledRef.current) scheduleSync();
    },
    [scheduleSync],
  );

  useEffect(() => {
    if (enabled) syncGeometry();
  }, [enabled, items, syncGeometry]);

  useEffect(
    () => () => {
      if (syncFrameRef.current != null) cancelAnimationFrame(syncFrameRef.current);
      if (resetTimerRef.current != null) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  const autoScroll = useFrameCallback((frame) => {
    'worklet';
    if (activeId.value === null || settling.value) return;
    const y = fingerY.value;
    const height = rootHeight.value;
    let speed = 0;
    if (y < AUTO_SCROLL_EDGE) {
      speed = -MAX_SCROLL_SPEED * Math.min(1, (AUTO_SCROLL_EDGE - y) / AUTO_SCROLL_EDGE);
    } else if (y > height - AUTO_SCROLL_EDGE) {
      speed = MAX_SCROLL_SPEED * Math.min(1, (y - (height - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE);
    }
    if (speed === 0) return;
    const seconds = Math.min(frame.timeSincePreviousFrame ?? 16, 48) / 1000;
    const maxOffset = Math.max(0, contentHeight.value - height);
    const next = Math.min(maxOffset, Math.max(0, dragScroll.value + speed * seconds));
    const delta = next - dragScroll.value;
    if (Math.abs(delta) < 0.5) return;
    dragScroll.value = next;
    scrolledBy.value += delta;
    scrollTo(scrollRef, 0, next, false);
    const target = dragTargetIndex(
      heights.value,
      fromIndex.value,
      translate.value + scrolledBy.value,
    );
    if (target !== toIndex.value) toIndex.value = target;
  }, false);

  const handleBegin = useCallback(
    (id: string) => {
      draggingRef.current = true;
      draggedStore.set(id);
      autoScroll.setActive(true);
      void triggerHaptic('selection');
    },
    [autoScroll, draggedStore],
  );

  const resetDrag = useCallback(() => {
    pendingResetRef.current = false;
    if (resetTimerRef.current != null) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    draggingRef.current = false;
    autoScroll.setActive(false);
    activeId.value = null;
    ghostShown.value = false;
    settling.value = false;
    translate.value = 0;
    draggedStore.set(null);
    if (enabledRef.current) syncGeometry();
  }, [activeId, autoScroll, draggedStore, ghostShown, settling, syncGeometry, translate]);

  const handleDrop = useCallback(
    (id: string, from: number, to: number) => {
      autoScroll.setActive(false);
      const rows = snapshotRef.current;
      if (from !== to && rows[from]?.id === id && onDrop(moveItem(rows, from, to), id)) {
        // Hold the rows where they are until the saved order renders, so the
        // list never shows the old order for a frame in between.
        pendingResetRef.current = true;
        resetTimerRef.current = setTimeout(resetDrag, RESET_FALLBACK_MS);
        return;
      }
      resetDrag();
    },
    [autoScroll, onDrop, resetDrag],
  );

  // The drop re-rendered the list: release the rows (in the same commit).
  useLayoutEffect(() => {
    if (pendingResetRef.current) resetDrag();
  }, [items, resetDrag]);

  // Leaving selection mode (or this page) mid-drag abandons the drag.
  useEffect(() => {
    if (!enabled && draggingRef.current) resetDrag();
  }, [enabled, resetDrag]);

  const retarget = useCallback(() => {
    'worklet';
    const target = dragTargetIndex(
      heights.value,
      fromIndex.value,
      translate.value + scrolledBy.value,
    );
    if (target !== toIndex.value) toIndex.value = target;
  }, [fromIndex, heights, scrolledBy, toIndex, translate]);

  const begin = useCallback(
    (id: string, absoluteY: number, yInRow: number) => {
      'worklet';
      if (activeId.value !== null) return false;
      const index = order.value.indexOf(id);
      if (index < 1) return false;
      const root = measure(rootRef);
      if (!root) return false;
      rootPageY.value = root.pageY;
      rootHeight.value = root.height;
      fingerY.value = absoluteY - root.pageY;
      ghostTop.value = absoluteY - yInRow - root.pageY;
      startAbsoluteY.value = absoluteY;
      translate.value = 0;
      dragScroll.value = scrollOffset.value;
      scrolledBy.value = 0;
      settling.value = false;
      ghostShown.value = false;
      fromIndex.value = index;
      toIndex.value = index;
      dragEpoch.value += 1;
      activeId.value = id;
      runOnJS(handleBegin)(id);
      return true;
    },
    [
      activeId,
      dragEpoch,
      dragScroll,
      fingerY,
      fromIndex,
      ghostShown,
      ghostTop,
      handleBegin,
      order,
      rootHeight,
      rootPageY,
      rootRef,
      scrollOffset,
      scrolledBy,
      settling,
      startAbsoluteY,
      toIndex,
      translate,
    ],
  );

  const move = useCallback(
    (absoluteY: number) => {
      'worklet';
      if (activeId.value === null || settling.value) return;
      fingerY.value = absoluteY - rootPageY.value;
      translate.value = absoluteY - startAbsoluteY.value;
      retarget();
    },
    [activeId, fingerY, retarget, rootPageY, settling, startAbsoluteY, translate],
  );

  const end = useCallback(
    (cancelled: boolean) => {
      'worklet';
      const id = activeId.value;
      if (id === null || settling.value) return;
      settling.value = true;
      // The list's onScroll reports are ignored mid-drag; this is where it is.
      scrollOffset.value = dragScroll.value;
      if (cancelled) toIndex.value = fromIndex.value;
      const from = fromIndex.value;
      const to = toIndex.value;
      translate.value = withTiming(
        dropOffset(heights.value, from, to) - scrolledBy.value,
        { duration: DROP_MS },
        () => {
          runOnJS(handleDrop)(id, from, to);
        },
      );
    },
    [
      activeId,
      dragScroll,
      fromIndex,
      handleDrop,
      heights,
      scrollOffset,
      scrolledBy,
      settling,
      toIndex,
      translate,
    ],
  );

  const tracking = useSharedValue(false);
  const trackingGesture = useMemo(
    () =>
      Gesture.Manual()
        .onTouchesDown(() => {
          tracking.value = true;
        })
        .onTouchesMove((event) => {
          const touch = event.allTouches[0];
          if (touch && activeId.value !== null) move(touch.absoluteY);
        })
        .onTouchesUp(() => {
          tracking.value = false;
          end(false);
        })
        .onTouchesCancelled(() => {
          tracking.value = false;
          end(true);
        }),
    [activeId, end, move, tracking],
  );

  const contextValue = useMemo<TransactionReorderContextValue>(
    () => ({
      activeId,
      ghostShown,
      fromIndex,
      toIndex,
      order,
      heights,
      dragEpoch,
      begin,
      move,
      end,
      reportHeight,
      trackingGesture,
      tracking,
    }),
    [
      activeId,
      begin,
      dragEpoch,
      end,
      fromIndex,
      ghostShown,
      heights,
      move,
      order,
      reportHeight,
      toIndex,
      tracking,
      trackingGesture,
    ],
  );

  const ghostStyle = useAnimatedStyle(() => ({
    opacity: ghostShown.value ? 1 : 0,
    transform: [
      { translateY: ghostTop.value + translate.value },
      { scale: settling.value ? 1 : 1.02 },
    ],
  }));
  const handleGhostLayout = useCallback(() => {
    ghostShown.value = true;
  }, [ghostShown]);

  /** The list reports where it is scrolled to (JS, throttled like its onScroll). */
  const reportScrollOffset = useCallback(
    (y: number) => {
      if (enabledRef.current && !draggingRef.current) scrollOffset.value = y;
    },
    [scrollOffset],
  );
  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeight.value = height;
    },
    [contentHeight],
  );

  return {
    contextValue,
    trackingGesture,
    rootRef,
    draggedStore,
    ghostStyle,
    handleGhostLayout,
    reportScrollOffset,
    handleContentSizeChange,
  };
}
