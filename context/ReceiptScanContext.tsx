import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { PRO_LIMITS } from '~/constants/proLimits';
import { useApp } from '~/context/AppContext';
import type { SplitDraft } from '~/features/transactions/components/editor';
import { useProGate } from '~/hooks/useProGate';
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
import { copyReceiptImage, deleteReceiptImage } from '~/services/userAssets';
import { newId } from '~/utils/id';

export type ScanJobStatus = 'scanning' | 'error' | 'ready';
export type ScanJobError = 'empty' | 'capacity' | 'too_large' | 'failed';

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
    getReceiptCount,
    getUnpaidSplitBillCount,
  } = useApp();
  const { checkLimit } = useProGate();
  const [jobs, setJobs] = useState<ScanJob[]>([]);
  // Mirror the list in a ref so dismissJob can read the latest job synchronously
  // (it runs outside React's render-driven state).
  const jobsRef = useRef<ScanJob[]>([]);
  // Render-synced ref over everything the scan flows read, so the callbacks
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
    getUnpaidSplitBillCount,
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

  // Shared catch handler for both scan flows: quota exhaustion drops the job and
  // either alerts (Pro monthly cap) or opens the paywall (free); anything else
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

  /**
   * Shared preamble for both scan flows: verify the app-user id, capture a
   * receipt (camera-first, falling back to the photo library only when the
   * user backs out of the camera — on denied/failed the picker already
   * alerted), enqueue the scanning job, and fire the start haptic/analytics.
   * Returns null when the flow should stop silently.
   */
  const beginScanJob = useCallback(
    async (mode: 'single' | 'split') => {
      const appUserId = envRef.current.settings.appUserId?.trim();
      if (!appUserId) {
        Alert.alert(I18n.t('receiptScan.error_title'), I18n.t('receiptScan.error_body'));
        return null;
      }

      let source: 'camera' | 'library' = 'camera';
      let picked = await pickAndSaveReceiptImage('camera');
      if (picked.status === 'cancelled') {
        source = 'library';
        picked = await pickAndSaveReceiptImage('library');
      }
      if (picked.status !== 'saved') return null; // cancelled / denied / failed
      const rel = picked.path;

      const id = newId();
      setJobsBoth((prev) => [...prev, { id, status: 'scanning', mode, receiptUri: rel }]);
      void triggerHaptic('selection');
      void trackEvent(
        AnalyticsEvents.RECEIPT_SCAN_STARTED,
        mode === 'split' ? { mode: 'split' } : { source },
      );
      return { id, rel, appUserId };
    },
    [setJobsBoth],
  );

  const startScan = useCallback(async () => {
    const { checkLimit: gate, getReceiptCount: receiptCount } = envRef.current;
    // A scanned transaction always carries its receipt image, so it counts
    // against the same free-tier receipts limit as a manual attach — gate up
    // front (before spending a scan), exactly like the editor's camera button.
    if (!gate('receipts', receiptCount())) return;

    const started = await beginScanJob('single');
    if (!started) return;
    const { id, rel, appUserId } = started;

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

      // One transaction per receipt: add it immediately (attaching the receipt)
      // and drop the job — no review step. An image can hold several receipts
      // (one transaction each); every transaction past the first gets its own
      // copy of the image, because receipt files are owned exclusively — the
      // editor deletes the file when its receipt is replaced or removed.
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
  }, [applyScanFailure, beginScanJob, setJobsBoth]);

  const startSplitScan = useCallback(async () => {
    const { checkLimit: gate, getReceiptCount: receiptCount } = envRef.current;
    // The receipt is attached when the split bill is saved, and a scanned split
    // becomes a new split bill — so both free-tier limits apply. Gate up front
    // (before spending a scan) so an over-limit free user hits the paywall,
    // not a dead-end editor.
    if (!gate('receipts', receiptCount())) return;
    if (!gate('split_bills', envRef.current.getUnpaidSplitBillCount())) return;

    const started = await beginScanJob('split');
    if (!started) return;
    const { id, rel, appUserId } = started;

    try {
      const scanEnv = envRef.current;
      // Same currency resolution as single-scan drafts (resolveScannedToDraft):
      // the Quick Entry default currency when set, else the reporting currency.
      const currency = scanEnv.quickEntryPrefs.defaultCurrency || scanEnv.settings.currencyCode;
      const response = await scanReceiptItems({
        receiptRelPath: rel,
        appUserId,
        currency,
      });

      const rows = resolveScannedItemsToSplits(response.items, {
        defaultAccountId: scanEnv.quickEntryPrefs.defaultAccountId,
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
        currency,
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
  }, [applyScanFailure, beginScanJob, setJobsBoth]);

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
