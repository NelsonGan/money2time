import { ChevronLeft } from 'lucide-react-native';
import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '~/components/feedback/AppErrorBoundary';
import { Text } from '~/components/ui/text';
import { ThemeModal } from '~/components/ui/theme-modal';
import { useReceiptScans } from '~/context/ReceiptScanContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { type ScanIntent, subscribeOpenScanCamera } from '~/services/scanCameraNavigation';

// expo-camera is a native module; lazy-load the viewfinder so the rest of the
// app keeps working on a dev client that hasn't been rebuilt with the native
// pod yet (importing expo-camera eagerly touches it at startup).
const InlineReceiptCamera = lazy(() =>
  import('~/features/transactions/components/InlineReceiptCamera').then((m) => ({
    default: m.InlineReceiptCamera,
  })),
);

const VIEWFINDER_HEIGHT = 296;

/**
 * The receipt-scan camera, as a bottom sheet over whatever screen asked for it,
 * rather than a pushed full-screen route. Mounted once by the app shell and
 * driven by the `scanCameraNavigation` bridge, so every scan entry point — the
 * + sheet, the Settle Up CTA, the ready banner — gets the same inline surface
 * without knowing anything about it.
 *
 * Keeping it in a sheet is the point: the screen behind stays visible, so
 * dismissing lands the user exactly where they were instead of unwinding a
 * navigation push.
 */
export function ReceiptCameraSheet() {
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const { scanReceiptImage } = useReceiptScans();
  const [intent, setIntent] = useState<ScanIntent | null>(null);

  useEffect(() => subscribeOpenScanCamera((next) => setIntent(next)), []);

  const handleClose = useCallback(() => {
    void triggerHaptic('selection');
    setIntent(null);
  }, []);

  const handleCaptured = useCallback(
    (path: string, source: 'camera' | 'library') => {
      const current = intent ?? 'quick';
      setIntent(null);
      scanReceiptImage(path, source, current);
    },
    [intent, scanReceiptImage],
  );

  const visible = intent != null;

  return (
    <ThemeModal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={handleClose}>
        <Pressable onPress={(event) => event.stopPropagation()}>
          <View
            className="rounded-t-[28px] bg-card"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          >
            <View className="flex-row items-center gap-2.5 px-5 pt-4">
              <Pressable
                onPress={handleClose}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('receiptScan.camera_close')}
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-full bg-secondary/60 active:opacity-70"
              >
                <ChevronLeft size={18} color={themeColors.textMuted} />
              </Pressable>
              <Text variant="subheading" numberOfLines={1} className="shrink">
                {I18n.t(
                  intent === 'split' ? 'add_action.split_scan_title' : 'add_action.scan_title',
                )}
              </Text>
            </View>

            <View className="pt-3.5">
              {visible ? (
                <AppErrorBoundary fallback={<CameraUnavailable onDismiss={handleClose} />}>
                  <Suspense
                    fallback={
                      <View
                        className="mx-4 items-center justify-center rounded-[22px] bg-black"
                        style={{ height: VIEWFINDER_HEIGHT }}
                      >
                        <ActivityIndicator color="#fff" />
                      </View>
                    }
                  >
                    <InlineReceiptCamera
                      viewfinderHeight={VIEWFINDER_HEIGHT}
                      onCaptured={handleCaptured}
                    />
                  </Suspense>
                </AppErrorBoundary>
              ) : null}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}

/** The native camera module failed to load (an un-rebuilt dev client). Close
 *  rather than stranding the user on a black rectangle. */
function CameraUnavailable({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    onDismiss();
  }, [onDismiss]);
  return <View style={{ height: VIEWFINDER_HEIGHT }} />;
}
