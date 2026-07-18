import './global.css';
// Register the background task handler before anything else mounts — the
// OS may invoke it before any React component renders.
import './services/autoBackupTaskRegistration';

import {
  WorkSans_400Regular,
  WorkSans_500Medium,
  WorkSans_600SemiBold,
  WorkSans_700Bold,
  WorkSans_800ExtraBold,
  WorkSans_900Black,
} from '@expo-google-fonts/work-sans';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import * as Sentry from '@sentry/react-native';
import { useFonts } from 'expo-font';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Appearance,
  AppState,
  Image,
  InteractionManager,
  Platform,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '~/components/feedback/AppErrorBoundary';
import { type MascotName, MascotWarmup } from '~/components/feedback/Mascot';
import { AddActionSheet } from '~/components/navigation/AddActionSheet';
import { AddFab } from '~/components/navigation/AddFab';
import { BottomNav, type TabName } from '~/components/navigation/BottomNav';
import {
  BottomNavMinimizeProvider,
  useBottomNavMinimize,
} from '~/components/navigation/BottomNavMinimize';
import { TodayJumpFab } from '~/components/navigation/TodayJumpFab';
import {
  AccountLogoPickerSheet,
  Button,
  ItemIconPickerSheet,
  Text,
  ThemeModal,
} from '~/components/ui';
import { AppProvider, useApp, useTransactions } from '~/context/AppContext';
import { ProProvider, usePro } from '~/context/ProContext';
import {
  ReceiptScanProvider,
  type ScanOutcome,
  useReceiptScans,
} from '~/context/ReceiptScanContext';
import { SplitBillSessionProvider } from '~/context/SplitBillSession';
import { TabVisibilityProvider } from '~/context/TabVisibilityContext';
import { ThemeProvider, useResolvedTheme } from '~/context/ThemeContext';
import {
  AddAlbumTransactionsScreen,
  AlbumDetailScreen,
  AlbumsScreen,
  CreateAlbumScreen,
  EditAlbumDetailsScreen,
  EditAlbumTransactionsScreen,
} from '~/features/albums/screens';
import {
  consumePendingCategoryAllocation,
  setPendingCategoryAllocation,
} from '~/features/budget/lib/categoryAllocationBridge';
import {
  BudgetTemplateEditorScreen,
  BudgetTemplatesScreen,
  CategoryAllocationScreen,
  MonthlyBudgetEditorScreen,
} from '~/features/budget/screens';
import { CalendarScreen } from '~/features/calendar/screens';
import { InsightsDrilldownScreen, InsightsScreen } from '~/features/insights/screens';
import { AssetsTab } from '~/features/items/components';
import {
  consumePendingItemIconPicker,
  setPendingItemIconPicker,
} from '~/features/items/lib/itemIconPickerBridge';
import { ItemEditorScreen, ItemsScreen } from '~/features/items/screens';
import { FeatureAnnouncementModal } from '~/features/news/components/FeatureAnnouncementModal';
import type { FeatureAnnouncement } from '~/features/news/featureAnnouncements';
import { OnboardingFlow } from '~/features/onboarding/screens';
import { ReviewPrePromptSheet } from '~/features/reviewPrompt/components/ReviewPrePromptSheet';
import { BiometricLockGate } from '~/features/settings/components/BiometricLockGate';
import { CloudBackupPromptModal } from '~/features/settings/components/CloudBackupPromptModal';
import {
  consumePendingAccountLogoPicker,
  setPendingAccountLogoPicker,
} from '~/features/settings/lib/accountLogoPickerBridge';
import {
  AccountEditorScreen,
  AccountGroupEditorScreen,
  AccountsScreen,
  AddWageMonthScreen,
  AutoBackupScreen,
  CategoryEditorScreen,
  ExchangeRatesScreen,
  HourlyValueScreen,
  PayCreditCardScreen,
  ProPaywallScreen,
  QuickEntrySettingsScreen,
  RecurringScreen,
  SettingsStack,
  ShareAndEarnScreen,
  WageCalculatorFlowScreen,
} from '~/features/settings/screens';
import { TransactionEditorScreen } from '~/features/transactions/components';
import { QuickAddWarmup } from '~/features/transactions/components/QuickAddWarmup';
import {
  type VoiceQuickAddHandle,
  VoiceQuickAddOverlay,
} from '~/features/transactions/components/VoiceQuickAddOverlay';
import {
  resolveAutoLogEntry,
  selectDrainableAutoLogEntries,
} from '~/features/transactions/lib/autoLog';
import { buildAutoLogCatalog } from '~/features/transactions/lib/autoLogCatalog';
import { pickDefaultAccountId } from '~/features/transactions/lib/entryDefaults';
import { setReceiptSplitLaunch } from '~/features/transactions/lib/receiptSplitBridge';
import {
  AddTransactionScreen,
  EditTransactionScreen,
  QuickAddScreen,
  ReceiptSplitScreen,
  ScanReceiptCameraScreen,
  SettleUpPersonScreen,
  SettleUpScreen,
  SettleUpSettingsScreen,
  SettleUpTransactionScreen,
  SplitBillScreen,
} from '~/features/transactions/screens';
import { TutorialCoachmarkOverlay } from '~/features/tutorial/components/TutorialCoachmarkOverlay';
import type {
  TutorialSpotlightRequest,
  TutorialTargetId,
  TutorialTargetRect,
} from '~/features/tutorial/types';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useProGate } from '~/hooks/useProGate';
import { useThemeVars } from '~/hooks/useThemeVars';
import { I18n } from '~/lib/i18n';
import {
  type RootMainNavigationProp,
  RootStack,
  type RootStackParamList,
  type RootStackRouteProps,
} from '~/navigation/rootStack';
import { SHARED_NATIVE_STACK_OPTIONS } from '~/navigation/stackOptions';
import { createNativeStackSwipeHapticListeners } from '~/navigation/swipeBackHaptics';
import { subscribeRunAddAction } from '~/services/addActionNavigation';
import { AnalyticsEvents, setCurrentScreen, trackEvent } from '~/services/analytics';
import {
  clearAutoLogPending,
  clearAutoLogPendingScans,
  isAutoLogSupported,
  readAutoLogPending,
  readAutoLogPendingScans,
  subscribeAutoLogDrain,
  writeAutoLogCatalog,
} from '~/services/autoLog';
import { requestCalendarGoToToday } from '~/services/calendarNavigation';
import {
  checkEligibility as checkCloudBackupEligibility,
  getCloudBackupPromptState,
  recordCloudBackupPromptShown,
} from '~/services/cloudBackupPrompt';
import { subscribeMoney2TimeDeepLinks } from '~/services/deepLinks';
import { beforeBreadcrumbFilter, beforeSendEvent, reportError } from '~/services/errorReporting';
import {
  getLatestUnseenAnnouncementForUser,
  markFeatureAnnouncementSeen,
} from '~/services/featureAnnouncementState';
import {
  isAnyPromptVisible,
  markPromptHidden,
  markPromptVisible,
} from '~/services/globalPromptCoordinator';
import { subscribeOpenHourlyValueRequest } from '~/services/hourlyValueNavigation';
import { subscribeOpenPaywallRequest } from '~/services/paywallNavigation';
import { downscaleReceiptForStorage } from '~/services/receiptImage';
import { subscribeOpenReceiptSplit } from '~/services/receiptSplitNavigation';
import { recordInsightsView } from '~/services/reviewPrompt';
import { subscribeOpenScanCamera } from '~/services/scanCameraNavigation';
import { requestOpenAutoLogSettings } from '~/services/autoLogNavigation';
import { subscribeOpenScanReview } from '~/services/scanReviewNavigation';
import { isSpeechRecognitionAvailable } from '~/services/speechRecognition';
import { requestOpenTab, subscribeOpenTabRequest } from '~/services/tabNavigation';
import {
  requestOpenTransactions,
  subscribeOpenTransactionsRequest,
} from '~/services/transactionsNavigation';
import { saveReceiptImage } from '~/services/userAssets';
import {
  buildMoney2TimeWidgetSnapshot,
  parseSavingsExclusions,
  reloadMoney2TimeWidgets,
  writeMoney2TimeWidgetSnapshot,
} from '~/services/widgetSnapshot';
import type { AddButtonAction, CategoryType, TransactionWithRelations, WageConfig } from '~/types';
import {
  dayKeyFromIsoLocal,
  monthKeyFromDateLocal,
  monthKeyFromIsoLocal,
} from '~/utils/formatters';
Sentry.init({
  // Read from Expo public env (EXPO_PUBLIC_* is inlined at build time). Left
  // undefined when unset, which disables Sentry rather than crashing.
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,

  // Finance app: never send IP, cookies, request bodies, or user PII.
  sendDefaultPii: false,

  // Sentry Logs product stays off; error monitoring does not need it.
  enableLogs: false,

  // Dedupe + volume-cap + PII scrub so a render loop can't burn the quota and
  // no financial data leaves the device. See services/errorReporting.
  beforeSend: (event) => beforeSendEvent(event),
  beforeBreadcrumb: (breadcrumb) => beforeBreadcrumbFilter(breadcrumb),
});

type MainTab = TabName;
const MAIN_TAB_ORDER: MainTab[] = ['calendar', 'accounts', 'insights', 'albums', 'settings'];
type ActivityInsightType =
  | 'expense_breakdown'
  | 'income_breakdown'
  | 'expense_trend'
  | 'expense_sentiment'
  | 'asset_history';
type ActivityInsightPeriodPreset = 'week' | 'month' | 'year' | 'custom';

type FontScalingNativeComponent = {
  defaultProps?: Record<string, unknown>;
};

// Hold the native splash until the first page is fully ready (fonts + data +
// theme), so no intermediate loading UI flashes before real content paints.
void SplashScreen.preventAutoHideAsync();

function disableDynamicType(component: FontScalingNativeComponent) {
  component.defaultProps = {
    ...component.defaultProps,
    allowFontScaling: false,
    maxFontSizeMultiplier: 1,
  };
}

disableDynamicType(RNText as unknown as FontScalingNativeComponent);
disableDynamicType(RNTextInput as unknown as FontScalingNativeComponent);

interface ActivityBreakdownInsightRequest {
  insightType: ActivityInsightType;
  monthKey: string;
  anchorDateKey?: string;
  customEnd?: string;
  customStart?: string;
  periodPreset?: ActivityInsightPeriodPreset;
  token: number;
}

interface ActivityInsightOpenOptions {
  anchorDateKey?: string;
  customEnd?: string;
  customStart?: string;
  periodPreset?: ActivityInsightPeriodPreset;
}

interface GuidedTutorialStep {
  tab: MainTab;
  targetId: TutorialTargetId;
  titleKey: string;
  bodyKey: string;
  mascot: MascotName;
}

const GUIDED_TUTORIAL_STEPS: GuidedTutorialStep[] = [
  {
    tab: 'calendar',
    targetId: 'nav.add',
    titleKey: 'tutorial.coach_steps.add_title',
    bodyKey: 'tutorial.coach_steps.add_body',
    mascot: 'excited',
  },
  {
    tab: 'calendar',
    targetId: 'nav.tabs',
    titleKey: 'tutorial.coach_steps.tabs_title',
    bodyKey: 'tutorial.coach_steps.tabs_body',
    mascot: 'happy',
  },
  {
    tab: 'insights',
    targetId: 'insights.type_selector',
    titleKey: 'tutorial.coach_steps.insights_title',
    bodyKey: 'tutorial.coach_steps.insights_body',
    mascot: 'rich',
  },
  {
    tab: 'settings',
    targetId: 'settings.recurring',
    titleKey: 'tutorial.coach_steps.recurring_title',
    bodyKey: 'tutorial.coach_steps.recurring_body',
    mascot: 'sleepy',
  },
  {
    tab: 'settings',
    targetId: 'settings.statement_import',
    titleKey: 'tutorial.coach_steps.statement_import_title',
    bodyKey: 'tutorial.coach_steps.statement_import_body',
    mascot: 'announce',
  },
  {
    tab: 'settings',
    targetId: 'settings.management',
    titleKey: 'tutorial.coach_steps.management_title',
    bodyKey: 'tutorial.coach_steps.management_body',
    mascot: 'love',
  },
  {
    tab: 'settings',
    targetId: 'settings.start_tutorial',
    titleKey: 'tutorial.coach_steps.settings_title',
    bodyKey: 'tutorial.coach_steps.settings_body',
    mascot: 'celebrate',
  },
];

const MemoAccountsScreen = React.memo(AccountsScreen);
const MemoCalendarScreen = React.memo(CalendarScreen);
const MemoInsightsScreen = React.memo(InsightsScreen);
const MemoAlbumsScreen = React.memo(AlbumsScreen);
const MemoSettingsStack = React.memo(SettingsStack);
const MemoAssetsTab = React.memo(AssetsTab);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabSlot: {
    ...StyleSheet.absoluteFillObject,
  },
  tabVisible: { opacity: 1 },
  tabHidden: { opacity: 0 },
});

