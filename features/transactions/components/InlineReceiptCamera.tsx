import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { ClayIcon } from '~/components/ui/ClayIcon';
import { Text } from '~/components/ui/text';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { downscaleReceiptForStorage } from '~/services/receiptImage';
import { pickAndSaveReceiptImage } from '~/services/receiptPicker';
import { saveReceiptImage } from '~/services/userAssets';

interface InlineReceiptCameraProps {
  /** Height of the viewfinder box. The control row sits below it. */
  viewfinderHeight: number;
  /**
   * A capture (or library pick) that has been downscaled and written to the
   * receipt store. `path` is the stored relative path.
   */
  onCaptured: (path: string, source: 'camera' | 'library') => void;
  /** Dismiss without capturing. When omitted, no close control is drawn — the
   *  host supplies its own (e.g. the sheet header's back button). */
  onClose?: () => void;
  /** Horizontal inset around the viewfinder and controls. */
  horizontalInset?: number;
}

const VIEWFINDER_BG = '#14100F';
const BRACKET_COLOR = 'rgba(255,255,255,0.75)';

const styles = StyleSheet.create({
  viewfinder: {
    borderRadius: 22,
    backgroundColor: VIEWFINDER_BG,
    overflow: 'hidden',
  },
  fill: StyleSheet.absoluteFillObject,
  bracket: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderColor: BRACKET_COLOR,
  },
});

/** One of the four framing corners drawn inside the viewfinder. */
function Bracket({ top, left }: { top: boolean; left: boolean }) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.bracket,
        top ? { top: 14 } : { bottom: 14 },
        left ? { left: 14 } : { right: 14 },
        top ? { borderTopWidth: 2 } : { borderBottomWidth: 2 },
        left ? { borderLeftWidth: 2 } : { borderRightWidth: 2 },
        {
          borderTopLeftRadius: top && left ? 8 : 0,
          borderTopRightRadius: top && !left ? 8 : 0,
          borderBottomLeftRadius: !top && left ? 8 : 0,
          borderBottomRightRadius: !top && !left ? 8 : 0,
        },
      ]}
    />
  );
}

/**
 * The receipt viewfinder, sized to sit *inside* whatever is hosting it — the
 * add sheet, or the transaction editor's numpad slot — rather than as its own
 * pushed screen. Keeping it in place means the user never loses sight of what
 * they were doing, and the shot lands back in the same surface.
 *
 * Snapping holds the photo for confirmation (Retake / Use photo); only
 * confirming downscales it, writes it to the receipt store and calls
 * `onCaptured`. A library pick skips confirmation — the picker was the review
 * step — and reports `source: 'library'`.
 *
 * **expo-camera is a native module**, so this file must never be imported
 * eagerly: every host loads it through `React.lazy` behind an error boundary,
 * or a dev client that has not been rebuilt crashes at startup.
 */
