/**
 * Geometry of dragging one row through a vertical list of rows and headers.
 *
 * The list is a flat sequence of items (day headers and transaction rows) with
 * the height each one takes up, margins included. Everything is relative to
 * where the dragged row sat when the drag began, so it needs no scroll offsets
 * or absolute positions, only heights. These run on the UI thread during a
 * drag, hence the worklet directives.
 */

/**
 * Where the dragged row would drop, as an index into the original sequence.
 *
 * A neighbour below makes room once the dragged row's bottom edge passes its
 * middle, and one above once the dragged row's top edge does, so a row changes
 * places halfway across its neighbour whichever way it is dragged. Index 0 is
 * the first day's header, which nothing can be dropped above.
 */
export function dragTargetIndex(
  heights: readonly number[],
  fromIndex: number,
  displacement: number,
): number {
  'worklet';
  const draggedHeight = heights[fromIndex] ?? 0;
  let target = fromIndex;
  if (displacement > 0) {
    let neighbourTop = draggedHeight;
    for (let index = fromIndex + 1; index < heights.length; index += 1) {
      const height = heights[index] ?? 0;
      if (displacement + draggedHeight <= neighbourTop + height / 2) break;
      target = index;
      neighbourTop += height;
    }
  } else if (displacement < 0) {
    let neighbourTop = 0;
    for (let index = fromIndex - 1; index >= 1; index -= 1) {
      const height = heights[index] ?? 0;
      neighbourTop -= height;
      if (displacement >= neighbourTop + height / 2) break;
      target = index;
    }
  }
  return target;
}

/** How far the dragged row's top moves to land in `toIndex`. */
export function dropOffset(heights: readonly number[], fromIndex: number, toIndex: number): number {
  'worklet';
  let offset = 0;
  if (toIndex > fromIndex) {
    for (let index = fromIndex + 1; index <= toIndex; index += 1) offset += heights[index] ?? 0;
  } else {
    for (let index = toIndex; index < fromIndex; index += 1) offset -= heights[index] ?? 0;
  }
  return offset;
}

/**
 * How far an item at `index` slides to make room while the row at `fromIndex`
 * hovers over `toIndex`: up by the dragged row's height when the row has moved
 * down past it, down when the row has moved up past it.
 */
export function makeRoomOffset(
  index: number,
  fromIndex: number,
  toIndex: number,
  draggedHeight: number,
): number {
  'worklet';
  if (index < 0 || index === fromIndex) return 0;
  if (fromIndex < toIndex && index > fromIndex && index <= toIndex) return -draggedHeight;
  if (fromIndex > toIndex && index >= toIndex && index < fromIndex) return draggedHeight;
  return 0;
}

/** The sequence with the item at `fromIndex` moved to `toIndex`. */
export function moveItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return [...items];
  next.splice(toIndex, 0, moved);
  return next;
}
