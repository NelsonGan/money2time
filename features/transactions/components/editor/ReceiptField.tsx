import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ChevronRight, Receipt } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { getReceiptUri, saveReceiptImage } from '~/services/userAssets';

import { ReceiptViewerModal } from './ReceiptViewerModal';
import { SummaryRow } from './SummaryRow';

interface ReceiptFieldProps {
  /** Stored receipt relative path (e.g. `receipts/9f3c.jpg`), or null. */
  receiptUri: string | null;
  /** Receives the new relative path, or null when the receipt is removed. */
  onChange: (relativePath: string | null) => void;
}

const styles = StyleSheet.create({
  thumb: {
    width: 34,
    height: 34,
    borderRadius: 8,
  },
});

export function ReceiptField({ receiptUri, onChange }: ReceiptFieldProps) {
  const themeColors = useThemeColors();
  const [viewerVisible, setViewerVisible] = useState(false);
  const fileUri = useMemo(() => getReceiptUri(receiptUri), [receiptUri]);

  const pickFrom = useCallback(
    async (source: 'camera' | 'library') => {
      try {
        const permission =
          source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            I18n.t('accounts.logo.permission_title'),
            I18n.t('accounts.logo.permission_message'),
          );
          return;
        }
        const result =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
            : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
        if (result.canceled || !result.assets?.[0]) return;
        const relativePath = saveReceiptImage(result.assets[0].uri);
        onChange(relativePath);
      } catch {
        Alert.alert(I18n.t('accounts.logo.upload_failed'));
      }
    },
    [onChange],
  );

  const handleAddReceipt = useCallback(() => {
    void triggerHaptic('selection');
    Alert.alert(I18n.t('transactions.editor.receipt.label'), undefined, [
      {
        text: I18n.t('transactions.editor.receipt.take_photo'),
        onPress: () => void pickFrom('camera'),
      },
      {
        text: I18n.t('transactions.editor.receipt.choose_from_library'),
        onPress: () => void pickFrom('library'),
      },
      { text: I18n.t('common.cancel'), style: 'cancel' },
    ]);
  }, [pickFrom]);

  const handleRemove = useCallback(() => {
    void triggerHaptic('warning');
    Alert.alert(
      I18n.t('transactions.editor.receipt.remove_title'),
      I18n.t('transactions.editor.receipt.remove_message'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('transactions.editor.receipt.remove'),
          style: 'destructive',
          onPress: () => {
            setViewerVisible(false);
            onChange(null);
          },
        },
      ],
    );
  }, [onChange]);

  return (
    <>
      {/* Tapping the row opens the full-screen viewer; the small thumbnail is
          just a peek. Adding/replacing happens from the header camera button
          or from inside the viewer. */}
      <SummaryRow
        label={I18n.t('transactions.editor.receipt.label')}
        isActive={false}
        onPress={() => {
          if (!fileUri) {
            handleAddReceipt();
            return;
          }
          void triggerHaptic('selection');
          setViewerVisible(true);
        }}
        rightElement={null}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
              <Receipt size={13} color={themeColors.textMuted} />
            </View>
            <Text variant="caption" tone="muted">
              {I18n.t('transactions.editor.receipt.label')}
            </Text>
          </View>
          {fileUri ? (
            <View className="flex-row items-center gap-2">
              <Image source={{ uri: fileUri }} style={styles.thumb} contentFit="cover" />
              <ChevronRight size={16} color={themeColors.textMuted} />
            </View>
          ) : (
            <Text variant="body" className="text-muted-foreground/60">
              {I18n.t('transactions.editor.receipt.add')}
            </Text>
          )}
        </View>
      </SummaryRow>

      <ReceiptViewerModal
        visible={viewerVisible}
        fileUri={fileUri}
        onClose={() => setViewerVisible(false)}
        onReplace={() => {
          setViewerVisible(false);
          handleAddReceipt();
        }}
        onRemove={handleRemove}
      />
    </>
  );
}
