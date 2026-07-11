import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { PRO_LIMITS } from '~/constants/proLimits';
import { useApp } from '~/context/AppContext';
import type { SplitDraft } from '~/features/transactions/components/editor';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import { requestOpenPaywall } from '~/services/paywallNavigation';
import { pickAndSaveReceiptImage } from '~/services/receiptPicker';
import {
  ReceiptScanError,
  resolveScannedItemsToSplits,
  resolveScannedToDraft,
  scanReceipt,
  scanReceiptItems,
} from '~/services/receiptScan';
import { type OpenSplitScanRequest, requestOpenSplitScan } from '~/services/splitScanNavigation';
import { requestHighlightTransaction } from '~/services/transactionsNavigation';
import { deleteReceiptImage } from '~/services/userAssets';
import { newId } from '~/utils/id';

export type ScanJobStatus = 'scanning' | 'error' | 'ready';
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
  /** 'single' auto-adds one transaction; 'split' waits for the user to open it. */
  mode: 'single' | 'split';
  /** Relative receipt path (e.g. `receipts/9f3c.jpg`). */
  receiptUri: string;
  error?: ScanJobError;
  /** Present on a 'ready' split job — the parsed receipt awaiting the split editor. */
  splitPayload?: OpenSplitScanRequest;
  createdAt: number;
}

interface ReceiptScanContextValue {
  jobs: ScanJob[];
  /** Capture a receipt and scan it in the background (non-blocking). */
  startScan: () => Promise<void>;
  /** Capture a receipt and scan it into itemized split rows (non-blocking). */
  startSplitScan: () => Promise<void>;
  /** Open a 'ready' split job in the editor and remove it from the banner. */
  openSplitJob: (id: string) => void;
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

  // Shared catch handler for both scan flows: quota exhaustion drops the job and
  // either alerts (Pro daily cap) or opens the paywall (free); anything else
  // leaves a dismissible error card carrying the receipt.
  const applyScanFailure = useCallback(
    (err: unknown, jobId: string, rel: string) => {
      void trackEvent(AnalyticsEvents.RECEIPT_SCAN_FAILED, {
        code: err instanceof ReceiptScanError ? err.code : 'unknown',
      });
      if (err instanceof ReceiptScanError && err.code === 'limit_reached') {
        deleteReceiptImage(rel);
        setJobsBoth((prev) => prev.filter((j) => j.id !== jobId));
        if (err.isPro) {
          Alert.alert(I18n.t('receiptScan.limit_title'), I18n.t('receiptScan.limit_body'));
        } else {
          void trackEvent(AnalyticsEvents.PRO_LIMIT_HIT, { type: 'receipt_scan' });
          requestOpenPaywall(
            'receipt_scan',
            I18n.t('pro.limit_receipt_scans', { count: PRO_LIMITS.FREE_MAX_RECEIPT_SCANS }),
          );
        }
        return;
      }
      const error: ScanJobError =
        err instanceof ReceiptScanError && err.code === 'capacity' ? 'capacity' : 'failed';
      setJobsBoth((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: 'error', error } : j)),
      );
    },
    [setJobsBoth],
  );

  const startScan = useCallback(async () => {
    const appUserId = settings.appUserId?.trim();
    if (!appUserId) {
      Alert.alert(I18n.t('receiptScan.error_title'), I18n.t('receiptScan.error_body'));
      return;
    }

    // Camera-first, falling back to the photo library only if the user backs
    // out of the camera (cancelled). On a denied/failed camera outcome the
    // picker already alerted, so we stop rather than double-prompt for library.
    // This part is foreground (native picker); everything after enqueue runs in
    // the background.
    let source: 'camera' | 'library' = 'camera';
    let picked = await pickAndSaveReceiptImage('camera');
    if (picked.status === 'cancelled') {
      source = 'library';
      picked = await pickAndSaveReceiptImage('library');
    }
    if (picked.status !== 'saved') return; // cancelled / denied / failed
    const rel = picked.path;

    const id = newId();
    setJobsBoth((prev) => [
      ...prev,
      { id, status: 'scanning', mode: 'single', receiptUri: rel, createdAt: Date.now() },
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
      applyScanFailure(err, id, rel);
    }
  }, [
    accounts,
    applyScanFailure,
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

  const startSplitScan = useCallback(async () => {
    const appUserId = settings.appUserId?.trim();
    if (!appUserId) {
      Alert.alert(I18n.t('receiptScan.error_title'), I18n.t('receiptScan.error_body'));
      return;
    }

    // Camera-first, falling back to library only on cancellation (matches startScan).
    let picked = await pickAndSaveReceiptImage('camera');
    if (picked.status === 'cancelled') {
      picked = await pickAndSaveReceiptImage('library');
    }
    if (picked.status !== 'saved') return;
    const rel = picked.path;

    const id = newId();
    setJobsBoth((prev) => [
      ...prev,
      { id, status: 'scanning', mode: 'split', receiptUri: rel, createdAt: Date.now() },
    ]);
    void triggerHaptic('selection');
    void trackEvent(AnalyticsEvents.RECEIPT_SCAN_STARTED, { mode: 'split' });

    try {
      const response = await scanReceiptItems({
        receiptRelPath: rel,
        appUserId,
        currency: settings.currencyCode,
      });

      const rows = resolveScannedItemsToSplits(response.items, {
        defaultAccountId: quickEntryPrefs.defaultAccountId,
      });
      void trackEvent(AnalyticsEvents.RECEIPT_SCAN_COMPLETED, {
        mode: 'split',
        count: rows.length,
      });

      if (rows.length === 0) {
        setJobsBoth((prev) =>
          prev.map((j) => (j.id === id ? { ...j, status: 'error', error: 'empty' } : j)),
        );
        return;
      }

      // Each row gets a stable id here so the editor's split state keeps identity.
      const splits: SplitDraft[] = rows.map((r) => ({ ...r, id: newId() }));
      const payload: OpenSplitScanRequest = {
        splits,
        currency: settings.currencyCode,
        receiptUri: rel,
        merchant: response.merchant?.trim() ?? '',
      };
      // Don't auto-add: surface a tappable "ready to split" card in the banner.
      setJobsBoth((prev) =>
        prev.map((j) => (j.id === id ? { ...j, status: 'ready', splitPayload: payload } : j)),
      );
      void triggerHaptic('success');
    } catch (err) {
      applyScanFailure(err, id, rel);
    }
  }, [
    applyScanFailure,
    quickEntryPrefs.defaultAccountId,
    setJobsBoth,
    settings.appUserId,
    settings.currencyCode,
  ]);

  const openSplitJob = useCallback(
    (id: string) => {
      const job = jobsRef.current.find((j) => j.id === id);
      if (!job || job.status !== 'ready' || !job.splitPayload) return;
      void triggerHaptic('selection');
      requestOpenSplitScan(job.splitPayload);
      // The editor now owns the receipt + splits; drop the banner card without
      // deleting the receipt image (it's attached on save).
      setJobsBoth((prev) => prev.filter((j) => j.id !== id));
    },
    [setJobsBoth],
  );

  const value = useMemo<ReceiptScanContextValue>(
    () => ({ jobs, startScan, startSplitScan, openSplitJob, dismissJob }),
    [jobs, startScan, startSplitScan, openSplitJob, dismissJob],
  );
  return <ReceiptScanContext.Provider value={value}>{children}</ReceiptScanContext.Provider>;
}