function MountedTab({
  active,
  shouldPreload = false,
  children,
}: {
  active: boolean;
  shouldPreload?: boolean;
  children: React.ReactNode;
}) {
  // Each tab renders nothing until it either becomes active or is flagged
  // for preload by the shell. Mounting all 5 tabs on the first render after
  // data loads would stagger the home tab as the others run FlashList
  // measurements, effects, and theme resolution in parallel — so the shell
  // mounts home first, then progressively flips `shouldPreload` per tab via
  // InteractionManager, paying each mount cost in the background instead of
  // on the user's first tap. Once mounted, the tab stays mounted.
  const hasBeenActiveRef = useRef(active);
  if (active) hasBeenActiveRef.current = true;
  const shouldMount = hasBeenActiveRef.current || shouldPreload;

  return (
    <View
      pointerEvents={active ? 'auto' : 'none'}
      style={[styles.tabSlot, active ? styles.tabVisible : styles.tabHidden]}
    >
      {shouldMount ? (
        <TabVisibilityProvider visible={active}>{children}</TabVisibilityProvider>
      ) : null}
    </View>
  );
}

function ThemeGate({ children }: { children: React.ReactNode }) {
  const { settings } = useApp();
  const { setColorScheme } = useColorScheme();
  const themeMode = settings?.themeMode ?? 'system';
  const themeColor = settings?.themeColor ?? 'rosewood';
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(
    () => Appearance.getColorScheme() ?? 'light',
  );

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme ?? 'light');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    setColorScheme(themeMode === 'system' ? 'system' : themeMode);
  }, [themeMode, setColorScheme]);

  const resolved: 'light' | 'dark' = themeMode === 'system' ? systemScheme : themeMode;

  return (
    <ThemeProvider resolvedTheme={resolved} themeColor={themeColor}>
      {children}
    </ThemeProvider>
  );
}

interface MainShellScreenProps {
  navigation: RootMainNavigationProp;
  onVisibleScreenChange?: (screen: string) => void;
  /** Fired when the user switches into the Settings tab (a tab swap, not a
   *  native push) — a safe moment to surface the cloud-backup nudge. */
  onEnterSettingsTab?: () => void;
  tutorialStartToken?: number;
}

