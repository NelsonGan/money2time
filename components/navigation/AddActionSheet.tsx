import {
  Camera,
  Check,
  ChevronDown,
  Mic,
  Pencil,
  ScanLine,
  Settings2,
  SplitSquareHorizontal,
  Zap,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountLogo } from '~/components/ui/AccountLogo';
import { AccountPickerSheet } from '~/components/ui/AccountPickerSheet';
import { Text } from '~/components/ui/text';
import { ThemeModal } from '~/components/ui/theme-modal';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Account, AccountGroup, AddButtonAction } from '~/types';
import { cn } from '~/utils';

type SheetTab = 'add' | 'split';

interface AddActionSheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * 'run' (default) executes an add flow when a row is tapped — used by the +
   * button. 'pick' returns the chosen action key via `onPickAction` instead —
   * used in Quick Entry settings to map an action to the tap/hold gesture.
   */
  mode?: 'run' | 'pick';

  // --- run mode ---
  onQuick?: () => void;
  onFull?: () => void;
  onScan?: () => void;
  /** Open a new expense directly in the split-bill editor. */
  onSplitManual?: () => void;
  /** Scan a receipt and break it into items to split with friends. */
  onScanSplit?: () => void;
  /** Opens Quick Entry settings so the user can reconfigure the + button. */
  onSettings?: () => void;
  /** Only shown when voice quick-entry is enabled/supported. */
  onVoice?: () => void;
  /** Accounts offered as the default the entry flows post to. */
  accounts?: Account[];
  accountGroups?: AccountGroup[];
  /** The currently effective default account (explicit pick or fallback). */
  selectedAccountId?: string | null;
  /** Persist a new default account for all entry flows. */
  onSelectAccount?: (accountId: string) => void;

  // --- pick mode ---
  /** Sheet title override (pick mode shows the gesture being mapped). */
  title?: string;
  /** Called with the picked action (or 'none') in pick mode. */
  onPickAction?: (action: AddButtonAction | 'none') => void;
  /** Highlights the currently mapped action in pick mode. */
  pickSelected?: AddButtonAction | 'none';
  /** Offer a "Nothing" option (used for the hold gesture). */
  pickAllowNone?: boolean;
  /** Whether the voice row should be offered in pick mode. */
  voiceAvailable?: boolean;
}

