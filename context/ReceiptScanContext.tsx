import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { PRO_LIMITS } from '~/constants/proLimits';
import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import { requestOpenPaywall } from '~/services/paywallNavigation';
import { pickAndSaveReceiptImage } from '~/services/receiptPicker';
import { requestHighlightTransaction } from '~/services/transactionsNavigation';
import { ReceiptScanError, resolveScannedToDraft, scanReceipt } from '~/services/receiptScan';
import { deleteReceiptImage } from '~/services/userAssets';
import { newId } from '~/utils/id';

export type ScanJobStatus = 'scanning' | 'error';
export type ScanJobError = 'empty' | 'capacity' | 'failed';

/**
 * A single receipt scan tracked in the background. The user snaps a receipt and
 * keeps using the app while the Worker parses it; the banner shows its progress.
 * On success the parsed transaction is added automatically and the job is
 * removed; on failure it becomes a dismissible error.
 */
export interface ScanJob {
  id: string;
  status: ScanJobStatus;
  /** Relative receipt path (e.g. `receipts/9f3c.jpg`). */
  receiptUri: string;
  error?: ScanJobError;
  createdAt: number;
}

interface ReceiptScanContextValue {
  jobs: ScanJob[];
  /** Capture a receipt and scan it in the background (non-blocking). */
  startScan: () => Promise<void>;
  /** Remove a failed job and delete its (now-unused) receipt image. */
  dismissJob: (id: string) => void;
}

const ReceiptScanContext = createContext<ReceiptScanContextValue | null>(null);

export function useReceiptScans(): ReceiptScanContextValue {
  const ctx = useContext(ReceiptScanContext);
  if (!ctx) {
    throw new Error('useReceiptScans must be used within a ReceiptScanProvider');
  }
  return ctx;
}