function MainShellScreen({
  navigation,
  onVisibleScreenChange,
  onEnterSettingsTab,
  tutorialStartToken = 0,
}: MainShellScreenProps) {
  const { isSimpleMode, quickEntryPrefs, items, accounts, accountGroups, updateQuickEntryPrefs } =
    useApp();
  const { checkLimit } = useProGate();
  const { startScan } = useReceiptScans();
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const voiceHandleRef = useRef<VoiceQuickAddHandle | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  // A voice start requested before the capture overlay had mounted (the support
  // probe hadn't resolved yet) — fulfilled once the overlay's handle is wired.
  const voiceStartPendingRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await isSpeechRecognitionAvailable();
      if (!cancelled) setVoiceSupported(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  // Whether the capture overlay + long-press shortcut are wired up. Note this
  // does NOT gate the "Voice" tile in the add sheet — that is always shown and
  // checks support lazily on tap (see handleVoiceTap), so an unsupported device
  // gets a clear message instead of a silently missing option.
  const voiceEnabled = voiceSupported;

  // Start voice capture, checking support lazily so the add-sheet tile is always
  // tappable. Unsupported devices get an explanatory alert; supported devices
  // that tapped before the probe resolved mount the overlay then start.
  const handleVoiceTap = useCallback(async () => {
    const ok = await isSpeechRecognitionAvailable();
    if (!ok) {
      Alert.alert(
        I18n.t('add_action.voice_unavailable_title'),
        I18n.t('add_action.voice_unavailable_message'),
      );
      return;
    }
    if (voiceHandleRef.current) {
      voiceHandleRef.current.startTap();
      return;
    }
    voiceStartPendingRef.current = true;
    setVoiceSupported(true);
  }, []);

  // Child effects run before parent effects, so by the time this fires after the
  // overlay mounts, its imperative handle is already set.
  useEffect(() => {
    if (!voiceEnabled || !voiceStartPendingRef.current) return;
    voiceStartPendingRef.current = false;
    voiceHandleRef.current?.startTap();
  }, [voiceEnabled]);
  const shellRootRef = useRef<View>(null);
  // Window-space origin of the shell root. `measureInWindow` returns
  // coordinates relative to the native window; on Android (and sometimes on
  // iOS with tall status bars) the shell's render origin isn't (0,0) in that
  // space because of `react-native-screens` fragment insets and edge-to-edge
  // status bar handling. We measure the shell's window position on layout and
  // subtract it from target rects so tutorial highlights render in the
  // overlay's local coordinate space.
  const [shellWindowOrigin, setShellWindowOrigin] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [isGuidedTutorialActive, setIsGuidedTutorialActive] = useState(false);
  const [guidedTutorialStepIndex, setGuidedTutorialStepIndex] = useState(0);
  const [tutorialTargetRects, setTutorialTargetRects] = useState<
    Partial<Record<TutorialTargetId, TutorialTargetRect>>
  >({});
  const [tutorialNavTabRects, setTutorialNavTabRects] = useState<
    Partial<Record<MainTab, TutorialTargetRect>>
  >({});
  const [tutorialSpotlightRequestToken, setTutorialSpotlightRequestToken] = useState(0);
  const [activeTab, setActiveTab] = useState<MainTab>('calendar');
  const [isCalendarSelectionMode, setIsCalendarSelectionMode] = useState(false);
  const [showCalendarTodayButton, setShowCalendarTodayButton] = useState(false);
  const [accountsScrollTopToken, setAccountsScrollTopToken] = useState(0);
  const [accountsResetToken, setAccountsResetToken] = useState(0);
  const [calendarResetToken, setCalendarResetToken] = useState(0);
  const [calendarGoToDayRequest, setCalendarGoToDayRequest] = useState<{
    dayKey: string;
    token: number;
  } | null>(null);
  const [insightsResetToMonthToken, setInsightsResetToMonthToken] = useState(0);
  const [activityBreakdownInsightRequest, setActivityBreakdownInsightRequest] =
    useState<ActivityBreakdownInsightRequest | null>(null);
  const [albumsScrollTopToken, setAlbumsScrollTopToken] = useState(0);
  const [settingsCurrentScreen, setSettingsCurrentScreen] = useState('settings');
  const [settingsScrollTopToken, setSettingsScrollTopToken] = useState(0);
  const [settingsResetToken, setSettingsResetToken] = useState(0);
  const tutorialStartTokenRef = useRef(0);
  const previousActiveTabRef = useRef<MainTab | null>(null);
  const [preloadedTabs, setPreloadedTabs] = useState<Set<MainTab>>(() => new Set());
  // Drives the off-screen quick-add warm-up: mounted briefly during idle so the
  // first FAB tap doesn't pay the sheet's one-time module/view init cost.
  const [warmupQuickAdd, setWarmupQuickAdd] = useState(false);

  useEffect(() => {
    const order: MainTab[] = ['settings', 'insights', 'accounts', 'albums'];
    let cancelled = false;
    let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
    let pendingInteraction: ReturnType<typeof InteractionManager.runAfterInteractions> | null =
      null;

    const preloadAt = (index: number) => {
      if (cancelled || index >= order.length) return;
      pendingInteraction = InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;
        const tab = order[index];
        setPreloadedTabs((prev) => {
          if (prev.has(tab)) return prev;
          const next = new Set(prev);
          next.add(tab);
          return next;
        });
        pendingTimeout = setTimeout(() => preloadAt(index + 1), 120);
      });
    };

    pendingTimeout = setTimeout(() => preloadAt(0), 250);

    return () => {
      cancelled = true;
      if (pendingTimeout) clearTimeout(pendingTimeout);
      if (pendingInteraction) pendingInteraction.cancel();
    };
  }, []);

  useEffect(() => {
    // Warm up the quick-add sheet off-screen once the app is idle (after the
    // tabs have pre-loaded). This evaluates its lazy module graph and registers
    // the cold TextInput/keyboard-controller view classes so the first FAB tap
    // is as smooth as later ones. Unmount after a beat — the registrations stay
    // warm for the session.
    let cancelled = false;
    let unmountTimer: ReturnType<typeof setTimeout> | null = null;
    let interaction: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;

    const mountTimer = setTimeout(() => {
      interaction = InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;
        setWarmupQuickAdd(true);
        unmountTimer = setTimeout(() => setWarmupQuickAdd(false), 3000);
      });
    }, 1200);

    return () => {
      cancelled = true;
      clearTimeout(mountTimer);
      if (unmountTimer) clearTimeout(unmountTimer);
      if (interaction) interaction.cancel();
    };
  }, []);

  useEffect(() => {
    return subscribeOpenHourlyValueRequest(() => {
      navigation.navigate('SettingsHourlyValue');
    });
  }, [navigation]);

  useEffect(() => {
    return subscribeOpenPaywallRequest(({ source, flashMessage }) => {
      navigation.navigate('ProPaywall', { source, flashMessage });
    });
  }, [navigation]);

  useEffect(() => {
    return subscribeOpenScanCamera((intent) => {
      navigation.navigate('ScanReceiptCamera', intent === 'split' ? { intent } : undefined);
    });
  }, [navigation]);

  useEffect(() => {
    return subscribeOpenReceiptSplit(() => {
      // A finished itemized scan (or a Split-a-receipt request): the launch
      // payload is already on the receiptSplitBridge.
      navigation.navigate('ReceiptSplit');
    });
  }, [navigation]);

  useEffect(() => {
    return subscribeOpenScanReview((request) => {
      // A finished single-receipt scan: open the editor pre-filled with the
      // parsed values so the user reviews/edits before saving.
      navigation.navigate('AddTransactionDetailed', { initialValues: request.initialValues });
    });
  }, [navigation]);

  useEffect(() => {
    return subscribeOpenTransactionsRequest((request) => {
      setActiveTab('calendar');
      // Land the list on the transaction's own day (it may sit in an earlier
      // month) instead of snapping back to the current month.
      if (request.dayKey) {
        const dayKey = request.dayKey;
        setCalendarGoToDayRequest((prev) => ({ dayKey, token: (prev?.token ?? 0) + 1 }));
      } else {
        setCalendarResetToken((prev) => prev + 1);
      }
    });
  }, []);

  useEffect(() => {
    return subscribeOpenTabRequest(({ tab }) => {
      setActiveTab(tab);
    });
  }, []);

  const openAddTransaction = useCallback(() => {
    navigation.navigate('AddTransaction');
  }, [navigation]);

  // Open a fresh expense straight in the split-bill editor (manual split). No
  // amount is set, so the editor opens the split sheet in itemized mode.
  const openSplitManual = useCallback(() => {
    navigation.navigate('AddTransactionDetailed', {
      initialValues: { type: 'expense' },
      openSplitBill: true,
    });
  }, [navigation]);

  // Runs an add action for the + button (tap primary or the options sheet).
  // Voice uses tap-to-stop mode here (no hold).
  const runAddAction = useCallback(
    (action: AddButtonAction) => {
      if (action === 'scan') startScan();
      else if (action === 'voice') void handleVoiceTap();
      else if (action === 'full') navigation.navigate('AddTransactionDetailed');
      else if (action === 'split') openSplitManual();
      else if (action === 'splitScan') void startScan('split');
      else openAddTransaction(); // 'quick'
    },
    [startScan, openAddTransaction, openSplitManual, navigation, handleVoiceTap],
  );

  // iOS Back Tap runs the same entry flows as the + button, via the
  // `money2time://add?action=` deep link.
  useEffect(() => subscribeRunAddAction(runAddAction), [runAddAction]);

  // Resolve the + button's tap/hold behavior from Quick Entry prefs. When the
  // options sheet is on, tap opens the sheet and hold is a voice shortcut (when
  // available). When off, tap runs the primary action and hold the secondary.
  const useAddSheet = quickEntryPrefs.addUseActionSheet;
  const tapAction: AddButtonAction =
    quickEntryPrefs.addPrimaryAction === 'voice' && !voiceEnabled
      ? 'quick'
      : quickEntryPrefs.addPrimaryAction;
  const configuredHold: AddButtonAction | 'none' = useAddSheet
    ? voiceEnabled
      ? 'voice'
      : 'none'
    : quickEntryPrefs.addSecondaryAction;
  const holdAction: AddButtonAction | 'none' =
    configuredHold === 'voice' && !voiceEnabled ? 'none' : configuredHold;
  const holdIsVoice = holdAction === 'voice';

  // The default account the four entry flows post to, surfaced as a quick
  // switch on the add sheet. Shares the flows' own fallback so the chip row
  // highlights the real target.
  const defaultEntryAccountId = useMemo(
    () => pickDefaultAccountId(accounts, quickEntryPrefs.defaultAccountId),
    [accounts, quickEntryPrefs.defaultAccountId],
  );
  const handleSelectDefaultAccount = useCallback(
    (accountId: string) => updateQuickEntryPrefs({ defaultAccountId: accountId }),
    [updateQuickEntryPrefs],
  );

  const handleFabPress = useCallback(() => {
    if (useAddSheet) {
      setAddSheetVisible(true);
      return;
    }
    runAddAction(tapAction);
  }, [useAddSheet, runAddAction, tapAction]);

  const handleFabLongPress = useCallback(() => {
    if (holdAction === 'none') return;
    // Hold-voice uses press-and-hold (start on hold, stop on release); the
    // other actions fire once on hold-recognized.
    if (holdAction === 'voice') voiceHandleRef.current?.start();
    else runAddAction(holdAction);
  }, [holdAction, runAddAction]);

  const openTransactionEditor = useCallback(
    (transaction: TransactionWithRelations) => {
      navigation.navigate('EditTransaction', {
        transactionId: transaction.id,
      });
    },
    [navigation],
  );
  const openTransactionSplitBill = useCallback(
    (transaction: TransactionWithRelations) => {
      navigation.navigate('EditTransaction', {
        transactionId: transaction.id,
        openSplitBill: true,
      });
    },
    [navigation],
  );
  const openAccountDetail = useCallback(
    (accountId: string) => {
      navigation.navigate('AccountDetail', { accountId });
    },
    [navigation],
  );
  const openInsightsDrilldown = useCallback(
    (payload: RootStackParamList['InsightsDrilldown']) => {
      navigation.navigate('InsightsDrilldown', payload);
      void trackEvent(AnalyticsEvents.INSIGHTS_DRILLDOWN_OPENED, { screen: 'InsightsDrilldown' });
    },
    [navigation],
  );
  const openActivityBreakdownInsight = useCallback(
    (insightType: ActivityInsightType, monthKey: string, options?: ActivityInsightOpenOptions) => {
      setActivityBreakdownInsightRequest((previous) => ({
        insightType,
        monthKey,
        anchorDateKey: options?.anchorDateKey,
        customEnd: options?.customEnd,
        customStart: options?.customStart,
        periodPreset: options?.periodPreset,
        token: (previous?.token ?? 0) + 1,
      }));
      setActiveTab('insights');
    },
    [],
  );

  const openCreateAlbum = useCallback(() => {
    navigation.navigate('CreateAlbum');
  }, [navigation]);
  const openAlbumDetail = useCallback(
    (albumId: string) => {
      navigation.navigate('AlbumDetail', { albumId });
    },
    [navigation],
  );

  const openAccountSettings = useCallback(() => {
    navigation.navigate('SettingsAccounts');
  }, [navigation]);

  const openRecurringEditor = useCallback(
    (ruleId?: string) => {
      if (ruleId) {
        navigation.navigate('RecurringEditor', { ruleId });
      } else {
        navigation.navigate('RecurringEditor');
      }
    },
    [navigation],
  );

  const openItemEditor = useCallback(
    (itemId?: string) => {
      // Adding a new item is gated by the free-tier limit; editing is always allowed.
      if (!itemId && !checkLimit('items', items.length)) return;
      navigation.navigate('ItemEditor', itemId ? { itemId } : undefined);
    },
    [checkLimit, items.length, navigation],
  );

  const openBudgetTemplateEditor = useCallback(
    (params?: { templateId?: string; duplicateFromId?: string }) => {
      navigation.navigate('BudgetTemplateEditor', params);
    },
    [navigation],
  );

  const openMonthlyBudgetEditor = useCallback(
    (budgetId: string) => {
      navigation.navigate('BudgetMonthEditor', { budgetId });
    },
    [navigation],
  );

  const openCustomBudgetCreator = useCallback(
    (month: string) => {
      navigation.navigate('BudgetMonthEditor', { createForMonth: month });
    },
    [navigation],
  );

  const openBudgetTemplates = useCallback(() => {
    navigation.navigate('SettingsBudgetTemplates');
  }, [navigation]);

  const openProPaywall = useCallback(
    (source?: string) => {
      navigation.navigate('ProPaywall', source ? { source } : undefined);
    },
    [navigation],
  );
  // Stable per-tab prop wrappers. The five tab screens stay mounted for the
  // app's lifetime and are wrapped in React.memo, but inline arrow/render props
  // gave them a fresh identity on every MainShellScreen render — so each of the
  // ~7 app-level state settles during cold-start hydration re-rendered all five
  // tabs (100–390ms per cascade). Hoisting these to stable callbacks lets the
  // memo bail out so hidden tabs no longer recompute on unrelated churn.
  const openInsightsTrendPaywall = useCallback(
    () => openProPaywall('insights_trend'),
    [openProPaywall],
  );
  const openSettingsPaywall = useCallback(() => openProPaywall('settings'), [openProPaywall]);
  const openSettleUp = useCallback(() => navigation.navigate('SettleUp'), [navigation]);
  const openItemEditorFromAssets = useCallback(() => openItemEditor(), [openItemEditor]);
  const openAddTransactionForAccount = useCallback(
    (accountId: string) =>
      navigation.navigate('AddTransactionDetailed', { initialAccountId: accountId }),
    [navigation],
  );
  const openNetAssetsInsight = useCallback(
    () => openActivityBreakdownInsight('asset_history', monthKeyFromDateLocal(new Date())),
    [openActivityBreakdownInsight],
  );
  const renderAssetsItems = useCallback(
    () => <ItemsScreen embedded safeAreaEdges={[]} onOpenItem={openItemEditor} />,
    [openItemEditor],
  );

  const openAccountEditor = useCallback(
    (params?: { accountId?: string; presetGroupName?: string }) => {
      navigation.navigate('AccountEditor', params);
    },
    [navigation],
  );
  const openPayCreditCard = useCallback(
    (payAccountId: string) => {
      navigation.navigate('PayCreditCard', { accountId: payAccountId });
    },
    [navigation],
  );
  const openAccountGroupEditor = useCallback(() => {
    navigation.navigate('AccountGroupEditor');
  }, [navigation]);
  // Stable render prop for the accounts pane (see openInsightsTrendPaywall note).
  // Declared here so its deps on openAccountEditor/openPayCreditCard/
  // openAccountGroupEditor are already initialized.
  const renderAssetsAccounts = useCallback(
    ({
      hideBalances,
      onToggleBalances,
    }: {
      hideBalances: boolean;
      onToggleBalances: () => void;
    }) => (
      <MemoAccountsScreen
        safeAreaEdges={[]}
        hideOverviewHeader
        hideBalances={hideBalances}
        onToggleBalances={onToggleBalances}
        resetToRootToken={accountsResetToken}
        scrollToTopToken={accountsScrollTopToken}
        onOpenAccount={openAccountDetail}
        onOpenAddTransaction={openAddTransactionForAccount}
        onOpenTransaction={openTransactionEditor}
        onOpenTransactionSplitBadge={openTransactionSplitBill}
        onOpenSettings={openAccountSettings}
        onOpenAccountEditor={openAccountEditor}
        onOpenPayCreditCard={openPayCreditCard}
        onOpenCreateGroup={openAccountGroupEditor}
        onOpenNetAssetsInsight={openNetAssetsInsight}
      />
    ),
    [
      accountsResetToken,
      accountsScrollTopToken,
      openAccountDetail,
      openAddTransactionForAccount,
      openTransactionEditor,
      openTransactionSplitBill,
      openAccountSettings,
      openAccountEditor,
      openPayCreditCard,
      openAccountGroupEditor,
      openNetAssetsInsight,
    ],
  );
  const openCategoryEditor = useCallback(
    (params?: { categoryId?: string; parentId?: string; type?: CategoryType }) => {
      navigation.navigate('CategoryEditor', params);
    },
    [navigation],
  );
  const openAddWageMonth = useCallback(() => {
    navigation.navigate('AddWageMonth');
  }, [navigation]);
  const openWageCalculator = useCallback(
    (params: { monthKey: string; initialConfig: WageConfig }) => {
      navigation.navigate('SettingsWageCalculator', params);
    },
    [navigation],
  );

  const shouldHideBottomNav =
    (activeTab === 'calendar' && isCalendarSelectionMode) ||
    // The auto-log tutorial is a full-page walkthrough with its own bottom nav
    // row (Back / Next), so the floating tab bar would only cover it.
    (activeTab === 'settings' && settingsCurrentScreen === 'AutoLogTutorial');

  const { resetMinimize } = useBottomNavMinimize();

  // Restore the minimized glass bar when navigating within the settings stack,
  // matching the restore on tab change — otherwise a short sub-screen with no
  // scrollable would leave the bar stuck minimized.
  const handleSettingsScreenChange = useCallback(
    (screen: string) => {
      resetMinimize();
      setSettingsCurrentScreen(screen);
    },
    [resetMinimize],
  );

  const handleTabChange = useCallback(
    (tab: TabName) => {
      resetMinimize();
      if (tab === 'accounts' && activeTab === 'accounts') {
        setAccountsResetToken((prev) => prev + 1);
        setAccountsScrollTopToken((prev) => prev + 1);
      }
      if (tab === 'calendar' && activeTab === 'calendar') {
        setCalendarResetToken((prev) => prev + 1);
      }
      if (tab === 'insights' && activeTab === 'insights') {
        setInsightsResetToMonthToken((prev) => prev + 1);
      }
      if (tab === 'albums' && activeTab === 'albums') {
        setAlbumsScrollTopToken((prev) => prev + 1);
      }
      if (tab === 'settings') {
        setSettingsCurrentScreen('settings');
        setSettingsResetToken((prev) => prev + 1);
        if (activeTab === 'settings') {
          setSettingsScrollTopToken((prev) => prev + 1);
        }
      }
      setActiveTab(tab);
    },
    [activeTab, resetMinimize],
  );

  useEffect(() => {
    const previousTab = previousActiveTabRef.current;
    previousActiveTabRef.current = activeTab;

    if (previousTab === activeTab) return;
    if (activeTab === 'insights') {
      recordInsightsView();
    }
    if (activeTab === 'settings') {
      onEnterSettingsTab?.();
    }
  }, [activeTab, onEnterSettingsTab]);

  useEffect(() => {
    const visibleScreen = activeTab === 'settings' ? settingsCurrentScreen : activeTab;
    onVisibleScreenChange?.(visibleScreen);
  }, [activeTab, onVisibleScreenChange, settingsCurrentScreen]);

  const handleTutorialTargetLayout = useCallback(
    (targetId: TutorialTargetId, rect: TutorialTargetRect) => {
      setTutorialTargetRects((previous) => {
        const current = previous[targetId];
        if (
          current &&
          Math.abs(current.x - rect.x) < 1 &&
          Math.abs(current.y - rect.y) < 1 &&
          Math.abs(current.width - rect.width) < 1 &&
          Math.abs(current.height - rect.height) < 1
        ) {
          return previous;
        }
        return { ...previous, [targetId]: rect };
      });
    },
    [],
  );
  const handleTutorialTabLayout = useCallback((tab: MainTab, rect: TutorialTargetRect) => {
    setTutorialNavTabRects((previous) => {
      const current = previous[tab];
      if (
        current &&
        Math.abs(current.x - rect.x) < 1 &&
        Math.abs(current.y - rect.y) < 1 &&
        Math.abs(current.width - rect.width) < 1 &&
        Math.abs(current.height - rect.height) < 1
      ) {
        return previous;
      }
      return { ...previous, [tab]: rect };
    });
  }, []);

  const startGuidedTutorial = useCallback(() => {
    setGuidedTutorialStepIndex(0);
    setIsGuidedTutorialActive(true);
    void trackEvent(AnalyticsEvents.TUTORIAL_STARTED);
  }, []);

  const finishGuidedTutorial = useCallback(() => {
    const wasComplete = guidedTutorialStepIndex >= GUIDED_TUTORIAL_STEPS.length - 1;
    setIsGuidedTutorialActive(false);
    setGuidedTutorialStepIndex(0);
    void trackEvent(
      wasComplete ? AnalyticsEvents.TUTORIAL_COMPLETED : AnalyticsEvents.TUTORIAL_SKIPPED,
      { steps_viewed: guidedTutorialStepIndex + 1 },
    );
  }, [guidedTutorialStepIndex]);

  const handleGuidedTutorialBack = useCallback(() => {
    setGuidedTutorialStepIndex((previous) => Math.max(0, previous - 1));
  }, []);

  const handleGuidedTutorialNext = useCallback(() => {
    if (guidedTutorialStepIndex >= GUIDED_TUTORIAL_STEPS.length - 1) {
      finishGuidedTutorial();
      return;
    }
    setGuidedTutorialStepIndex((previous) => previous + 1);
  }, [finishGuidedTutorial, guidedTutorialStepIndex]);

  useEffect(() => {
    if (!isGuidedTutorialActive) return;
    const step = GUIDED_TUTORIAL_STEPS[guidedTutorialStepIndex];
    if (!step) return;
    if (activeTab !== step.tab) {
      handleTabChange(step.tab);
    }
  }, [activeTab, guidedTutorialStepIndex, handleTabChange, isGuidedTutorialActive]);

  useEffect(() => {
    if (!isGuidedTutorialActive) return;
    const step = GUIDED_TUTORIAL_STEPS[guidedTutorialStepIndex];
    if (!step) return;

    // Clear stale rect for the incoming target so the overlay shows the loading
    // state instead of a position measured on a prior visit. This is critical on
    // Android where `measureInWindow` can lag behind layout/scroll changes.
    setTutorialTargetRects((previous) => {
      if (!(step.targetId in previous)) return previous;
      const next = { ...previous };
      delete next[step.targetId];
      return next;
    });
  }, [guidedTutorialStepIndex, isGuidedTutorialActive]);

  useEffect(() => {
    if (!isGuidedTutorialActive) return;
    const step = GUIDED_TUTORIAL_STEPS[guidedTutorialStepIndex];
    if (!step) return;
    if (activeTab !== step.tab) return;

    // Android layout/scroll commits happen on a separate thread, so we wait
    // longer than iOS before prompting a remeasure.
    const delay = Platform.OS === 'android' ? 240 : 140;
    const refresh = setTimeout(() => {
      setTutorialSpotlightRequestToken((previous) => previous + 1);
    }, delay);

    return () => {
      clearTimeout(refresh);
    };
  }, [activeTab, guidedTutorialStepIndex, isGuidedTutorialActive]);

  useEffect(() => {
    if (tutorialStartToken <= 0 || tutorialStartToken === tutorialStartTokenRef.current) return;
    tutorialStartTokenRef.current = tutorialStartToken;
    startGuidedTutorial();
  }, [startGuidedTutorial, tutorialStartToken]);

  const handleShellRootLayout = useCallback(() => {
    shellRootRef.current?.measureInWindow((x, y) => {
      setShellWindowOrigin((previous) =>
        Math.abs(previous.x - x) < 0.5 && Math.abs(previous.y - y) < 0.5 ? previous : { x, y },
      );
    });
  }, []);

  useEffect(() => {
    if (!isGuidedTutorialActive) return;
    handleShellRootLayout();
  }, [
    activeTab,
    guidedTutorialStepIndex,
    handleShellRootLayout,
    isGuidedTutorialActive,
    tutorialSpotlightRequestToken,
  ]);

  const currentGuidedStep = isGuidedTutorialActive
    ? (GUIDED_TUTORIAL_STEPS[guidedTutorialStepIndex] ?? null)
    : null;
  // The whole bottom nav bar, derived as the bounding box of the per-tab rects
  // the BottomNav reports. This adapts to whichever nav layout is active
  // (floating liquid-glass pill vs. classic bar) without measuring it directly.
  const navTabsBoundingRect = useMemo<TutorialTargetRect | null>(() => {
    const visibleTabs = isSimpleMode
      ? MAIN_TAB_ORDER.filter((tab) => tab !== 'accounts')
      : MAIN_TAB_ORDER;
    const rects = visibleTabs
      .map((tab) => tutorialNavTabRects[tab])
      .filter((rect): rect is TutorialTargetRect => rect != null);
    if (rects.length === 0) return null;
    const minX = Math.min(...rects.map((rect) => rect.x));
    const minY = Math.min(...rects.map((rect) => rect.y));
    const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
    const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }, [isSimpleMode, tutorialNavTabRects]);
  const rawGuidedTargetRect = currentGuidedStep
    ? currentGuidedStep.targetId === 'nav.tabs'
      ? navTabsBoundingRect
      : (tutorialTargetRects[currentGuidedStep.targetId] ?? null)
    : null;
  const rawGuidedTabRect =
    currentGuidedStep &&
    currentGuidedStep.targetId !== 'nav.add' &&
    currentGuidedStep.targetId !== 'nav.tabs'
      ? (tutorialNavTabRects[currentGuidedStep.tab] ?? null)
      : null;
  const currentGuidedTargetRect = useMemo<TutorialTargetRect | null>(() => {
    if (!rawGuidedTargetRect) return null;
    return {
      ...rawGuidedTargetRect,
      x: rawGuidedTargetRect.x - shellWindowOrigin.x,
      y: rawGuidedTargetRect.y - shellWindowOrigin.y,
    };
  }, [rawGuidedTargetRect, shellWindowOrigin.x, shellWindowOrigin.y]);
  const currentGuidedTabRect = useMemo<TutorialTargetRect | null>(() => {
    if (!rawGuidedTabRect) return null;
    return {
      ...rawGuidedTabRect,
      x: rawGuidedTabRect.x - shellWindowOrigin.x,
      y: rawGuidedTabRect.y - shellWindowOrigin.y,
    };
  }, [rawGuidedTabRect, shellWindowOrigin.x, shellWindowOrigin.y]);
  const currentTutorialFocusedTab =
    isGuidedTutorialActive &&
    currentGuidedStep?.targetId !== 'nav.add' &&
    currentGuidedStep?.targetId !== 'nav.tabs'
      ? (currentGuidedStep?.tab ?? null)
      : null;
  const tutorialSpotlightRequest = useMemo<TutorialSpotlightRequest>(
    () => ({
      active: isGuidedTutorialActive && currentGuidedStep !== null,
      targetId: currentGuidedStep?.targetId ?? null,
      token: tutorialSpotlightRequestToken,
    }),
    [currentGuidedStep, isGuidedTutorialActive, tutorialSpotlightRequestToken],
  );
  return (
    <View ref={shellRootRef} onLayout={handleShellRootLayout} className="flex-1 bg-background">
      <View style={styles.flex}>
        <MountedTab active={activeTab === 'accounts'} shouldPreload={preloadedTabs.has('accounts')}>
          <MemoAssetsTab
            resetToAccountsToken={accountsResetToken}
            onAddItem={openItemEditorFromAssets}
            onOpenAccountSettings={openAccountSettings}
            renderAccounts={renderAssetsAccounts}
            renderItems={renderAssetsItems}
          />
        </MountedTab>
        <MountedTab active={activeTab === 'calendar'}>
          <MemoCalendarScreen
            resetToCurrentMonthToken={calendarResetToken}
            goToDayRequest={calendarGoToDayRequest}
            onOpenTransaction={openTransactionEditor}
            onOpenTransactionSplitBadge={openTransactionSplitBill}
            onOpenBreakdownInsight={openActivityBreakdownInsight}
            onSelectionModeChange={setIsCalendarSelectionMode}
            onShowTodayButtonChange={setShowCalendarTodayButton}
          />
        </MountedTab>
        <MountedTab active={activeTab === 'insights'} shouldPreload={preloadedTabs.has('insights')}>
          <MemoInsightsScreen
            resetToCurrentMonthToken={insightsResetToMonthToken}
            onOpenDrilldown={openInsightsDrilldown}
            onOpenTransaction={openTransactionEditor}
            onOpenProPaywall={openInsightsTrendPaywall}
            onOpenBudgetTemplates={openBudgetTemplates}
            onOpenBudgetTemplateEditor={openBudgetTemplateEditor}
            onOpenMonthlyBudgetEditor={openMonthlyBudgetEditor}
            onCreateCustomBudget={openCustomBudgetCreator}
            activityBreakdownInsightRequest={activityBreakdownInsightRequest}
            isSimpleMode={isSimpleMode}
            onTutorialTargetLayout={handleTutorialTargetLayout}
            tutorialSpotlightRequest={tutorialSpotlightRequest}
          />
        </MountedTab>
        <MountedTab active={activeTab === 'albums'} shouldPreload={preloadedTabs.has('albums')}>
          <MemoAlbumsScreen
            scrollToTopToken={albumsScrollTopToken}
            onOpenCreateAlbum={openCreateAlbum}
            onOpenAlbumDetail={openAlbumDetail}
          />
        </MountedTab>
        <MountedTab active={activeTab === 'settings'} shouldPreload={preloadedTabs.has('settings')}>
          <MemoSettingsStack
            resetToRootToken={settingsResetToken}
            scrollToTopToken={settingsScrollTopToken}
            onOpenRecurringEditor={openRecurringEditor}
            onOpenItemEditor={openItemEditor}
            onOpenAccountEditor={openAccountEditor}
            onOpenPayCreditCard={openPayCreditCard}
            onOpenCreateGroup={openAccountGroupEditor}
            onOpenCategoryEditor={openCategoryEditor}
            onOpenAddWageMonth={openAddWageMonth}
            onOpenWageCalculator={openWageCalculator}
            onOpenProPaywall={openSettingsPaywall}
            onOpenSettleUp={openSettleUp}
            onOpenEditTransaction={openTransactionEditor}
            onScreenChange={handleSettingsScreenChange}
            onStartTutorial={startGuidedTutorial}
            onTutorialTargetLayout={handleTutorialTargetLayout}
            tutorialSpotlightRequest={tutorialSpotlightRequest}
          />
        </MountedTab>
      </View>

      {!shouldHideBottomNav ? (
        <>
          <BottomNav
            activeTab={activeTab}
            onTabChange={handleTabChange}
            hideTabs={isSimpleMode ? ['accounts'] : undefined}
            onTutorialTabLayout={handleTutorialTabLayout}
            tutorialFocusedTab={currentTutorialFocusedTab}
            tutorialMeasureToken={tutorialSpotlightRequest.token}
          />
          {activeTab === 'calendar' ? (
            <AddFab
              onPress={handleFabPress}
              onLongPress={holdAction === 'none' ? undefined : handleFabLongPress}
              onLongPressEnd={holdIsVoice ? () => voiceHandleRef.current?.stop() : undefined}
              showVoiceHint={false}
              accessibilityLabel={I18n.t('onboarding.bootstrap.add_transaction')}
              onTutorialTargetLayout={handleTutorialTargetLayout}
              tutorialSpotlightRequest={tutorialSpotlightRequest}
            />
          ) : null}
          {activeTab === 'calendar' && showCalendarTodayButton ? (
            <TodayJumpFab onPress={requestCalendarGoToToday} />
          ) : null}
        </>
      ) : null}

      <AddActionSheet
        visible={addSheetVisible}
        onClose={() => setAddSheetVisible(false)}
        onQuick={openAddTransaction}
        onFull={() => navigation.navigate('AddTransactionDetailed')}
        onScan={startScan}
        onSplitManual={openSplitManual}
        onSplitScan={() => void startScan('split')}
        onSettings={() => navigation.navigate('SettingsQuickEntry')}
        onVoice={handleVoiceTap}
        accounts={accounts}
        accountGroups={accountGroups}
        selectedAccountId={defaultEntryAccountId}
        onSelectAccount={handleSelectDefaultAccount}
      />

      {voiceEnabled ? (
        <VoiceQuickAddOverlay
          handleRef={voiceHandleRef}
          onEditDetailed={(input) => {
            navigation.navigate('AddTransactionDetailed', {
              initialAccountId: input.accountId ?? undefined,
              initialValues: {
                type: input.type,
                amount: String(input.amount),
                date: input.date,
                accountId: input.accountId ?? null,
                fromAccountId: null,
                toAccountId: null,
                categoryId: input.categoryId ?? null,
                note: input.note ?? '',
              },
            });
          }}
        />
      ) : null}

      {warmupQuickAdd ? <QuickAddWarmup /> : null}

      <TutorialCoachmarkOverlay
        visible={isGuidedTutorialActive && currentGuidedStep !== null}
        stepIndex={guidedTutorialStepIndex}
        totalSteps={GUIDED_TUTORIAL_STEPS.length}
        title={currentGuidedStep ? I18n.t(currentGuidedStep.titleKey) : ''}
        body={currentGuidedStep ? I18n.t(currentGuidedStep.bodyKey) : ''}
        targetId={currentGuidedStep?.targetId ?? null}
        targetRect={currentGuidedTargetRect}
        secondaryTargetRect={currentGuidedTabRect}
        mascotName={currentGuidedStep?.mascot}
        onBack={handleGuidedTutorialBack}
        onNext={handleGuidedTutorialNext}
        onSkip={finishGuidedTutorial}
        isLastStep={guidedTutorialStepIndex >= GUIDED_TUTORIAL_STEPS.length - 1}
      />
    </View>
  );
}

