import { Camera, Mic, Pencil, Zap } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui/text';
import { ThemeModal } from '~/components/ui/theme-modal';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

interface AddActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onQuick: () => void;
  onFull: () => void;
  onScan: () => void;
  /** Only shown when voice quick-entry is enabled/supported. */
  onVoice?: () => void;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
});

/**
 * Bottom sheet shown when tapping the + FAB (when "Show options" is on): choose
 * how to add a transaction — Quick entry, Full entry, Scan receipt, or Voice.
 */
export function AddActionSheet({
  visible,
  onClose,
  onQuick,
  onFull,
  onScan,
  onVoice,
}: AddActionSheetProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();

  const handle = (action: () => void) => () => {
    void triggerHaptic('selection');
    onClose();
    // Defer so the sheet dismiss animation doesn't race the navigation/capture.
    setTimeout(action, 0);
  };

  return (
    <ThemeModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View
            className="bg-card rounded-t-[28px]"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          >
            <View className="items-center pt-3 pb-1">
              <View className="h-1 w-10 rounded-full bg-secondary" />
            </View>
            <View className="px-5 pt-3 pb-2">
              <Text variant="subheading">{I18n.t('add_action.title')}</Text>
            </View>
            <View className="px-3 pb-2">
              <ActionRow
                icon={<Zap size={22} color={themeColors.primary} />}
                title={I18n.t('add_action.quick_title')}
                subtitle={I18n.t('add_action.quick_subtitle')}
                onPress={handle(onQuick)}
              />
              <ActionRow
                icon={<Pencil size={22} color={themeColors.primary} />}
                title={I18n.t('add_action.full_title')}
                subtitle={I18n.t('add_action.full_subtitle')}
                onPress={handle(onFull)}
              />
              <ActionRow
                icon={<Camera size={22} color={themeColors.primary} />}
                title={I18n.t('add_action.scan_title')}
                subtitle={I18n.t('add_action.scan_subtitle')}
                onPress={handle(onScan)}
              />
              {onVoice ? (
                <ActionRow
                  icon={<Mic size={22} color={themeColors.primary} />}
                  title={I18n.t('add_action.voice_title')}
                  subtitle={I18n.t('add_action.voice_subtitle')}
                  onPress={handle(onVoice)}
                />
              ) : null}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}

interface ActionRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}

function ActionRow({ icon, title, subtitle, onPress }: ActionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      className="flex-row items-center gap-3 rounded-2xl px-3 py-3.5"
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-primary/10">
        {icon}
      </View>
      <View className="flex-1">
        <Text variant="body" className="font-medium">
          {title}
        </Text>
        <Text variant="caption" tone="muted">
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}