interface ActionSpec {
  key: AddButtonAction;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
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
 * how to add a transaction. Two tabs — "Add" (Quick / Full / Scan / Voice) and
 * "Split" (Manual / Scan). In `pick` mode the same sheet doubles as an action
 * picker in Quick Entry settings, mapping an action onto tap/hold.
 */
export function AddActionSheet({
  visible,
  onClose,
  mode = 'run',
  onQuick,
  onFull,
  onScan,
  onSplitManual,
  onScanSplit,
  onSettings,
  onVoice,
  accounts,
  accountGroups,
  selectedAccountId,
  onSelectAccount,
  title,
  onPickAction,
  pickSelected,
  pickAllowNone,
  voiceAvailable,
}: AddActionSheetProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [accountPickerVisible, setAccountPickerVisible] = useState(false);
  const [tab, setTab] = useState<SheetTab>('add');
  const isPick = mode === 'pick';

  // When opening the picker, land on the tab that holds the currently-mapped
  // action so its check is visible without hunting across tabs.
  useEffect(() => {
    if (!visible) return;
    if (isPick && (pickSelected === 'split' || pickSelected === 'scan_split')) {
      setTab('split');
    } else {
      setTab('add');
    }
  }, [visible, isPick, pickSelected]);

  // Voice is shown in run mode when a handler is wired; in pick mode when the
  // device supports it.
  const showVoice = isPick ? !!voiceAvailable : !!onVoice;

  const addActions = useMemo<ActionSpec[]>(() => {
    const list: ActionSpec[] = [
      {
        key: 'quick',
        icon: <Zap size={22} color={themeColors.primary} />,
        title: I18n.t('add_action.quick_title'),
        subtitle: I18n.t('add_action.quick_subtitle'),
      },
      {
        key: 'full',
        icon: <Pencil size={22} color={themeColors.primary} />,
        title: I18n.t('add_action.full_title'),
        subtitle: I18n.t('add_action.full_subtitle'),
      },
      {
        key: 'scan',
        icon: <Camera size={22} color={themeColors.primary} />,
        title: I18n.t('add_action.scan_title'),
        subtitle: I18n.t('add_action.scan_subtitle'),
      },
    ];
    if (showVoice) {
      list.push({
        key: 'voice',
        icon: <Mic size={22} color={themeColors.primary} />,
        title: I18n.t('add_action.voice_title'),
        subtitle: I18n.t('add_action.voice_subtitle'),
      });
    }
    return list;
  }, [showVoice, themeColors.primary]);

  const splitActions = useMemo<ActionSpec[]>(
    () => [
      {
        key: 'split',
        icon: <SplitSquareHorizontal size={22} color={themeColors.primary} />,
        title: I18n.t('add_action.split_manual_title'),
        subtitle: I18n.t('add_action.split_manual_subtitle'),
      },
      {
        key: 'scan_split',
        icon: <ScanLine size={22} color={themeColors.primary} />,
        title: I18n.t('add_action.scan_split_title'),
        subtitle: I18n.t('add_action.scan_split_subtitle'),
      },
    ],
    [themeColors.primary],
  );

  const runHandlers: Record<AddButtonAction, (() => void) | undefined> = {
    quick: onQuick,
    full: onFull,
    scan: onScan,
    voice: onVoice,
    split: onSplitManual,
    scan_split: onScanSplit,
  };

  const handleRow = (key: AddButtonAction) => () => {
    void triggerHaptic('selection');
    onClose();
    if (isPick) {
      // Report the mapping; no dismiss-animation race since nothing navigates.
      onPickAction?.(key);
      return;
    }
    // Defer so the sheet dismiss animation doesn't race the navigation/capture.
    setTimeout(() => runHandlers[key]?.(), 0);
  };

  const handleNone = () => {
    void triggerHaptic('selection');
    onClose();
    onPickAction?.('none');
  };

  // A quick default-account switch — the picked account becomes the default the
  // entry flows all post to. Only worth showing (run mode) when there's a real
  // choice. Selecting keeps this sheet open so the user then taps an entry method.
  const accountList = accounts ?? [];
  const showAccounts = !isPick && accountList.length > 1;
  const selectedAccount = accountList.find((a) => a.id === selectedAccountId) ?? null;

  const activeActions = tab === 'add' ? addActions : splitActions;

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
              <Text variant="subheading">{title ?? I18n.t('add_action.title')}</Text>
              {!isPick && onSettings ? (
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    onClose();
                    setTimeout(() => onSettings(), 0);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('settings.quick_entry.title')}
                  hitSlop={8}
                  className="h-9 w-9 items-center justify-center rounded-full bg-secondary/50 active:opacity-70"
                >
                  <Settings2 size={18} color={themeColors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            {/* Tab switcher: Add / Split */}
            <View className="mx-5 mt-1 mb-2 flex-row rounded-2xl bg-secondary/50 p-1">
              {(['add', 'split'] as const).map((t) => {
                const selected = tab === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => {
                      void triggerHaptic('selection');
                      setTab(t);
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    className={cn(
                      'flex-1 items-center justify-center rounded-xl py-2',
                      selected ? 'bg-card' : '',
                    )}
                  >
                    <Text
                      variant="body"
                      className={cn(
                        'font-medium',
                        selected ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {I18n.t(t === 'add' ? 'add_action.tab_add' : 'add_action.tab_split')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {showAccounts ? (
              <View className="px-5 pt-1 pb-2">
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    setAccountPickerVisible(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={selectedAccount?.name}
                  className="h-[52px] flex-row items-center gap-2.5 rounded-2xl border border-border/40 bg-card/95 px-3.5 active:opacity-70"
                >
                  {selectedAccount ? (
                    <AccountLogo
                      logoId={selectedAccount.logoId}
                      type={selectedAccount.type}
                      size={24}
                    />
                  ) : null}
                  <Text
                    variant="body"
                    className="flex-1 font-medium text-foreground"
                    numberOfLines={1}
                  >
                    {selectedAccount?.name ?? ''}
                  </Text>
                  <ChevronDown size={18} color={themeColors.textMuted} />
                </Pressable>
              </View>
            ) : null}

            <View className="px-3 pb-2">
              {activeActions.map((action) => (
                <ActionRow
                  key={action.key}
                  icon={action.icon}
                  title={action.title}
                  subtitle={action.subtitle}
                  selected={isPick && pickSelected === action.key}
                  onPress={handleRow(action.key)}
                />
              ))}
              {isPick && pickAllowNone ? (
                <ActionRow
                  icon={<View className="h-2 w-2 rounded-full bg-muted-foreground" />}
                  title={I18n.t('settings.quick_entry.add_button.action_none')}
                  subtitle={I18n.t('add_action.none_subtitle')}
                  selected={pickSelected === 'none'}
                  onPress={handleNone}
                />
              ) : null}
            </View>
          </View>
        </Pressable>
      </Pressable>
      {/* Same account picker used across the app, as an in-modal overlay so it
          layers over this sheet without nesting a second Modal. */}
      {showAccounts ? (
        <AccountPickerSheet
          overlay
          visible={accountPickerVisible}
          onClose={() => setAccountPickerVisible(false)}
          accounts={accountList}
          accountGroups={accountGroups ?? []}
          selectedAccountId={selectedAccountId ?? null}
          onSelect={(accountId) => {
            onSelectAccount?.(accountId);
            setAccountPickerVisible(false);
          }}
        />
      ) : null}
    </ThemeModal>
  );
}

interface ActionRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  selected?: boolean;
  onPress: () => void;
}

function ActionRow({ icon, title, subtitle, selected, onPress }: ActionRowProps) {
  const themeColors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      className={cn(
        'flex-row items-center gap-3 rounded-2xl px-3 py-3.5',
        selected ? 'bg-primary/10' : '',
      )}
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
      {selected ? <Check size={18} color={themeColors.primary} /> : null}
    </Pressable>
  );
}
