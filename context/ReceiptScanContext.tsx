import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { PRO_LIMITS } from '~/constants/proLimits';
import { useApp } from '~/context/AppContext';
import { useProGate } from '~/hooks/useProGate';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import { requestOpenPaywall } from '~/services/paywallNavigation';
import { pickAndSaveReceiptImage } from '~/services/receiptPicker';
import { ReceiptScanError, resolveScannedToDraft, scanReceipt } from '~/services/receiptScan';
import { type OpenScanReviewRequest, requestOpenScanReview } from '~/services/scanReviewNavigation';
import { requestHighlightTransaction } from '~/services/transactionsNavigation';
import { copyReceiptImage, deleteReceiptImage } from '~/services/userAssets';
import { newId } from '~/utils/id';

export type ScanJobStatus = 'scanning' | 'error' | 'ready';
export type ScanJobError = 'empty' | 'capacity' | 'too_large' | 'failed';

/**
 * A single receipt scan tracked in the background. The user snaps a receipt and
 * keeps using the app while the Worker parses it; the banner shows its progress.
 * On success it becomes a tappable 'ready' card that opens a pre-filled editor
 * for review; on failure it becomes a dismissible error.
 */
export interface ScanJob {
  id: string;
  status: ScanJobStatus;
  /** Relative receipt path (e.g. `receipts/9f3c.jpg`). */
  receiptUri: string;
  error?: ScanJobError;
  /** Present on a 'ready' job — the parsed draft awaiting the review editor. */
  reviewPayload?: OpenScanReviewRequest;
}

