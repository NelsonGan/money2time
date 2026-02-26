import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { GripVertical } from 'lucide-react-native';
import { Text } from '~/components/ui/text';
import { triggerHaptic } from '~/services/haptics';

const SNAP_CONFIG = {
  damping: 100,
  stiffness: 800,
  mass: 0.2,
  overshootClamping: true,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 0.01,
};

interface DemoItem {
  id: string;
  name: string;
}

const INITIAL: DemoItem[] = Array.from({ length: 10 }, (_, i) => ({
  id: String(i),
  name: `Item ${i + 1}`,
}));

function Row({ item, drag, isActive }: RenderItemParams<DemoItem>) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        marginHorizontal: 16,
        marginBottom: 4,
        borderRadius: 12,
        backgroundColor: isActive ? '#ddd' : '#f5f5f5',
      }}
    >
      <Text style={{ flex: 1 }}>{item.name}</Text>
      <Pressable
        onLongPress={drag}
        delayLongPress={100}
        disabled={isActive}
        hitSlop={8}
        style={{ padding: 8 }}
      >
        <GripVertical size={18} color="#999" />
      </Pressable>
    </View>
  );
}

export function DraggableListDemo() {
  const [items, setItems] = useState(INITIAL);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <Text style={{ padding: 16, fontWeight: 'bold' }}>Touch the grip icon to drag</Text>
      <DraggableFlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={Row}
        animationConfig={SNAP_CONFIG}
        onDragBegin={() => {
          void triggerHaptic('medium');
        }}
        onDragEnd={({ data }) => {
          void triggerHaptic('light');
          setItems(data);
        }}
        onPlaceholderIndexChange={() => {
          void triggerHaptic('selection');
        }}
      />
    </SafeAreaView>
  );
}
