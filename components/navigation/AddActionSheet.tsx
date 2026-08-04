import { Check, ChevronDown, ChevronLeft, Settings2 } from 'lucide-react-native';
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '~/components/feedback/AppErrorBoundary';
import { AccountLogo } from '~/components/ui/AccountLogo';
import { AccountPickerSheet } from '~/components/ui/AccountPickerSheet';
import { ClayIcon } from '~/components/ui/ClayIcon';
import { Text } from '~/components/ui/text';
import { ThemeModal } from '~/components/ui/theme-modal';
import { useReceiptScans } from '~/context/ReceiptScanContext';
import { VoiceCaptureOverlay } from '~/features/transactions/components/VoiceCaptureOverlay';
import { usePagerTabSync } from '~/hooks/usePagerTabSync';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { ScanIntent } from '~/services/scanCameraNavigation';
import {
  claimInlineVoiceHost,
  getVoiceCaptureState,
  subscribeVoiceCapture,
  type VoiceCaptureState,
} from '~/services/voiceCaptureBridge';
import type { Account, AccountGroup, AddButtonAction } from '~/types';
import { cn } from '~/utils';

// expo-camera is a native module; lazy-load the viewfinder so it stays off the
// cold-start path and a dev client without the pod can still open this sheet.
const InlineReceiptCamera = lazy(() =>
  import('~/features/transactions/components/InlineReceiptCamera').then((m) => ({
    default: m.InlineReceiptCamera,
  })),
);

type SheetTab = 'add' | 'split';
const TAB_ORDER: SheetTab[] = ['add', 'split'];

/** Viewfinder height when the camera takes over the sheet's tile grid. */
const VIEWFINDER_HEIGHT = 296;

// Fixed height for the swipeable grid pager (two rows of tiles). The Add tab
// fills both rows; the shorter Split tab is centered within the same height so
// the sheet doesn't jump as you swipe between tabs.
const GRID_PAGE_HEIGHT = 280;

