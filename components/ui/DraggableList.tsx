import React from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import DraggableFlatList, {
  type DragEndParams,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { GripVertical } from 'lucide-react-native';
import { triggerHaptic } from '~/services/haptics';
import { useThemeColors } from '~/hooks/useThemeColors';

const SNAP_CONFIG = {
  damping: 100,
  stiffness: 800,
  mass: 0.2,
  overshootClamping: true,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 0.01,
};

export interface DraggableListProps<T> {
  data: T[];
  keyExtractor: (item: T) => string;
  onDragEnd: (data: T[]) => void;
  renderItem: (params: {
    item: T;
    index: number;
    drag: () => void;
    isActive: boolean;
  }) => React.ReactNode;
  ListHeaderComponent?: React.ReactNode;
  ListEmptyComponent?: React.ReactNode;
  contentContainerStyle?: ViewStyle;
  scrollEnabled?: boolean;
}

export function DraggableList<T extends { id: string }>({
  data,
  keyExtractor,
  onDragEnd,
  renderItem,
  ListHeaderComponent,
  ListEmptyComponent,
  contentContainerStyle,
  scrollEnabled = true,
}: DraggableListProps<T>) {
  if (data.length === 0 && ListEmptyComponent) {
    return (
      <View style={contentContainerStyle}>
        {ListHeaderComponent}
        {ListEmptyComponent}
      </View>
    );
  }

  return (
    <DraggableFlatList
      data={data}
      keyExtractor={keyExtractor}
      animationConfig={SNAP_CONFIG}
      onDragBegin={() => {
        void triggerHaptic('medium');
      }}
      onDragEnd={({ data: d }: DragEndParams<T>) => {
        void triggerHaptic('light');
        onDragEnd(d);
      }}
      onPlaceholderIndexChange={() => {
        void triggerHaptic('selection');
      }}
      renderItem={(params: RenderItemParams<T>) =>
        renderItem({
          item: params.item,
          index: params.getIndex() ?? 0,
          drag: params.drag,
          isActive: params.isActive,
        })
      }
      ListHeaderComponent={
        ListHeaderComponent as React.ComponentType | React.ReactElement | null | undefined
      }
      contentContainerStyle={contentContainerStyle}
      autoscrollThreshold={80}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      scrollEnabled={scrollEnabled}
    />
  );
}

export function DragHandle({ drag, isActive }: { drag: () => void; isActive?: boolean }) {
  const themeColors = useThemeColors();
  return (
    <Pressable
      onLongPress={drag}
      delayLongPress={100}
      disabled={isActive}
      hitSlop={8}
      style={{ padding: 8, marginRight: -4 }}
    >
      <GripVertical size={18} color={themeColors.textMuted} />
    </Pressable>
  );
}
