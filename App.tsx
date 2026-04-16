import './global.css';

import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
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
  ActivityIndicator,
  Appearance,
  InteractionManager,
  Platform,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '~/components/feedback/AppErrorBoundary';
import { Mascot } from '~/components/feedback/Mascot';
import { BottomNav, type TabName } from '~/components/navigation/BottomNav';
import { Button, Text, ThemeModal } from '~/components/ui';
import { AppProvider, useApp } from '~/context/AppContext';
import { ProProvider } from '~/context/ProContext';
import { ThemeProvider, useResolvedTheme } from '~/context/ThemeContext';
import { AI_CHAT_MODEL } from '~/features/ai-chat/constants/models';
import { buildSystemPrompt } from '~/features/ai-chat/constants/prompts';
import { AIChatScreen } from '~/features/ai-chat/screens/AIChatScreen';
import * as aiChatLlamaService from '~/features/ai-chat/services/llamaService';
import * as aiChatModelManager from '~/features/ai-chat/services/modelManager';
import { HomeScreen } from '~/features/home/screens';
import { InsightsDrilldownScreen, InsightsScreen } from '~/features/insights/screens';
import { OnboardingFlow } from '~/features/onboarding/screens';
import {
  AccountsScreen,
  HourlyValueScreen,
  ProPaywallScreen,
  RecurringScreen,
  SettingsStack,
  WageCalculatorFlowScreen,
} from '~/features/settings/screens';
import { TransactionEditorScreen } from '~/features/transactions/components';
import {
  AddTransactionScreen,
  EditTransactionScreen,
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
import { useThemeColors } from '~/hooks/useThemeColors';
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
import { subscribeOpenHourlyValueRequest } from '~/services/hourlyValueNavigation';
import { subscribeOpenPaywallRequest } from '~/services/paywallNavigation';
import {
  requestOpenTransactions,
  subscribeOpenTransactionsRequest,
} from '~/services/transactionsNavigation';
import type { TransactionWithRelations } from '~/types';
import {
  dayKeyFromDateLocal,
  dayKeyFromIsoLocal,
  monthKeyFromDateLocal,
  monthKeyFromIsoLocal,
} from '~/utils/formatters';

type MainTab = TabName;
type ActivityInsightType =
  | 'expense_breakdown'
  | 'income_breakdown'
  | 'expense_trend'
  | 'expense_sentiment';
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
}

const GUIDED_TUTORIAL_STEPS: GuidedTutorialStep[] = [
  {
    tab: 'home',
    targetId: 'home.display_toggle',
    titleKey: 'tutorial.coach_steps.home_title',
    bodyKey: 'tutorial.coach_steps.home_body',
  },
  {
    tab: 'home',
    targetId: 'home.converter',
    titleKey: 'tutorial.coach_steps.converter_title',
    bodyKey: 'tutorial.coach_steps.converter_body',
  },
  {
    tab: 'transactions',
    targetId: 'nav.add',
    titleKey: 'tutorial.coach_steps.add_title',
    bodyKey: 'tutorial.coach_steps.add_body',
  },
  {
    tab: 'insights',
    targetId: 'insights.type_selector',
    titleKey: 'tutorial.coach_steps.insights_title',
    bodyKey: 'tutorial.coach_steps.insights_body',
  },
  {
    tab: 'settings',
    targetId: 'settings.recurring',
    titleKey: 'tutorial.coach_steps.recurring_title',
    bodyKey: 'tutorial.coach_steps.recurring_body',
  },
  {
    tab: 'settings',
    targetId: 'settings.statement_import',
    titleKey: 'tutorial.coach_steps.statement_import_title',
    bodyKey: 'tutorial.coach_steps.statement_import_body',
  },
  {
    tab: 'settings',
    targetId: 'settings.management',
    titleKey: 'tutorial.coach_steps.management_title',
    bodyKey: 'tutorial.coach_steps.management_body',
  },
  {
    tab: 'settings',
    targetId: 'settings.start_tutorial',
    titleKey: 'tutorial.coach_steps.settings_title',
    bodyKey: 'tutorial.coach_steps.settings_body',
  },
];

