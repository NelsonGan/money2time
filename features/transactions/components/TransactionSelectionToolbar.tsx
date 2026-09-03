import { Copy, Pencil, Trash2 } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: spacing.xs,
    left: 0,
    right: 0,
    zIndex: 20,
  },
});

interface TransactionSelectionToolbarProps {
  selectedCount: number;
  /** Pre-rendered total value node (respects money/time display). */
  totalNode: React.ReactNode;
  onCancel: () => void;
  /** Omitted when nothing in the selection can be duplicated. */
  onDuplicate?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * Floating selection toolbar shown while transactions are multi-selected.
 * Positioned as an absolute overlay; host must render it inside a relatively
 * positioned container.
 */
export function TransactionSelectionToolbar({
  selectedCount,
  totalNode,
  onCancel,
  onDuplicate,
  onEdit,
  onDelete,
}: TransactionSelectionToolbarProps) {
  const themeColors = useThemeColors();

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <TabletContentContainer>
        <View className="px-5">
          <View className="rounded-[26px] bg-card border border-border/40 px-3 py-2.5 flex-row items-center justify-between gap-2">
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                onCancel();
              }}
              className="rounded-full bg-secondary/70 px-3 py-1.5 active:opacity-85"
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.cancel')}
            >
              <Text variant="caption" tone="muted">
                {I18n.t('common.cancel')}
              </Text>
            </Pressable>

            <View className="flex-1 items-center px-1">
              <View className="flex-row flex-wrap items-center justify-center gap-1.5">
                <Text variant="caption" className="text-foreground">
                  {I18n.t('transactions.selection.selected_count', { count: selectedCount })}
                </Text>
                <View className="rounded-full border border-border/35 bg-secondary/70 px-2 py-[3px]">
                  {totalNode}
                </View>
              </View>
            </View>

            <View className="flex-row items-center gap-2">
              {onDuplicate ? (
                <Pressable
                  onPress={onDuplicate}
                  className="h-9 w-9 rounded-full bg-secondary/70 border border-border/35 items-center justify-center active:opacity-85"
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('transactions.selection.duplicate')}
                  hitSlop={8}
                >
                  <Copy size={14} color={themeColors.textMuted} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={onEdit}
                className="h-9 w-9 rounded-full bg-primary/12 border border-primary/35 items-center justify-center active:opacity-85"
                accessibilityRole="button"
                accessibilityLabel={I18n.t('transactions.selection.update')}
                hitSlop={8}
              >
                <Pencil size={14} color={themeColors.primary} />
              </Pressable>
              <Pressable
                onPress={onDelete}
                className="h-9 w-9 rounded-full bg-destructive/10 border border-destructive/35 items-center justify-center active:opacity-85"
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.delete')}
                hitSlop={8}
              >
                <Trash2 size={14} color={themeColors.coral} />
              </Pressable>
            </View>
          </View>
        </View>
      </TabletContentContainer>
    </View>
  );
}
