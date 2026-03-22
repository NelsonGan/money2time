import { BarChart2, House, Plus, Settings, Wallet } from 'lucide-react-native';
import React, { memo, useCallback, useEffect, useRef } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui';
import type { TutorialSpotlightRequest, TutorialTargetRect } from '~/features/tutorial/types';
import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';
import { usePressScale } from '~/hooks/usePressScale';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

export type TabName = 'transactions' | 'home' | 'insights' | 'settings';

interface BottomNavProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  hideTabs?: TabName[];
  onPressAdd?: () => void;
  onTutorialTargetLayout?: (targetId: 'nav.add', rect: TutorialTargetRect) => void;
  onTutorialTabLayout?: (tab: TabName, rect: TutorialTargetRect) => void;
  tutorialSpotlightRequest?: TutorialSpotlightRequest;
  tutorialFocusedTab?: TabName | null;
  tutorialMeasureToken?: number;
}

const TABS: { name: TabName; labelKey: string; icon: typeof House }[] = [
  { name: 'home', labelKey: 'nav.home', icon: House },
  { name: 'transactions', labelKey: 'nav.activity', icon: Wallet },
  { name: 'insights', labelKey: 'nav.insights', icon: BarChart2 },
  { name: 'settings', labelKey: 'nav.settings', icon: Settings },
];

const ADD_BUTTON_SIZE = 64;
const ADD_BUTTON_SLOT_WIDTH = 84;
const ADD_BUTTON_PROTRUSION = 18;
const NAV_ROW_HEIGHT = 56;

export function getBottomNavSafePadding(safeBottom: number) {
  return Platform.OS === 'ios' ? Math.max(safeBottom - 12, 8) : Math.max(safeBottom, 10);
}

export function getBottomNavReservedInset(safeBottom: number, includeAddButton = true) {
  return (
    (includeAddButton ? ADD_BUTTON_PROTRUSION : 0) +
    NAV_ROW_HEIGHT +
    getBottomNavSafePadding(safeBottom)
  );
}

const NavItem = memo(function NavItem({
  tab,
  icon: Icon,
  label,
  isActive,
  isTutorialFocused,
  onPressTab,
  tintActive,
  tintInactive,
  onTutorialTabLayout,
  tutorialMeasureToken,
}: {
  tab: TabName;
  icon: typeof House;
  label: string;
  isActive: boolean;
  isTutorialFocused: boolean;
  onPressTab: (tab: TabName) => void;
  tintActive: string;
  tintInactive: string;
  onTutorialTabLayout?: (tab: TabName, rect: TutorialTargetRect) => void;
  tutorialMeasureToken?: number;
}) {
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.88 });
  const navItemRef = useRef<React.ElementRef<typeof Pressable> | null>(null);
  const handlePress = useCallback(() => onPressTab(tab), [onPressTab, tab]);
  const reportLayout = useCallback(() => {
    if (!onTutorialTabLayout) return;
    navItemRef.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      onTutorialTabLayout(tab, { x, y, width, height });
    });
  }, [onTutorialTabLayout, tab]);
  const isEmphasized = isActive || isTutorialFocused;

  useEffect(() => {
    if (!onTutorialTabLayout) return;
    if (!tutorialMeasureToken) return;
    const refresh = setTimeout(() => {
      reportLayout();
    }, 70);
    return () => clearTimeout(refresh);
  }, [onTutorialTabLayout, reportLayout, tutorialMeasureToken]);

  return (
    <Animated.View style={animatedStyle} className="flex-1">
      <Pressable
        ref={navItemRef}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onLayout={reportLayout}
        className={cn(
          'min-h-[54px] items-center justify-center gap-0.5 rounded-2xl mx-0.5',
          isTutorialFocused && 'bg-primary/12',
        )}
      >
        <Icon
          size={20}
          color={isEmphasized ? tintActive : tintInactive}
          strokeWidth={isEmphasized ? 2.5 : 1.8}
        />
        <Text
          variant="label"
          className={cn('text-[10px]', isEmphasized ? 'text-primary' : 'text-muted-foreground')}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
});