function AddTransactionRouteScreen({ route, navigation }: RootStackRouteProps<'AddTransaction'>) {
  const { isSimpleMode, simpleWalletId } = useApp();
  return (
    <QuickAddScreen
      onClose={() => navigation.goBack()}
      onSubmitReady={(input) => {
        requestOpenTransactions({
          monthKey: monthKeyFromIsoLocal(input.date),
          dayKey: dayKeyFromIsoLocal(input.date),
        });
      }}
      onExpandToDetailed={(initialValues, initialAccountId) => {
        navigation.replace('AddTransactionDetailed', {
          initialAccountId,
          initialValues,
        });
      }}
      onOpenQuickEntrySettings={() => navigation.replace('SettingsQuickEntry')}
      isSimpleMode={isSimpleMode}
      simpleWalletId={simpleWalletId}
      initialAccountId={route.params?.initialAccountId}
      initialValues={route.params?.initialValues}
    />
  );
}

function AddTransactionDetailedRouteScreen({
  route,
  navigation,
}: RootStackRouteProps<'AddTransactionDetailed'>) {
  const { isSimpleMode, simpleWalletId } = useApp();
  return (
    <AddTransactionScreen
      onClose={() => navigation.goBack()}
      onSubmitReady={(input) => {
        requestOpenTransactions({
          monthKey: monthKeyFromIsoLocal(input.date),
          dayKey: dayKeyFromIsoLocal(input.date),
        });
      }}
      isSimpleMode={isSimpleMode}
      simpleWalletId={simpleWalletId}
      initialAccountId={route.params?.initialAccountId}
      initialValues={route.params?.initialValues}
      openSplitBillOnMount={route.params?.openSplitBill}
    />
  );
}

