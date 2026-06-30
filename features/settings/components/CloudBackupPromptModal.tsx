import { CloudUpload, X } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, FatButton, Text, ThemeModal } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

interface CloudBackupPromptModalProps {
  visible: boolean;
  /** Primary CTA — opens the auto-backup settings screen. */
  onEnable: () => void;
  /** "Maybe later" / close / backdrop. */
  onDismiss: () => void;
}

const PANEL_PADDING = 18;

export function CloudBackupPromptModal({
  visible,
  onEnable,
  onDismiss,
}: CloudBackupPromptModalProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const accentColor = colors.primary;

  return (
    <ThemeModal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onDismiss}
    >
      <View
        className="flex-1 justify-end bg-black/50 px-4"
        style={{ paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }}
      >
        <View className="overflow-hidden rounded-[30px] border border-border/30 bg-background shadow-float">
          {/* Tinted hero panel with the cloud glyph. */}
          <View style={[styles.panel, { backgroundColor: withColorAlpha(accentColor, 0.1) }]}>
            <View
              style={[styles.iconBubble, { backgroundColor: withColorAlpha(accentColor, 0.16) }]}
            >
              <CloudUpload size={40} color={accentColor} strokeWidth={2.2} />
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={I18n.t('common.close')}
            onPress={onDismiss}
            hitSlop={8}
            style={[
              styles.closeBtn,
              { backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.08) },
            ]}
          >
            <X size={17} color={colors.textSoft} />
          </Pressable>

          <View style={styles.body}>
            <View style={styles.textArea}>
              <Text variant="heading" style={{ color: colors.text }}>
                {I18n.t('cloud_backup_prompt.title')}
              </Text>
              <Text variant="friendly" tone="muted" className="mt-2">
                {I18n.t('cloud_backup_prompt.body')}
              </Text>
            </View>

            <View style={styles.footer}>
              <FatButton
                color={accentColor}
                label={I18n.t('cloud_backup_prompt.cta')}
                onPress={onEnable}
              />
              <Button variant="ghost" size="sm" onPress={onDismiss}>
                <Text tone="muted">{I18n.t('cloud_backup_prompt.dismiss')}</Text>
              </Button>
            </View>
          </View>
        </View>
      </View>
    </ThemeModal>
  );
}

const styles = StyleSheet.create({
  panel: {
    paddingHorizontal: PANEL_PADDING,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubble: {
    width: 80,
    height: 80,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    height: 32,
    width: 32,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 22,
  },
  textArea: {
    minHeight: 72,
  },
  footer: {
    gap: 8,
    marginTop: 18,
  },
});
