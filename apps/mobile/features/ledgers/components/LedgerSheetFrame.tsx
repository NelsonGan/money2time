import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemeModal } from '~/components/ui/theme-modal';
import { useSheetColumnStyle } from '~/hooks/useSheetColumnStyle';

interface LedgerSheetFrameProps {
  visible: boolean;
  onClose: () => void;
  /** The title row under the grabber. */
  header: React.ReactNode;
  /** The list of rows; scrolls when it is taller than the sheet. */
  children: React.ReactNode;
}

/** The bottom sheet the ledger switcher and the ledger picker share. */
export function LedgerSheetFrame({ visible, onClose, header, children }: LedgerSheetFrameProps) {
  const sheetColumnStyle = useSheetColumnStyle();
  const insets = useSafeAreaInsets();
  return (
    <ThemeModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessible={false} style={styles.backdrop} onPress={onClose}>
        <Pressable
          accessible={false}
          onPress={(event) => event.stopPropagation()}
          style={[styles.sheet, sheetColumnStyle]}
        >
          <View className="rounded-t-[28px] bg-card">
            <View className="items-center pt-2.5">
              <View className="h-1 w-10 rounded-full bg-border/60" />
            </View>
            {header}
            <ScrollView
              style={styles.list}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingBottom: Math.max(insets.bottom, 16) + 8,
                gap: 8,
              }}
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '85%' },
  list: { flexGrow: 0 },
});