function WidgetSnapshotSync() {
  const {
    settings,
    categories,
    monthlyBudgets,
    insightsPreferencesJson,
    getTrueHourlyRateForDate,
  } = useApp();
  const { transactions } = useTransactions();
  const { isPro } = usePro();

  useEffect(() => {
    // Building the snapshot walks every transaction. During cold-start hydration
    // its inputs (settings, isPro, transactions) settle across several renders,
    // so running synchronously here rebuilt it 3+ times on the JS thread mid-
    // startup. Defer past interactions and let each dep change cancel the pending
    // run, so the rapid startup churn coalesces into a single build that lands
    // off the render-blocking path — the widget data isn't needed to paint.
    let cancelled = false;
    const handle = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      const savingsExclusions = parseSavingsExclusions(insightsPreferencesJson);
      const snapshot = buildMoney2TimeWidgetSnapshot({
        transactions,
        settings,
        isPro,
        getTrueHourlyRateForDate,
        categories,
        monthlyBudgets,
        excludedSavingsIncomeCategoryIds: savingsExclusions.income,
        excludedSavingsExpenseCategoryIds: savingsExclusions.expense,
      });
      void writeMoney2TimeWidgetSnapshot(snapshot).then(() => reloadMoney2TimeWidgets());
    });
    return () => {
      cancelled = true;
      handle.cancel();
    };
  }, [
    categories,
    getTrueHourlyRateForDate,
    insightsPreferencesJson,
    isPro,
    monthlyBudgets,
    settings,
    transactions,
  ]);

  return null;
}

/**
 * The app half of iOS auto-log: publishes the catalog the Shortcuts App Intent
 * reads for its pickers, and drains the taps the intent queued back into real
 * transactions. See plugins/withMoney2TimeAutoLog.js for the Swift side.
 */
function AutoLogSync() {
  const {
    accounts,
    categories,
    settings,
    quickEntryPrefs,
    isSimpleMode,
    simpleWalletId,
    createTransaction,
    updateQuickEntryPrefs,
  } = useApp();
  const { isPro } = usePro();

  // Read on every render rather than inside the effect so it is a real
  // dependency: switching app language changes the string, which republishes
  // the catalog the intent reads its notification titles from.
  const notificationTitle = I18n.t('notifications.content.autolog_title');
  const failureNotificationTitle = I18n.t('notifications.content.autolog_failure_title');
  const failureNotificationBody = I18n.t('notifications.content.autolog_failure_body');

  // Guards against overlapping drains; see `drain` below.
  const drainingRef = useRef(false);
  const usageCountRef = useRef(quickEntryPrefs.autoLogUsageCount);
  usageCountRef.current = quickEntryPrefs.autoLogUsageCount;

  useEffect(() => {
    if (!isAutoLogSupported()) return undefined;
    // Same reasoning as WidgetSnapshotSync: these inputs settle over several
    // renders during cold start, so a synchronous write here would rebuild and
    // re-encode the catalog repeatedly on the JS thread mid-startup. The intent
    // only reads it when the user taps to pay, so it is never needed to paint.
    let cancelled = false;
    const handle = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      // Same rejection path as the drain: report rather than leave it unhandled.
      void writeAutoLogCatalog(
        buildAutoLogCatalog({
          accounts,
          categories,
          isSimpleMode,
          simpleWalletId,
          isPro,
          autoLogUsageCount: quickEntryPrefs.autoLogUsageCount,
          defaultAccountId: quickEntryPrefs.defaultAccountId,
          defaultExpenseCategoryId: quickEntryPrefs.defaultExpenseCategoryId,
          backTapAction: quickEntryPrefs.backTapAction,
          includeSubcategories: quickEntryPrefs.autoLogIncludeSubcategories,
          notificationTitle,
          failureNotificationTitle,
          failureNotificationBody,
          reportingCurrency: settings.currencyCode,
          generatedAt: new Date().toISOString(),
        }),
      ).catch(reportError);
    });
    return () => {
      cancelled = true;
      handle.cancel();
    };
  }, [
    accounts,
    categories,
    failureNotificationBody,
    failureNotificationTitle,
    isPro,
    isSimpleMode,
    notificationTitle,
    quickEntryPrefs.autoLogIncludeSubcategories,
    quickEntryPrefs.autoLogUsageCount,
    quickEntryPrefs.backTapAction,
    quickEntryPrefs.defaultAccountId,
    quickEntryPrefs.defaultExpenseCategoryId,
    settings.currencyCode,
    simpleWalletId,
  ]);

  const drain = useCallback(async () => {
    if (!isAutoLogSupported()) return;
    // Mount, AppState 'active' and the dev test button can all ask for a drain
    // at once. Reading the queue is async, so two overlapping runs would each
    // see the same entries before either cleared them and post every tap twice.
    // A skipped run loses nothing: the entries stay queued for the next one.
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      const drainable = selectDrainableAutoLogEntries(await readAutoLogPending());
      if (drainable.length === 0) return;

      const consumed: string[] = [];
      let created = 0;

      for (const entry of drainable) {
        const input = resolveAutoLogEntry(entry, {
          accounts,
          categories,
          isSimpleMode,
          simpleWalletId,
          defaultAccountId: quickEntryPrefs.defaultAccountId,
          defaultExpenseCategoryId: quickEntryPrefs.defaultExpenseCategoryId,
          reportingCurrency: settings.currencyCode,
        });

        if (!input) {
          // Nothing postable in it. Consume anyway so one bad row can't wedge
          // the queue on every foreground forever.
          reportError(new Error('Auto-log entry could not be resolved'), {
            amountRaw: entry.amountRaw,
          });
          consumed.push(entry.id);
          continue;
        }

        try {
          createTransaction(input, { source: 'autolog' });
          consumed.push(entry.id);
          created += 1;
        } catch (error) {
          // Leave it queued so the next foreground retries it.
          reportError(error, { autoLogEntryId: entry.id });
        }
      }

      // Clear only what we actually consumed, so a create that threw is retried
      // rather than silently lost.
      if (consumed.length > 0) await clearAutoLogPending(consumed);
      // Read the count through a ref: the closure's copy can be stale by now if
      // prefs changed while we were awaiting, and undercounting hands out free
      // auto-logs past the cap.
      if (created > 0) {
        updateQuickEntryPrefs({ autoLogUsageCount: usageCountRef.current + created });
      }
    } catch (error) {
      // The native side rejects when the App Group is unreachable (e.g. a build
      // whose entitlement is missing). Swallow it here so a foreground does not
      // raise an unhandled rejection every time; the entries stay queued.
      reportError(error);
    } finally {
      drainingRef.current = false;
    }
  }, [
    accounts,
    categories,
    createTransaction,
    isSimpleMode,
    quickEntryPrefs.defaultAccountId,
    quickEntryPrefs.defaultExpenseCategoryId,
    settings.currencyCode,
    simpleWalletId,
    updateQuickEntryPrefs,
  ]);

  // Also drain on an explicit request (the dev test button) since that enqueues
  // a tap this component owns.
  useForegroundAutoLogDrain(drain, true);

  return null;
}

/**
 * Wire an auto-log drain to run on mount and on every foreground. The latest
 * `drain` is held in a ref so the AppState listener is set up once rather than
 * torn down and re-added on every render. When `subscribeToDrainRequests` is
 * true it also drains on an explicit `requestAutoLogDrain()` — used only by the
 * tap drain, since a drain request never enqueues a screenshot.
 */
function useForegroundAutoLogDrain(drain: () => void, subscribeToDrainRequests: boolean) {
  const drainRef = useRef(drain);
  drainRef.current = drain;

  useEffect(() => {
    void drainRef.current();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drainRef.current();
    });
    const unsubscribeDrain = subscribeToDrainRequests
      ? subscribeAutoLogDrain(() => void drainRef.current())
      : undefined;
    return () => {
      subscription.remove();
      unsubscribeDrain?.();
    };
  }, [subscribeToDrainRequests]);
}

/**
 * Reads the source image's pixel dimensions so the downscaler knows whether the
 * long edge exceeds its cap — camera/picker flows get these from their asset
 * metadata, but a queued screenshot arrives as a bare file. Degrades to
 * "unknown" (re-encode only, no resize) rather than failing the scan.
 */
function getImageSize(uri: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve(null),
    );
  });
}

/**
 * Drains screenshots queued in the App Group by the iOS "Log Screenshot" App
 * Intent (see plugins/withMoney2TimeAutoLog.js) into background receipt scans:
 * copy each image into the receipt store, hand it to the scan pipeline with the
 * 'screenshot' intent (Worker screenshot mode — arbitrary payment screens,
 * account detection, silent auto-create), and clear the queue entry. Runs on
 * mount and on every foreground, exactly like AutoLogSync — the intent opens
 * the app when run, so a queued screenshot normally drains within seconds.
 */
function ScreenshotScanSync() {
  const { scanReceiptImageAsync } = useReceiptScans();

  // Guards against overlapping drains — mount, AppState 'active' and a drain
  // request can all fire at once, and two overlapping runs would each see the
  // same queue and scan every screenshot twice.
  const drainingRef = useRef(false);

  const drain = useCallback(async () => {
    if (!isAutoLogSupported()) return;
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      const pending = await readAutoLogPendingScans();
      if (pending.length === 0) return;

      // Process one screenshot at a time, awaiting each scan to completion.
      // Serial (not concurrent) so a batch never fires N parallel Worker OCR
      // calls, and each App Group entry is cleared only AFTER its scan has
      // settled — never on a mere enqueue, so a mid-scan kill can't silently
      // drop a shot before it was even attempted.
      //
      // A queued screenshot is ephemeral: it gets exactly ONE attempt, then
      // its App Group entry is dropped whatever the result. There is no
      // requeue/retry — if a scan doesn't capture (parse failure, read error,
      // over quota), that's fine; the user re-runs the shortcut themselves.
      for (const entry of pending) {
        let outcome: ScanOutcome;
        try {
          const uri = entry.path.startsWith('file://') ? entry.path : `file://${entry.path}`;
          // Same storage treatment as a camera capture: downscale/re-encode,
          // then copy into the receipt store, which the scan job then owns.
          const downscaled = await downscaleReceiptForStorage(uri, (await getImageSize(uri)) ?? {});
          const rel = saveReceiptImage(downscaled);
          outcome = await scanReceiptImageAsync(rel, 'shortcut', 'screenshot');
        } catch (error) {
          // Couldn't even read/store the shot — report for visibility and drop
          // it (image file included). No requeue.
          reportError(error, { autoLogScanId: entry.id });
          await clearAutoLogPendingScans([entry.id]);
          continue;
        }

        // Quota exhausted: the limit is terminal until the quota resets, and
        // every remaining shot would hit it too. Drop the whole batch (the
        // native clear also deletes the App Group image files) so the queue
        // can't re-scan, re-hit the limit, and re-open the paywall on every
        // later foreground. applyScanFailure already showed the paywall once;
        // the screenshots themselves remain in the user's photo library.
        if (outcome === 'limit') {
          await clearAutoLogPendingScans(pending.map((p) => p.id));
          break;
        }

        // Attempted — success or a silent no-capture — so drop this entry (and
        // its App Group image file). Per-entry so a break above keeps the rest.
        await clearAutoLogPendingScans([entry.id]);
      }
    } catch (error) {
      // A failed read/clear against an unreachable App Group must not raise an
      // unhandled rejection on every foreground. Whatever wasn't cleared stays
      // queued and is attempted again next foreground.
      reportError(error);
    } finally {
      drainingRef.current = false;
    }
  }, [scanReceiptImageAsync]);

  // Screenshots only ever arrive via the intent opening the app, so mount +
  // foreground cover them; no need to listen for explicit drain requests (the
  // dev test button enqueues taps, never screenshots).
  useForegroundAutoLogDrain(drain, false);

  return null;
}

