import React from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import { useEdgeSwipeBack } from '~/hooks/useEdgeSwipeBack';

interface EdgeSwipeBackContainerProps {
  children: React.ReactNode;
  onBack?: (() => void) | null;
  edgeWidth?: number;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  edgeZone: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
});

export function EdgeSwipeBackContainer({
  children,
  onBack,
  edgeWidth = 24,
}: EdgeSwipeBackContainerProps) {
  const swipeBackGesture = useEdgeSwipeBack(onBack ?? undefined);

  return (
    <View style={styles.root}>
      {children}
      <View pointerEvents="box-none" style={styles.overlay}>
        <GestureDetector gesture={swipeBackGesture}>
          <View
            pointerEvents={onBack ? 'auto' : 'none'}
            style={[styles.edgeZone, { width: edgeWidth }]}
          />
        </GestureDetector>
      </View>
    </View>
  );
}
