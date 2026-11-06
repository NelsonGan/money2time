/**
 * The page a horizontal pager's scroll event settled on, or null when the
 * event is not a page turn. A paging scroll view is always exactly one page
 * wide, so a settle measured at any other width (`layoutMeasurement`) comes
 * from a layout change in flight: an iPad window being resized reports
 * frames from its resize animation, and dividing their offsets by any page
 * width lands months or decades away. Those are skipped; the pager re-snaps
 * to its page when the new width renders (`usePagerWidthResnap`).
 */
export function pageIndexFromOffset(
  offsetX: number,
  measuredWidth: number | undefined,
  pageWidth: number,
): number | null {
  if (measuredWidth && measuredWidth > 0 && Math.abs(measuredWidth - pageWidth) > 0.5) {
    return null;
  }
  return Math.round(offsetX / Math.max(1, pageWidth));
}