function EditTransactionRouteScreen({ route, navigation }: RootStackRouteProps<'EditTransaction'>) {
  const { isSimpleMode, simpleWalletId } = useApp();
  const { transactions } = useTransactions();
  const transaction = useMemo(
    () => transactions.find((item) => item.id === route.params.transactionId) ?? null,
    [route.params.transactionId, transactions],
  );

  useEffect(() => {
    if (transaction) return;
    navigation.goBack();
  }, [navigation, transaction]);

  if (!transaction) {
    return <View className="flex-1 bg-background" />;
  }

  return (
    <EditTransactionScreen
      transaction={transaction}
      onClose={() => navigation.goBack()}
      isSimpleMode={isSimpleMode}
      simpleWalletId={simpleWalletId}
      openSplitBillOnMount={route.params.openSplitBill}
    />
  );
}

function AccountDetailRouteScreen({ route, navigation }: RootStackRouteProps<'AccountDetail'>) {
  return (
    <AccountsScreen
      onBack={() => navigation.goBack()}
      accountId={route.params.accountId}
      useNativeBackGesture
      onOpenAccountEditor={(params) => navigation.navigate('AccountEditor', params)}
      onOpenPayCreditCard={(accountId) => navigation.navigate('PayCreditCard', { accountId })}
      onOpenCreateGroup={() => navigation.navigate('AccountGroupEditor')}
      onOpenAddTransaction={(accountId) =>
        navigation.push('AddTransactionDetailed', { initialAccountId: accountId })
      }
      onOpenTransaction={(transaction) =>
        navigation.navigate('EditTransaction', {
          transactionId: transaction.id,
        })
      }
      onOpenTransactionSplitBadge={(transaction) =>
        navigation.navigate('EditTransaction', {
          transactionId: transaction.id,
          openSplitBill: true,
        })
      }
    />
  );
}

function ItemEditorRouteScreen({ route, navigation }: RootStackRouteProps<'ItemEditor'>) {
  return (
    <ItemEditorScreen
      itemId={route.params?.itemId}
      onClose={() => navigation.goBack()}
      onOpenIconPicker={(session) => {
        setPendingItemIconPicker(session);
        navigation.navigate('ItemIconPicker');
      }}
    />
  );
}

function ItemIconPickerRouteScreen({ navigation }: RootStackRouteProps<'ItemIconPicker'>) {
  // The hand-off (selected id + onSelect callback) rides a module bridge, not
  // navigation params, so nothing non-serializable enters the nav state. Read
  // it once on mount; a cold state-restore leaves it empty, so just pop back.
  const sessionRef = useRef(consumePendingItemIconPicker());
  const session = sessionRef.current;
  useEffect(() => {
    if (!session) navigation.goBack();
  }, [navigation, session]);
  if (!session) return null;
  return (
    <ItemIconPickerSheet
      selectedIconId={session.selectedIconId}
      onSelect={session.onSelect}
      onClose={() => navigation.goBack()}
    />
  );
}

function BudgetTemplateEditorRouteScreen({
  route,
  navigation,
}: RootStackRouteProps<'BudgetTemplateEditor'>) {
  return (
    <BudgetTemplateEditorScreen
      templateId={route.params?.templateId}
      duplicateFromId={route.params?.duplicateFromId}
      onOpenCategoryAllocation={(params) => {
        setPendingCategoryAllocation(params);
        navigation.navigate('BudgetCategoryAllocation');
      }}
      onClose={() => navigation.goBack()}
    />
  );
}

function BudgetCategoryAllocationRouteScreen({
  navigation,
}: RootStackRouteProps<'BudgetCategoryAllocation'>) {
  // The hand-off (draft slice + onDone callback) rides a module bridge, not
  // navigation params, so nothing non-serializable enters the nav state. Read
  // it once on mount; a cold state-restore leaves it empty, so just pop back.
  const sessionRef = useRef(consumePendingCategoryAllocation());
  const session = sessionRef.current;
  useEffect(() => {
    if (!session) navigation.goBack();
  }, [navigation, session]);
  if (!session) return null;
  return (
    <CategoryAllocationScreen
      categoryId={session.categoryId}
      initialAmounts={session.initialAmounts}
      remainingExcludingThis={session.remainingExcludingThis}
      onDone={session.onDone}
      onClose={() => navigation.goBack()}
    />
  );
}

function BudgetMonthEditorRouteScreen({
  route,
  navigation,
}: RootStackRouteProps<'BudgetMonthEditor'>) {
  return (
    <MonthlyBudgetEditorScreen
      budgetId={'budgetId' in route.params ? route.params.budgetId : undefined}
      createForMonth={'createForMonth' in route.params ? route.params.createForMonth : undefined}
      onOpenCategoryAllocation={(params) => {
        setPendingCategoryAllocation(params);
        navigation.navigate('BudgetCategoryAllocation');
      }}
      onClose={() => navigation.goBack()}
    />
  );
}

function SettingsBudgetTemplatesRouteScreen({
  navigation,
}: RootStackRouteProps<'SettingsBudgetTemplates'>) {
  return (
    <BudgetTemplatesScreen
      onBack={() => navigation.goBack()}
      onOpenEditor={(params) => navigation.navigate('BudgetTemplateEditor', params)}
    />
  );
}

function AccountEditorRouteScreen({ route, navigation }: RootStackRouteProps<'AccountEditor'>) {
  return (
    <AccountEditorScreen
      accountId={route.params?.accountId}
      presetGroupName={route.params?.presetGroupName}
      onClose={() => navigation.goBack()}
      onOpenMultiCurrency={() => navigation.navigate('SettingsMultiCurrency')}
      onOpenLogoPicker={(session) => {
        setPendingAccountLogoPicker(session);
        navigation.navigate('AccountLogoPicker');
      }}
    />
  );
}

function AccountLogoPickerRouteScreen({ navigation }: RootStackRouteProps<'AccountLogoPicker'>) {
  // The hand-off (selected id + onSelect callback) rides a module bridge, not
  // navigation params, so nothing non-serializable enters the nav state. Read
  // it once on mount; a cold state-restore leaves it empty, so just pop back.
  const sessionRef = useRef(consumePendingAccountLogoPicker());
  const session = sessionRef.current;
  useEffect(() => {
    if (!session) navigation.goBack();
  }, [navigation, session]);
  if (!session) return null;
  return (
    <AccountLogoPickerSheet
      selectedLogoId={session.selectedLogoId}
      onSelect={session.onSelect}
      onClose={() => navigation.goBack()}
    />
  );
}

function PayCreditCardRouteScreen({ route, navigation }: RootStackRouteProps<'PayCreditCard'>) {
  return (
    <PayCreditCardScreen accountId={route.params.accountId} onClose={() => navigation.goBack()} />
  );
}

function AccountGroupEditorRouteScreen({ navigation }: RootStackRouteProps<'AccountGroupEditor'>) {
  return <AccountGroupEditorScreen onClose={() => navigation.goBack()} />;
}

function CategoryEditorRouteScreen({ route, navigation }: RootStackRouteProps<'CategoryEditor'>) {
  return (
    <CategoryEditorScreen
      categoryId={route.params?.categoryId}
      parentId={route.params?.parentId}
      type={route.params?.type}
      onClose={() => navigation.goBack()}
    />
  );
}

function CreateAlbumRouteScreen({ route, navigation }: RootStackRouteProps<'CreateAlbum'>) {
  return (
    <CreateAlbumScreen
      initialTransactionIds={route.params?.initialTransactionIds}
      onClose={() => navigation.goBack()}
      onCreated={(albumId) => navigation.replace('AlbumDetail', { albumId })}
    />
  );
}

function AlbumDetailRouteScreen({ route, navigation }: RootStackRouteProps<'AlbumDetail'>) {
  return (
    <AlbumDetailScreen
      albumId={route.params.albumId}
      onClose={() => navigation.goBack()}
      onDeleted={() => navigation.goBack()}
      onAddTransactions={(albumId) => navigation.navigate('AddAlbumTransactions', { albumId })}
      onEditDetails={(albumId) => navigation.navigate('EditAlbumDetails', { albumId })}
      onOpenTransaction={(transaction) =>
        navigation.navigate('EditTransaction', { transactionId: transaction.id })
      }
      onOpenBreakdown={(payload) => navigation.navigate('InsightsDrilldown', payload)}
    />
  );
}

function EditAlbumDetailsRouteScreen({
  route,
  navigation,
}: RootStackRouteProps<'EditAlbumDetails'>) {
  return (
    <EditAlbumDetailsScreen
      albumId={route.params.albumId}
      onClose={() => navigation.goBack()}
      onEditTransactions={(albumId) => navigation.navigate('EditAlbumTransactions', { albumId })}
    />
  );
}

function EditAlbumTransactionsRouteScreen({
  route,
  navigation,
}: RootStackRouteProps<'EditAlbumTransactions'>) {
  return (
    <EditAlbumTransactionsScreen
      albumId={route.params.albumId}
      onClose={() => navigation.goBack()}
    />
  );
}

function AddAlbumTransactionsRouteScreen({
  route,
  navigation,
}: RootStackRouteProps<'AddAlbumTransactions'>) {
  return (
    <AddAlbumTransactionsScreen
      albumId={route.params.albumId}
      onClose={() => navigation.goBack()}
    />
  );
}

function ProPaywallRouteScreen({ route, navigation }: RootStackRouteProps<'ProPaywall'>) {
  return (
    <ProPaywallScreen
      onClose={() => navigation.goBack()}
      source={route.params?.source}
      flashMessage={route.params?.flashMessage}
    />
  );
}

function SettingsAccountsRouteScreen({ navigation }: RootStackRouteProps<'SettingsAccounts'>) {
  return (
    <AccountsScreen
      onBack={() => navigation.goBack()}
      managementOnly
      useNativeBackGesture
      onOpenAccountEditor={(params) => navigation.navigate('AccountEditor', params)}
      onOpenPayCreditCard={(accountId) => navigation.navigate('PayCreditCard', { accountId })}
      onOpenCreateGroup={() => navigation.navigate('AccountGroupEditor')}
    />
  );
}

function SettingsRecurringRouteScreen({ navigation }: RootStackRouteProps<'SettingsRecurring'>) {
  return (
    <RecurringScreen
      onBack={() => navigation.goBack()}
      onOpenEditor={(ruleId) => {
        if (ruleId) {
          navigation.navigate('RecurringEditor', { ruleId });
          return;
        }
        navigation.navigate('RecurringEditor');
      }}
      useNativeBackGesture
    />
  );
}

function SettingsHourlyValueRouteScreen({
  navigation,
}: RootStackRouteProps<'SettingsHourlyValue'>) {
  return (
    <HourlyValueScreen
      onClose={() => navigation.goBack()}
      onOpenWageCalculator={({ monthKey, initialConfig }) =>
        navigation.navigate('SettingsWageCalculator', { monthKey, initialConfig })
      }
      onOpenAddWageMonth={() => navigation.navigate('AddWageMonth')}
    />
  );
}

function AddWageMonthRouteScreen({ navigation }: RootStackRouteProps<'AddWageMonth'>) {
  return (
    <AddWageMonthScreen
      onClose={() => navigation.goBack()}
      onOpenWageCalculator={({ monthKey, initialConfig }) =>
        navigation.replace('SettingsWageCalculator', { monthKey, initialConfig })
      }
    />
  );
}

function SettingsQuickEntryRouteScreen({ navigation }: RootStackRouteProps<'SettingsQuickEntry'>) {
  return <QuickEntrySettingsScreen onBack={() => navigation.goBack()} />;
}

function SettingsMultiCurrencyRouteScreen({
  navigation,
}: RootStackRouteProps<'SettingsMultiCurrency'>) {
  return <ExchangeRatesScreen onBack={() => navigation.goBack()} />;
}

function SettingsAutoBackupRouteScreen({ navigation }: RootStackRouteProps<'SettingsAutoBackup'>) {
  return <AutoBackupScreen onBack={() => navigation.goBack()} />;
}

function ShareAndEarnRouteScreen({ navigation }: RootStackRouteProps<'ShareAndEarn'>) {
  return <ShareAndEarnScreen onBack={() => navigation.goBack()} />;
}

