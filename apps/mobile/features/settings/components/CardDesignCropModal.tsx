import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AccountLogo, Button, SegmentedToggle, Text } from '~/components/ui';
import { SettingsHeader } from '~/components/ui/settings';
import {
  CARD_DESIGN_ASPECT_RATIO,
  type CardTextTone,
  CUSTOM_CARD_DESIGN_SCRIM,
} from '~/constants/cardDesigns';
import { spacing } from '~/constants/designSystem';
import {
  CARD_TEXT_BAND_FADE_END,
  CARD_TEXT_BAND_HEIGHT,
  cardDesignInk,
} from '~/features/settings/components/AccountCardDesign';
import { COLLAPSED_CARD_HEIGHT } from '~/features/settings/components/AccountCardStack';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { saveCustomCardDesign } from '~/services/userAssets';
import type { AccountType } from '~/types';
import { cardCropPixels, clampPan, clampZoom, maxPan, type Size } from '~/utils/cardDesignCrop';

/** Longest edge kept from the photo before framing; the card never needs more. */
const SOURCE_MAX_EDGE = 2400;
/** Width the saved crop is scaled down to: a 3x phone's full card width. */
const OUTPUT_WIDTH = 1200;

interface CardDesignCropModalProps {
  /** The picked photo, or null while the modal is closed. */
  sourceUri: string | null;
  accountName: string;
  logoId?: string | null;
  accountType: AccountType;
  balanceLabel: string;
  onCancel: () => void;
  /** Called with the saved design's `custom:` id. */
  onSaved: (designId: string) => void;
}

interface PreparedSource extends Size {
  uri: string;
}

/**
 * Frames an uploaded photo as a card design: the user drags and pinches the
 * photo inside a window the exact width and shape of the card on the Accounts
 * screen, picks the text colour while the card's own name and balance sit on
 * top of it, and the frame is cut out and stored.
 *
 * The system picker's crop is not used: on iOS it is always square, and a card
 * is not.
 */
export function CardDesignCropModal(props: CardDesignCropModalProps) {
  return (
    <Modal
      visible={props.sourceUri != null}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={props.onCancel}
    >
      {/* A modal is its own native root: it inherits neither the app's
          safe-area insets nor its gesture root, so it brings both. */}
      <SafeAreaProvider>
        <GestureHandlerRootView style={styles.flexOne}>
          {props.sourceUri ? <CropBody {...props} sourceUri={props.sourceUri} /> : null}
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </Modal>
  );
}

