export const YEAR_MONTHS_PER_ROW = 3;
export const YEAR_HORIZONTAL_PADDING = 20;
export const YEAR_MONTH_HORIZONTAL_GAP = 14;
export const YEAR_ROW_VERTICAL_GAP = 20;
export const YEAR_HEADER_HEIGHT = 36;
export const YEAR_MONTH_NAME_HEIGHT = 22;
export const YEAR_DAY_ROWS = 6;

const FULL_MONTH_DAY_GAP = 5;
const FULL_MONTH_HORIZONTAL_PADDING = 4;
const FULL_MONTH_TOP = 4;

export interface CalendarFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CalendarYearLayout {
  monthWidth: number;
  cellSize: number;
  miniMonthHeight: number;
  yearItemHeight: number;
  monthFrames: CalendarFrame[];
}

/** Shared geometry for the year renderer and the month-to-year transition. */
export function getCalendarYearLayout(screenWidth: number): CalendarYearLayout {
  const monthWidth = Math.floor(
    (screenWidth -
      YEAR_HORIZONTAL_PADDING * 2 -
      YEAR_MONTH_HORIZONTAL_GAP * (YEAR_MONTHS_PER_ROW - 1)) /
      YEAR_MONTHS_PER_ROW,
  );
  const cellSize = Math.floor(monthWidth / 7);
  const miniMonthHeight = YEAR_MONTH_NAME_HEIGHT + cellSize * YEAR_DAY_ROWS;
  const yearItemHeight = YEAR_HEADER_HEIGHT + miniMonthHeight * 4 + YEAR_ROW_VERTICAL_GAP * 3 + 16;
  const monthFrames = Array.from({ length: 12 }, (_, monthIndex) => {
    const row = Math.floor(monthIndex / YEAR_MONTHS_PER_ROW);
    const column = monthIndex % YEAR_MONTHS_PER_ROW;
    return {
      x: YEAR_HORIZONTAL_PADDING + column * (monthWidth + YEAR_MONTH_HORIZONTAL_GAP),
      y: YEAR_HEADER_HEIGHT + row * (miniMonthHeight + YEAR_ROW_VERTICAL_GAP),
      width: monthWidth,
      height: miniMonthHeight,
    };
  });
  return { monthWidth, cellSize, miniMonthHeight, yearItemHeight, monthFrames };
}

export interface MonthToYearZoomGeometry {
  source: CalendarFrame;
  target: CalendarFrame;
  scale: number;
  translateX: number;
  translateY: number;
}

/**
 * End geometry for shrinking the visible full-month grid into the selected
 * mini-month. Translation is expressed after scaling around the layer's top
 * left corner: destination = source * scale + translation.
 */
export function getMonthToYearZoomGeometry({
  screenWidth,
  contentWidth,
  monthIndex,
}: {
  screenWidth: number;
  contentWidth: number;
  monthIndex: number;
}): MonthToYearZoomGeometry {
  const chartWidth = Math.max(280, contentWidth - FULL_MONTH_HORIZONTAL_PADDING * 2);
  const dayCellSize = Math.max(40, Math.floor((chartWidth - FULL_MONTH_DAY_GAP * 6) / 7));
  const fullGridWidth = dayCellSize * 7 + FULL_MONTH_DAY_GAP * 6;
  const fullDayHeight = Math.min(dayCellSize + 14, 62);
  const source: CalendarFrame = {
    x: (screenWidth - fullGridWidth) / 2,
    y: FULL_MONTH_TOP,
    width: fullGridWidth,
    height: 20 + fullDayHeight * 6 + FULL_MONTH_DAY_GAP * 5,
  };
  const layout = getCalendarYearLayout(screenWidth);
  const clampedMonthIndex = Math.max(0, Math.min(11, monthIndex));
  const target = layout.monthFrames[clampedMonthIndex]!;
  const scale = target.width / source.width;
  return {
    source,
    target,
    scale,
    translateX: target.x - source.x * scale,
    translateY: target.y - source.y * scale,
  };
}