function SettleUpRouteScreen({ navigation }: RootStackRouteProps<'SettleUp'>) {
  const { startScan } = useReceiptScans();
  return (
    <SettleUpScreen
      onBack={() => navigation.goBack()}
      onOpenPerson={(personKey) => navigation.navigate('SettleUpPerson', { personKey })}
      onOpenTransaction={(transactionId) =>
        navigation.navigate('SettleUpTransaction', { transactionId })
      }
      onOpenSettings={() => navigation.navigate('SettleUpSettings')}
      onSplitReceipt={() => {
        // Scan is the headline path (itemized OCR, metered by the scan quota);
        // manual entry stays available for offline / no-quota use.
        Alert.alert(I18n.t('transactions.receiptSplit.settleup_cta'), undefined, [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          {
            text: I18n.t('add_action.split_manual_title'),
            onPress: () => {
              setReceiptSplitLaunch({ mode: 'create', source: 'manual', entryPoint: 'settleup' });
              navigation.navigate('ReceiptSplit');
            },
          },
          {
            text: I18n.t('add_action.scan_title'),
            onPress: () => {
              // Return to the home tab first so the scan progress banner (which
              // lives on the calendar) is visible while the receipt is parsed.
              navigation.popToTop();
              requestOpenTab('calendar');
              void startScan('split');
            },
          },
        ]);
      }}
    />
  );
}

function SettleUpSettingsRouteScreen({ navigation }: RootStackRouteProps<'SettleUpSettings'>) {
  return <SettleUpSettingsScreen onBack={() => navigation.goBack()} />;
}

function SettleUpPersonRouteScreen({ route, navigation }: RootStackRouteProps<'SettleUpPerson'>) {
  return (
    <SettleUpPersonScreen
      personKey={route.params.personKey}
      onBack={() => navigation.goBack()}
      onOpenSettings={() => navigation.navigate('SettleUpSettings')}
    />
  );
}

function SettleUpTransactionRouteScreen({
  route,
  navigation,
}: RootStackRouteProps<'SettleUpTransaction'>) {
  return (
    <SettleUpTransactionScreen
      transactionId={route.params.transactionId}
      onBack={() => navigation.goBack()}
      onOpenSettings={() => navigation.navigate('SettleUpSettings')}
      onEdit={() =>
        navigation.navigate('EditTransaction', { transactionId: route.params.transactionId })
      }
      onOpenReceiptSplit={() => {
        setReceiptSplitLaunch({
          mode: 'edit',
          transactionId: route.params.transactionId,
          entryPoint: 'editor',
        });
        navigation.navigate('ReceiptSplit');
      }}
    />
  );
}

function SettingsWageCalculatorRouteScreen({
  route,
  navigation,
}: RootStackRouteProps<'SettingsWageCalculator'>) {
  const { settings, updateWageConfigForMonth } = useApp();
  const { monthKey, initialConfig } = route.params;

  return (
    <WageCalculatorFlowScreen
      initialConfig={initialConfig}
      settings={settings}
      monthLabel={monthKey}
      onCancel={() => navigation.goBack()}
      onComplete={(config) => {
        updateWageConfigForMonth(monthKey, config);
        navigation.goBack();
      }}
    />
  );
}

function InsightsDrilldownRouteScreen({
  route,
  navigation,
}: RootStackRouteProps<'InsightsDrilldown'>) {
  const { removeTransactionsFromAlbum } = useApp();
  const albumId = route.params.albumId;
  return (
    <InsightsDrilldownScreen
      payload={route.params}
      onBack={() => navigation.goBack()}
      onOpenTransaction={(transaction) =>
        navigation.navigate('EditTransaction', {
          transactionId: transaction.id,
        })
      }
      onOpenTransactionSplitBadge={(transaction) =>
        navigation.navigate('EditTransaction', {
          transactionId: transaction.id,
          openSplitBill: true,
        })
      }
      onOpenSubcategoryDrilldown={(payload) => navigation.push('InsightsDrilldown', payload)}
      onRemoveFromAlbum={albumId ? (ids) => removeTransactionsFromAlbum(albumId, ids) : undefined}
    />
  );
}

function RecurringEditorRouteScreen({ route, navigation }: RootStackRouteProps<'RecurringEditor'>) {
  const { recurringRules, createRecurringRule, updateRecurringRule, isSimpleMode, simpleWalletId } =
    useApp();
  const ruleId = route.params?.ruleId ?? null;
  const editingRule = useMemo(
    () => (ruleId ? (recurringRules.find((rule) => rule.id === ruleId) ?? null) : null),
    [recurringRules, ruleId],
  );

  useEffect(() => {
    if (!ruleId || editingRule) return;
    if (navigation.canGoBack()) navigation.goBack();
  }, [editingRule, navigation, ruleId]);

  if (ruleId && !editingRule) {
    return <View className="flex-1 bg-background" />;
  }

  return (
    <TransactionEditorScreen
      mode={editingRule ? 'edit' : 'create'}
      onClose={() => {
        if (navigation.canGoBack()) navigation.goBack();
      }}
      onSubmit={() => {}}
      onDelete={undefined}
      deleteLabel={undefined}
      titleOverride={editingRule ? I18n.t('recurring.edit_rule') : I18n.t('recurring.new_rule')}
      subtitleOverride={I18n.t('recurring.same_flow')}
      submitLabelOverride={I18n.t('recurring.save_rule')}
      restrictTypeOptions={isSimpleMode ? ['expense', 'income'] : ['expense', 'income', 'transfer']}
      hideAccountSelector={isSimpleMode}
      recurringOptions={{
        initialName: editingRule?.name,
        initialPattern: editingRule?.recurrencePattern,
        initialInterval: editingRule?.recurrenceInterval,
        initialEndDate: editingRule?.endDate,
        initialIsActive: editingRule?.isActive,
        onSubmitRecurring: ({ transaction, recurring }) => {
          const recurringTxType =
            transaction.type === 'transfer'
              ? 'transfer'
              : transaction.type === 'income'
                ? 'income'
                : 'expense';
          const basePayload = {
            name: recurring.name,
            type: recurringTxType,
            amount: transaction.amount,
            // Store the actual currency code (matching normal transactions),
            // not the display symbol — runDueTransactions relies on this for
            // FX conversion and cross-currency detection when the rule fires.
            currency: transaction.currency,
            note: transaction.note ?? null,
            recurrencePattern: recurring.pattern,
            recurrenceInterval: recurring.interval,
            nextRunDate: transaction.date,
            endDate: recurring.endDate,
            isActive: recurring.isActive,
          } as const;
          const effectiveAccountId = isSimpleMode
            ? (simpleWalletId ?? transaction.accountId ?? null)
            : (transaction.accountId ?? null);
          const payload =
            transaction.type === 'transfer' && !isSimpleMode
              ? {
                  ...basePayload,
                  fromAccountId: transaction.fromAccountId ?? null,
                  toAccountId: transaction.toAccountId ?? null,
                  accountId: null,
                  categoryId: null,
                }
              : {
                  ...basePayload,
                  accountId: effectiveAccountId,
                  categoryId: transaction.categoryId ?? null,
                  fromAccountId: null,
                  toAccountId: null,
                };

          if (editingRule) {
            updateRecurringRule(editingRule.id, payload);
          } else {
            createRecurringRule(payload);
          }
        },
      }}
      initialValues={
        editingRule
          ? {
              type: editingRule.type,
              amount: String(editingRule.amount),
              date: dayKeyFromIsoLocal(editingRule.nextRunDate),
              accountId: isSimpleMode && simpleWalletId ? simpleWalletId : editingRule.accountId,
              fromAccountId: editingRule.fromAccountId,
              toAccountId: editingRule.toAccountId,
              categoryId: editingRule.categoryId,
              note: editingRule.note ?? '',
            }
          : isSimpleMode && simpleWalletId
            ? { accountId: simpleWalletId }
            : undefined
      }
    />
  );
}

