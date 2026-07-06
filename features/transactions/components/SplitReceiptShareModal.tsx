import { File, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';
import { ChevronLeft } from 'lucide-react-native';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, ThemeModal } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import { getPaymentQrUri } from '~/services/userAssets';
import type { PersonDebt } from '~/types';
import { currencySymbolForCode } from '~/utils/currency';
import { getErrorMessage } from '~/utils/errorHandling';
import { formatCurrency } from '~/utils/formatters';
import { newId } from '~/utils/id';

import { buildReceiptText } from '../lib/settleUp';
import { SplitReceiptCard } from './SplitReceiptCard';

interface SplitReceiptShareModalProps {
  visible: boolean;
  onClose: () => void;
  person: PersonDebt | null;
}

export function SplitReceiptShareModal({ visible, onClose, person }: SplitReceiptShareModalProps) {
  const themeColors = useThemeColors();
  const { settings } = useApp();
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);

  const formatNative = useCallback(
    (amount: number, currency: string) => formatCurrency(amount, currencySymbolForCode(currency)),
    [],
  );

  const fromName = settings.profileName?.trim() || null;
  const toName = person?.name ?? I18n.t('transactions.settleUp.someone');
  const fromTo = fromName ? `${fromName} → ${toName}` : `${toName}`;
  const qrUri = getPaymentQrUri(settings.paymentQrUri);

  const shareAsText = useCallback(
    async (target: PersonDebt) => {
      const text = buildReceiptText(target, {
        strings: {
          heading: I18n.t('transactions.settleUp.receipt_heading'),
          fromTo,
          totalLabel: I18n.t('transactions.settleUp.receipt_total_label'),
          qrNote: qrUri ? I18n.t('transactions.settleUp.receipt_qr_note') : null,
          footer: I18n.t('transactions.settleUp.receipt_footer'),
        },
        formatMoney: formatNative,
      });
      await Share.share({ message: text });
    },
    [formatNative, fromTo, qrUri],
  );

  const handleShare = useCallback(async () => {
    if (!person || busy) return;
    void triggerHaptic('selection');
    setBusy(true);
    let sharedAsImage = false;
    try {
      // Skia is loaded lazily so the screen still works if the native module
      // isn't linked — capture then falls back to a plain-text receipt.
      const { makeImageFromView } = await import('@shopify/react-native-skia');
      const image = await makeImageFromView(cardRef);
      const base64 = image?.encodeToBase64();
      if (base64) {
        const file = new File(Paths.cache, `settle-up-${newId()}.png`);
        file.create({ overwrite: true });
        file.write(base64, { encoding: 'base64' });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'image/png',
            UTI: 'public.png',
            dialogTitle: I18n.t('transactions.settleUp.share_receipt'),
          });
        } else {
          await Share.share({ url: file.uri });
        }
        sharedAsImage = true;
      } else {
        await shareAsText(person);
      }
      trackEvent(AnalyticsEvents.SETTLE_UP_RECEIPT_SHARED, {
        billCount: person.billCount,
        hasQr: !!qrUri,
        asImage: sharedAsImage,
      });
      onClose();
    } catch {
      // Image capture / share failed — fall back to the plain-text receipt.
      try {
        await shareAsText(person);
        trackEvent(AnalyticsEvents.SETTLE_UP_RECEIPT_SHARED, {
          billCount: person.billCount,
          hasQr: !!qrUri,
          asImage: false,
        });
        onClose();
      } catch (fallbackError) {
        Alert.alert(I18n.t('errors.generic_operation_failed'), getErrorMessage(fallbackError));
      }
    } finally {
      setBusy(false);
    }
  }, [busy, onClose, person, qrUri, shareAsText]);

  return (
    <ThemeModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="flex-row items-center gap-2 border-b border-border/20 px-4 py-3">
          <Pressable
            onPress={onClose}
            className="h-9 w-9 items-center justify-center rounded-full bg-secondary"
          >
            <ChevronLeft size={18} color={themeColors.text} />
          </Pressable>
          <Text variant="bodyStrong">{I18n.t('transactions.settleUp.share_receipt')}</Text>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ alignItems: 'center', paddingVertical: 28 }}
        >
          {person ? (
            <SplitReceiptCard
              ref={cardRef}
              person={person}
              fromTo={fromTo}
              qrUri={qrUri}
              formatNative={formatNative}
            />
          ) : null}
        </ScrollView>

        <View className="px-5 pb-8 pt-2">
          <Pressable
            onPress={handleShare}
            disabled={busy || !person}
            className="h-14 flex-row items-center justify-center gap-2 rounded-2xl bg-primary active:opacity-90"
            style={{ opacity: busy || !person ? 0.6 : 1 }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text variant="bodyStrong" className="text-primary-foreground">
                {I18n.t('transactions.settleUp.share_receipt')}
              </Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemeModal>
  );
}
