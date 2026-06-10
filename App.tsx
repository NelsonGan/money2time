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
import { useFonts } from 'expo-font';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Appearance,
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
import { LoadingDots } from '~/components/feedback/LoadingDots';
import { Mascot, type MascotName, MascotWarmup } from '~/components/feedback/Mascot';
import { AddFab } from '~/components/navigation/AddFab';
import {
  BottomNav,
  type TabName,
  useBottomNavContentInset,
} from '~/components/navigation/BottomNav';
import {
  BottomNavMinimizeProvider,
  useBottomNavMinimize,
} from '~/components/navigation/BottomNavMinimize';
import { Button, Text, ThemeModal } from '~/components/ui';
import { AppProvider, useApp } from '~/context/AppContext';
import { ProProvider, usePro } from '~/context/ProContext';
import { ThemeProvider, useResolvedTheme } from '~/context/ThemeContext';
import { CalendarScreen } from '~/features/calendar/screens';
import { InsightsDrilldownScreen, InsightsScreen } from '~/features/insights/screens';
import { FeatureAnnouncementModal } from '~/features/news/components/FeatureAnnouncementModal';
import type { FeatureAnnouncement } from '~/features/news/featureAnnouncements';
import { OnboardingFlow } from '~/features/onboarding/screens';
import { ReviewPrePromptSheet } from '~/features/reviewPrompt/components/ReviewPrePromptSheet';
import {
  AccountsScreen,
  HourlyValueScreen,
  ProPaywallScreen,
  QuickEntrySettingsScreen,
  RecurringScreen,
  SettingsStack,
  WageCalculatorFlowScreen,
} from '~/features/settings/screens';
import { TransactionEditorScreen } from '~/features/transactions/components';
import {
  type VoiceQuickAddHandle,
  VoiceQuickAddOverlay,
} from '~/features/transactions/components/VoiceQuickAddOverlay';
import {
  AddTransactionScreen,
  EditTransactionScreen,
  QuickAddScreen,
  SimpleActivityScreen,
  TransactionsScreen,
} from '~/features/transactions/screens';
import { TutorialCoachmarkOverlay } from '~/features/tutorial/components/TutorialCoachmarkOverlay';
import type {
  TutorialSpotlightRequest,
  TutorialTargetId,
  TutorialTargetRect,
} from '~/features/tutorial/types';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
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
import { AnalyticsEvents, setCurrentScreen, trackEvent } from '~/services/analytics';
import { subscribeMoney2TimeDeepLinks } from '~/services/deepLinks';
import {
  getLatestUnseenAnnouncementForUser,
  markFeatureAnnouncementSeen,
} from '~/services/featureAnnouncementState';
import { subscribeOpenHourlyValueRequest } from '~/services/hourlyValueNavigation';
import { subscribeOpenPaywallRequest } from '~/services/paywallNavigation';
import { recordInsightsView } from '~/services/reviewPrompt';
import { isSpeechRecognitionAvailable } from '~/services/speechRecognition';
import { subscribeOpenTabRequest } from '~/services/tabNavigation';
import {
  requestOpenTransactions,
  subscribeOpenTransactionsRequest,
} from '~/services/transactionsNavigation';
import {
  buildMoney2TimeWidgetSnapshot,
  parseSavingsExclusions,
  reloadMoney2TimeWidgets,
  writeMoney2TimeWidgetSnapshot,
} from '~/services/widgetSnapshot';
import type { TransactionWithRelations } from '~/types';
import {
  dayKeyFromIsoLocal,
  monthKeyFromDateLocal,
  monthKeyFromIsoLocal,
} from '~/utils/formatters';

type MainTab = TabName;
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
    tab: 'home',
    targetId: 'nav.add',
    titleKey: 'tutorial.coach_steps.add_title',
    bodyKey: 'tutorial.coach_steps.add_body',
    mascot: 'excited',
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

const MemoTransactionsScreen = React.memo(TransactionsScreen);
const MemoSimpleActivityScreen = React.memo(SimpleActivityScreen);
const MemoAccountsScreen = React.memo(AccountsScreen);
const MemoCalendarScreen = React.memo(CalendarScreen);
const MemoInsightsScreen = React.memo(InsightsScreen);
const MemoSettingsStack = React.memo(SettingsStack);

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
      {shouldMount ? children : null}
    </View>
  );
}