const MemoHomeScreen = React.memo(HomeScreen);
const MemoTransactionsScreen = React.memo(TransactionsScreen);
const MemoSimpleActivityScreen = React.memo(SimpleActivityScreen);
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

function MountedTab({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <View
      pointerEvents={active ? 'auto' : 'none'}
      style={[styles.tabSlot, active ? styles.tabVisible : styles.tabHidden]}
    >
      {children}
    </View>
  );
}

const MAIN_TAB_SCREEN_NAMES = new Set<string>(['home', 'transactions', 'insights', 'settings']);

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

function AIChatStartupPreloader() {
  const { accounts, categories, isLoading, isSimpleMode, settings } = useApp();

  useEffect(() => {
    if (isLoading || !settings.onboardingCompleted || !settings.aiChatEnabled) return;
    if (!aiChatModelManager.isModelDownloaded(AI_CHAT_MODEL.fileName)) return;

    const preloadModel = async () => {
      try {
        await aiChatLlamaService.loadModel(
          aiChatModelManager.getModelPath(AI_CHAT_MODEL.fileName),
        );

        const today = dayKeyFromDateLocal(new Date());
        await aiChatLlamaService.primeTransactionParser(
          buildSystemPrompt(
            accounts,
            categories,
            settings.currencyCode,
            settings.currencySymbol,
            today,
            !isSimpleMode,
          ),
          '30 for breakfast',
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.warn('[App] AI chat startup preload failed:', detail);
      }
    };

    void preloadModel();
  }, [
    accounts,
    categories,
    isLoading,
    isSimpleMode,
    settings.aiChatEnabled,
    settings.currencyCode,
    settings.currencySymbol,
    settings.onboardingCompleted,
  ]);

  return null;
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
  const { isSimpleMode, settings } = useApp();
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
  const [homeScrollTopToken, setHomeScrollTopToken] = useState(0);
  const [transactionsScrollTopToken, setTransactionsScrollTopToken] = useState(0);
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
      setActiveTab('transactions');
      jumpTransactionsToMonth(monthKey ?? monthKeyFromDateLocal(new Date()));
    });
  }, [jumpTransactionsToMonth]);

  const openAddTransaction = useCallback(() => {
    navigation.navigate('AddTransaction');
  }, [navigation]);

  const openTransactionEditor = useCallback(
    (transaction: TransactionWithRelations) => {
      navigation.navigate('EditTransaction', { transactionId: transaction.id });
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

  const openSettingsScreen = useCallback(
    (screen: 'Accounts' | 'Recurring') => {
      if (screen === 'Recurring') {
        navigation.navigate('SettingsRecurring');
      } else {
        navigation.navigate('SettingsAccounts');
      }
    },
    [navigation],
  );

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

  const openExpenseTrend = useCallback(() => {
    const now = new Date();
    const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    rangeStart.setDate(rangeStart.getDate() - 6);
    const rangeEndKey = dayKeyFromDateLocal(now);
    openActivityBreakdownInsight('expense_trend', monthKeyFromDateLocal(now), {
      anchorDateKey: rangeEndKey,
      customEnd: rangeEndKey,
      customStart: dayKeyFromDateLocal(rangeStart),
      periodPreset: 'custom',
    });
  }, [openActivityBreakdownInsight]);

  const openExpenseSentiment = useCallback(() => {
    const now = new Date();
    const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    rangeStart.setDate(rangeStart.getDate() - 6);
    const rangeEndKey = dayKeyFromDateLocal(now);
    openActivityBreakdownInsight('expense_sentiment', monthKeyFromDateLocal(now), {
      anchorDateKey: rangeEndKey,
      customEnd: rangeEndKey,
      customStart: dayKeyFromDateLocal(rangeStart),
      periodPreset: 'custom',
    });
  }, [openActivityBreakdownInsight]);

  const openProPaywall = useCallback(
    (source?: string) => {
      navigation.navigate('ProPaywall', source ? { source } : undefined);
    },
    [navigation],
  );

  const openAIChat = useCallback(() => {
    navigation.navigate('AIChat');
  }, [navigation]);
  const openBottomNavPrimaryAction = useCallback(() => {
    if (settings.centerAddButtonOpensAiChat) {
      openAIChat();
      return;
    }
    openAddTransaction();
  }, [openAIChat, openAddTransaction, settings.centerAddButtonOpensAiChat]);

  const shouldHideBottomNav =
    activeTab === 'transactions' && isTransactionsSelectionMode;

  const handleTabChange = useCallback(
    (tab: TabName) => {
      if (tab === 'home' && activeTab === 'home') {
        setHomeScrollTopToken((prev) => prev + 1);
      }
      if (tab === 'transactions' && activeTab === 'transactions') {
        jumpTransactionsToMonth(monthKeyFromDateLocal(new Date()));
        setTransactionsScrollTopToken((prev) => prev + 1);
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
    [activeTab, jumpTransactionsToMonth],
  );

  useEffect(() => {
    const previousTab = previousActiveTabRef.current;
    previousActiveTabRef.current = activeTab;

    if (previousTab === activeTab) return;
    void trackEvent(AnalyticsEvents.TAB_VIEWED, { tab: activeTab });
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

  const currentGuidedStep = isGuidedTutorialActive
    ? (GUIDED_TUTORIAL_STEPS[guidedTutorialStepIndex] ?? null)
    : null;
  const currentGuidedTargetRect = currentGuidedStep
    ? (tutorialTargetRects[currentGuidedStep.targetId] ?? null)
    : null;
  const currentGuidedTabRect =
    currentGuidedStep && currentGuidedStep.targetId !== 'nav.add'
      ? (tutorialNavTabRects[currentGuidedStep.tab] ?? null)
      : null;
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
    <View className="flex-1 bg-background">
      <View style={styles.flex}>
        <MountedTab active={activeTab === 'home'}>
          <MemoHomeScreen
            scrollToTopToken={homeScrollTopToken}
            onOpenAccount={openAccountDetail}
            onOpenTransaction={openTransactionEditor}
            onOpenSettingsScreen={openSettingsScreen}
            onOpenExpenseTrend={openExpenseTrend}
            onOpenExpenseSentiment={openExpenseSentiment}
            onTutorialTargetLayout={handleTutorialTargetLayout}
            tutorialSpotlightRequest={tutorialSpotlightRequest}
          />
        </MountedTab>
        <MountedTab active={activeTab === 'transactions'}>
          {isSimpleMode ? (
            <MemoSimpleActivityScreen
              scrollToTopToken={transactionsScrollTopToken}
              focusMonthKey={transactionsFocusMonthKey}
              focusMonthToken={transactionsFocusMonthToken}
              onOpenTransaction={openTransactionEditor}
              onOpenBreakdownInsight={openActivityBreakdownInsight}
              tutorialResetToken={transactionsTutorialResetToken}
            />
          ) : (
            <MemoTransactionsScreen
              scrollToTopToken={transactionsScrollTopToken}
              focusMonthKey={transactionsFocusMonthKey}
              focusMonthToken={transactionsFocusMonthToken}
              onOpenTransaction={openTransactionEditor}
              onOpenBreakdownInsight={openActivityBreakdownInsight}
              onSelectionModeChange={setIsTransactionsSelectionMode}
              tutorialResetToken={transactionsTutorialResetToken}
            />
          )}
        </MountedTab>
        <MountedTab active={activeTab === 'insights'}>
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
        <MountedTab active={activeTab === 'settings'}>
          <MemoSettingsStack
            resetToRootToken={settingsResetToken}
            scrollToTopToken={settingsScrollTopToken}
            onOpenRecurringEditor={openRecurringEditor}
            onOpenProPaywall={() => openProPaywall('settings')}
            onOpenAIChat={openAIChat}
            onScreenChange={setSettingsCurrentScreen}
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
            onPressAdd={openBottomNavPrimaryAction}
            addButtonAccessibilityLabel={
              settings.centerAddButtonOpensAiChat
                ? I18n.t('settings.ai_chat')
                : I18n.t('onboarding.checklist.add_transaction')
            }
            onTutorialTargetLayout={handleTutorialTargetLayout}
            onTutorialTabLayout={handleTutorialTabLayout}
            tutorialSpotlightRequest={tutorialSpotlightRequest}
            tutorialFocusedTab={currentTutorialFocusedTab}
            tutorialMeasureToken={tutorialSpotlightRequest.token}
          />
        </>
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
        navigation.navigate('EditTransaction', { transactionId: transaction.id })
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

function AIChatRouteScreen({ navigation }: RootStackRouteProps<'AIChat'>) {
  return <AIChatScreen onBack={() => navigation.goBack()} />;
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
        navigation.navigate('EditTransaction', { transactionId: transaction.id })
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
  const { isLoading, settings } = useApp();
  const { isTablet } = useDeviceLayout();
  const resolvedTheme = useResolvedTheme();
  const themeColors = useThemeColors();
  const themeStyle = useThemeVars();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const [showTutorialPrompt, setShowTutorialPrompt] = useState(false);
  const [tutorialStartToken, setTutorialStartToken] = useState(0);
  const [mainShellCurrentScreen, setMainShellCurrentScreen] = useState('home');
  const [rootActiveScreen, setRootActiveScreen] = useState<keyof RootStackParamList>('Main');
  const navigationLocaleKey = settings.locale ?? I18n.locale ?? 'en';
  const rootScreenListeners = useMemo(() => createNativeStackSwipeHapticListeners(), []);
  const previousVisibleScreenRef = useRef<string | null>(null);

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

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background" style={themeStyle}>
        <View className="items-center rounded-[28px] border border-border/40 bg-card px-8 py-8 shadow-soft">
          <Mascot size={130} mood="sleepy" animate />
          <Text variant="friendly" tone="muted" className="mt-4">
            {I18n.t('app.loading_world')}
          </Text>
        </View>
        <ActivityIndicator size="large" color={themeColors.primary} className="mt-4" />
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
      <AIChatStartupPreloader />
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
              <MainShellScreen
                navigation={props.navigation}
                onVisibleScreenChange={setMainShellCurrentScreen}
                tutorialStartToken={tutorialStartToken}
              />
            )}
          </RootStack.Screen>
          <RootStack.Screen name="AddTransaction" component={AddTransactionRouteScreen} />
          <RootStack.Screen name="EditTransaction" component={EditTransactionRouteScreen} />
          <RootStack.Screen name="AccountDetail" component={AccountDetailRouteScreen} />
          <RootStack.Screen name="SettingsAccounts" component={SettingsAccountsRouteScreen} />
          <RootStack.Screen name="SettingsRecurring" component={SettingsRecurringRouteScreen} />
          <RootStack.Screen name="SettingsHourlyValue" component={SettingsHourlyValueRouteScreen} />
          <RootStack.Screen
            name="SettingsWageCalculator"
            component={SettingsWageCalculatorRouteScreen}
          />
          <RootStack.Screen name="InsightsDrilldown" component={InsightsDrilldownRouteScreen} />
          <RootStack.Screen name="RecurringEditor" component={RecurringEditorRouteScreen} />
          <RootStack.Screen name="ProPaywall" component={ProPaywallRouteScreen} />
          <RootStack.Screen name="AIChat" component={AIChatRouteScreen} />
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
          SpaceMono_400Regular,
          SpaceMono_700Bold,
        }
      : {},
  );

  if (shouldLoadCustomFonts && !fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <AppErrorBoundary>
          <AppProvider>
            <ProProvider>
              <ThemeGate>
                <AppContent />
              </ThemeGate>
            </ProProvider>
          </AppProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
