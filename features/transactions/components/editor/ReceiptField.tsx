import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Receipt, Trash2, X } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '~/components/ui';
import { ThemeModal } from '~/components/ui/theme-modal';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { getReceiptUri, saveReceiptImage } from '~/services/userAssets';
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
  viewerImage: {
    flex: 1,
    width: '100%',
  },
});

export function ReceiptField({ receiptUri, onChange }: ReceiptFieldProps) {
  const themeColors = useThemeColors();
  const [viewerVisible, setViewerVisible] = useState(false);
  const fileUri = useMemo(() => getReceiptUri(receiptUri), [receiptUri]);

  const pickFrom = useCallback(
    async (source: 'camera' | 'library') => {
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
      try {
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

  const handleRowPress = useCallback(() => {
    if (fileUri) {
      void triggerHaptic('selection');
      setViewerVisible(true);
    } else {
      handleAddReceipt();
    }
  }, [fileUri, handleAddReceipt]);

  return (
    <>
      <SummaryRow
        label={I18n.t('transactions.editor.receipt.label')}
        isActive={false}
        onPress={handleRowPress}
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
            <Image source={{ uri: fileUri }} style={styles.thumb} contentFit="cover" />
          ) : (
            <Text variant="body" className="text-muted-foreground/60">
              {I18n.t('transactions.editor.receipt.add')}
            </Text>
          )}
        </View>
      </SummaryRow>

      <ThemeModal
        visible={viewerVisible}
        animationType="fade"
        transparent={Platform.OS === 'ios'}
        onRequestClose={() => setViewerVisible(false)}
      >
        <View className="flex-1 bg-black">
          <SafeAreaView className="flex-1">
            <View className="flex-row items-center justify-between px-5 py-3">
              <Pressable
                onPress={() => setViewerVisible(false)}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.close')}
                className="h-10 w-10 items-center justify-center rounded-full bg-white/10"
              >
                <X size={18} color="#FFFFFF" />
              </Pressable>
              <Text variant="bodyStrong" style={{ color: '#FFFFFF' }}>
                {I18n.t('transactions.editor.receipt.label')}
              </Text>
              <Pressable
                onPress={handleRemove}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('transactions.editor.receipt.remove')}
                className="h-10 w-10 items-center justify-center rounded-full bg-white/10"
              >
                <Trash2 size={18} color="#FF6B6B" />
              </Pressable>
            </View>
            {fileUri ? (
              <Image source={{ uri: fileUri }} style={styles.viewerImage} contentFit="contain" />
            ) : null}
            <View className="px-5 py-4">
              <Pressable
                onPress={() => {
                  setViewerVisible(false);
                  handleAddReceipt();
                }}
                accessibilityRole="button"
                className="items-center rounded-2xl bg-white/15 py-3.5"
              >
                <Text variant="bodyStrong" style={{ color: '#FFFFFF' }}>
                  {I18n.t('transactions.editor.receipt.replace')}
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </ThemeModal>
    </>
  );
}