const MAIN_TAB_SCREEN_NAMES = new Set<string>([
  'home',
  'accounts',
  'calendar',
  'insights',
  'settings',
]);

function isMainTabScreen(screen: string): boolean {
  return MAIN_TAB_SCREEN_NAMES.has(screen);
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
  tutorialStartToken?: number;
}

function MainShellScreen({
  navigation,
  onVisibleScreenChange,
  tutorialStartToken = 0,
}: MainShellScreenProps) {
  const { isSimpleMode, quickEntryPrefs } = useApp();
  const voiceHandleRef = useRef<VoiceQuickAddHandle | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
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
  // The whole voice-input surface (settings row, long-press, capture overlay)
  // is gated on this single flag so unsupported devices show no trace of it.
  // Availability is probed on every platform; the native module reports
  // support (iOS + Android), while web/unsupported devices report false.
  const voiceEnabled =
    voiceSupported && quickEntryPrefs.voiceInputEnabled && quickEntryPrefs.quickEntryEnabled;
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
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [isTransactionsSelectionMode, setIsTransactionsSelectionMode] = useState(false);
  const [isCalendarSelectionMode, setIsCalendarSelectionMode] = useState(false);
  const [transactionsScrollTopToken, setTransactionsScrollTopToken] = useState(0);
  const [accountsScrollTopToken, setAccountsScrollTopToken] = useState(0);
  const [accountsResetToken, setAccountsResetToken] = useState(0);
  const [calendarScrollTopToken, setCalendarScrollTopToken] = useState(0);
  const [calendarResetToken, setCalendarResetToken] = useState(0);
  const [transactionsTutorialResetToken, setTransactionsTutorialResetToken] = useState(0);
  const [transactionsFocusMonthKey, setTransactionsFocusMonthKey] = useState<string | null>(null);
  const [transactionsFocusMonthToken, setTransactionsFocusMonthToken] = useState(0);
  const [insightsResetToMonthToken, setInsightsResetToMonthToken] = useState(0);
  const [activityBreakdownInsightRequest, setActivityBreakdownInsightRequest] =
    useState<ActivityBreakdownInsightRequest | null>(null);
  const [settingsCurrentScreen, setSettingsCurrentScreen] = useState('settings');
  const [settingsScrollTopToken, setSettingsScrollTopToken] = useState(0);
  const [settingsResetToken, setSettingsResetToken] = useState(0);
  const tutorialStartTokenRef = useRef(0);
  const previousActiveTabRef = useRef<MainTab | null>(null);
  const [preloadedTabs, setPreloadedTabs] = useState<Set<MainTab>>(() => new Set());

  useEffect(() => {
    // Progressively pre-mount the non-home tabs after home has rendered, so
    // the first tap on each tab doesn't pay its mount cost on the JS thread
    // (visible as lag + a one-frame layout shift on Settings, whose nested
    // NativeStack only resolves window insets once mounted). Staggering one
    // tab per InteractionManager pass keeps them from competing with home.
    const order: MainTab[] = ['settings', 'insights', 'calendar', 'accounts'];
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
    return subscribeOpenHourlyValueRequest(() => {
      navigation.navigate('SettingsHourlyValue');
    });
  }, [navigation]);

  useEffect(() => {
    return subscribeOpenPaywallRequest(({ source, flashMessage }) => {
      navigation.navigate('ProPaywall', { source, flashMessage });
    });
  }, [navigation]);

  const jumpTransactionsToMonth = useCallback((monthKey: string) => {
    setTransactionsFocusMonthKey(monthKey);
    setTransactionsFocusMonthToken((prev) => prev + 1);
  }, []);

  useEffect(() => {
    return subscribeOpenTransactionsRequest(({ monthKey }) => {
      setActiveTab('home');
      jumpTransactionsToMonth(monthKey ?? monthKeyFromDateLocal(new Date()));
    });
  }, [jumpTransactionsToMonth]);

  useEffect(() => {
    return subscribeOpenTabRequest(({ tab }) => {
      setActiveTab(tab);
    });
  }, []);

  const openAddTransaction = useCallback(() => {
    navigation.navigate('AddTransaction');
  }, [navigation]);

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

  const openProPaywall = useCallback(
    (source?: string) => {
      navigation.navigate('ProPaywall', source ? { source } : undefined);
    },
    [navigation],
  );

  const openBottomNavPrimaryAction = useCallback(() => {
    openAddTransaction();
  }, [openAddTransaction]);

  const shouldHideBottomNav =
    (activeTab === 'home' && isTransactionsSelectionMode) ||
    (activeTab === 'calendar' && isCalendarSelectionMode);

  const { resetMinimize } = useBottomNavMinimize();
  const bottomNavContentInset = useBottomNavContentInset();

  const handleTabChange = useCallback(
    (tab: TabName) => {
      resetMinimize();
      if (tab === 'home' && activeTab === 'home') {
        jumpTransactionsToMonth(monthKeyFromDateLocal(new Date()));
        setTransactionsScrollTopToken((prev) => prev + 1);
      }
      if (tab === 'accounts' && activeTab === 'accounts') {
        setAccountsResetToken((prev) => prev + 1);
        setAccountsScrollTopToken((prev) => prev + 1);
      }
      if (tab === 'calendar' && activeTab === 'calendar') {
        setCalendarResetToken((prev) => prev + 1);
        setCalendarScrollTopToken((prev) => prev + 1);
      }
      if (tab === 'insights' && activeTab === 'insights') {
        setInsightsResetToMonthToken((prev) => prev + 1);
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
    [activeTab, jumpTransactionsToMonth, resetMinimize],
  );

  useEffect(() => {
    const previousTab = previousActiveTabRef.current;
    previousActiveTabRef.current = activeTab;

    if (previousTab === activeTab) return;
    void trackEvent(AnalyticsEvents.TAB_VIEWED, { tab: activeTab });
    if (activeTab === 'insights') {
      recordInsightsView();
    }
  }, [activeTab]);

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
    if (step.targetId === 'nav.add') {
      setTransactionsTutorialResetToken((previous) => previous + 1);
    }
  }, [guidedTutorialStepIndex, isGuidedTutorialActive]);

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
  const rawGuidedTargetRect = currentGuidedStep
    ? (tutorialTargetRects[currentGuidedStep.targetId] ?? null)
    : null;
  const rawGuidedTabRect =
    currentGuidedStep && currentGuidedStep.targetId !== 'nav.add'
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
    isGuidedTutorialActive && currentGuidedStep?.targetId !== 'nav.add'
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
        <MountedTab active={activeTab === 'home'}>
          {isSimpleMode ? (
            <MemoSimpleActivityScreen
              scrollToTopToken={transactionsScrollTopToken}
              focusMonthKey={transactionsFocusMonthKey}
              focusMonthToken={transactionsFocusMonthToken}
              onOpenTransaction={openTransactionEditor}
              onOpenTransactionSplitBadge={openTransactionSplitBill}
              onOpenBreakdownInsight={openActivityBreakdownInsight}
              tutorialResetToken={transactionsTutorialResetToken}
            />
          ) : (
            <MemoTransactionsScreen
              scrollToTopToken={transactionsScrollTopToken}
              focusMonthKey={transactionsFocusMonthKey}
              focusMonthToken={transactionsFocusMonthToken}
              onOpenTransaction={openTransactionEditor}
              onOpenTransactionSplitBadge={openTransactionSplitBill}
              onOpenBreakdownInsight={openActivityBreakdownInsight}
              onSelectionModeChange={setIsTransactionsSelectionMode}
              tutorialResetToken={transactionsTutorialResetToken}
            />
          )}
        </MountedTab>
        <MountedTab active={activeTab === 'accounts'} shouldPreload={preloadedTabs.has('accounts')}>
          {/* Same container-level inset strategy as the settings stack. */}
          <View style={{ flex: 1, paddingBottom: bottomNavContentInset }}>
            <MemoAccountsScreen
              safeAreaEdges={['top']}
              resetToRootToken={accountsResetToken}
              scrollToTopToken={accountsScrollTopToken}
              onOpenAccount={openAccountDetail}
              onOpenAddTransaction={(accountId) =>
                navigation.navigate('AddTransaction', { initialAccountId: accountId })
              }
              onOpenTransaction={openTransactionEditor}
              onOpenTransactionSplitBadge={openTransactionSplitBill}
              onOpenSettings={openAccountSettings}
              onOpenNetAssetsInsight={() =>
                openActivityBreakdownInsight('asset_history', monthKeyFromDateLocal(new Date()))
              }
            />
          </View>
        </MountedTab>
        <MountedTab active={activeTab === 'calendar'} shouldPreload={preloadedTabs.has('calendar')}>
          <MemoCalendarScreen
            scrollToTopToken={calendarScrollTopToken}
            resetToCurrentMonthToken={calendarResetToken}
            onOpenTransaction={openTransactionEditor}
            onOpenTransactionSplitBadge={openTransactionSplitBill}
            onOpenBreakdownInsight={openActivityBreakdownInsight}
            onSelectionModeChange={setIsCalendarSelectionMode}
          />
        </MountedTab>
        <MountedTab active={activeTab === 'insights'} shouldPreload={preloadedTabs.has('insights')}>
          <MemoInsightsScreen
            resetToCurrentMonthToken={insightsResetToMonthToken}
            onOpenDrilldown={openInsightsDrilldown}
            onOpenTransaction={openTransactionEditor}
            onOpenProPaywall={() => openProPaywall('insights_trend')}
            activityBreakdownInsightRequest={activityBreakdownInsightRequest}
            isSimpleMode={isSimpleMode}
            onTutorialTargetLayout={handleTutorialTargetLayout}
            tutorialSpotlightRequest={tutorialSpotlightRequest}
          />
        </MountedTab>
        <MountedTab active={activeTab === 'settings'} shouldPreload={preloadedTabs.has('settings')}>
          {/* Settings screens are numerous and form-like; pad the whole stack
              above the floating glass bar instead of threading the inset into
              every screen. No-op (0) in fallback mode. */}
          <View style={{ flex: 1, paddingBottom: bottomNavContentInset }}>
            <MemoSettingsStack
              resetToRootToken={settingsResetToken}
              scrollToTopToken={settingsScrollTopToken}
              onOpenRecurringEditor={openRecurringEditor}
              onOpenProPaywall={() => openProPaywall('settings')}
              onScreenChange={setSettingsCurrentScreen}
              onStartTutorial={startGuidedTutorial}
              onTutorialTargetLayout={handleTutorialTargetLayout}
              tutorialSpotlightRequest={tutorialSpotlightRequest}
            />
          </View>
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
          {activeTab === 'home' ? (
            <AddFab
              onPress={openBottomNavPrimaryAction}
              onLongPress={voiceEnabled ? () => voiceHandleRef.current?.start() : undefined}
              onLongPressEnd={voiceEnabled ? () => voiceHandleRef.current?.stop() : undefined}
              showVoiceHint={voiceEnabled}
              accessibilityLabel={I18n.t('onboarding.checklist.add_transaction')}
              onTutorialTargetLayout={handleTutorialTargetLayout}
              tutorialSpotlightRequest={tutorialSpotlightRequest}
            />
          ) : null}
        </>
      ) : null}

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
  const { isSimpleMode, simpleWalletId, quickEntryPrefs } = useApp();
  // When quick entry is turned off, every + button routes straight to the full
  // transaction form instead of the quick-add sheet.
  if (!quickEntryPrefs.quickEntryEnabled) {
    return (
      <AddTransactionScreen
        onClose={() => navigation.goBack()}
        onSubmitReady={(input) => {
          requestOpenTransactions({ monthKey: monthKeyFromIsoLocal(input.date) });
        }}
        isSimpleMode={isSimpleMode}
        simpleWalletId={simpleWalletId}
        initialAccountId={route.params?.initialAccountId}
        initialValues={route.params?.initialValues}
      />
    );
  }
  return (
    <QuickAddScreen
      onClose={() => navigation.goBack()}
      onSubmitReady={(input) => {
        requestOpenTransactions({ monthKey: monthKeyFromIsoLocal(input.date) });
      }}
      onExpandToDetailed={(initialValues, initialAccountId) => {
        navigation.replace('AddTransactionDetailed', {
          initialAccountId,
          initialValues,
        });
      }}
      onOpenQuickEntrySettings={() => navigation.push('SettingsQuickEntry')}
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
        requestOpenTransactions({ monthKey: monthKeyFromIsoLocal(input.date) });
      }}
      isSimpleMode={isSimpleMode}
      simpleWalletId={simpleWalletId}
      initialAccountId={route.params?.initialAccountId}
      initialValues={route.params?.initialValues}
    />
  );
}