export function InlineReceiptCamera({
  viewfinderHeight,
  onCaptured,
  onClose,
  horizontalInset = 16,
}: InlineReceiptCameraProps) {
  const themeColors = useThemeColors();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  // Which action is in flight. Both disable the controls, but only a capture
  // shows the shutter spinner — opening the album must not flash it.
  const [busyAction, setBusyAction] = useState<'capture' | 'album' | null>(null);
  const busy = busyAction != null;
  // True once the preview is ready — takePictureAsync before this can reject on
  // some devices, so the shutter stays disabled until then.
  const [ready, setReady] = useState(false);
  // Guards the single-use handoff so a slow capture and a fast album pick can't
  // both report a result.
  const doneRef = useRef(false);
  // Synchronous re-entrancy guard. `busy` is React state, so two taps in the
  // same frame both read it as false — a ref blocks the second capture before
  // it saves a second (orphaned) receipt file.
  const inFlightRef = useRef(false);
  // A snapped (not yet confirmed) photo. While set, the viewfinder shows the
  // capture with Retake / Use photo instead of the live controls.
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  // Source dimensions of the held capture, so the downscaler can cap the long
  // edge without a second decode. A ref — it never needs to re-render.
  const capturedDimsRef = useRef<{ width: number; height: number } | null>(null);

  // Ask for camera access once on mount when we can still prompt. The album
  // button keeps working even if the user declines, so this never blocks them.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const finishWith = useCallback(
    (path: string, source: 'camera' | 'library') => {
      if (doneRef.current) return;
      doneRef.current = true;
      onCaptured(path, source);
    },
    [onCaptured],
  );

  const handleCapture = useCallback(async () => {
    if (inFlightRef.current || doneRef.current) return;
    const camera = cameraRef.current;
    if (!camera) return;
    inFlightRef.current = true;
    setBusyAction('capture');
    void triggerHaptic('medium');
    try {
      const photo = await camera.takePictureAsync({ quality: 0.7 });
      // Hold the shot for confirmation — nothing is saved until "Use photo".
      if (photo?.uri) {
        capturedDimsRef.current = { width: photo.width, height: photo.height };
        setCapturedUri(photo.uri);
      }
    } catch {
      Alert.alert(I18n.t('accounts.logo.upload_failed'));
    }
    inFlightRef.current = false;
    setBusyAction(null);
  }, []);

  const handleRetake = useCallback(() => {
    if (inFlightRef.current || doneRef.current) return;
    void triggerHaptic('selection');
    setCapturedUri(null);
  }, []);

  const handleUsePhoto = useCallback(async () => {
    if (inFlightRef.current || doneRef.current || !capturedUri) return;
    inFlightRef.current = true;
    void triggerHaptic('medium');
    try {
      // Downscale + re-encode before storing, so the one stored copy is small
      // enough for both the attachment view and the scan upload.
      const downscaled = await downscaleReceiptForStorage(
        capturedUri,
        capturedDimsRef.current ?? undefined,
      );
      // finishWith tears this host down, so the guard is never cleared.
      finishWith(saveReceiptImage(downscaled), 'camera');
    } catch {
      Alert.alert(I18n.t('accounts.logo.upload_failed'));
      inFlightRef.current = false;
    }
  }, [capturedUri, finishWith]);

  const handleAlbum = useCallback(async () => {
    if (inFlightRef.current || doneRef.current) return;
    inFlightRef.current = true;
    void triggerHaptic('selection');
    setBusyAction('album');
    // `library` handles its own permission + save; on cancel/denied/failed we
    // stay on the viewfinder (the picker already alerted for denied/failed).
    const picked = await pickAndSaveReceiptImage('library');
    if (picked.status === 'saved') {
      // finishWith tears this host down, so the guard is intentionally left set.
      finishWith(picked.path, 'library');
      return;
    }
    inFlightRef.current = false;
    setBusyAction(null);
  }, [finishWith]);

  const granted = permission?.granted ?? false;
  const holding = capturedUri != null;

  return (
    <View style={{ paddingHorizontal: horizontalInset }}>
      <View style={[styles.viewfinder, { height: viewfinderHeight }]}>
        {holding ? (
          <Image source={{ uri: capturedUri }} style={styles.fill} contentFit="contain" />
        ) : granted ? (
          <>
            <CameraView
              ref={cameraRef}
              style={styles.fill}
              facing="back"
              onCameraReady={() => setReady(true)}
            />
            <Bracket top left />
            <Bracket top left={false} />
            <Bracket top={false} left />
            <Bracket top={false} left={false} />
            <View className="absolute inset-x-0 bottom-4 items-center" pointerEvents="none">
              <Text className="rounded-full bg-black/45 px-3 py-1.5 text-center text-xs text-white/90">
                {I18n.t('receiptScan.camera_hint')}
              </Text>
            </View>
          </>
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            {permission == null ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text className="text-center text-base font-semibold text-white">
                  {I18n.t('receiptScan.camera_permission_title')}
                </Text>
                <Text className="mt-2 text-center text-xs text-white/70">
                  {I18n.t('receiptScan.camera_permission_body')}
                </Text>
                {permission.canAskAgain ? (
                  <Pressable
                    onPress={() => void requestPermission()}
                    accessibilityRole="button"
                    className="mt-4 rounded-full bg-white px-5 py-2.5 active:opacity-80"
                  >
                    <Text className="text-sm font-semibold text-black">
                      {I18n.t('receiptScan.camera_permission_grant')}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        )}
      </View>

      {holding ? (
        <View className="flex-row items-center justify-between gap-3 pt-4">
          <Pressable
            onPress={handleRetake}
            accessibilityRole="button"
            className="h-12 flex-1 items-center justify-center rounded-full border border-border/50 bg-secondary/60 active:opacity-70"
          >
            <Text variant="bodyStrong">{I18n.t('receiptScan.camera_retake')}</Text>
          </Pressable>
          <Pressable
            onPress={() => void handleUsePhoto()}
            accessibilityRole="button"
            className="h-12 flex-1 items-center justify-center rounded-full bg-primary active:opacity-90"
          >
            <Text variant="bodyStrong" className="text-primary-foreground">
              {I18n.t('receiptScan.camera_use_photo')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="flex-row items-center pt-4">
          <Pressable
            onPress={() => void handleAlbum()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('receiptScan.camera_album')}
            className="h-12 w-12 items-center justify-center active:opacity-70"
          >
            <ClayIcon name="entry/image-plus" size={46} />
          </Pressable>

          <View className="flex-1 items-center">
            <Pressable
              onPress={() => void handleCapture()}
              disabled={!granted || !ready || busy}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('receiptScan.camera_capture')}
              className="h-[68px] w-[68px] items-center justify-center rounded-full border-[3px] active:opacity-80"
              style={{
                borderColor: `${themeColors.text}29`,
                opacity: granted && ready ? 1 : 0.4,
              }}
            >
              {busyAction === 'capture' ? (
                <ActivityIndicator color={themeColors.primary} />
              ) : (
                <View
                  className="h-[54px] w-[54px] rounded-full"
                  style={{ backgroundColor: themeColors.primary }}
                />
              )}
            </Pressable>
          </View>

          <View className="h-12 w-12 items-center justify-center">
            {onClose ? (
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('receiptScan.camera_close')}
                className="active:opacity-70"
              >
                <ClayIcon name="entry/close-round" size={46} />
              </Pressable>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}
