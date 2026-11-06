import React from 'react';
import { View } from 'react-native';

interface ColumnGridProps {
  /** 1 renders a plain column, exactly as a stacked list. */
  columns: number;
  gap: number;
  children: React.ReactNode;
}

/**
 * Lays its children out in rows of `columns` equal-width cells (a wide iPad
 * page, from `useWideTabColumns`), cells in a row stretched to the tallest.
 * With one column it is the usual stacked list.
 */
export function ColumnGrid({ columns, gap, children }: ColumnGridProps) {
  const items = React.Children.toArray(children);
  if (columns <= 1) return <View style={{ gap }}>{items}</View>;

  const rows: React.ReactNode[][] = [];
  for (let index = 0; index < items.length; index += columns) {
    rows.push(items.slice(index, index + columns));
  }
  return (
    <View style={{ gap }}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={{ flexDirection: 'row', gap }}>
          {row.map((item, cellIndex) => (
            <View key={cellIndex} style={{ flex: 1 }}>
              {item}
            </View>
          ))}
          {/* Keep the last row's cells the same width as the rows above. */}
          {Array.from({ length: columns - row.length }, (_, padIndex) => (
            <View key={`pad-${padIndex}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}
