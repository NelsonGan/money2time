import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Images, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui/text';
import { useReceiptScans } from '~/context/ReceiptScanContext';
import { I18n } from '~/lib/i18n';
import type { RootStackParamList } from '~/navigation/rootStack';
import { triggerHaptic } from '~/services/haptics';
import { pickAndSaveReceiptImage } from '~/services/receiptPicker';
import { saveReceiptImage } from '~/services/userAssets';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  camera: { ...StyleSheet.absoluteFillObject },
  overlay: { flex: 1, justifyContent: 'space-between' },
});

/**
 * Full-screen receipt-scan camera. Replaces the raw OS camera so the capture UI
 * can offer both a shutter and an in-frame album button (bottom-right) — the
 * user can snap a receipt or pick one from their photo library without backing
 * out first. Either path saves the image to the receipt store and hands it to
 * the background scanner via `scanReceiptImage`, then pops back.
 *
 * expo-camera is a native module, so this component is lazy-loaded by
 * `ScanReceiptCameraScreen` — never import it eagerly (it would touch the
 * native module at app startup and crash a not-yet-rebuilt dev client).
 */
export function ScanReceiptCamera() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { scanReceiptImage } = useReceiptScans();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  // True once the preview is ready — takePictureAsync before this can reject on
  // some devices, so the shutter stays disabled until then.
  const [ready, setReady] = useState(false);
  // Guards the single-use navigation.goBack() so a slow capture and a fast
  // album pick can't both pop the screen.
  const doneRef = useRef(false);
  // Synchronous re-entrancy guard. `busy` is React state, so two taps in the
  // same frame both read it as false — a ref blocks the second capture before
  // it saves a second (orphaned) receipt file or fires a concurrent capture.
  const inFlightRef = useRef(false);

  // Ask for camera access once on mount when we can still prompt. The album
  // button keeps working even if the user declines, so this never blocks them.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const finishWith = useCallback(
    (rel: string, source: 'camera' | 'library') => {
      if (doneRef.current) return;
      doneRef.current = true;
      scanReceiptImage(rel, source);
      navigation.goBack();
    },
    [navigation, scanReceiptImage],
  );

  const handleCapture = useCallback(async () => {
    if (inFlightRef.current || doneRef.current) return;
    const camera = cameraRef.current;
    if (!camera) return;
    inFlightRef.current = true;
    setBusy(true);
    void triggerHaptic('medium');
    try {
      const photo = await camera.takePictureAsync({ quality: 0.7 });
      if (!photo?.uri) {
        inFlightRef.current = false;
        setBusy(false);
        return;
      }
      // finishWith navigates away on success, so the guard is never cleared.
      finishWith(saveReceiptImage(photo.uri), 'camera');
    } catch {
      Alert.alert(I18n.t('accounts.logo.upload_failed'));
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [finishWith]);

  const handleAlbum = useCallback(async () => {
    if (inFlightRef.current || doneRef.current) return;
    inFlightRef.current = true;
    void triggerHaptic('selection');
    setBusy(true);
    // `library` handles its own permission + save; on cancel/denied/failed we
    // stay on the camera (the picker already alerted for denied/failed).
    const picked = await pickAndSaveReceiptImage('library');
    if (picked.status === 'saved') {
      // finishWith navigates away, so the guard is intentionally left set.
      finishWith(picked.path, 'library');
      return;
    }
    inFlightRef.current = false;
    setBusy(false);
  }, [finishWith]);

  const handleClose = useCallback(() => {
    void triggerHaptic('selection');
    navigation.goBack();
  }, [navigation]);

  const granted = permission?.granted ?? false;

  return (
    <View style={styles.root}>
      {granted ? (
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          onCameraReady={() => setReady(true)}
        />
      ) : (
        <View style={styles.camera} className="items-center justify-center px-10">
          {permission == null ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text className="text-center text-lg font-semibold text-white">
                {I18n.t('receiptScan.camera_permission_title')}
              </Text>
              <Text className="mt-2 text-center text-sm text-white/70">
                {I18n.t('receiptScan.camera_permission_body')}
              </Text>
              {permission.canAskAgain ? (
                <Pressable
                  onPress={() => void requestPermission()}
                  accessibilityRole="button"
                  className="mt-6 rounded-full bg-white px-6 py-3 active:opacity-80"
                >
                  <Text className="font-semibold text-black">
                    {I18n.t('receiptScan.camera_permission_grant')}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      )}

      <View style={styles.overlay} pointerEvents="box-none">
        {/* Top bar: close + framing hint. */}
        <View
          style={{ paddingTop: insets.top + 8 }}
          className="flex-row items-center px-4 pb-4"
          pointerEvents="box-none"
        >
          <Pressable
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('receiptScan.camera_close')}
            hitSlop={10}
            className="h-11 w-11 items-center justify-center rounded-full bg-black/40 active:opacity-70"
          >
            <X size={24} color="#fff" />
          </Pressable>
          {granted ? (
            <View className="flex-1 items-center pr-11" pointerEvents="none">
              <Text className="rounded-full bg-black/40 px-3 py-1.5 text-center text-xs text-white/90">
                {I18n.t('receiptScan.camera_hint')}
              </Text>
            </View>
          ) : (
            <View className="flex-1" />
          )}
        </View>

        {/* Bottom bar: shutter (center) with the album button on the right. */}
        <View
          style={{ paddingBottom: insets.bottom + 24 }}
          className="flex-row items-center justify-center px-8 pt-4"
          pointerEvents="box-none"
        >
          {/* Left spacer keeps the shutter centered while the album button sits
              on the right — matching the requested bottom-right placement. */}
          <View className="w-16" />

          <Pressable
            onPress={handleCapture}
            disabled={!granted || !ready || busy}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('receiptScan.camera_capture')}
            className="h-20 w-20 items-center justify-center rounded-full active:opacity-80"
            style={{ opacity: granted && ready ? 1 : 0.4 }}
          >
            <View className="h-20 w-20 items-center justify-center rounded-full border-[3px] border-white">
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View className="h-16 w-16 rounded-full bg-white" />
              )}
            </View>
          </Pressable>

          <View className="w-16 items-center">
            <Pressable
              onPress={handleAlbum}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('receiptScan.camera_album')}
              className="items-center active:opacity-70"
            >
              <View className="h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                <Images size={26} color="#fff" />
              </View>
              <Text className="mt-1 text-[11px] text-white/90">
                {I18n.t('receiptScan.camera_album')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
