import { Mic } from 'lucide-react-native';
import React, { useCallback, useContext, useEffect, useRef } from 'react';
import { InteractionManager, Platform, Pressable, View } from 'react-native';
import { BottomTabBarHeightContext } from 'react-native-bottom-tabs';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlusIcon } from '~/components/icons/NavIcons';
import { getBottomNavReservedInset } from '~/components/navigation/BottomNav';
import { spacing } from '~/constants/designSystem';
import type { TutorialSpotlightRequest, TutorialTargetRect } from '~/features/tutorial/types';
import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';
import { usePressScale } from '~/hooks/usePressScale';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';

interface AddFabProps {
  onPress: () => void;
  onLongPress?: () => void;
  onLongPressEnd?: () => void;
  showVoiceHint?: boolean;
  accessibilityLabel?: string;
  onTutorialTargetLayout?: (targetId: 'nav.add', rect: TutorialTargetRect) => void;
  tutorialSpotlightRequest?: TutorialSpotlightRequest;
}

const FAB_SIZE = 56;
const FAB_BOTTOM_GAP = 12;
const FAB_RIGHT_MARGIN = spacing.lg;

export function AddFab({
  onPress,
  onLongPress,
  onLongPressEnd,
  showVoiceHint = false,
  accessibilityLabel,
  onTutorialTargetLayout,
  tutorialSpotlightRequest,
}: AddFabProps) {
  const themeColors = useThemeColors();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const { isTablet } = useDeviceLayout();
  const fabRef = useRef<React.ElementRef<typeof Pressable> | null>(null);
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.92 });
  const longPressActiveRef = useRef(false);

  const handlePress = useCallback(() => {
    // If a long-press just fired, suppress the synthetic onPress that
    // Pressable also emits when the finger lifts.
    if (longPressActiveRef.current) {
      longPressActiveRef.current = false;
      return;
    }
    void triggerHaptic('medium');
    onPress();
  }, [onPress]);

  const handleLongPress = useCallback(() => {
    if (!onLongPress) return;
    longPressActiveRef.current = true;
    void triggerHaptic('warning');
    onLongPress();
  }, [onLongPress]);

  const handleLongPressEnd = useCallback(() => {
    if (longPressActiveRef.current) {
      // Reset BEFORE invoking onLongPressEnd so a synchronous re-press (or
      // the synthetic onPress that some Pressable variants emit on release)
      // sees a clean state. Leaving this true caused the next short tap to
      // be swallowed by handlePress's "suppress synthetic onPress" branch.
      longPressActiveRef.current = false;
      onLongPressEnd?.();
    }
  }, [onLongPressEnd]);

  const measureFab = useCallback(() => {
    if (!onTutorialTargetLayout) return;
    fabRef.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      onTutorialTargetLayout('nav.add', { x, y, width, height });
    });
  }, [onTutorialTargetLayout]);

  const handleLayout = useCallback(() => {
    measureFab();
  }, [measureFab]);

  useEffect(() => {
    if (!tutorialSpotlightRequest?.active) return;
    if (tutorialSpotlightRequest.targetId !== 'nav.add') return;

    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      measureFab();
    });
    const firstPass = setTimeout(() => {
      measureFab();
    }, 40);
    const secondPass = setTimeout(() => {
      measureFab();
    }, 220);
    const androidExtraPass =
      Platform.OS === 'android'
        ? setTimeout(() => {
            measureFab();
          }, 500)
        : null;

    return () => {
      interactionHandle.cancel();
      clearTimeout(firstPass);
      clearTimeout(secondPass);
      if (androidExtraPass) clearTimeout(androidExtraPass);
    };
  }, [measureFab, tutorialSpotlightRequest]);

  // Inside the native tab view (iOS) the context carries the measured bar
  // height; outside it (Android custom bar shell) fall back to the flow-layout
  // reserved inset.
  const nativeTabBarHeight = useContext(BottomTabBarHeightContext);
  const bottomOffset =
    (nativeTabBarHeight ?? getBottomNavReservedInset(safeBottom)) + FAB_BOTTOM_GAP;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: bottomOffset,
      }}
    >
      <View
        pointerEvents="box-none"
        style={[
          {
            flexDirection: 'row',
            justifyContent: 'flex-end',
            paddingRight: FAB_RIGHT_MARGIN,
          },
          isTablet && {
            maxWidth: TABLET_CONTENT_MAX_WIDTH,
            alignSelf: 'center',
            width: '100%',
          },
        ]}
      >
        <Animated.View style={animatedStyle}>
          <Pressable
            ref={fabRef}
            onPress={handlePress}
            onLongPress={onLongPress ? handleLongPress : undefined}
            delayLongPress={350}
            onPressIn={handlePressIn}
            onPressOut={() => {
              handlePressOut();
              handleLongPressEnd();
            }}
            onLayout={handleLayout}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={{
              width: FAB_SIZE,
              height: FAB_SIZE,
              borderRadius: FAB_SIZE / 2,
              backgroundColor: themeColors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.18,
              shadowRadius: 8,
              elevation: 6,
            }}
          >
            {showVoiceHint ? (
              <>
                <Mic size={26} color="#FFFFFF" strokeWidth={2.4} />
                <View
                  style={{
                    position: 'absolute',
                    right: 4,
                    bottom: 4,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#FFFFFF',
                    borderWidth: 2,
                    borderColor: themeColors.primary,
                  }}
                >
                  <PlusIcon size={11} color={themeColors.primary} strokeWidth={3.6} />
                </View>
              </>
            ) : (
              <PlusIcon size={26} color="#FFFFFF" strokeWidth={2.8} />
            )}
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}
