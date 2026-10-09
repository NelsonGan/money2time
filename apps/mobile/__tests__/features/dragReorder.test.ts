import {
  dragTargetIndex,
  dropOffset,
  makeRoomOffset,
  moveItem,
} from '~/features/transactions/lib/dragReorder';

// A header (32) over three 60-high rows, then a second day the same shape.
const HEIGHTS = [32, 60, 60, 60, 32, 60, 60];

describe('dragTargetIndex', () => {
  it('stays put until the row is dragged halfway across a neighbour', () => {
    expect(dragTargetIndex(HEIGHTS, 2, 0)).toBe(2);
    expect(dragTargetIndex(HEIGHTS, 2, 29)).toBe(2);
    expect(dragTargetIndex(HEIGHTS, 2, 31)).toBe(3);
    expect(dragTargetIndex(HEIGHTS, 2, -29)).toBe(2);
    expect(dragTargetIndex(HEIGHTS, 2, -31)).toBe(1);
  });

  it('crosses a day header into the next day', () => {
    // Past row 3 (60) and the header's middle (16): the top of the next day.
    expect(dragTargetIndex(HEIGHTS, 2, 60 + 17)).toBe(4);
    expect(dragTargetIndex(HEIGHTS, 2, 60 + 32 + 31)).toBe(5);
  });

  it('crosses back up into the previous day', () => {
    expect(dragTargetIndex(HEIGHTS, 5, -17)).toBe(4);
    expect(dragTargetIndex(HEIGHTS, 5, -(32 + 31))).toBe(3);
  });

  it('never goes above the first header or past the last item', () => {
    expect(dragTargetIndex(HEIGHTS, 1, -500)).toBe(1);
    expect(dragTargetIndex(HEIGHTS, 3, -500)).toBe(1);
    expect(dragTargetIndex(HEIGHTS, 2, 5000)).toBe(HEIGHTS.length - 1);
  });
});

describe('dropOffset', () => {
  it('lands the row where the rows it passed used to start', () => {
    expect(dropOffset(HEIGHTS, 2, 2)).toBe(0);
    expect(dropOffset(HEIGHTS, 2, 3)).toBe(60);
    expect(dropOffset(HEIGHTS, 2, 5)).toBe(60 + 32 + 60);
    expect(dropOffset(HEIGHTS, 5, 1)).toBe(-(32 + 60 + 60 + 60));
  });
});

describe('makeRoomOffset', () => {
  it('slides the passed items against the drag by the dragged row’s height', () => {
    // Row 2 dragged down to 4: rows 3 and 4 move up, the rest stay.
    expect([0, 1, 2, 3, 4, 5, 6].map((index) => makeRoomOffset(index, 2, 4, 60))).toEqual([
      0, 0, 0, -60, -60, 0, 0,
    ]);
    // Row 5 dragged up to 3: items 3 and 4 move down.
    expect([0, 1, 2, 3, 4, 5, 6].map((index) => makeRoomOffset(index, 5, 3, 60))).toEqual([
      0, 0, 0, 60, 60, 0, 0,
    ]);
  });

  it('moves nothing for an item the drag does not know', () => {
    expect(makeRoomOffset(-1, 2, 4, 60)).toBe(0);
  });
});

describe('moveItem', () => {
  it('moves one item and keeps the rest in order', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 1, 3)).toEqual(['a', 'c', 'd', 'b']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });

  it('matches where the drag math says the row lands', () => {
    const ids = ['day-1', 'a', 'b', 'c', 'day-2', 'd', 'e'];
    const target = dragTargetIndex(HEIGHTS, 1, 60 + 60 + 32 + 31);
    expect(target).toBe(5);
    expect(moveItem(ids, 1, target)).toEqual(['day-1', 'b', 'c', 'day-2', 'd', 'a', 'e']);
  });
});
