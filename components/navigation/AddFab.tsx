import { Mic } from 'lucide-react-native';
import React, { useCallback, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlusIcon } from '~/components/icons/NavIcons';
import { getBottomNavReservedInset } from '~/components/navigation/BottomNav';
import { ClayIcon } from '~/components/ui/ClayIcon';
import { spacing } from '~/constants/designSystem';
import { useIsFlatIcons } from '~/context/ThemeContext';
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
}

const FAB_SIZE = 60;
/** The flat + sits inside a primary disc, which reads smaller than bare clay. */
const FLAT_FAB_SIZE = 56;
const FAB_BOTTOM_GAP = 12;
const FAB_RIGHT_MARGIN = spacing.lg;

export function AddFab({
  onPress,
  onLongPress,
  onLongPressEnd,
  showVoiceHint = false,
  accessibilityLabel,
}: AddFabProps) {
  const themeColors = useThemeColors();
  const isFlat = useIsFlatIcons();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const { isTablet } = useDeviceLayout();
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.92 });
  const longPressActiveRef = useRef(false);
  // Guards against a rapid double-fire of the press — on a cold start the JS
  // thread is busy and a single tap can register twice, opening two editors and
  // buzzing the haptic twice. Ignore a second press within a short window.
  const lastPressAtRef = useRef(0);

  const handlePress = useCallback(() => {
    // If a long-press just fired, suppress the synthetic onPress that
    // Pressable also emits when the finger lifts.
    if (longPressActiveRef.current) {
      longPressActiveRef.current = false;
      return;
    }
    const now = Date.now();
    if (now - lastPressAtRef.current < 500) return;
    lastPressAtRef.current = now;
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

  const bottomOffset = getBottomNavReservedInset(safeBottom) + FAB_BOTTOM_GAP;

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
            onPress={handlePress}
            onLongPress={onLongPress ? handleLongPress : undefined}
            delayLongPress={350}
            onPressIn={handlePressIn}
            onPressOut={() => {
              handlePressOut();
              handleLongPressEnd();
            }}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            // The clay + is the whole button: no primary disc behind it, since
            // the glyph already reads as a raised, three-dimensional object and
            // a solid circle underneath flattens it back into a plain icon. The
            // flat + is the opposite — a bare line glyph needs the disc and its
            // shadow to read as a button at all, so it gets both back.
            style={
              isFlat
                ? {
                    width: FLAT_FAB_SIZE,
                    height: FLAT_FAB_SIZE,
                    borderRadius: FLAT_FAB_SIZE / 2,
                    backgroundColor: themeColors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.18,
                    shadowRadius: 8,
                    elevation: 6,
                  }
                : {
                    width: FAB_SIZE,
                    height: FAB_SIZE,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }
            }
          >
            {/* No shadow style on the clay branch: iOS draws a view shadow from
                the layer's square bounds, not from the image's alpha, so a
                transparent PNG gets a grey rectangle behind it. The clay art
                already carries its own highlight and drop shadow. */}
            {isFlat ? (
              showVoiceHint ? (
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
              )
            ) : (
              <>
                <ClayIcon name="nav/add-active" size={FAB_SIZE} />
                {showVoiceHint ? (
                  <View
                    style={{
                      position: 'absolute',
                      right: 0,
                      bottom: 0,
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: themeColors.card,
                      borderWidth: 2,
                      borderColor: themeColors.primary,
                    }}
                  >
                    <Mic size={12} color={themeColors.primary} strokeWidth={2.6} />
                  </View>
                ) : null}
              </>
            )}
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}
