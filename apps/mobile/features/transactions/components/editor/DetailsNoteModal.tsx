import { X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, ThemeModal } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

/** Long enough for a paragraph or two; short enough to stay a note. */
export const DETAILS_MAX_LENGTH = 2000;

interface DetailsNoteModalProps {
  visible: boolean;
  value: string;
  onClose: () => void;
  onApply: (value: string) => void;
}

/**
 * The editor's longer free-text note. A card pinned near the top of the
 * screen rather than a bottom sheet: the keyboard then never covers the text
 * being typed, on any phone, without measuring it. Edits stay a draft until
 * Done, so closing throws them away.
 */
export function DetailsNoteModal({ visible, value, onClose, onApply }: DetailsNoteModalProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  const handleDone = () => {
    void triggerHaptic('selection');
    Keyboard.dismiss();
    onApply(draft);
    onClose();
  };

  return (
    <ThemeModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      onShow={() => inputRef.current?.focus()}
    >
      <Pressable
        className="flex-1 items-center bg-black/45 px-5"
        style={{ paddingTop: insets.top + 24 }}
        onPress={handleClose}
      >
        <Pressable
          className="w-full max-w-[520px] overflow-hidden rounded-[30px] border border-border/30 bg-background shadow-float"
          onPress={(e) => e.stopPropagation()}
        >
          <View className="flex-row items-center gap-3 px-5 pb-3 pt-5">
            <Pressable
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.close')}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full bg-secondary/60 active:opacity-70"
            >
              <X size={17} color={themeColors.textMuted} />
            </Pressable>
            <Text variant="subheading" numberOfLines={1} className="min-w-0 flex-1">
              {I18n.t('transactions.editor.details.title')}
            </Text>
            <Pressable
              onPress={handleDone}
              accessibilityRole="button"
              className="h-9 items-center justify-center rounded-pill bg-primary px-4 shadow-glow active:opacity-90"
            >
              <Text variant="caption" tone="inverse">
                {I18n.t('common.done')}
              </Text>
            </Pressable>
          </View>
          <View className="px-5 pb-4">
            <View className="rounded-[20px] border border-border/30 bg-card px-4 pb-2 pt-3">
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={DETAILS_MAX_LENGTH}
                textAlignVertical="top"
                accessibilityLabel={I18n.t('transactions.editor.details.title')}
                placeholder={I18n.t('transactions.editor.details.placeholder')}
                placeholderTextColor={`${themeColors.mutedForeground}99`}
                selectionColor={themeColors.primary}
                style={[styles.input, { color: themeColors.text }]}
              />
              <Text variant="caption" tone="muted" className="self-end">
                {`${draft.length}/${DETAILS_MAX_LENGTH}`}
              </Text>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 160,
    maxHeight: 220,
    fontSize: 16,
    lineHeight: 22,
    padding: 0,
  },
});
