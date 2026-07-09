import { File, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';
import { ChevronLeft } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, ThemeModal } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import { hasSeenQrPrompt, markQrPromptSeen } from '~/services/settleUpQrPromptState';
import { getPaymentQrUri } from '~/services/userAssets';
import { getErrorMessage } from '~/utils/errorHandling';

import { buildReceiptText } from '../lib/settleUp';
import type { ReceiptContent } from './SplitReceiptCard';
import { SplitReceiptCard } from './SplitReceiptCard';

interface SplitReceiptShareModalProps {
  visible: boolean;
  onClose: () => void;
  content: ReceiptContent | null;
  /** Number of line items on the receipt, for analytics. */
  itemCount: number;
  /** Open the Settle Up settings page so the user can attach a payment QR.
   *  Invoked from the one-time "add your payment QR" nudge. */
  onSetupQr?: () => void;
}

export function SplitReceiptShareModal({
  visible,
  onClose,
  content,
  itemCount,
  onSetupQr,
}: SplitReceiptShareModalProps) {
  const themeColors = useThemeColors();
  const { settings } = useApp();
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);

  const qrUri = useMemo(() => getPaymentQrUri(settings.paymentQrUri), [settings.paymentQrUri]);

  const shareAsText = useCallback(
    async (target: ReceiptContent) => {
      const text = buildReceiptText({
        title: target.title,
        subtitle: target.subtitle,
        lines: target.lines.map((line) => ({ label: line.label, amount: line.amount })),
        totalLabel: target.totalLabel,
        totalText: target.totalText,
        qrNote: qrUri ? I18n.t('transactions.settleUp.receipt_qr_note') : null,
      });
      await Share.share({ message: text });
    },
    [qrUri],
  );

  const handleShare = useCallback(async () => {
    if (!content || busy) return;
    void triggerHaptic('selection');
    setBusy(true);
    let sharedAsImage = false;
    // Set once the native share sheet has actually been presented. If the share
    // itself then rejects we must NOT fall back to the text sheet, or the user
    // would get a second share sheet popping up unprompted.
    let nativeShareInvoked = false;
    // Temp PNG written for the share; deleted afterwards so captures don't pile
    // up in the cache. A fixed name also caps it at a single reused file.
    let tempFile: File | null = null;
    try {
      // Skia is loaded lazily so the screen still works if the native module
      // isn't linked — capture then falls back to a plain-text receipt.
      const { makeImageFromView } = await import('@shopify/react-native-skia');
      const image = await makeImageFromView(cardRef);
      const base64 = image?.encodeToBase64();
      if (base64) {
        const file = new File(Paths.cache, 'settle-up-receipt.png');
        file.create({ overwrite: true });
        file.write(base64, { encoding: 'base64' });
        tempFile = file;
        if (await Sharing.isAvailableAsync()) {
          nativeShareInvoked = true;
          await Sharing.shareAsync(file.uri, {
            mimeType: 'image/png',
            UTI: 'public.png',
            dialogTitle: I18n.t('transactions.settleUp.share_receipt'),
          });
          sharedAsImage = true;
        } else {
          // No file share sheet available — RN's Share.share ignores `url` on
          // Android, so fall back to the plain-text receipt instead.
          await shareAsText(content);
        }
      } else {
        await shareAsText(content);
      }
      trackEvent(AnalyticsEvents.SETTLE_UP_RECEIPT_SHARED, {
        itemCount,
        hasQr: !!qrUri,
        asImage: sharedAsImage,
      });
      onClose();
    } catch (shareError) {
      // The native share sheet was already presented, so its failure isn't a
      // capture problem — surface it rather than opening a second sheet.
      if (nativeShareInvoked) {
        Alert.alert(I18n.t('errors.generic_operation_failed'), getErrorMessage(shareError));
      } else {
        // Image capture failed before sharing — fall back to the plain text.
        try {
          await shareAsText(content);
          trackEvent(AnalyticsEvents.SETTLE_UP_RECEIPT_SHARED, {
            itemCount,
            hasQr: !!qrUri,
            asImage: false,
          });
          onClose();
        } catch (fallbackError) {
          Alert.alert(I18n.t('errors.generic_operation_failed'), getErrorMessage(fallbackError));
        }
      }
    } finally {
      try {
        tempFile?.delete();
      } catch {
        // Best-effort cleanup; a leftover temp file is overwritten next share.
      }
      setBusy(false);
    }
  }, [busy, content, itemCount, onClose, qrUri, shareAsText]);

  // Gate the first no-QR share behind a one-time nudge to attach a payment QR.
  // The user can head to settings to add one, or dismiss and share anyway; the
  // nudge is marked seen the first time it shows so it never nags again.
  const handleSharePress = useCallback(async () => {
    if (busy || !content) return;
    if (!qrUri && !(await hasSeenQrPrompt(settings.appUserId))) {
      void markQrPromptSeen(settings.appUserId);
      void triggerHaptic('selection');
      Alert.alert(
        I18n.t('transactions.settleUp.qr_prompt_title'),
        I18n.t('transactions.settleUp.qr_prompt_message'),
        [
          {
            text: I18n.t('common.not_now'),
            style: 'cancel',
            onPress: () => void handleShare(),
          },
          {
            text: I18n.t('transactions.settleUp.qr_prompt_cta'),
            onPress: () => {
              onClose();
              onSetupQr?.();
            },
          },
        ],
      );
      return;
    }
    void handleShare();
  }, [busy, content, qrUri, settings.appUserId, handleShare, onClose, onSetupQr]);

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
          {content ? <SplitReceiptCard ref={cardRef} content={content} qrUri={qrUri} /> : null}
        </ScrollView>

        <View className="px-5 pb-8 pt-2">
          <Pressable
            onPress={handleSharePress}
            disabled={busy || !content}
            className="h-14 flex-row items-center justify-center gap-2 rounded-2xl bg-primary active:opacity-90"
            style={{ opacity: busy || !content ? 0.6 : 1 }}
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
