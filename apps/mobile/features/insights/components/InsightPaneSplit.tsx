import React, { createContext, useContext } from 'react';
import { View } from 'react-native';

/**
 * Which part of an insight page to draw. `stack` is every phone, tablet and
 * the closed iPhone Duo: chart and details in one column, as always. On the
 * open Duo the page draws itself twice, once per pane: the chart in the left
 * pane (`primary`), the details beside it in the right one (`secondary`).
 */
type InsightPaneSlot = 'stack' | 'primary' | 'secondary';

const InsightPaneSlotContext = createContext<InsightPaneSlot>('stack');

export const InsightPaneSlotProvider = InsightPaneSlotContext.Provider;

interface InsightPaneSplitProps {
  /** The pane's column class (its gap and top margin). */
  className: string;
  /** The chart and its headline figure. */
  primary: React.ReactNode;
  /** What the chart breaks down: category rows, the month's transactions. */
  secondary: React.ReactNode;
}

/**
 * An insight page made of a chart and its details. Stacked, the output is
 * the same column the page always drew; split, each pane gets its half.
 */
export function InsightPaneSplit({ className, primary, secondary }: InsightPaneSplitProps) {
  const slot = useContext(InsightPaneSlotContext);
  return (
    <View className={className}>
      {slot !== 'secondary' ? primary : null}
      {slot !== 'primary' ? secondary : null}
    </View>
  );
}

/** Whether a rendered insight page can be split across the two panes. */
export function isSplitInsightPane(node: React.ReactNode): boolean {
  return React.isValidElement(node) && node.type === InsightPaneSplit;
}
