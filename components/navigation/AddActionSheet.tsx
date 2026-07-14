import {
  Camera,
  Check,
  ChevronDown,
  Mic,
  Pencil,
  ReceiptText,
  Settings2,
  SplitSquareHorizontal,
  Zap,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view';
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
const TAB_ORDER: SheetTab[] = ['add', 'split'];

// Fixed height for the swipeable grid pager (two rows of tiles). The Add tab
// fills both rows; the shorter Split tab is centered within the same height so
// the sheet doesn't jump as you swipe between tabs.
const GRID_PAGE_HEIGHT = 280;

interface AddActionSheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * 'run' (default) executes an add flow when a tile is tapped — used by the +
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
  /** Scan a receipt straight into the Split-by-Item editor. */
  onSplitScan?: () => void;
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
  /** Small caption shown above the tabs (e.g. the gesture being mapped). */
  title?: string;
  /** Called with the picked action (or 'none') in pick mode. */
  onPickAction?: (action: AddButtonAction | 'none') => void;
  /** Highlights the currently mapped action in pick mode. */
  pickSelected?: AddButtonAction | 'none';
  /** Offer a "Nothing" option (used for the hold gesture). */
  pickAllowNone?: boolean;
  /** Whether the voice tile should be offered in pick mode. */
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
  pager: {
    height: GRID_PAGE_HEIGHT,
  },
});

/**
 * Bottom sheet shown when tapping the + FAB (when "Show options" is on): a
 * swipeable "Add" / "Split" header over a 2-column grid of entry methods. In
 * `pick` mode the same sheet doubles as an action picker in Quick Entry
 * settings, mapping an action onto tap/hold.
 */
