import React, { memo, useCallback, useMemo } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AlbumsIcon,
  HomeIcon,
  InsightsIcon,
  SettingsIcon,
  WalletIcon,
} from '~/components/icons/NavIcons';
import { useBottomNavMinimize } from '~/components/navigation/BottomNavMinimize';
import { FLOATING_NAV_HEIGHT, getFloatingNavBottomGap } from '~/components/navigation/floatingNav';
import { getLiquidGlassNavView } from '~/components/navigation/liquidGlass';
import type { TabName } from '~/components/navigation/navTabs';
import { ClayIcon, type ClayIconName } from '~/components/ui/ClayIcon';
import { useIsFlatIcons, useResolvedTheme } from '~/context/ThemeContext';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { usePressScale } from '~/hooks/usePressScale';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

export type { TabName };

interface BottomNavProps {
  tabs: readonly TabName[];
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
}

type NavIconComponent = typeof HomeIcon;

interface NavTabMeta {
  icon: ClayIconName;
  activeIcon: ClayIconName;
  /**
   * The pre-clay SVG for the original five tabs. Pages added later have none
   * and fall back to the flat Lucide glyph ClayIcon maps their art to.
   */
  flatIcon?: NavIconComponent;
  labelKey: string;
}

/**
 * Tab glyphs in both icon styles.
 *
 * Clay artwork carries its own colour, so an active clay tab is a different
 * *file* rather than a tint — see components/ui/ClayIcon.tsx. Tabs with only
 * one pose (albums, and every page that can be added to the bar) reuse their
 * resting art and lean on the size and opacity step instead. The flat set is
 * the pre-clay SVG pair, which does the opposite: one component, tinted and
 * filled when active.
 */
export const NAV_TAB_META: Record<TabName, NavTabMeta> = {
  calendar: {
    icon: 'nav/home',
    activeIcon: 'nav/home-active',
    flatIcon: HomeIcon,
    labelKey: 'nav.tab_calendar',
  },
  accounts: {
    icon: 'nav/wallet',
    activeIcon: 'nav/wallet-active',
    flatIcon: WalletIcon,
    labelKey: 'nav.tab_accounts',
  },
  insights: {
    icon: 'nav/insights',
    activeIcon: 'nav/insights-active',
    flatIcon: InsightsIcon,
    labelKey: 'nav.tab_insights',
  },
  albums: {
    icon: 'settings/albums',
    activeIcon: 'settings/albums',
    flatIcon: AlbumsIcon,
    labelKey: 'nav.tab_albums',
  },
  settings: {
    icon: 'nav/settings',
    activeIcon: 'nav/settings-active',
    flatIcon: SettingsIcon,
    labelKey: 'nav.tab_settings',
  },
  goals: {
    icon: 'status/goal-target',
    activeIcon: 'status/goal-target',
    labelKey: 'nav.tab_goals',
  },
  recurring: {
    icon: 'settings/recurring',
    activeIcon: 'settings/recurring',
    labelKey: 'nav.tab_recurring',
  },
  reimbursements: {
    icon: 'money-time/wallet-in',
    activeIcon: 'money-time/wallet-in',
    labelKey: 'nav.tab_reimbursements',
  },
  receipts: {
    icon: 'settings/receipts',
    activeIcon: 'settings/receipts',
    labelKey: 'nav.tab_receipts',
  },
  settleUp: {
    icon: 'settings/settle-up',
    activeIcon: 'settings/settle-up',
    labelKey: 'nav.tab_settle_up',
  },
};

const NAV_ROW_HEIGHT = 58;
const ICON_SIZE = 26;
const ICON_SIZE_ACTIVE = 30;
const ICON_OPACITY_RESTING = 0.72;

const FLOATING_NAV_MARGIN_H = 20;
const FLOATING_NAV_MAX_WIDTH = 520;
// Calendar zoom layers use positive z-indices and extend beneath the floating bar.
// Keep the bar above them so it remains visible and receives touches.
const NAV_OVERLAY_Z_INDEX = 20;
// How far the bar shrinks/sinks when minimized on scroll.
const FLOATING_MINIMIZE_SCALE = 0.88;
const FLOATING_MINIMIZE_TRANSLATE_Y = 12;
const FLOATING_MINIMIZE_OPACITY = 0.8;

type BlurNavView = typeof import('expo-blur').BlurView;
let cachedBlurNavView: BlurNavView | null | undefined;

function getBlurNavView(): BlurNavView | null {
  if (cachedBlurNavView !== undefined) return cachedBlurNavView;
  cachedBlurNavView = null;
  // expo-blur 58 only blurs on Android inside an explicit BlurTargetView and
  // otherwise draws just its tint, so Android uses the solid fallback surface.
  // (expo-blur 15 blurred the whole window instead, which crashed release
  // builds when R8 renamed the class it scoped to; see the keep-rules test.)
  if (Platform.OS === 'android') return cachedBlurNavView;
  try {
    // Older binaries may have Liquid Glass but not the newer blur module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedBlurNavView = (require('expo-blur') as typeof import('expo-blur')).BlurView;
  } catch {
    // Keep the translucent surface available until a native rebuild arrives.
  }
  return cachedBlurNavView;
}