function WidgetSnapshotSync() {
  const { transactions, settings, categories, insightsPreferencesJson, getTrueHourlyRateForDate } =
    useApp();
  const { isPro } = usePro();

  useEffect(() => {
    const savingsExclusions = parseSavingsExclusions(insightsPreferencesJson);
    const snapshot = buildMoney2TimeWidgetSnapshot({
      transactions,
      settings,
      isPro,
      getTrueHourlyRateForDate,
      categories,
      excludedSavingsIncomeCategoryIds: savingsExclusions.income,
      excludedSavingsExpenseCategoryIds: savingsExclusions.expense,
    });

    void writeMoney2TimeWidgetSnapshot(snapshot).then(() => reloadMoney2TimeWidgets());
  }, [
    categories,
    getTrueHourlyRateForDate,
    insightsPreferencesJson,
    isPro,
    settings,
    transactions,
  ]);

  return null;
}

function EditTransactionRouteScreen({ route, navigation }: RootStackRouteProps<'EditTransaction'>) {
  const { transactions, isSimpleMode, simpleWalletId } = useApp();
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
      onOpenAddTransaction={(accountId) =>
        navigation.push('AddTransaction', { initialAccountId: accountId })
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
  return <AccountsScreen onBack={() => navigation.goBack()} managementOnly useNativeBackGesture />;
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
    />
  );
}

