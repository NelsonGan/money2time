import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { X } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text, ThemeModal } from '~/components/ui';
import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

function CloseButton({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={I18n.t('web_dashboard.close')}
      hitSlop={12}
      className="h-11 w-11 items-center justify-center rounded-full bg-secondary"
    >
      <X size={22} color={colors.text} />
    </Pressable>
  );
}

/** Full-screen camera that reports the first QR code it reads, once. */
export function QrScannerModal({
  visible,
  onClose,
  onScanned,
}: {
  visible: boolean;
  onClose: () => void;
  onScanned: (text: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  useEffect(() => {
    if (visible) handled.current = false;
  }, [visible]);

  // Ask once when the scanner opens, while the system can still prompt.
  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  return (
    <ThemeModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <StatusBar style="auto" />
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View className="flex-row justify-end px-4 py-2">
          <CloseButton onPress={onClose} />
        </View>
        <View className="items-center gap-2">
          <Image
            source={require('../../../assets/illustrations/link-computer.png')}
            className="h-24 w-48"
            resizeMode="contain"
            accessible={false}
          />
          <Text variant="headingSm">{I18n.t('web_dashboard.link_title')}</Text>
          <Text variant="caption" tone="muted">
            app.money2time.com
          </Text>
        </View>
        {permission?.granted ? (
          <View className="mt-6 aspect-square w-[86%] max-w-[420px] self-center overflow-hidden rounded-3xl border-2 border-primary/30 bg-secondary">
            <CameraView
              {...REPLAY_PRIVATE}
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (handled.current) return;
                handled.current = true;
                onScanned(data);
              }}
            />
          </View>
        ) : (
          <View className="mt-6 aspect-square w-[86%] max-w-[420px] self-center items-center justify-center rounded-3xl bg-secondary px-6">
            {permission == null ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Text variant="bodyStrong" className="text-center">
                  {I18n.t('web_dashboard.camera_permission')}
                </Text>
                {/* Once declined for good, only Settings can turn it back on. */}
                <Button
                  className="mt-4"
                  onPress={() =>
                    void (permission.canAskAgain ? requestPermission() : Linking.openSettings())
                  }
                >
                  <Text>
                    {I18n.t(
                      permission.canAskAgain
                        ? 'web_dashboard.camera_allow'
                        : 'web_dashboard.camera_settings',
                    )}
                  </Text>
                </Button>
              </>
            )}
          </View>
        )}
        <Text variant="caption" tone="muted" className="mt-5 px-8 text-center">
          {I18n.t('web_dashboard.scan_hint')}
        </Text>
      </View>
    </ThemeModal>
  );
}
