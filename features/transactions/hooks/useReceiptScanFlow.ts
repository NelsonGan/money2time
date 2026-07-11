import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { PRO_LIMITS } from '~/constants/proLimits';
import { useApp } from '~/context/AppContext';
import { setPendingScanReview } from '~/features/transactions/lib/scanReviewBridge';
import { I18n } from '~/lib/i18n';
import type { AddTransactionInitialValues, RootMainNavigationProp } from '~/navigation/rootStack';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { requestOpenPaywall } from '~/services/paywallNavigation';
import { pickAndSaveReceiptImage } from '~/services/receiptPicker';
import {
  ReceiptScanError,
  resolveScannedToDraft,
  type ScanDraft,
  scanReceipt,
} from '~/services/receiptScan';
import { deleteReceiptImage } from '~/services/userAssets';

function draftToInitialValues(draft: ScanDraft, receiptUri: string): AddTransactionInitialValues {
  return {
    type: draft.type,
    amount: String(draft.amount),
    date: draft.date,
    accountId: draft.accountId,
    categoryId: draft.categoryId,
    note: draft.note ?? '',
    sentiment: draft.sentiment,
    currency: draft.currency,
    receiptUri,
  };
}

/**
 * Orchestrates the receipt-scan flow: capture → Worker call → route. A single
 * parsed transaction opens the full editor prefilled; multiple open the
 * ScanReview list. Returns `scanning` so the caller can show a loading overlay.
 */
export function useReceiptScanFlow(navigation: RootMainNavigationProp) {
  const { settings, categories, accounts, quickEntryPrefs, isSimpleMode, simpleWalletId } =
    useApp();
  const [scanning, setScanning] = useState(false);

  const runScan = useCallback(async () => {
    const appUserId = settings.appUserId?.trim();
    if (!appUserId) {
      Alert.alert(I18n.t('receiptScan.error_title'), I18n.t('receiptScan.error_body'));
      return;
    }

    // Camera-first: open the camera immediately. If the user backs out (or the
    // camera isn't available / permission is denied), fall back to the photo
    // library so they can upload an existing receipt photo instead.
    let source: 'camera' | 'library' = 'camera';
    let receiptRel = await pickAndSaveReceiptImage('camera');
    if (!receiptRel) {
      source = 'library';
      receiptRel = await pickAndSaveReceiptImage('library');
    }
    if (!receiptRel) return; // cancelled both / denied (picker already alerted)

    setScanning(true);
    void trackEvent(AnalyticsEvents.RECEIPT_SCAN_STARTED, { source });
    try {
      const expenseCategoryNames = categories
        .filter((c) => c.type === 'expense')
        .map((c) => c.name);

      const response = await scanReceipt({
        receiptRelPath: receiptRel,
        appUserId,
        currency: settings.currencyCode,
        categories: expenseCategoryNames,
      });

      const drafts = response.transactions.map((t) =>
        resolveScannedToDraft(t, {
          categories,
          accounts,
          reportingCurrency: settings.currencyCode,
          defaultExpenseCategoryId: quickEntryPrefs.defaultExpenseCategoryId,
          defaultIncomeCategoryId: quickEntryPrefs.defaultIncomeCategoryId,
          categoryMap: quickEntryPrefs.categoryMap,
          defaultAccountId: quickEntryPrefs.defaultAccountId,
          simpleWalletId: isSimpleMode ? simpleWalletId : null,
        }),
      );

      void trackEvent(AnalyticsEvents.RECEIPT_SCAN_COMPLETED, { count: drafts.length });

      if (drafts.length === 0) {
        deleteReceiptImage(receiptRel);
        Alert.alert(I18n.t('receiptScan.empty_title'), I18n.t('receiptScan.empty_body'));
        return;
      }

      if (drafts.length === 1) {
        navigation.navigate('AddTransactionDetailed', {
          initialValues: draftToInitialValues(drafts[0], receiptRel),
        });
        return;
      }

      setPendingScanReview({ drafts, receiptUri: receiptRel });
      navigation.navigate('ScanReview');
    } catch (err) {
      deleteReceiptImage(receiptRel);
      void trackEvent(AnalyticsEvents.RECEIPT_SCAN_FAILED, {
        code: err instanceof ReceiptScanError ? err.code : 'unknown',
      });

      if (err instanceof ReceiptScanError && err.code === 'limit_reached') {
        void trackEvent(AnalyticsEvents.PRO_LIMIT_HIT, { type: 'receipt_scan' });
        requestOpenPaywall(
          'receipt_scan',
          I18n.t('pro.limit_receipt_scans', { count: PRO_LIMITS.FREE_MAX_RECEIPT_SCANS }),
        );
        return;
      }
      if (err instanceof ReceiptScanError && err.code === 'capacity') {
        Alert.alert(I18n.t('receiptScan.busy_title'), I18n.t('receiptScan.busy_body'));
        return;
      }
      // Server/inference/network failures carry a raw code (e.g. "inference_failed")
      // in err.message — never surface that. Always show friendly copy.
      Alert.alert(I18n.t('receiptScan.error_title'), I18n.t('receiptScan.error_body'));
    } finally {
      setScanning(false);
    }
  }, [
    accounts,
    categories,
    isSimpleMode,
    navigation,
    quickEntryPrefs.categoryMap,
    quickEntryPrefs.defaultAccountId,
    quickEntryPrefs.defaultExpenseCategoryId,
    quickEntryPrefs.defaultIncomeCategoryId,
    settings.appUserId,
    settings.currencyCode,
    simpleWalletId,
  ]);

  const startScan = useCallback(() => {
    void runScan();
  }, [runScan]);

  return { startScan, scanning };
}
