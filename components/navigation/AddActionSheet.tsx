import { Camera, Mic, Pencil, Settings2, Users, Zap } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountLogo } from '~/components/ui/AccountLogo';
import { SelectField } from '~/components/ui/select';
import { Text } from '~/components/ui/text';
import { ThemeModal } from '~/components/ui/theme-modal';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Account } from '~/types';

interface AddActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onQuick: () => void;
  onFull: () => void;
  onScan: () => void;
  /** Scan a receipt and break it into items to split with friends. */
  onScanSplit: () => void;
  /** Opens Quick Entry settings so the user can reconfigure the + button. */
  onSettings: () => void;
  /** Only shown when voice quick-entry is enabled/supported. */
  onVoice?: () => void;
  /** Accounts offered as the default the four entry flows post to. */
  accounts: Account[];
  /** The currently effective default account (explicit pick or fallback). */
  selectedAccountId: string | null;
  /** Persist a new default account for all entry flows. */
  onSelectAccount: (accountId: string) => void;
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
  onScanSplit,
  onSettings,
  onVoice,
  accounts,
  selectedAccountId,
  onSelectAccount,
}: AddActionSheetProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();

  const handle = (action: () => void) => () => {
    void triggerHaptic('selection');
    onClose();
    // Defer so the sheet dismiss animation doesn't race the navigation/capture.
    setTimeout(action, 0);
  };

  // A quick default-account switch — the picked account becomes the default the
  // Quick / Full / Scan / Voice flows all post to. Only worth showing when
  // there's a real choice. Picking from the dropdown keeps this sheet open so
  // the user then taps an entry method.
  const showAccounts = accounts.length > 1;
  const accountOptions = useMemo(
    () =>
      accounts.map((account) => ({
        value: account.id,
        label: account.name,
        icon: <AccountLogo logoId={account.logoId} type={account.type} size={22} />,
      })),
    [accounts],
  );

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
            <View className="flex-row items-center justify-between px-5 pt-3 pb-2">
              <Text variant="subheading">{I18n.t('add_action.title')}</Text>
              <Pressable
                onPress={handle(onSettings)}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('settings.quick_entry.title')}
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-full bg-secondary/50 active:opacity-70"
              >
                <Settings2 size={18} color={themeColors.textMuted} />
              </Pressable>
            </View>
            {showAccounts ? (
              <View className="px-5 pt-1 pb-2">
                <SelectField
                  compact
                  label={I18n.t('add_action.account_label')}
                  sheetTitle={I18n.t('add_action.account_label')}
                  optionsLayout="list"
                  value={selectedAccountId}
                  options={accountOptions}
                  onChange={onSelectAccount}
                />
              </View>
            ) : null}
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
              <ActionRow
                icon={<Users size={22} color={themeColors.primary} />}
                title={I18n.t('add_action.scan_split_title')}
                subtitle={I18n.t('add_action.scan_split_subtitle')}
                onPress={handle(onScanSplit)}
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
