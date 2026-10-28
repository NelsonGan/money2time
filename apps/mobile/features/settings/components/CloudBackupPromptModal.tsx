import { X } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GoogleDriveIcon, ICloudIcon } from '~/components/icons/CloudProviderIcons';
import { Button, FatButton, PromptSheet, Text } from '~/components/ui';
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
  const accentColor = colors.primary;

  return (
    <PromptSheet visible={visible} onDismiss={onDismiss}>
      {/* Tinted hero panel showing the two cloud destinations. */}
      <View style={[styles.panel, { backgroundColor: withColorAlpha(accentColor, 0.1) }]}>
        <View style={styles.providerRow}>
          <View style={styles.provider}>
            <View
              style={[
                styles.iconBubble,
                {
                  backgroundColor: colors.card,
                  borderColor: withColorAlpha(colors.text, 0.08),
                },
              ]}
            >
              <ICloudIcon size={34} />
            </View>
            <Text variant="caption" tone="muted">
              {I18n.t('auto_backup.target.icloud')}
            </Text>
          </View>
          <View style={styles.provider}>
            <View
              style={[
                styles.iconBubble,
                {
                  backgroundColor: colors.card,
                  borderColor: withColorAlpha(colors.text, 0.08),
                },
              ]}
            >
              <GoogleDriveIcon size={30} />
            </View>
            <Text variant="caption" tone="muted">
              {I18n.t('auto_backup.target.google_drive')}
            </Text>
          </View>
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
    </PromptSheet>
  );
}

const styles = StyleSheet.create({
  panel: {
    paddingHorizontal: PANEL_PADDING,
    paddingVertical: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 28,
  },
  provider: {
    alignItems: 'center',
    gap: 8,
  },
  iconBubble: {
    width: 68,
    height: 68,
    borderRadius: 999,
    borderWidth: 1,
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