export function AddActionSheet({
  visible,
  onClose,
  mode = 'run',
  onQuick,
  onFull,
  onScan,
  onSplitManual,
  onSplitScan,
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

  const pagerRef = useRef<PagerView>(null);
  const activeTabIndex = TAB_ORDER.indexOf(tab);
  const pagerPositionRef = useRef(activeTabIndex);

  // Land on the tab holding the currently-mapped action when the picker opens.
  useEffect(() => {
    if (!visible) return;
    setTab(isPick && pickSelected === 'split' ? 'split' : 'add');
  }, [visible, isPick, pickSelected]);

  // Keep the pager aligned when the tab changes from a header tap.
  useEffect(() => {
    if (activeTabIndex === pagerPositionRef.current) return;
    pagerPositionRef.current = activeTabIndex;
    pagerRef.current?.setPage(activeTabIndex);
  }, [activeTabIndex]);

  const handlePageSelected = (event: PagerViewOnPageSelectedEvent) => {
    const position = event.nativeEvent.position;
    pagerPositionRef.current = position;
    const next = TAB_ORDER[position];
    if (next && next !== tab) {
      void triggerHaptic('selection');
      setTab(next);
    }
  };

  // Run mode always offers Voice — support is checked lazily on tap (the handler
  // shows a message on unsupported devices) rather than hiding the option. Pick
  // mode (mapping an action in settings) only offers it where it can actually run.
  const showVoice = isPick ? !!voiceAvailable : true;

  const addActions = useMemo<ActionSpec[]>(() => {
    const list: ActionSpec[] = [
      {
        key: 'quick',
        icon: <Zap size={30} color={themeColors.primary} />,
        title: I18n.t('add_action.quick_title'),
        subtitle: I18n.t('add_action.quick_subtitle'),
      },
      {
        key: 'full',
        icon: <Pencil size={30} color={themeColors.primary} />,
        title: I18n.t('add_action.full_title'),
        subtitle: I18n.t('add_action.full_subtitle'),
      },
      {
        key: 'scan',
        icon: <Camera size={30} color={themeColors.primary} />,
        title: I18n.t('add_action.scan_title'),
        subtitle: I18n.t('add_action.scan_subtitle'),
      },
    ];
    if (showVoice) {
      list.push({
        key: 'voice',
        icon: <Mic size={30} color={themeColors.primary} />,
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
        icon: <SplitSquareHorizontal size={30} color={themeColors.primary} />,
        title: I18n.t('add_action.split_manual_title'),
        subtitle: I18n.t('add_action.split_manual_subtitle'),
      },
      {
        key: 'splitScan',
        icon: <ReceiptText size={30} color={themeColors.primary} />,
        title: I18n.t('add_action.split_scan_title'),
        subtitle: I18n.t('add_action.split_scan_subtitle'),
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
    splitScan: onSplitScan,
  };

  const handleTile = (key: AddButtonAction) => {
    void triggerHaptic('selection');
    onClose();
    if (isPick) {
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

  const renderGrid = (list: ActionSpec[]) => {
    const rows: ActionSpec[][] = [];
    for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2));
    return (
      // Top-aligned (not centered) so a lone tile — e.g. the Split tab's single
      // Manual-split tile — sits in the top-left slot, exactly where the Add
      // tab's first tile is, instead of drifting to the vertical middle.
      <View className="px-4 pt-3" style={{ rowGap: 10 }}>
        {rows.map((pair, ri) => (
          <View key={ri} className="flex-row" style={{ columnGap: 10 }}>
            {pair.map((action) => (
              <GridTile
                key={action.key}
                icon={action.icon}
                title={action.title}
                subtitle={action.subtitle}
                selected={isPick && pickSelected === action.key}
                onPress={() => handleTile(action.key)}
              />
            ))}
            {/* Keep a lone tile at half width so the 2×2 grid stays aligned. */}
            {pair.length === 1 ? <View className="flex-1" /> : null}
          </View>
        ))}
      </View>
    );
  };

  return (
    <ThemeModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View
            className="bg-card rounded-t-[28px]"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          >
            {isPick && title ? (
              <Text variant="caption" tone="muted" className="px-5 pt-5">
                {title}
              </Text>
            ) : null}

            {/* Swipeable underline tab header (the sheet's title), with the
                account switch + settings inline on the right — all vertically
                centered on the labels. The active underline is absolutely
                positioned so it doesn't push the row's alignment off the text. */}
            <View className="flex-row items-center px-5 pt-4">
              <View className="flex-row gap-6">
                {TAB_ORDER.map((t) => {
                  const isActive = t === tab;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => {
                        if (isActive) return;
                        void triggerHaptic('selection');
                        setTab(t);
                      }}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: isActive }}
                      className="relative py-2"
                    >
                      <Text
                        variant="subheading"
                        className={cn(isActive ? 'text-foreground' : 'text-muted-foreground')}
                      >
                        {I18n.t(t === 'add' ? 'add_action.tab_add' : 'add_action.tab_split')}
                      </Text>
                      <View
                        className="absolute inset-x-0 bottom-0 h-0.5 rounded-full"
                        style={{ backgroundColor: isActive ? themeColors.primary : 'transparent' }}
                      />
                    </Pressable>
                  );
                })}
              </View>

              <View className="flex-1" />

              {showAccounts ? (
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    setAccountPickerVisible(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={selectedAccount?.name}
                  className="max-w-[150px] flex-row items-center gap-1.5 rounded-full bg-secondary/50 px-2.5 py-1.5 active:opacity-70"
                >
                  {selectedAccount ? (
                    <AccountLogo
                      logoId={selectedAccount.logoId}
                      type={selectedAccount.type}
                      size={18}
                    />
                  ) : null}
                  <Text
                    variant="caption"
                    className="shrink font-medium text-foreground"
                    numberOfLines={1}
                  >
                    {selectedAccount?.name ?? ''}
                  </Text>
                  <ChevronDown size={14} color={themeColors.textMuted} />
                </Pressable>
              ) : null}

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
                  className="ml-2 h-9 w-9 items-center justify-center rounded-full bg-secondary/50 active:opacity-70"
                >
                  <Settings2 size={18} color={themeColors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            <PagerView
              ref={pagerRef}
              style={styles.pager}
              initialPage={activeTabIndex}
              onPageSelected={handlePageSelected}
            >
              <View key="add" collapsable={false} className="flex-1">
                {renderGrid(addActions)}
              </View>
              <View key="split" collapsable={false} className="flex-1">
                {renderGrid(splitActions)}
              </View>
            </PagerView>

            {isPick && pickAllowNone ? (
              <Pressable
                onPress={handleNone}
                accessibilityRole="button"
                accessibilityState={{ selected: pickSelected === 'none' }}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                className={cn(
                  'mx-5 mt-1 flex-row items-center justify-center gap-2 rounded-2xl border border-border/40 py-3.5',
                  pickSelected === 'none' ? 'bg-primary/10' : '',
                )}
              >
                <Text variant="body" className="font-medium">
                  {I18n.t('settings.quick_entry.add_button.action_none')}
                </Text>
                {pickSelected === 'none' ? <Check size={18} color={themeColors.primary} /> : null}
              </Pressable>
            ) : null}
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

interface GridTileProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  selected?: boolean;
  onPress: () => void;
}

function GridTile({ icon, title, subtitle, selected, onPress }: GridTileProps) {
  const themeColors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      className={cn(
        'flex-1 items-center justify-center rounded-3xl border px-3 py-4',
        selected ? 'border-primary/50 bg-primary/10' : 'border-border/30 bg-secondary/30',
      )}
    >
      {selected ? (
        <View className="absolute right-2.5 top-2.5">
          <Check size={16} color={themeColors.primary} />
        </View>
      ) : null}
      <View className="mb-2 h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        {icon}
      </View>
      <Text variant="bodyStrong" className="text-center" numberOfLines={1}>
        {title}
      </Text>
      <Text
        tone="muted"
        className="mt-0.5 text-center text-[11px] leading-[14px]"
        numberOfLines={1}
      >
        {subtitle}
      </Text>
    </Pressable>
  );
}
