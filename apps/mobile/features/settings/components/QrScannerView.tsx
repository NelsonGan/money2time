import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';

import { Button, Text } from '~/components/ui';
import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

/** Inline camera; pause it while pairing or when another screen covers it. */
export function QrScannerView({
  active,
  onScanned,
}: {
  active: boolean;
  onScanned: (text: string) => void;
}) {
  const colors = useThemeColors();
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  useEffect(() => {
    if (active) handled.current = false;
  }, [active]);

  useEffect(() => {
    if (active && permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [active, permission, requestPermission]);

  return (
    <View className="aspect-square w-full max-w-[360px] self-center items-center justify-center overflow-hidden rounded-3xl border-2 border-primary/30 bg-secondary">
      {!active || permission == null ? (
        <ActivityIndicator color={colors.primary} />
      ) : permission.granted ? (
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
      ) : (
        <View className="items-center px-6">
          <Text variant="bodyStrong" className="text-center">
            {I18n.t('web_dashboard.camera_permission')}
          </Text>
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
        </View>
      )}
    </View>
  );
}