function SettingsQuickEntryRouteScreen({ navigation }: RootStackRouteProps<'SettingsQuickEntry'>) {
  return <QuickEntrySettingsScreen onBack={() => navigation.goBack()} />;
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
    />
  );
}

function RecurringEditorRouteScreen({ route, navigation }: RootStackRouteProps<'RecurringEditor'>) {
  const {
    settings,
    recurringRules,
    createRecurringRule,
    updateRecurringRule,
    isSimpleMode,
    simpleWalletId,
  } = useApp();
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
            currency: settings.currencySymbol,
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
  const { isLoading, settings, quickEntryPrefs } = useApp();
  const { isTablet } = useDeviceLayout();
  const resolvedTheme = useResolvedTheme();
  const themeStyle = useThemeVars();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const [showTutorialPrompt, setShowTutorialPrompt] = useState(false);
  const [featureAnnouncement, setFeatureAnnouncement] = useState<FeatureAnnouncement | null>(null);
  const [featureAnnouncementVisible, setFeatureAnnouncementVisible] = useState(false);
  const [tutorialStartToken, setTutorialStartToken] = useState(0);
  const [mainShellCurrentScreen, setMainShellCurrentScreen] = useState('home');
  const [rootActiveScreen, setRootActiveScreen] = useState<keyof RootStackParamList>('Main');
  const navigationLocaleKey = settings.locale ?? I18n.locale ?? 'en';
  const rootScreenListeners = useMemo(() => createNativeStackSwipeHapticListeners(), []);
  const previousVisibleScreenRef = useRef<string | null>(null);
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

    const previousScreen = previousVisibleScreenRef.current;
    previousVisibleScreenRef.current = visibleScreen;

    void setCurrentScreen(visibleScreen);

    if (previousScreen === visibleScreen) return;
    if (visibleScreen === 'onboarding' || isMainTabScreen(visibleScreen)) return;

    void trackEvent(AnalyticsEvents.SCREEN_VIEWED, { screen: visibleScreen });
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
        const nextAnnouncement = await getLatestUnseenAnnouncementForUser(settings.appUserId);
        if (cancelled || !nextAnnouncement) return;
        setFeatureAnnouncement(nextAnnouncement);
        setFeatureAnnouncementVisible(true);
      })();
    });

    return () => {
      cancelled = true;
      interactionHandle.cancel();
    };
  }, [isLoading, settings.appUserId, settings.onboardingCompleted, showTutorialPrompt]);

  const handleOnboardingComplete = useCallback(() => {
    setTutorialStartToken(0);
    InteractionManager.runAfterInteractions(() => {
      setShowTutorialPrompt(true);
    });
    void trackEvent(AnalyticsEvents.ONBOARDING_COMPLETED);
  }, []);

  const handleStartTutorialNow = useCallback(() => {
    setShowTutorialPrompt(false);
    setTutorialStartToken((prev) => prev + 1);
  }, []);

  const handleSkipTutorialPrompt = useCallback(() => {
    setShowTutorialPrompt(false);
  }, []);

  const handleDismissFeatureAnnouncement = useCallback(() => {
    const announcementId = featureAnnouncement?.id;
    setFeatureAnnouncementVisible(false);
    if (announcementId) {
      void markFeatureAnnouncementSeen(settings.appUserId, announcementId);
    }
  }, [featureAnnouncement?.id, settings.appUserId]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background" style={themeStyle}>
        <View className="items-center rounded-[28px] border border-border/40 bg-card px-8 py-8 shadow-soft">
          <Mascot size={130} mood="sleepy" animate />
          <Text variant="friendly" tone="muted" className="mt-4">
            {I18n.t('app.loading_world')}
          </Text>
        </View>
        <View className="mt-4">
          <LoadingDots size="large" />
        </View>
      </View>
    );
  }

  if (!settings.onboardingCompleted) {
    return (
      <View style={[styles.flex, themeStyle]}>
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={themeStyle}>
      <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
      <WidgetSnapshotSync />
      <NavigationContainer
        key={`locale:${navigationLocaleKey}`}
        ref={navigationRef}
        onReady={syncRootActiveScreen}
        onStateChange={syncRootActiveScreen}
      >
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
                  tutorialStartToken={tutorialStartToken}
                />
              </BottomNavMinimizeProvider>
            )}
          </RootStack.Screen>
          <RootStack.Screen
            name="AddTransaction"
            component={AddTransactionRouteScreen}
            options={
              quickEntryPrefs.quickEntryEnabled
                ? {
                    presentation: 'transparentModal',
                    // QuickAddSheet handles its own enter/exit animation (backdrop fade +
                    // slide). Letting the navigator add its own fade on top stacks a
                    // ~300ms tail on dismiss, which looks like a "lingering grey" lag
                    // after submit. 'none' makes the route appear/disappear instantly
                    // so the only visible animation is the sheet's own.
                    animation: 'none',
                    gestureEnabled: false,
                    contentStyle: { backgroundColor: 'transparent' },
                  }
                : // With quick entry off, this route renders the full editor as a
                  // normal card so the slide animation and edge-swipe-back work.
                  SHARED_NATIVE_STACK_OPTIONS
            }
          />
          <RootStack.Screen
            name="AddTransactionDetailed"
            component={AddTransactionDetailedRouteScreen}
          />
          <RootStack.Screen name="EditTransaction" component={EditTransactionRouteScreen} />
          <RootStack.Screen name="AccountDetail" component={AccountDetailRouteScreen} />
          <RootStack.Screen name="SettingsAccounts" component={SettingsAccountsRouteScreen} />
          <RootStack.Screen name="SettingsRecurring" component={SettingsRecurringRouteScreen} />
          <RootStack.Screen name="SettingsHourlyValue" component={SettingsHourlyValueRouteScreen} />
          <RootStack.Screen name="SettingsQuickEntry" component={SettingsQuickEntryRouteScreen} />
          <RootStack.Screen
            name="SettingsWageCalculator"
            component={SettingsWageCalculatorRouteScreen}
          />
          <RootStack.Screen name="InsightsDrilldown" component={InsightsDrilldownRouteScreen} />
          <RootStack.Screen name="RecurringEditor" component={RecurringEditorRouteScreen} />
          <RootStack.Screen name="ProPaywall" component={ProPaywallRouteScreen} />
        </RootStack.Navigator>
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
        visible={featureAnnouncementVisible}
        onDismiss={handleDismissFeatureAnnouncement}
      />
      <ReviewPrePromptSheet />
    </View>
  );
}

export default function App() {
  const shouldLoadCustomFonts = Platform.OS !== 'ios';
  const [fontsLoaded] = useFonts(
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

  if (shouldLoadCustomFonts && !fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <KeyboardProvider>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <AppErrorBoundary>
            <AppProvider>
              <ProProvider>
                <ThemeGate>
                  <AppContent />
                </ThemeGate>
              </ProProvider>
            </AppProvider>
          </AppErrorBoundary>
          <MascotWarmup />
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