interface ReceiptScanContextValue {
  jobs: ScanJob[];
  /** Capture a receipt and scan it in the background (non-blocking). */
  startScan: () => Promise<void>;
  /** Open a 'ready' job in the review editor and remove its banner card. */
  openReadyJob: (id: string) => void;
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
    getReceiptCount,
  } = useApp();
  const { checkLimit } = useProGate();
  const [jobs, setJobs] = useState<ScanJob[]>([]);
  // Mirror the list in a ref so dismissJob can read the latest job synchronously
  // (it runs outside React's render-driven state).
  const jobsRef = useRef<ScanJob[]>([]);
  // Render-synced ref over everything the scan flow reads, so the callbacks
  // below stay identity-stable and the context value only changes with `jobs`
  // — otherwise every account/category/settings write would re-render all
  // useReceiptScans consumers (the same discipline AppContext documents for
  // its transaction-reading functions).
  const env = {
    settings,
    categories,
    accounts,
    quickEntryPrefs,
    isSimpleMode,
    simpleWalletId,
    createTransaction,
    getReceiptCount,
    checkLimit,
  };
  const envRef = useRef(env);
  envRef.current = env;

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

  // Catch handler for the scan flow: quota exhaustion drops the job and either
  // alerts (Pro monthly cap) or opens the paywall (free); anything else leaves a
  // dismissible error card carrying the receipt.
  const applyScanFailure = useCallback(
    (err: unknown, jobId: string, rel: string) => {
      void trackEvent(AnalyticsEvents.RECEIPT_SCAN_FAILED, {
        code: err instanceof ReceiptScanError ? err.code : 'unknown',
      });
      if (err instanceof ReceiptScanError && err.code === 'limit_reached') {
        deleteReceiptImage(rel);
        setJobsBoth((prev) => prev.filter((j) => j.id !== jobId));
        if (err.isPro) {
          // Pro users are already paying — no paywall. Show the limit and point
          // them at support (the Worker owns the real cap; prefer its number).
          Alert.alert(
            I18n.t('receiptScan.limit_title'),
            I18n.t('receiptScan.limit_body', {
              count: err.limit ?? PRO_LIMITS.PRO_MAX_RECEIPT_SCANS,
            }),
          );
        } else {
          void trackEvent(AnalyticsEvents.PRO_LIMIT_HIT, { type: 'receipt_scan' });
          requestOpenPaywall(
            'receipt_scan',
            // The Worker owns the quota, so prefer the limit it reported over
            // the app's compiled-in copy of the number.
            I18n.t('pro.limit_receipt_scans', {
              count: err.limit ?? PRO_LIMITS.FREE_MAX_RECEIPT_SCANS,
            }),
          );
        }
        return;
      }
      const error: ScanJobError =
        err instanceof ReceiptScanError && (err.code === 'capacity' || err.code === 'too_large')
          ? err.code
          : 'failed';
      setJobsBoth((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: 'error', error } : j)),
      );
    },
    [setJobsBoth],
  );

  const startScan = useCallback(async () => {
    const { checkLimit: gate, getReceiptCount: receiptCount } = envRef.current;
    // A scanned transaction always carries its receipt image, so it counts
    // against the same free-tier receipts limit as a manual attach — gate up
    // front (before spending a scan), exactly like the editor's camera button.
    if (!gate('receipts', receiptCount())) return;

    const appUserId = envRef.current.settings.appUserId?.trim();
    if (!appUserId) {
      Alert.alert(I18n.t('receiptScan.error_title'), I18n.t('receiptScan.error_body'));
      return;
    }

    // Capture a receipt (camera-first, falling back to the photo library only
    // when the user backs out of the camera — on denied/failed the picker
    // already alerted), enqueue the scanning job, and fire the start haptic.
    let source: 'camera' | 'library' = 'camera';
    let picked = await pickAndSaveReceiptImage('camera');
    if (picked.status === 'cancelled') {
      source = 'library';
      picked = await pickAndSaveReceiptImage('library');
    }
    if (picked.status !== 'saved') return; // cancelled / denied / failed
    const rel = picked.path;

    const id = newId();
    setJobsBoth((prev) => [...prev, { id, status: 'scanning', receiptUri: rel }]);
    void triggerHaptic('selection');
    void trackEvent(AnalyticsEvents.RECEIPT_SCAN_STARTED, { source });

    try {
      const scanEnv = envRef.current;
      const expenseCategoryNames = scanEnv.categories
        .filter((c) => c.type === 'expense')
        .map((c) => c.name);

      const response = await scanReceipt({
        receiptRelPath: rel,
        appUserId,
        currency: scanEnv.settings.currencyCode,
        categories: expenseCategoryNames,
      });

      const drafts = response.transactions.map((t) =>
        // Receipts are always expenses — force it so an income line can't slip in.
        resolveScannedToDraft(
          { ...t, type: 'expense' },
          {
            categories: scanEnv.categories,
            accounts: scanEnv.accounts,
            reportingCurrency: scanEnv.settings.currencyCode,
            defaultCurrency: scanEnv.quickEntryPrefs.defaultCurrency,
            defaultExpenseCategoryId: scanEnv.quickEntryPrefs.defaultExpenseCategoryId,
            defaultIncomeCategoryId: scanEnv.quickEntryPrefs.defaultIncomeCategoryId,
            categoryMap: scanEnv.quickEntryPrefs.categoryMap,
            defaultAccountId: scanEnv.quickEntryPrefs.defaultAccountId,
            simpleWalletId: scanEnv.isSimpleMode ? scanEnv.simpleWalletId : null,
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

      // One receipt → one draft (the common case): don't save it silently.
      // Surface a tappable "ready to review" card in the banner that opens the
      // parsed values in a pre-filled editor when tapped, so the background scan
      // never yanks the user into a modal. The receipt is handed to that editor
      // on open (it attaches on save, deletes on cancel).
      if (drafts.length === 1) {
        const d = drafts[0]!;
        const reviewPayload: OpenScanReviewRequest = {
          initialValues: {
            type: 'expense',
            amount: d.amount != null ? String(d.amount) : undefined,
            currency: d.currency,
            date: d.date,
            accountId: d.accountId,
            categoryId: d.categoryId,
            note: d.note ?? undefined,
            sentiment: d.sentiment,
            receiptUri: rel,
          },
        };
        setJobsBoth((prev) =>
          prev.map((j) => (j.id === id ? { ...j, status: 'ready', reviewPayload } : j)),
        );
        void triggerHaptic('success');
        return;
      }

      // Several receipts in one image (rare): a single review editor can only
      // front one of them, so add each immediately as before rather than lose
      // the rest. Every transaction past the first gets its own copy of the
      // image, because receipt files are owned exclusively — the editor deletes
      // the file when its receipt is replaced or removed.
      let firstId: string | null = null;
      drafts.forEach((d, index) => {
        const receiptUri = index === 0 ? rel : copyReceiptImage(rel);
        const txnId = envRef.current.createTransaction(
          {
            type: 'expense',
            amount: d.amount,
            currency: d.currency,
            date: d.date,
            accountId: d.accountId,
            categoryId: d.categoryId,
            note: d.note,
            sentiment: d.sentiment,
            receiptUri: receiptUri ?? undefined,
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
  }, [applyScanFailure, setJobsBoth]);

  const openReadyJob = useCallback(
    (id: string) => {
      const job = jobsRef.current.find((j) => j.id === id);
      if (!job || job.status !== 'ready' || !job.reviewPayload) return;
      void triggerHaptic('selection');
      requestOpenScanReview(job.reviewPayload);
      // The editor now owns the receipt; drop the banner card without deleting
      // the receipt image (it's attached on save, cleaned up on cancel).
      setJobsBoth((prev) => prev.filter((j) => j.id !== id));
    },
    [setJobsBoth],
  );

  const value = useMemo<ReceiptScanContextValue>(
    () => ({ jobs, startScan, openReadyJob, dismissJob }),
    [jobs, startScan, openReadyJob, dismissJob],
  );
  return <ReceiptScanContext.Provider value={value}>{children}</ReceiptScanContext.Provider>;
}