function AppContent() {
  const { isLoading, settings, getTransactionCount } = useApp();
  const { isTablet } = useDeviceLayout();
  const resolvedTheme = useResolvedTheme();
  const themeStyle = useThemeVars();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const [showTutorialPrompt, setShowTutorialPrompt] = useState(false);
  const [featureAnnouncement, setFeatureAnnouncement] = useState<FeatureAnnouncement | null>(null);
  const [featureAnnouncementVisible, setFeatureAnnouncementVisible] = useState(false);
  const [cloudBackupPromptVisible, setCloudBackupPromptVisible] = useState(false);
  // Initialize pessimistically from the persisted intent so the announcement is
  // never presented during the brief window before the lock gate reports in.
  const [biometricLocked, setBiometricLocked] = useState(settings.biometricLockEnabled);
  const [tutorialStartToken, setTutorialStartToken] = useState(0);
  const [mainShellCurrentScreen, setMainShellCurrentScreen] = useState('calendar');
  const [rootActiveScreen, setRootActiveScreen] = useState<keyof RootStackParamList>('Main');
  const navigationLocaleKey = settings.locale ?? I18n.locale ?? 'en';
  const rootScreenListeners = useMemo(() => createNativeStackSwipeHapticListeners(), []);
  const checkedFeatureAnnouncementUserRef = useRef<string | null>(null);

  const syncRootActiveScreen = useCallback(() => {
    const rootState = navigationRef.getRootState();
    const nextScreen = (rootState?.routes[rootState.index]?.name ??
      'Main') as keyof RootStackParamList;

    setRootActiveScreen((previous) => (previous === nextScreen ? previous : nextScreen));
  }, [navigationRef]);

  const visibleScreen = settings.onboardingCompleted
    ? rootActiveScreen === 'Main'
      ? mainShellCurrentScreen
      : rootActiveScreen
    : 'onboarding';

  useEffect(() => {
    if (isLoading) return;

    void setCurrentScreen(visibleScreen);
  }, [isLoading, visibleScreen]);

  useEffect(() => {
    const targetLock = isTablet
      ? ScreenOrientation.OrientationLock.DEFAULT
      : ScreenOrientation.OrientationLock.PORTRAIT_UP;

    const syncOrientationLock = async () => {
      try {
        await ScreenOrientation.lockAsync(targetLock);
      } catch {
        // Ignore orientation failures so app startup is not blocked on unsupported devices.
      }
    };

    void syncOrientationLock();
  }, [isTablet]);

  useEffect(() => {
    if (isLoading || !settings.onboardingCompleted) return undefined;
    return subscribeMoney2TimeDeepLinks(navigationRef);
  }, [isLoading, navigationRef, settings.onboardingCompleted]);

  useEffect(() => {
    if (isLoading || !settings.onboardingCompleted || showTutorialPrompt) return undefined;
    if (checkedFeatureAnnouncementUserRef.current === settings.appUserId) return undefined;
    checkedFeatureAnnouncementUserRef.current = settings.appUserId;

    let cancelled = false;
    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        const voiceSupported = await isSpeechRecognitionAvailable();
        if (cancelled) return;
        // Platform, not isAutoLogSupported(): iOS builds whose binary predates
        // the native auto-log module should still see the announcement, like
        // the Automation tile on the settings home.
        const nextAnnouncement = await getLatestUnseenAnnouncementForUser(settings.appUserId, [
          ...(voiceSupported ? (['voice'] as const) : []),
          ...(Platform.OS === 'ios' ? (['autoLog'] as const) : []),
        ]);
        if (cancelled || !nextAnnouncement) return;
        setFeatureAnnouncement(nextAnnouncement);
        setFeatureAnnouncementVisible(true);
        markPromptVisible('featureAnnouncement');
      })();
    });

    return () => {
      cancelled = true;
      interactionHandle.cancel();
    };
  }, [isLoading, settings.appUserId, settings.onboardingCompleted, showTutorialPrompt]);

  // Latest snapshot of the cloud-backup prompt's gating inputs, read inside the
  // (stable) handler so it can reference live settings without re-creating.
  const cloudBackupGuardsRef = useRef({ isOnCloudBackup: false, blocked: true });
  cloudBackupGuardsRef.current = {
    isOnCloudBackup: settings.autoBackupEnabled && settings.autoBackupTarget !== 'local',
    // Never stack on top of another overlay — that overlap can freeze the page.
    blocked: showTutorialPrompt || featureAnnouncementVisible || biometricLocked,
  };
  // Synchronous "already claimed" flag, cleared on dismiss, so two rapid
  // triggers can never both open the modal.
  const cloudBackupShowingRef = useRef(false);

  // Nudge non-cloud users toward iCloud/Drive backup when they open Settings —
  // a tab swap (not a native push/pop), so presenting a modal here can't race a
  // navigation transition the way the old post-transaction trigger did.
  const maybeShowCloudBackupPrompt = useCallback(async () => {
    const guards = cloudBackupGuardsRef.current;
    if (
      guards.blocked ||
      cloudBackupShowingRef.current ||
      isAnyPromptVisible('cloudBackupPrompt')
    ) {
      return;
    }
    const state = await getCloudBackupPromptState();
    const verdict = checkCloudBackupEligibility({
      state,
      now: new Date(),
      isOnCloudBackup: cloudBackupGuardsRef.current.isOnCloudBackup,
      transactionCount: getTransactionCount(),
    });
    if (!verdict.eligible) return;
    // Re-check after the async hop, then claim + present without awaiting in
    // between so nothing else can stack a second modal in the gap.
    if (
      cloudBackupShowingRef.current ||
      cloudBackupGuardsRef.current.blocked ||
      isAnyPromptVisible('cloudBackupPrompt')
    ) {
      return;
    }
    cloudBackupShowingRef.current = true;
    markPromptVisible('cloudBackupPrompt');
    setCloudBackupPromptVisible(true);
    void recordCloudBackupPromptShown();
    void trackEvent(AnalyticsEvents.CLOUD_BACKUP_PROMPT_SHOWN, {
      transaction_count: getTransactionCount(),
    });
  }, [getTransactionCount]);

  // Stable wrapper so MainShellScreen's tab effect doesn't re-subscribe each
  // render (and to satisfy no-misused-promises on the void-returning prop).
  const handleEnterSettingsTab = useCallback(() => {
    void maybeShowCloudBackupPrompt();
  }, [maybeShowCloudBackupPrompt]);

  const splashHiddenRef = useRef(false);
  const handleContentLayout = useCallback(() => {
    // The root view has laid out, but its lists (FlashList day pager, etc.)
    // commit their rows a frame or two later. Hiding the splash on this layout
    // pass reveals the empty shell first and then flashes the rows in. Wait two
    // frames so the first real content frame has painted, then lift the splash
    // straight onto populated content.
    if (splashHiddenRef.current) return;
    splashHiddenRef.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void SplashScreen.hideAsync();
      });
    });
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setTutorialStartToken(0);
    InteractionManager.runAfterInteractions(() => {
      setShowTutorialPrompt(true);
      markPromptVisible('tutorialPrompt');
    });
    void trackEvent(AnalyticsEvents.ONBOARDING_COMPLETED);
  }, []);

  const handleStartTutorialNow = useCallback(() => {
    setShowTutorialPrompt(false);
    markPromptHidden('tutorialPrompt');
    setTutorialStartToken((prev) => prev + 1);
  }, []);

  const handleSkipTutorialPrompt = useCallback(() => {
    setShowTutorialPrompt(false);
    markPromptHidden('tutorialPrompt');
  }, []);

  const handleDismissFeatureAnnouncement = useCallback(() => {
    const announcementId = featureAnnouncement?.id;
    setFeatureAnnouncementVisible(false);
    markPromptHidden('featureAnnouncement');
    if (announcementId) {
      void markFeatureAnnouncementSeen(settings.appUserId, announcementId);
    }
  }, [featureAnnouncement?.id, settings.appUserId]);

  const handleDismissCloudBackupPrompt = useCallback(() => {
    setCloudBackupPromptVisible(false);
    cloudBackupShowingRef.current = false;
    markPromptHidden('cloudBackupPrompt');
    void trackEvent(AnalyticsEvents.CLOUD_BACKUP_PROMPT_DISMISSED);
  }, []);

  const handleEnableCloudBackup = useCallback(() => {
    setCloudBackupPromptVisible(false);
    cloudBackupShowingRef.current = false;
    markPromptHidden('cloudBackupPrompt');
    void trackEvent(AnalyticsEvents.CLOUD_BACKUP_PROMPT_CTA_TAPPED);
    navigationRef.navigate('SettingsAutoBackup');
  }, [navigationRef]);

  // Keep the native splash up while data loads — render nothing so no
  // intermediate UI flashes before the first page is ready.
  if (isLoading) {
    return null;
  }

  if (!settings.onboardingCompleted) {
    return (
      <View style={[styles.flex, themeStyle]} onLayout={handleContentLayout}>
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={themeStyle} onLayout={handleContentLayout}>
      <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
      <WidgetSnapshotSync />
      <AutoLogSync />
      <ScreenshotScanSync />
      <NavigationContainer
        key={`locale:${navigationLocaleKey}`}
        ref={navigationRef}
        onReady={syncRootActiveScreen}
        onStateChange={syncRootActiveScreen}
      >
        <SplitBillSessionProvider>
          <RootStack.Navigator
            screenOptions={SHARED_NATIVE_STACK_OPTIONS}
            screenListeners={rootScreenListeners}
          >
            <RootStack.Screen name="Main">
              {(props) => (
                <BottomNavMinimizeProvider>
                  <MainShellScreen
                    navigation={props.navigation}
                    onVisibleScreenChange={setMainShellCurrentScreen}
                    onEnterSettingsTab={handleEnterSettingsTab}
                    tutorialStartToken={tutorialStartToken}
                  />
                </BottomNavMinimizeProvider>
              )}
            </RootStack.Screen>
            <RootStack.Screen
              name="AddTransaction"
              component={AddTransactionRouteScreen}
              options={{
                presentation: 'transparentModal',
                // QuickAddSheet handles its own enter/exit animation (backdrop fade +
                // slide). Letting the navigator add its own fade on top stacks a
                // ~300ms tail on dismiss, which looks like a "lingering grey" lag
                // after submit. 'none' makes the route appear/disappear instantly
                // so the only visible animation is the sheet's own.
                animation: 'none',
                gestureEnabled: false,
                contentStyle: { backgroundColor: 'transparent' },
              }}
            />
            <RootStack.Screen
              name="AddTransactionDetailed"
              component={AddTransactionDetailedRouteScreen}
            />
            <RootStack.Screen name="EditTransaction" component={EditTransactionRouteScreen} />
            <RootStack.Screen
              name="ScanReceiptCamera"
              component={ScanReceiptCameraScreen}
              options={{ contentStyle: { backgroundColor: '#000' } }}
            />
            <RootStack.Screen name="AccountDetail" component={AccountDetailRouteScreen} />
            <RootStack.Screen name="AccountEditor" component={AccountEditorRouteScreen} />
            <RootStack.Screen name="AccountLogoPicker" component={AccountLogoPickerRouteScreen} />
            <RootStack.Screen name="PayCreditCard" component={PayCreditCardRouteScreen} />
            <RootStack.Screen name="AccountGroupEditor" component={AccountGroupEditorRouteScreen} />
            <RootStack.Screen name="CategoryEditor" component={CategoryEditorRouteScreen} />
            <RootStack.Screen name="SettingsAccounts" component={SettingsAccountsRouteScreen} />
            <RootStack.Screen name="SettingsRecurring" component={SettingsRecurringRouteScreen} />
            <RootStack.Screen
              name="SettingsHourlyValue"
              component={SettingsHourlyValueRouteScreen}
            />
            <RootStack.Screen name="AddWageMonth" component={AddWageMonthRouteScreen} />
            <RootStack.Screen name="SettingsQuickEntry" component={SettingsQuickEntryRouteScreen} />
            <RootStack.Screen
              name="SettingsMultiCurrency"
              component={SettingsMultiCurrencyRouteScreen}
            />
            <RootStack.Screen name="SettingsAutoBackup" component={SettingsAutoBackupRouteScreen} />
            <RootStack.Screen name="ShareAndEarn" component={ShareAndEarnRouteScreen} />
            <RootStack.Screen name="SettleUp" component={SettleUpRouteScreen} />
            <RootStack.Screen name="SettleUpSettings" component={SettleUpSettingsRouteScreen} />
            <RootStack.Screen name="SettleUpPerson" component={SettleUpPersonRouteScreen} />
            <RootStack.Screen
              name="SettleUpTransaction"
              component={SettleUpTransactionRouteScreen}
            />
            <RootStack.Screen name="SplitBill" component={SplitBillScreen} />
            <RootStack.Screen name="ReceiptSplit" component={ReceiptSplitScreen} />
            <RootStack.Screen name="ItemEditor" component={ItemEditorRouteScreen} />
            <RootStack.Screen name="ItemIconPicker" component={ItemIconPickerRouteScreen} />
            <RootStack.Screen
              name="BudgetTemplateEditor"
              component={BudgetTemplateEditorRouteScreen}
            />
            <RootStack.Screen name="BudgetMonthEditor" component={BudgetMonthEditorRouteScreen} />
            <RootStack.Screen
              name="BudgetCategoryAllocation"
              component={BudgetCategoryAllocationRouteScreen}
            />
            <RootStack.Screen
              name="SettingsBudgetTemplates"
              component={SettingsBudgetTemplatesRouteScreen}
            />
            <RootStack.Screen
              name="SettingsWageCalculator"
              component={SettingsWageCalculatorRouteScreen}
            />
            <RootStack.Screen name="CreateAlbum" component={CreateAlbumRouteScreen} />
            <RootStack.Screen name="AlbumDetail" component={AlbumDetailRouteScreen} />
            <RootStack.Screen
              name="EditAlbumTransactions"
              component={EditAlbumTransactionsRouteScreen}
            />
            <RootStack.Screen
              name="AddAlbumTransactions"
              component={AddAlbumTransactionsRouteScreen}
            />
            <RootStack.Screen name="EditAlbumDetails" component={EditAlbumDetailsRouteScreen} />
            <RootStack.Screen name="InsightsDrilldown" component={InsightsDrilldownRouteScreen} />
            <RootStack.Screen name="RecurringEditor" component={RecurringEditorRouteScreen} />
            <RootStack.Screen name="ProPaywall" component={ProPaywallRouteScreen} />
          </RootStack.Navigator>
        </SplitBillSessionProvider>
      </NavigationContainer>

      <ThemeModal
        visible={showTutorialPrompt}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={handleSkipTutorialPrompt}
      >
        <View className="flex-1 items-center justify-center bg-black/35 px-6">
          <View className="w-full max-w-[360px] rounded-[26px] border border-border/45 bg-background px-5 py-5 shadow-soft">
            <Text variant="subheading">{I18n.t('tutorial.prompt_title')}</Text>
            <Text variant="friendly" tone="muted" className="mt-2">
              {I18n.t('tutorial.prompt_message')}
            </Text>
            <View className="mt-5 gap-2.5">
              <Button onPress={handleStartTutorialNow}>
                <Text>{I18n.t('tutorial.prompt_yes')}</Text>
              </Button>
              <Button variant="secondary" onPress={handleSkipTutorialPrompt}>
                <Text>{I18n.t('tutorial.prompt_not_now')}</Text>
              </Button>
            </View>
          </View>
        </View>
      </ThemeModal>
      <FeatureAnnouncementModal
        announcement={featureAnnouncement}
        visible={featureAnnouncementVisible && !biometricLocked}
        onDismiss={handleDismissFeatureAnnouncement}
        onOpenShareEarn={() => navigationRef.navigate('ShareAndEarn')}
        onOpenQuickEntrySettings={() => navigationRef.navigate('SettingsQuickEntry')}
        onOpenAutoLog={() => {
          // AutoLogSettings only exists inside the settings stack, so switch to
          // the settings tab and let the stack handle the push.
          requestOpenTab('settings');
          requestOpenAutoLogSettings();
        }}
      />
      <CloudBackupPromptModal
        visible={cloudBackupPromptVisible && !biometricLocked}
        onEnable={handleEnableCloudBackup}
        onDismiss={handleDismissCloudBackupPrompt}
      />
      <ReviewPrePromptSheet />
      <BiometricLockGate onLockStateChange={setBiometricLocked} />
    </View>
  );
}

export default Sentry.wrap(function App() {
  const shouldLoadCustomFonts = Platform.OS !== 'ios';
  const [fontsLoaded, fontError] = useFonts(
    shouldLoadCustomFonts
      ? {
          WorkSans_400Regular,
          WorkSans_500Medium,
          WorkSans_600SemiBold,
          WorkSans_700Bold,
          WorkSans_800ExtraBold,
          WorkSans_900Black,
        }
      : {},
  );

  // Failsafe: the splash is normally lifted on first content layout, but a
  // bootstrap failure (e.g. a migration or data-load throw) renders the error
  // fallback instead, which never reaches that layout pass. Without this, the
  // user is stuck staring at the native splash forever. Force-hide after a
  // generous delay so a broken launch can never trap them behind the splash —
  // hideAsync is idempotent, so the happy path's earlier hide still wins.
  useEffect(() => {
    const timer = setTimeout(() => {
      void SplashScreen.hideAsync();
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  // Splash stays up (prevented from auto-hiding) while fonts resolve, so this
  // null render is never visible. Proceed on error so we can't get stuck.
  if (shouldLoadCustomFonts && !fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <KeyboardProvider>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <AppErrorBoundary>
            <AppProvider>
              <ProProvider>
                <ReceiptScanProvider>
                  <ThemeGate>
                    <AppContent />
                  </ThemeGate>
                </ReceiptScanProvider>
              </ProProvider>
            </AppProvider>
          </AppErrorBoundary>
          <MascotWarmup />
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
});