export function ReceiptScanProvider({ children }: { children: React.ReactNode }) {
  const {
    settings,
    categories,
    accounts,
    quickEntryPrefs,
    isSimpleMode,
    simpleWalletId,
    createTransaction,
  } = useApp();
  const [jobs, setJobs] = useState<ScanJob[]>([]);
  // Mirror the list in a ref so dismissJob can read the latest job synchronously
  // (it runs outside React's render-driven state).
  const jobsRef = useRef<ScanJob[]>([]);
  const setJobsBoth = useCallback((updater: (prev: ScanJob[]) => ScanJob[]) => {
    setJobs((prev) => {
      const next = updater(prev);
      jobsRef.current = next;
      return next;
    });
  }, []);

  const dismissJob = useCallback(
    (id: string) => {
      const job = jobsRef.current.find((j) => j.id === id);
      if (job?.receiptUri) deleteReceiptImage(job.receiptUri);
      setJobsBoth((prev) => prev.filter((j) => j.id !== id));
    },
    [setJobsBoth],
  );

  const startScan = useCallback(async () => {
    const appUserId = settings.appUserId?.trim();
    if (!appUserId) {
      Alert.alert(I18n.t('receiptScan.error_title'), I18n.t('receiptScan.error_body'));
      return;
    }

    // Camera-first, falling back to the photo library if the user backs out or
    // the camera is unavailable/denied. This part is foreground (native picker);
    // everything after enqueue runs in the background.
    let source: 'camera' | 'library' = 'camera';
    let receiptRel = await pickAndSaveReceiptImage('camera');
    if (!receiptRel) {
      source = 'library';
      receiptRel = await pickAndSaveReceiptImage('library');
    }
    if (!receiptRel) return; // cancelled both / denied (picker already alerted)
    // A const keeps the non-null narrowing inside the closures below (a mutable
    // `let` widens back to `string | null` once captured).
    const rel = receiptRel;

    const id = newId();
    setJobsBoth((prev) => [
      ...prev,
      { id, status: 'scanning', receiptUri: rel, createdAt: Date.now() },
    ]);
    void triggerHaptic('selection');
    void trackEvent(AnalyticsEvents.RECEIPT_SCAN_STARTED, { source });

    try {
      const expenseCategoryNames = categories
        .filter((c) => c.type === 'expense')
        .map((c) => c.name);

      const response = await scanReceipt({
        receiptRelPath: rel,
        appUserId,
        currency: settings.currencyCode,
        categories: expenseCategoryNames,
      });

      const drafts = response.transactions.map((t) =>
        // Receipts are always expenses — force it so an income line can't slip in.
        resolveScannedToDraft(
          { ...t, type: 'expense' },
          {
            categories,
            accounts,
            reportingCurrency: settings.currencyCode,
            defaultCurrency: quickEntryPrefs.defaultCurrency,
            defaultExpenseCategoryId: quickEntryPrefs.defaultExpenseCategoryId,
            defaultIncomeCategoryId: quickEntryPrefs.defaultIncomeCategoryId,
            categoryMap: quickEntryPrefs.categoryMap,
            defaultAccountId: quickEntryPrefs.defaultAccountId,
            simpleWalletId: isSimpleMode ? simpleWalletId : null,
          },
        ),
      );

      void trackEvent(AnalyticsEvents.RECEIPT_SCAN_COMPLETED, { count: drafts.length });

      if (drafts.length === 0) {
        setJobsBoth((prev) =>
          prev.map((j) => (j.id === id ? { ...j, status: 'error', error: 'empty' } : j)),
        );
        return;
      }

      // One transaction per receipt: add it immediately (attaching the receipt)
      // and drop the job — no review step.
      let firstId: string | null = null;
      drafts.forEach((d) => {
        const txnId = createTransaction(
          {
            type: 'expense',
            amount: d.amount,
            currency: d.currency,
            date: d.date,
            accountId: d.accountId,
            categoryId: d.categoryId,
            note: d.note,
            sentiment: d.sentiment,
            receiptUri: rel,
          },
          { source: 'receipt' },
        );
        if (!firstId) firstId = txnId;
      });
      setJobsBoth((prev) => prev.filter((j) => j.id !== id));
      void trackEvent(AnalyticsEvents.RECEIPT_SCAN_SAVED, { count: drafts.length });
      if (firstId) requestHighlightTransaction(firstId);
      void triggerHaptic('success');
    } catch (err) {
      void trackEvent(AnalyticsEvents.RECEIPT_SCAN_FAILED, {
        code: err instanceof ReceiptScanError ? err.code : 'unknown',
      });

      // Quota exhausted → drop the job + receipt and route straight to paywall.
      if (err instanceof ReceiptScanError && err.code === 'limit_reached') {
        deleteReceiptImage(rel);
        setJobsBoth((prev) => prev.filter((j) => j.id !== id));
        void trackEvent(AnalyticsEvents.PRO_LIMIT_HIT, { type: 'receipt_scan' });
        requestOpenPaywall(
          'receipt_scan',
          I18n.t('pro.limit_receipt_scans', { count: PRO_LIMITS.FREE_MAX_RECEIPT_SCANS }),
        );
        return;
      }

      // Keep the receipt on the failed job so the banner can offer a dismiss
      // (which then deletes it). Never surface raw error codes to the user.
      const error: ScanJobError =
        err instanceof ReceiptScanError && err.code === 'capacity' ? 'capacity' : 'failed';
      setJobsBoth((prev) => prev.map((j) => (j.id === id ? { ...j, status: 'error', error } : j)));
    }
  }, [
    accounts,
    categories,
    createTransaction,
    isSimpleMode,
    quickEntryPrefs.categoryMap,
    quickEntryPrefs.defaultCurrency,
    quickEntryPrefs.defaultAccountId,
    quickEntryPrefs.defaultExpenseCategoryId,
    quickEntryPrefs.defaultIncomeCategoryId,
    setJobsBoth,
    settings.appUserId,
    settings.currencyCode,
    simpleWalletId,
  ]);

  const value = useMemo<ReceiptScanContextValue>(
    () => ({ jobs, startScan, dismissJob }),
    [jobs, startScan, dismissJob],
  );
  return <ReceiptScanContext.Provider value={value}>{children}</ReceiptScanContext.Provider>;
}
