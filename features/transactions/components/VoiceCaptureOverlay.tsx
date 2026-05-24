import { Mic } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

interface VoiceCaptureOverlayProps {
  visible: boolean;
  /** Live (interim) transcript shown while user is still speaking. */
  liveTranscript: string;
}

/**
 * Full-screen overlay shown while the user is holding the + button.
 * Animated mic + pulsing ring + live interim transcript.
 */
export function VoiceCaptureOverlay({ visible, liveTranscript }: VoiceCaptureOverlayProps) {
  const themeColors = useThemeColors();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      pulse.value = 0;
      pulse.value = withRepeat(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        -1,
        false,
      );
    } else {
      pulse.value = 0;
    }
  }, [pulse, visible]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.6 }],
    opacity: 0.5 - pulse.value * 0.5,
  }));

  if (!visible) return null;

  return (
    <View style={styles.root} pointerEvents="none">
      <View style={styles.center}>
        <View style={styles.micWrap}>
          <Animated.View
            style={[
              styles.ring,
              { borderColor: themeColors.primary, backgroundColor: `${themeColors.primary}20` },
              ringStyle,
            ]}
          />
          <View style={[styles.micCore, { backgroundColor: themeColors.primary }]}>
            <Mic size={36} color="#FFFFFF" />
          </View>
        </View>
        <Text
          variant="bodyStrong"
          className="mt-6 text-center"
          style={{ color: '#FFFFFF', fontSize: 16 }}
        >
          {I18n.t('settings.quick_entry.voice.listening')}
        </Text>
        <Text
          variant="caption"
          className="mt-2 text-center"
          style={{ color: 'rgba(255,255,255,0.65)' }}
        >
          {I18n.t('settings.quick_entry.voice.release_hint')}
        </Text>
        {liveTranscript ? (
          <Text
            variant="body"
            className="mt-5 text-center"
            numberOfLines={3}
            style={{ color: '#FFFFFF', fontSize: 18, paddingHorizontal: 32 }}
          >
            {liveTranscript}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  micWrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
  },
  micCore: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