function CropBody({
  sourceUri,
  accountName,
  logoId,
  accountType,
  balanceLabel,
  onCancel,
  onSaved,
}: CardDesignCropModalProps & { sourceUri: string }) {
  const { width: windowWidth } = useWindowDimensions();
  // The same width as a card in the Accounts stack, so what is framed here is
  // what the card shows, point for point.
  const frame = useMemo<Size>(
    () => ({
      width: windowWidth - spacing.lg * 2,
      height: (windowWidth - spacing.lg * 2) / CARD_DESIGN_ASPECT_RATIO,
    }),
    [windowWidth],
  );
  const [source, setSource] = useState<PreparedSource | null>(null);
  const [textTone, setTextTone] = useState<CardTextTone>('light');
  const [saving, setSaving] = useState(false);

  const zoom = useSharedValue(1);
  const savedZoom = useSharedValue(1);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const savedPanX = useSharedValue(0);
  const savedPanY = useSharedValue(0);

  // Read through a ref so a parent re-render (a fresh inline callback) cannot
  // re-run the preparation below and throw away the user's framing.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Re-encoded once up front: it applies the photo's EXIF rotation, so the
  // pixel size measured here is the one the crop below is cut from, and it
  // caps a 48 MP photo to something the gestures can move smoothly.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rendered = await ImageManipulator.manipulate(sourceUri).renderAsync();
        const context = ImageManipulator.manipulate(rendered);
        if (Math.max(rendered.width, rendered.height) > SOURCE_MAX_EDGE) {
          context.resize(
            rendered.width >= rendered.height
              ? { width: SOURCE_MAX_EDGE }
              : { height: SOURCE_MAX_EDGE },
          );
        }
        const image = await context.renderAsync();
        const out = await image.saveAsync({ compress: 0.92, format: SaveFormat.JPEG });
        if (!cancelled) setSource({ uri: out.uri, width: out.width, height: out.height });
      } catch {
        if (cancelled) return;
        Alert.alert(I18n.t('accounts.card_design.upload_failed'));
        onCancelRef.current();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceUri]);

  const imageSize: Size = source ?? { width: 1, height: 1 };
  const frameWidth = frame.width;
  const frameHeight = frame.height;
  const imageWidth = imageSize.width;
  const imageHeight = imageSize.height;

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      const nextZoom = clampZoom(savedZoom.value * event.scale);
      const limit = maxPan(
        { width: frameWidth, height: frameHeight },
        { width: imageWidth, height: imageHeight },
        nextZoom,
      );
      zoom.value = nextZoom;
      panX.value = clampPan(panX.value, limit.x);
      panY.value = clampPan(panY.value, limit.y);
    })
    .onEnd(() => {
      // Only the zoom: a pan still running alongside (one finger lifted, the
      // other dragging on) owns the pan, and rebasing it here would make the
      // photo jump by everything dragged so far.
      savedZoom.value = zoom.value;
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      // From wherever the photo is now, including where a pinch's clamping
      // left it.
      savedPanX.value = panX.value;
      savedPanY.value = panY.value;
    })
    .onUpdate((event) => {
      const limit = maxPan(
        { width: frameWidth, height: frameHeight },
        { width: imageWidth, height: imageHeight },
        zoom.value,
      );
      panX.value = clampPan(savedPanX.value + event.translationX, limit.x);
      panY.value = clampPan(savedPanY.value + event.translationY, limit.y);
    })
    .onEnd(() => {
      savedPanX.value = panX.value;
      savedPanY.value = panY.value;
    });

  const gesture = Gesture.Simultaneous(pinch, pan);

  const baseScale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight);
  const displayWidth = imageWidth * baseScale;
  const displayHeight = imageHeight * baseScale;
  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: panX.value }, { translateY: panY.value }, { scale: zoom.value }],
  }));

  const handleSave = useCallback(async () => {
    if (!source || saving) return;
    setSaving(true);
    try {
      const crop = cardCropPixels(frame, source, zoom.value, panX.value, panY.value);
      const context = ImageManipulator.manipulate(source.uri);
      context.crop(crop);
      if (crop.width > OUTPUT_WIDTH) context.resize({ width: OUTPUT_WIDTH });
      const image = await context.renderAsync();
      const out = await image.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
      const designId = saveCustomCardDesign(out.uri, textTone);
      void triggerHaptic('success');
      onSaved(designId);
    } catch {
      Alert.alert(I18n.t('accounts.card_design.upload_failed'));
      setSaving(false);
    }
  }, [frame, onSaved, panX, panY, saving, source, textTone, zoom]);

  const ink = cardDesignInk(textTone);
  const scrim = CUSTOM_CARD_DESIGN_SCRIM[textTone];
  const washColor = textTone === 'light' ? '0,0,0' : '255,255,255';
  const band = `rgba(${washColor},${scrim})`;
  // A closed card shows the middle band of the design; mark it so the uploader
  // puts what matters there.
  const bandHeight = Math.min(COLLAPSED_CARD_HEIGHT, frameHeight);
  const bandTop = (frameHeight - bandHeight) / 2;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <SettingsHeader title={I18n.t('accounts.card_design.crop_title')} onClose={onCancel} />
      <View style={styles.body}>
        <GestureDetector gesture={gesture}>
          <View
            style={[styles.frame, { width: frameWidth, height: frameHeight }]}
            accessible
            accessibilityLabel={I18n.t('accounts.card_design.crop_hint')}
          >
            {source ? (
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    width: displayWidth,
                    height: displayHeight,
                    left: (frameWidth - displayWidth) / 2,
                    top: (frameHeight - displayHeight) / 2,
                  },
                  imageStyle,
                ]}
              >
                <Image source={{ uri: source.uri }} style={styles.flexOne} contentFit="fill" />
              </Animated.View>
            ) : (
              <ActivityIndicator style={styles.flexOne} />
            )}
            {/* The same band the card draws behind its top row, placed where
                that row lands, so the uploader judges the real legibility. */}
            <LinearGradient
              pointerEvents="none"
              colors={[band, band, `rgba(${washColor},0)`]}
              locations={[0, CARD_TEXT_BAND_HEIGHT / CARD_TEXT_BAND_FADE_END, 1]}
              style={[styles.bandWash, { top: bandTop }]}
            />
            <View
              pointerEvents="none"
              style={[styles.band, { top: bandTop, height: bandHeight, borderColor: ink.divider }]}
            >
              <View style={styles.previewRow}>
                <AccountLogo logoId={logoId} type={accountType} size={34} />
                <Text
                  variant="bodyStrong"
                  numberOfLines={1}
                  style={[styles.previewName, { color: ink.text }, ink.textShadow]}
                >
                  {accountName}
                </Text>
                <Text
                  variant="bodyStrong"
                  numberOfLines={1}
                  style={[styles.previewBalance, { color: ink.text }, ink.textShadow]}
                >
                  {balanceLabel}
                </Text>
              </View>
            </View>
          </View>
        </GestureDetector>
        <Text variant="caption" tone="muted" className="mt-3 text-center">
          {I18n.t('accounts.card_design.crop_hint')}
        </Text>

        <View className="mt-6">
          <Text variant="label" tone="muted" className="mb-2">
            {I18n.t('accounts.card_design.text_label')}
          </Text>
          <SegmentedToggle
            value={textTone}
            onChange={setTextTone}
            options={[
              { value: 'light', label: I18n.t('accounts.card_design.text_light') },
              { value: 'dark', label: I18n.t('accounts.card_design.text_dark') },
            ]}
          />
        </View>
      </View>
      <View style={styles.footer}>
        <Button onPress={handleSave} disabled={!source || saving}>
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text>{I18n.t('accounts.card_design.save')}</Text>
          )}
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  frame: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#1E1E22',
  },
  bandWash: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: CARD_TEXT_BAND_FADE_END,
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 54,
    paddingHorizontal: 18,
  },
  previewName: {
    flex: 1,
    fontSize: 14,
    letterSpacing: -0.3,
  },
  previewBalance: {
    fontSize: 16,
    letterSpacing: -0.5,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
});