/** Listening panel height. Matches the tile grid so the sheet doesn't jump. */
const VOICE_PANEL_HEIGHT = GRID_PAGE_HEIGHT;

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
  /** Open a new expense directly in the split-bill editor. */
  onSplitManual?: () => void;
  /** Opens Quick Entry settings so the user can reconfigure the + button. */
  onSettings?: () => void;
  /** Only shown when voice quick-entry is enabled/supported. */
  /** Starts a tap-to-stop voice session. Resolve false when the device cannot
   *  listen, so the sheet drops straight back to the tiles. */
  onVoice?: () => void | boolean | Promise<void | boolean>;
  /** Recognises what was said and ends the session the sheet started. */
  onVoiceStop?: () => void;
  /** Abandons the session without producing a preview. */
  onVoiceCancel?: () => void;
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
  onSplitManual,
  onSettings,
  onVoice,
  onVoiceStop,
  onVoiceCancel,
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
  const { canStartScan, scanReceiptImage } = useReceiptScans();
  const [accountPickerVisible, setAccountPickerVisible] = useState(false);
  const [tab, setTab] = useState<SheetTab>('add');
  // Non-null while the viewfinder has taken over the tile grid. The scan tiles
  // swap this sheet's body rather than dismissing it and raising a second one,
  // so the account chip stays put and cancelling lands back on the tiles.
  const [scanIntent, setScanIntent] = useState<ScanIntent | null>(null);
  // Same idea for voice: the Voice tile swaps the grid for the listening panel
  // rather than dimming the whole app behind a floating mic.
  const [voiceActive, setVoiceActive] = useState(false);
  const [voice, setVoice] = useState<VoiceCaptureState>({
    recording: false,
    liveTranscript: '',
    endedNonce: 0,
  });
  // The bridge's `endedNonce` as of the moment this sheet asked for a session.
  // Anything past it means that session is over.
  const baselineNonceRef = useRef(0);
  const isPick = mode === 'pick';

  const pagerRef = useRef<PagerView>(null);
  const activeTabIndex = TAB_ORDER.indexOf(tab);
  const { positionRef: pagerPositionRef, onPageScrollStateChanged } = usePagerTabSync(
    pagerRef,
    activeTabIndex,
  );

  // Land on the tab holding the currently-mapped action when the picker opens.
  useEffect(() => {
    if (!visible) {
      // Drop the camera and the mic when the sheet goes away, so reopening
      // starts on the tiles and the native preview is torn down rather than
      // left running.
      setScanIntent(null);
      setVoiceActive(false);
      return;
    }
    setTab(isPick && pickSelected === 'split' ? 'split' : 'add');
  }, [visible, isPick, pickSelected]);

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
        icon: <ClayIcon name="entry/keypad" size={40} />,
        title: I18n.t('add_action.quick_title'),
        subtitle: I18n.t('add_action.quick_subtitle'),
      },
      {
        key: 'full',
        icon: <ClayIcon name="entry/pencil-edit" size={40} />,
        title: I18n.t('add_action.full_title'),
        subtitle: I18n.t('add_action.full_subtitle'),
      },
      {
        key: 'scan',
        icon: <ClayIcon name="insights/receipt-scan" size={42} />,
        title: I18n.t('add_action.scan_title'),
        subtitle: I18n.t('add_action.scan_subtitle'),
      },
    ];
    if (showVoice) {
      list.push({
        key: 'voice',
        icon: <ClayIcon name="entry/mic" size={44} />,
        title: I18n.t('add_action.voice_title'),
        subtitle: I18n.t('add_action.voice_subtitle'),
      });
    }
    return list;
  }, [showVoice]);

  const splitActions = useMemo<ActionSpec[]>(
    () => [
      {
        key: 'split',
        icon: <ClayIcon name="money-time/split-bill" size={42} />,
        title: I18n.t('add_action.split_manual_title'),
        subtitle: I18n.t('add_action.split_manual_subtitle'),
      },
      {
        key: 'splitScan',
        icon: <ClayIcon name="money-time/receipt" size={40} />,
        title: I18n.t('add_action.split_scan_title'),
        subtitle: I18n.t('add_action.split_scan_subtitle'),
      },
    ],
    [],
  );

  // The scan and voice tiles are absent on purpose: they take over this sheet's
  // body (see handleTile) rather than handing off to a caller.
  const runHandlers: Record<AddButtonAction, (() => void) | undefined> = {
    quick: onQuick,
    full: onFull,
    scan: undefined,
    voice: undefined,
    split: onSplitManual,
    splitScan: undefined,
  };

  const SCAN_TILE_INTENT: Partial<Record<AddButtonAction, ScanIntent>> = {
    scan: 'quick',
    splitScan: 'split',
  };

  const handleTile = (key: AddButtonAction) => {
    void triggerHaptic('selection');
    if (isPick) {
      onClose();
      onPickAction?.(key);
      return;
    }

    if (key === 'voice') {
      baselineNonceRef.current = getVoiceCaptureState().endedNonce;
      // Stay open and swap the grid for the listening panel. onVoice resolves
      // false when the device cannot listen at all (it has already explained
      // why), in which case there is nothing to show.
      setVoiceActive(true);
      void Promise.resolve(onVoice?.()).then((started) => {
        if (started === false) setVoiceActive(false);
      });
      return;
    }

    const intent = SCAN_TILE_INTENT[key];
    if (intent) {
      // Stay open and swap the grid for the viewfinder. The gate runs first, so
      // a free user over the limit still gets the paywall and never sees a
      // camera they cannot use.
      if (!canStartScan(intent)) {
        onClose();
        return;
      }
      setScanIntent(intent);
      return;
    }

    onClose();
    // Defer so the sheet dismiss animation doesn't race the navigation/capture.
    setTimeout(() => runHandlers[key]?.(), 0);
  };

  // Claim the capture UI so the full-screen overlay stands down, and mirror the
  // live session into local state. Only while the panel is actually up: an idle
  // claim would suppress the + button's own press-and-hold overlay.
  useEffect(() => {
    if (!voiceActive) return undefined;
    const release = claimInlineVoiceHost();
    const unsubscribe = subscribeVoiceCapture(setVoice);
    return () => {
      unsubscribe();
      release();
    };
  }, [voiceActive]);

  // Close once the session ends. Driven by the bridge's explicit end signal
  // rather than by watching `recording` fall: a session refused up front
  // (permission denied, Pro limit) never sets `recording` true at all, and
  // inferring the end from that would strand the panel on "Listening…".
  useEffect(() => {
    if (!voiceActive) return;
    if (voice.endedNonce !== baselineNonceRef.current) {
      setVoiceActive(false);
      onClose();
    }
  }, [voiceActive, voice.endedNonce, onClose]);

  // "I'm done speaking": recognise what was said. The session owner ends the
  // session, which the effect above turns into the sheet dismissal — the sheet
  // must be gone before the preview appears, or the two would stack.
  const stopVoice = useCallback(() => {
    void triggerHaptic('selection');
    onVoiceStop?.();
  }, [onVoiceStop]);

  // "I picked the wrong tile": abandon the session and go back to the grid, with
  // no preview. Local state is cleared first so the end signal that follows
  // finds no active panel and leaves the sheet open.
  const cancelVoice = useCallback(() => {
    void triggerHaptic('selection');
    setVoiceActive(false);
    onVoiceCancel?.();
  }, [onVoiceCancel]);

  const closeScan = useCallback(() => {
    void triggerHaptic('selection');
    setScanIntent(null);
  }, []);

  const handleScanCaptured = useCallback(
    (path: string, source: 'camera' | 'library') => {
      const intent = scanIntent ?? 'quick';
      setScanIntent(null);
      onClose();
      scanReceiptImage(path, source, intent);
    },
    [onClose, scanIntent, scanReceiptImage],
  );

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
      <Pressable
        style={styles.backdrop}
        onPress={() => {
          setScanIntent(null);
          if (voiceActive) cancelVoice();
          onClose();
        }}
      >
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
              {scanIntent || voiceActive ? (
                /* The tabs would go nowhere mid-capture, so the header becomes a
                   way back to them. The account chip stays: it is what the scan
                   will post to. */
                <View className="flex-row items-center gap-2.5">
                  <Pressable
                    onPress={voiceActive ? cancelVoice : closeScan}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('common.back')}
                    hitSlop={8}
                    className="h-9 w-9 items-center justify-center rounded-full bg-secondary/50 active:opacity-70"
                  >
                    <ChevronLeft size={18} color={themeColors.textMuted} />
                  </Pressable>
                  <Text variant="subheading" numberOfLines={1}>
                    {I18n.t(
                      voiceActive
                        ? 'add_action.voice_title'
                        : scanIntent === 'split'
                          ? 'add_action.split_scan_title'
                          : 'add_action.scan_title',
                    )}
                  </Text>
                </View>
              ) : (
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
                          style={{
                            backgroundColor: isActive ? themeColors.primary : 'transparent',
                          }}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              )}

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
                      goalEmoji={selectedAccount.goalEmoji}
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

              {!isPick && onSettings && !scanIntent && !voiceActive ? (
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

            {voiceActive ? (
              // Tap anywhere on the panel to stop, matching the full-screen
              // overlay's tap-to-stop behaviour.
              <Pressable onPress={stopVoice} accessibilityRole="button">
                <VoiceCaptureOverlay
                  variant="inline"
                  height={VOICE_PANEL_HEIGHT}
                  visible
                  starting={!voice.recording}
                  liveTranscript={voice.liveTranscript}
                  hint={voice.hint}
                />
              </Pressable>
            ) : scanIntent ? (
              <View className="pt-3.5">
                <AppErrorBoundary fallback={<CameraUnavailable onDismiss={closeScan} />}>
                  <Suspense
                    fallback={
                      <View
                        className="mx-4 items-center justify-center rounded-[22px] bg-black"
                        style={{ height: VIEWFINDER_HEIGHT }}
                      >
                        <ActivityIndicator color="#fff" />
                      </View>
                    }
                  >
                    <InlineReceiptCamera
                      viewfinderHeight={VIEWFINDER_HEIGHT}
                      onCaptured={handleScanCaptured}
                    />
                  </Suspense>
                </AppErrorBoundary>
              </View>
            ) : (
              <PagerView
                ref={pagerRef}
                style={styles.pager}
                initialPage={activeTabIndex}
                onPageSelected={handlePageSelected}
                onPageScrollStateChanged={onPageScrollStateChanged}
              >
                <View key="add" collapsable={false} className="flex-1">
                  {renderGrid(addActions)}
                </View>
                <View key="split" collapsable={false} className="flex-1">
                  {renderGrid(splitActions)}
                </View>
              </PagerView>
            )}

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

/** The native camera module failed to load (an un-rebuilt dev client): fall
 *  back to the tile grid rather than a black rectangle. */
function CameraUnavailable({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    onDismiss();
  }, [onDismiss]);
  return null;
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
      {/* No tinted disc: the clay glyph carries its own colour and depth, and a
          plate behind it reads as a competing container. The fixed box keeps
          differently-sized glyphs on one baseline. */}
      <View className="mb-2 h-14 w-14 items-center justify-center">{icon}</View>
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
