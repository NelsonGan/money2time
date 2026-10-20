import { CameraView, useCameraPermissions } from 'expo-camera';
import { X } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text, ThemeModal } from '~/components/ui';
import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

function CloseButton({ onPress, light }: { onPress: () => void; light?: boolean }) {
  const themeColors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={I18n.t('web_dashboard.close')}
      hitSlop={12}
      style={styles.close}
    >
      <X size={24} color={light ? '#FFFFFF' : themeColors.textMuted} />
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
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  useEffect(() => {
    if (visible) handled.current = false;
  }, [visible]);

  return (
    <ThemeModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.scanner, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.scannerHeader}>
          <CloseButton onPress={onClose} light />
        </View>
        {permission?.granted ? (
          <View style={styles.viewfinder}>
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
          <View style={styles.permission}>
            {permission == null ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text className="text-center text-base font-semibold text-white">
                  {I18n.t('web_dashboard.camera_permission')}
                </Text>
                <Button className="mt-4" onPress={() => void requestPermission()}>
                  <Text>{I18n.t('web_dashboard.camera_allow')}</Text>
                </Button>
              </>
            )}
          </View>
        )}
        <Text className="mt-4 px-8 text-center text-sm text-white/80">
          {I18n.t('web_dashboard.scan_hint')}
        </Text>
      </View>
    </ThemeModal>
  );
}

const styles = StyleSheet.create({
  close: { padding: 4 },
  scanner: { flex: 1, backgroundColor: '#000000' },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  viewfinder: {
    aspectRatio: 1,
    marginHorizontal: 24,
    marginTop: 32,
    borderRadius: 24,
    overflow: 'hidden',
  },
  permission: {
    aspectRatio: 1,
    marginHorizontal: 24,
    marginTop: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