export function BottomNav({
  activeTab,
  onTabChange,
  hideTabs,
  onPressAdd,
  onTutorialTargetLayout,
  onTutorialTabLayout,
  tutorialSpotlightRequest,
  tutorialFocusedTab,
  tutorialMeasureToken,
}: BottomNavProps) {
  const themeColors = useThemeColors();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const addButtonRef = useRef<React.ElementRef<typeof Pressable> | null>(null);
  const {
    animatedStyle: fabAnimatedStyle,
    handlePressIn: fabPressIn,
    handlePressOut: fabPressOut,
  } = usePressScale({ depth: 0.9 });

  const handleTabPress = useCallback(
    (tab: TabName) => {
      void triggerHaptic('medium');
      onTabChange(tab);
    },
    [onTabChange],
  );
  const handlePressAdd = useCallback(() => {
    void triggerHaptic('medium');
    onPressAdd?.();
  }, [onPressAdd]);
  const measureAddButton = useCallback(() => {
    if (!onTutorialTargetLayout) return;
    addButtonRef.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      onTutorialTargetLayout('nav.add', { x, y, width, height });
    });
  }, [onTutorialTargetLayout]);

  const handleAddButtonLayout = useCallback(() => {
    measureAddButton();
  }, [measureAddButton]);

  useEffect(() => {
    if (!tutorialSpotlightRequest?.active) return;
    if (tutorialSpotlightRequest.targetId !== 'nav.add') return;

    const firstPass = setTimeout(() => {
      measureAddButton();
    }, 40);
    const secondPass = setTimeout(() => {
      measureAddButton();
    }, 220);

    return () => {
      clearTimeout(firstPass);
      clearTimeout(secondPass);
    };
  }, [measureAddButton, tutorialSpotlightRequest]);

  const { isTablet } = useDeviceLayout();
  const visibleTabs = hideTabs?.length ? TABS.filter((t) => !hideTabs.includes(t.name)) : TABS;
  const midIndex = Math.floor(visibleTabs.length / 2);
  const showAddButton = !!onPressAdd;

  // Keep enough safe-area room without leaving a large block of background below the bar.
  const bottomPad = getBottomNavSafePadding(safeBottom);

  const renderTabs = (tabs: typeof visibleTabs) =>
    tabs.map((tab) => (
      <NavItem
        key={tab.name}
        tab={tab.name}
        icon={tab.icon}
        label={I18n.t(tab.labelKey)}
        isActive={activeTab === tab.name}
        isTutorialFocused={tutorialFocusedTab === tab.name}
        tintActive={themeColors.primary}
        tintInactive={themeColors.textMuted}
        onPressTab={handleTabPress}
        onTutorialTabLayout={onTutorialTabLayout}
        tutorialMeasureToken={tutorialMeasureToken}
      />
    ));

  return (
    <View
      pointerEvents="box-none"
      style={[
        {
          marginTop: showAddButton ? -ADD_BUTTON_PROTRUSION : 0,
          paddingTop: showAddButton ? ADD_BUTTON_PROTRUSION : 0,
          paddingBottom: bottomPad,
        },
        isTablet && {
          maxWidth: TABLET_CONTENT_MAX_WIDTH,
          alignSelf: 'center' as const,
          width: '100%',
        },
      ]}
      className="px-4"
    >
      {/* Floating pill nav */}
      <View
        className="rounded-[26px] border border-border/30 bg-card/95 shadow-nav-float"
        style={{ overflow: 'visible' }}
      >
        <View className="flex-row items-center px-2.5 py-1.5" style={{ minHeight: NAV_ROW_HEIGHT }}>
          {showAddButton ? (
            <>
              {renderTabs(visibleTabs.slice(0, midIndex))}
              <View
                className="items-center justify-center"
                style={{ width: ADD_BUTTON_SLOT_WIDTH, height: NAV_ROW_HEIGHT }}
              >
                <Animated.View
                  style={[
                    fabAnimatedStyle,
                    {
                      position: 'absolute',
                      top: -ADD_BUTTON_PROTRUSION,
                    },
                  ]}
                >
                  <Pressable
                    ref={addButtonRef}
                    onPress={handlePressAdd}
                    onPressIn={fabPressIn}
                    onPressOut={fabPressOut}
                    onLayout={handleAddButtonLayout}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('onboarding.checklist.add_transaction')}
                    className="items-center justify-center rounded-full shadow-glow-lg"
                    style={{
                      width: ADD_BUTTON_SIZE,
                      height: ADD_BUTTON_SIZE,
                      borderRadius: ADD_BUTTON_SIZE / 2,
                      backgroundColor: themeColors.primary,
                    }}
                  >
                    <Plus size={28} color="#FFFFFF" strokeWidth={2.8} />
                  </Pressable>
                </Animated.View>
              </View>
              {renderTabs(visibleTabs.slice(midIndex))}
            </>
          ) : (
            renderTabs(visibleTabs)
          )}
        </View>
      </View>
    </View>
  );
}
