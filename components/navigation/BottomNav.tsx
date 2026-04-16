import React, { memo, useCallback, useEffect, useRef } from 'react';
import { InteractionManager, Platform, Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ActivityIcon,
  HomeIcon,
  InsightsIcon,
  PlusIcon,
  SettingsIcon,
} from '~/components/icons/NavIcons';
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
  addButtonAccessibilityLabel?: string;
  onTutorialTargetLayout?: (targetId: 'nav.add', rect: TutorialTargetRect) => void;
  onTutorialTabLayout?: (tab: TabName, rect: TutorialTargetRect) => void;
  tutorialSpotlightRequest?: TutorialSpotlightRequest;
  tutorialFocusedTab?: TabName | null;
  tutorialMeasureToken?: number;
}

type NavIconComponent = typeof HomeIcon;

const TABS: { name: TabName; icon: NavIconComponent }[] = [
  { name: 'home', icon: HomeIcon },
  { name: 'transactions', icon: ActivityIcon },
  { name: 'insights', icon: InsightsIcon },
  { name: 'settings', icon: SettingsIcon },
];

const ADD_BUTTON_SIZE = 44;
const ADD_BUTTON_SLOT_WIDTH = 60;
const NAV_ROW_HEIGHT = 58;
const ICON_SIZE = 26;

export function getBottomNavSafePadding(safeBottom: number) {
  return Platform.OS === 'ios' ? Math.max(safeBottom - 12, 8) : Math.max(safeBottom, 10);
}

export function getBottomNavReservedInset(safeBottom: number) {
  return NAV_ROW_HEIGHT + getBottomNavSafePadding(safeBottom);
}

const NavItem = memo(function NavItem({
  tab,
  Icon,
  isActive,
  isTutorialFocused,
  onPressTab,
  tintActive,
  tintInactive,
  onTutorialTabLayout,
  tutorialMeasureToken,
}: {
  tab: TabName;
  Icon: NavIconComponent;
  isActive: boolean;
  isTutorialFocused: boolean;
  onPressTab: (tab: TabName) => void;
  tintActive: string;
  tintInactive: string;
  onTutorialTabLayout?: (tab: TabName, rect: TutorialTargetRect) => void;
  tutorialMeasureToken?: number;
}) {
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.85 });
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
    const androidExtra =
      Platform.OS === 'android'
        ? setTimeout(() => {
            reportLayout();
          }, 300)
        : null;
    return () => {
      clearTimeout(refresh);
      if (androidExtra) clearTimeout(androidExtra);
    };
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
          'items-center justify-center rounded-2xl mx-0.5',
          isTutorialFocused && 'bg-primary/12',
        )}
        style={{ height: NAV_ROW_HEIGHT }}
      >
        <Icon
          size={ICON_SIZE}
          color={isEmphasized ? tintActive : tintInactive}
          strokeWidth={isEmphasized ? 2.2 : 1.6}
          filled={isEmphasized}
        />
      </Pressable>
    </Animated.View>
  );
});

export function BottomNav({
  activeTab,
  onTabChange,
  hideTabs,
  onPressAdd,
  addButtonAccessibilityLabel,
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

    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      measureAddButton();
    });
    const firstPass = setTimeout(() => {
      measureAddButton();
    }, 40);
    const secondPass = setTimeout(() => {
      measureAddButton();
    }, 220);
    const androidExtraPass =
      Platform.OS === 'android'
        ? setTimeout(() => {
            measureAddButton();
          }, 500)
        : null;

    return () => {
      interactionHandle.cancel();
      clearTimeout(firstPass);
      clearTimeout(secondPass);
      if (androidExtraPass) clearTimeout(androidExtraPass);
    };
  }, [measureAddButton, tutorialSpotlightRequest]);

  const { isTablet } = useDeviceLayout();
  const visibleTabs = hideTabs?.length ? TABS.filter((t) => !hideTabs.includes(t.name)) : TABS;
  const midIndex = Math.floor(visibleTabs.length / 2);
  const showAddButton = !!onPressAdd;

  const bottomPad = getBottomNavSafePadding(safeBottom);

  const renderTabs = (tabs: typeof visibleTabs) =>
    tabs.map((tab) => (
      <NavItem
        key={tab.name}
        tab={tab.name}
        Icon={tab.icon}
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
        { paddingBottom: bottomPad },
        isTablet && {
          maxWidth: TABLET_CONTENT_MAX_WIDTH,
          alignSelf: 'center' as const,
          width: '100%',
        },
      ]}
      className="border-t border-border/30 bg-card"
    >
      <View
        className="flex-row items-center px-2"
        style={{ minHeight: NAV_ROW_HEIGHT }}
      >
        {showAddButton ? (
          <>
            {renderTabs(visibleTabs.slice(0, midIndex))}
            <View
              className="items-center justify-center"
              style={{ width: ADD_BUTTON_SLOT_WIDTH, height: NAV_ROW_HEIGHT }}
            >
              <Animated.View style={fabAnimatedStyle}>
                <Pressable
                  ref={addButtonRef}
                  onPress={handlePressAdd}
                  onPressIn={fabPressIn}
                  onPressOut={fabPressOut}
                  onLayout={handleAddButtonLayout}
                  accessibilityRole="button"
                  accessibilityLabel={
                    addButtonAccessibilityLabel ?? I18n.t('onboarding.checklist.add_transaction')
                  }
                  className="items-center justify-center rounded-full"
                  style={{
                    width: ADD_BUTTON_SIZE,
                    height: ADD_BUTTON_SIZE,
                    borderRadius: ADD_BUTTON_SIZE / 2,
                    backgroundColor: themeColors.primary,
                  }}
                >
                  <PlusIcon size={22} color="#FFFFFF" strokeWidth={2.8} />
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
  );
}