const NavItem = memo(function NavItemImpl({
  tab,
  icon,
  activeIcon,
  FlatIcon,
  labelKey,
  isActive,
  onPressTab,
}: {
  tab: TabName;
  icon: ClayIconName;
  activeIcon: ClayIconName;
  FlatIcon: NavIconComponent | undefined;
  labelKey: string;
  isActive: boolean;
  onPressTab: (tab: TabName) => void;
}) {
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.85 });
  const handlePress = useCallback(() => onPressTab(tab), [onPressTab, tab]);
  const isFlat = useIsFlatIcons();
  const themeColors = useThemeColors();

  return (
    <View className="flex-1">
      <Animated.View style={animatedStyle} className="flex-1">
        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          // The glyph is artwork with no text, so the label has to come from
          // here or a screen reader announces an unnamed button.
          accessibilityRole="tab"
          accessibilityState={{ selected: isActive }}
          accessibilityLabel={I18n.t(labelKey)}
          className="items-center justify-center rounded-2xl mx-0.5"
          style={{ height: NAV_ROW_HEIGHT }}
        >
          {isFlat && FlatIcon ? (
            <FlatIcon
              size={ICON_SIZE}
              color={isActive ? themeColors.primary : themeColors.textMuted}
              strokeWidth={isActive ? 2.2 : 1.6}
              filled={isActive}
            />
          ) : (
            <ClayIcon
              name={isActive ? activeIcon : icon}
              size={isActive ? ICON_SIZE_ACTIVE : ICON_SIZE}
              opacity={isActive ? undefined : ICON_OPACITY_RESTING}
              flatSize={ICON_SIZE - 2}
              flatColor={isActive ? themeColors.primary : themeColors.textMuted}
            />
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
});

export function BottomNav({ tabs, activeTab, onTabChange }: BottomNavProps) {
  const { bottom: safeBottom } = useSafeAreaInsets();
  const resolvedTheme = useResolvedTheme();
  const { minimizeProgress } = useBottomNavMinimize();
  const staticProgress = useSharedValue(0);
  const progress = minimizeProgress ?? staticProgress;

  const minimizeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: progress.value * FLOATING_MINIMIZE_TRANSLATE_Y },
      { scale: 1 - progress.value * (1 - FLOATING_MINIMIZE_SCALE) },
    ],
    opacity: 1 - progress.value * (1 - FLOATING_MINIMIZE_OPACITY),
  }));

  const handleTabPress = useCallback(
    (tab: TabName) => {
      void triggerHaptic('medium');
      onTabChange(tab);
    },
    [onTabChange],
  );

  const { isTablet } = useDeviceLayout();
  const GlassNavView = getLiquidGlassNavView();
  const BlurNavView = GlassNavView ? null : getBlurNavView();
  const AnimatedBlurNavView = useMemo(
    () => (BlurNavView ? Animated.createAnimatedComponent(BlurNavView) : null),
    [BlurNavView],
  );
  const hasBlurView = Boolean(BlurNavView);
  const blurAnimatedProps = useAnimatedProps(() => ({ intensity: 70 }));
  const fallbackTintStyle = useAnimatedStyle(() => ({ opacity: hasBlurView ? 0.4 : 0.8 }));
  const navItems = tabs.map((tab) => {
    const meta = NAV_TAB_META[tab];
    return (
      <NavItem
        key={tab}
        tab={tab}
        icon={meta.icon}
        activeIcon={meta.activeIcon}
        FlatIcon={meta.flatIcon}
        labelKey={meta.labelKey}
        isActive={activeTab === tab}
        onPressTab={handleTabPress}
      />
    );
  });

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 items-center"
      style={{ bottom: getFloatingNavBottomGap(safeBottom), zIndex: NAV_OVERLAY_Z_INDEX }}
    >
      <Animated.View
        style={[
          minimizeStyle,
          {
            width: '100%',
            maxWidth: isTablet ? FLOATING_NAV_MAX_WIDTH : undefined,
            paddingHorizontal: FLOATING_NAV_MARGIN_H,
          },
        ]}
      >
        {GlassNavView ? (
          <GlassNavView
            glassEffectStyle="regular"
            isInteractive
            colorScheme={resolvedTheme}
            style={{
              height: FLOATING_NAV_HEIGHT,
              borderRadius: FLOATING_NAV_HEIGHT / 2,
              overflow: 'hidden',
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 8,
            }}
          >
            {navItems}
          </GlassNavView>
        ) : (
          <View className="rounded-full shadow-float" style={{ height: FLOATING_NAV_HEIGHT }}>
            <View className="flex-1 overflow-hidden rounded-full border border-border/50">
              {AnimatedBlurNavView ? (
                <AnimatedBlurNavView
                  pointerEvents="none"
                  animatedProps={blurAnimatedProps}
                  tint={resolvedTheme === 'dark' ? 'dark' : 'light'}
                  style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
                />
              ) : null}
              <Animated.View
                pointerEvents="none"
                className="absolute inset-0 bg-card"
                style={fallbackTintStyle}
              />
              <View className="flex-1 flex-row items-center px-2">{navItems}</View>
            </View>
          </View>
        )}
      </Animated.View>
    </View>
  );
}
