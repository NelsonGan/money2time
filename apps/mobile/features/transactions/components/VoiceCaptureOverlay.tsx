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
  /** Instruction shown under "Listening…" — defaults to the hold-to-release hint. */
  hint?: string;
  /**
   * `fullscreen` (default) dims the whole app behind the mic — for the +
   * button's press-and-hold, which has no surface of its own. `inline` drops the
   * backdrop and sits in a host's own panel (the + sheet), so the user keeps
   * seeing where they are; the host supplies the container and background.
   */
  variant?: 'fullscreen' | 'inline';
  /** Height of the inline panel. Ignored when fullscreen. */
  height?: number;
  /**
   * The session has been asked for but is not live yet (permission prompt,
   * native warm-up). Shows the mic without claiming to be listening — a panel
   * that says "Listening…" while nothing is recording is a lie the user can
   * hear, since nothing they say is captured.
   */
  starting?: boolean;
}

/**
 * The "listening" UI: animated mic, pulsing ring and the live interim
 * transcript. Shown while the user is holding (or, in tap mode, after tapping)
 * the + button, or inside the + sheet once the Voice tile is chosen.
 */
export function VoiceCaptureOverlay({
  visible,
  liveTranscript,
  hint,
  variant = 'fullscreen',
  height,
  starting = false,
}: VoiceCaptureOverlayProps) {
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

  const inline = variant === 'inline';
  // Fullscreen sits on a dark scrim, so its ink is fixed white. Inline sits on
  // the host's card and has to follow the theme instead.
  const titleColor = inline ? themeColors.text : '#FFFFFF';
  const hintColor = inline ? themeColors.textMuted : 'rgba(255,255,255,0.65)';

  return (
    <View
      style={inline ? [styles.inlineRoot, height == null ? null : { height }] : styles.root}
      pointerEvents="none"
    >
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
          className={inline ? 'mt-4 text-center' : 'mt-6 text-center'}
          style={{ color: titleColor, fontSize: 16 }}
        >
          {starting
            ? I18n.t('settings.quick_entry.voice.starting')
            : I18n.t('settings.quick_entry.voice.listening')}
        </Text>
        {starting ? null : (
          <Text variant="caption" className="mt-2 text-center" style={{ color: hintColor }}>
            {hint ?? I18n.t('settings.quick_entry.voice.release_hint')}
          </Text>
        )}
        {liveTranscript ? (
          <Text
            variant="body"
            className={inline ? 'mt-3 text-center' : 'mt-5 text-center'}
            numberOfLines={3}
            style={{
              color: titleColor,
              fontSize: inline ? 16 : 18,
              paddingHorizontal: inline ? 8 : 32,
            }}
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
  inlineRoot: {
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
