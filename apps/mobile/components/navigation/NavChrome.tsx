import React, { memo, useCallback, useMemo } from 'react';
import { Platform, Pressable, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated';

import {
  AlbumsIcon,
  HomeIcon,
  InsightsIcon,
  SettingsIcon,
  WalletIcon,
} from '~/components/icons/NavIcons';
import { getLiquidGlassNavView } from '~/components/navigation/liquidGlass';
import type { TabName } from '~/components/navigation/navTabs';
import { ClayIcon, type ClayIconName } from '~/components/ui/ClayIcon';
import { useIsFlatIcons, useResolvedTheme } from '~/context/ThemeContext';
import { usePressScale } from '~/hooks/usePressScale';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

/**
 * The pieces both tab bars are built from: the floating bottom bar on phones
 * and tablets, and the side rail on iPhone Duo. Same items, same surface, so
 * the two only differ in which way they run.
 */

type NavIconComponent = typeof HomeIcon;

/** Which way a bar runs: a row along the bottom, or a column down the side. */
export type NavAxis = 'horizontal' | 'vertical';

export interface TabNavProps {
  tabs: readonly TabName[];
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
}

// Calendar zoom layers use positive z-indices and extend beneath the tab bar.
// Keep the bar above them so it remains visible and receives touches.
export const NAV_OVERLAY_Z_INDEX = 20;

/** Shared tab-press behaviour for both bars: a haptic, then the switch. */
export function useTabPressHandler(onTabChange: (tab: TabName) => void) {
  return useCallback(
    (tab: TabName) => {
      void triggerHaptic('medium');
      onTabChange(tab);
    },
    [onTabChange],
  );
}

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

/** One item's height, in a row or a column. */
const NAV_ITEM_EXTENT = 58;
const ICON_SIZE = 26;
const ICON_SIZE_ACTIVE = 30;
const ICON_OPACITY_RESTING = 0.72;

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

export const NavItem = memo(function NavItemImpl({
  tab,
  isActive,
  axis,
  onPressTab,
}: {
  tab: TabName;
  isActive: boolean;
  axis: NavAxis;
  onPressTab: (tab: TabName) => void;
}) {
  const { icon, activeIcon, flatIcon: FlatIcon, labelKey } = NAV_TAB_META[tab];
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.85 });
  const handlePress = useCallback(() => onPressTab(tab), [onPressTab, tab]);
  const isFlat = useIsFlatIcons();
  const themeColors = useThemeColors();
  const isRow = axis === 'horizontal';

  return (
    <View className={isRow ? 'flex-1' : undefined}>
      <Animated.View style={animatedStyle} className={isRow ? 'flex-1' : undefined}>
        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          // The glyph is artwork with no text, so the label has to come from
          // here or a screen reader announces an unnamed button.
          accessibilityRole="tab"
          accessibilityState={{ selected: isActive }}
          accessibilityLabel={I18n.t(labelKey)}
          className={
            isRow
              ? 'items-center justify-center rounded-2xl mx-0.5'
              : 'items-center justify-center rounded-2xl my-0.5'
          }
          style={{ height: NAV_ITEM_EXTENT }}
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

/**
 * The bar's pill: Liquid Glass where the OS has it, else a blurred
 * translucent card. `thickness` is its height in a row, its width in a column.
 */
export function NavSurface({
  axis,
  thickness,
  children,
}: {
  axis: NavAxis;
  thickness: number;
  children: React.ReactNode;
}) {
  const resolvedTheme = useResolvedTheme();
  const GlassNavView = getLiquidGlassNavView();
  const BlurNavView = GlassNavView ? null : getBlurNavView();
  const AnimatedBlurNavView = useMemo(
    () => (BlurNavView ? Animated.createAnimatedComponent(BlurNavView) : null),
    [BlurNavView],
  );
  const hasBlurView = Boolean(BlurNavView);
  const blurAnimatedProps = useAnimatedProps(() => ({ intensity: 70 }));
  const fallbackTintStyle = useAnimatedStyle(() => ({ opacity: hasBlurView ? 0.4 : 0.8 }));
  const isRow = axis === 'horizontal';
  const size: ViewStyle = isRow ? { height: thickness } : { width: thickness };

  if (GlassNavView) {
    return (
      <GlassNavView
        glassEffectStyle="regular"
        isInteractive
        colorScheme={resolvedTheme}
        style={{
          ...size,
          borderRadius: thickness / 2,
          overflow: 'hidden',
          flexDirection: isRow ? 'row' : 'column',
          alignItems: isRow ? 'center' : 'stretch',
          ...(isRow ? { paddingHorizontal: 8 } : { paddingVertical: 8, paddingHorizontal: 4 }),
        }}
      >
        {children}
      </GlassNavView>
    );
  }

  return (
    <View className="rounded-full shadow-float" style={size}>
      <View
        className={
          isRow
            ? 'flex-1 overflow-hidden rounded-full border border-border/50'
            : 'overflow-hidden rounded-full border border-border/50'
        }
      >
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
        {isRow ? (
          <View className="flex-1 flex-row items-center px-2">{children}</View>
        ) : (
          <View className="py-2 px-1">{children}</View>
        )}
      </View>
    </View>
  );
}
