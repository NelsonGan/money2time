import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { PRO_LIMITS } from '~/constants/proLimits';
import { useApp } from '~/context/AppContext';
import { useProGate } from '~/hooks/useProGate';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import { setReceiptSplitLaunch } from '~/features/transactions/lib/receiptSplitBridge';
import { requestOpenPaywall } from '~/services/paywallNavigation';
import {
  ReceiptScanError,
  type ResolvedReceiptDetail,
  resolveScannedReceiptDetail,
  resolveScannedToDraft,
  scanReceipt,
} from '~/services/receiptScan';
import { requestOpenReceiptSplit } from '~/services/receiptSplitNavigation';
import { requestOpenScanCamera, type ScanIntent } from '~/services/scanCameraNavigation';
import { type OpenScanReviewRequest, requestOpenScanReview } from '~/services/scanReviewNavigation';
import { requestHighlightTransaction } from '~/services/transactionsNavigation';
import { copyReceiptImage, deleteReceiptImage } from '~/services/userAssets';
import { newId } from '~/utils/id';

export type ScanJobStatus = 'scanning' | 'error' | 'ready';
export type ScanJobError = 'empty' | 'capacity' | 'too_large' | 'failed';

/**
 * How a background scan settled. Returned by the awaitable scan entry point so
 * the screenshot drain can clear its App Group queue only once the scan has
 * taken ownership of the image — and stop the batch on `limit` rather than
 * re-hitting the quota (and re-opening the paywall) for every queued shot.
 */
export type ScanOutcome = 'created' | 'ready' | 'empty' | 'limit' | 'failed' | 'invalid';

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
  /** Why the scan started — 'split' jobs open Split by Item when ready. */
  intent?: ScanIntent;
  error?: ScanJobError;
  /** Present on a 'ready' job — the parsed draft awaiting the review editor. */
  reviewPayload?: OpenScanReviewRequest;
  /** Present on a 'ready' job whose receipt can open Split by Item. */
  splitPayload?: ResolvedReceiptDetail;
}

interface ReceiptScanContextValue {
  jobs: ScanJob[];
  /**
   * Entry point for the scan flow: gate the free-tier limit, then open the
   * full-screen receipt-scan camera (which lets the user snap a photo or pick
   * one from their album). The camera then calls `scanReceiptImage`.
   */
  startScan: (intent?: ScanIntent) => Promise<void>;
  /**
   * Scan an already-saved receipt image in the background (non-blocking).
   * Called by the camera screen once the user has captured or picked a photo;
   * `rel` is the stored receipt path (e.g. `receipts/9f3c.jpg`).
   */
  scanReceiptImage: (
    rel: string,
    source: 'camera' | 'library' | 'shortcut',
    intent?: ScanIntent,
  ) => void;
  /**
   * Like `scanReceiptImage` but awaitable — resolves with the scan's outcome
   * once the transaction is created (or the scan errors). Used by the auto-log
   * screenshot drain to clear its queue only after a scan settles.
   */
  scanReceiptImageAsync: (
    rel: string,
    source: 'camera' | 'library' | 'shortcut',
    intent?: ScanIntent,
  ) => Promise<ScanOutcome>;
  /** Open a 'ready' job in the review editor and remove its banner card. */
  openReadyJob: (id: string) => void;
  /** Open a 'ready' job in the Split-by-Item editor and remove its banner card. */
  openReadyJobAsSplit: (id: string) => void;
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
    fxCurrencies,
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
  // Render-synced ref over everything the scan flow reads, so the callbacks
  // below stay identity-stable and the context value only changes with `jobs`
  // — otherwise every account/category/settings write would re-render all
  // useReceiptScans consumers (the same discipline AppContext documents for
  // its transaction-reading functions).
  const env = {
    settings,
    categories,
    accounts,
    fxCurrencies,
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

  const startScan = useCallback(async (intent: ScanIntent = 'quick') => {
    const {
      checkLimit: gate,
      getReceiptCount: receiptCount,
      getUnpaidSplitBillCount: unpaidSplitCount,
    } = envRef.current;
    // A scan can carry its receipt image (when "Save scanned receipts" is on),
    // so it counts against the same free-tier receipts limit as a manual attach
    // — gate up front (before opening the camera), like the editor's camera
    // button. Kept even when the image won't be stored: the underlying scan is
    // still the metered resource.
    if (!gate('receipts', receiptCount())) return;

    // A split-intent scan will create a new split bill, so it also counts
    // against the free-tier unsettled-split-bills cap — gate it up front, the
    // same check the transaction editor runs before a fresh manual split.
    if (intent === 'split' && !gate('split_bills', unpaidSplitCount())) return;

    const appUserId = envRef.current.settings.appUserId?.trim();
    if (!appUserId) {
      Alert.alert(I18n.t('receiptScan.error_title'), I18n.t('receiptScan.error_body'));
      return;
    }

    // Open the full-screen scan camera. It lets the user either snap a receipt
    // or pick one from their album (bottom-right album button), then hands the
    // stored image back via `scanReceiptImage`.
    requestOpenScanCamera(intent);
  }, []);

  const runScan = useCallback(
    async (id: string, rel: string, intent: ScanIntent = 'quick'): Promise<ScanOutcome> => {
      const appUserId = envRef.current.settings.appUserId?.trim();
      if (!appUserId) {
        deleteReceiptImage(rel);
        setJobsBoth((prev) => prev.filter((j) => j.id !== id));
        Alert.alert(I18n.t('receiptScan.error_title'), I18n.t('receiptScan.error_body'));
        return 'invalid';
      }
      try {
        const scanEnv = envRef.current;
        const expenseCategoryNames = scanEnv.categories
          .filter((c) => c.type === 'expense')
          .map((c) => c.name);

        // Split-intent scans use the itemized Worker mode so the response also
        // carries the line-item breakdown (receiptDetail). Screenshot-intent
        // scans (auto-log) use the screenshot mode, which reads arbitrary
        // payment screens and matches the on-screen payment source against the
        // user's account names — pointless in simple mode, where everything
        // posts to the wallet anyway, so the names stay off the wire there.
        const mode =
          intent === 'split'
            ? ('itemized' as const)
            : intent === 'screenshot'
              ? ('screenshot' as const)
              : ('quick' as const);
        const accountNames =
          mode === 'screenshot' && !scanEnv.isSimpleMode
            ? scanEnv.accounts.map((a) => a.name)
            : undefined;
        const response = await scanReceipt({
          receiptRelPath: rel,
          appUserId,
          currency: scanEnv.settings.currencyCode,
          categories: expenseCategoryNames,
          mode,
          accounts: accountNames,
        });

        const resolveContext = {
          categories: scanEnv.categories,
          accounts: scanEnv.accounts,
          reportingCurrency: scanEnv.settings.currencyCode,
          defaultCurrency: scanEnv.quickEntryPrefs.defaultCurrency,
          fxCurrencies: scanEnv.fxCurrencies,
          defaultExpenseCategoryId: scanEnv.quickEntryPrefs.defaultExpenseCategoryId,
          defaultIncomeCategoryId: scanEnv.quickEntryPrefs.defaultIncomeCategoryId,
          categoryMap: scanEnv.quickEntryPrefs.categoryMap,
          defaultAccountId: scanEnv.quickEntryPrefs.defaultAccountId,
          simpleWalletId: scanEnv.isSimpleMode ? scanEnv.simpleWalletId : null,
        };
        // Every scan posts as an expense — receipts and screenshots alike — so
        // force the type and let an income line never slip in. The screenshot
        // path keeps the model's `account` field (for account detection); only
        // the direction is pinned.
        const drafts = response.transactions.map((t) =>
          resolveScannedToDraft({ ...t, type: 'expense' }, resolveContext),
        );

        void trackEvent(AnalyticsEvents.RECEIPT_SCAN_COMPLETED, {
          count: drafts.length,
          mode,
          itemCount: response.receiptDetail?.items.length ?? 0,
        });

        // Whether to keep the scanned image as the receipt. Off by default: the
        // scan still reads the amount/merchant, but the photo is discarded. The
        // screenshot automation has its own opt-in, separate from hand scans.
        const keepImage =
          intent === 'screenshot'
            ? scanEnv.quickEntryPrefs.autoLogSaveScreenshot
            : scanEnv.quickEntryPrefs.saveScannedReceipts;

        if (drafts.length === 0) {
          // A screenshot automation is ephemeral: a shot that didn't parse just
          // drops silently (no error banner to dismiss), the user re-runs the
          // shortcut. Hand scans keep the banner — the user is watching and
          // wants to know the capture failed.
          if (intent === 'screenshot') {
            deleteReceiptImage(rel);
            setJobsBoth((prev) => prev.filter((j) => j.id !== id));
            return 'empty';
          }
          setJobsBoth((prev) =>
            prev.map((j) => (j.id === id ? { ...j, status: 'error', error: 'empty' } : j)),
          );
          return 'empty';
        }

        // A split-intent scan opens the Split by Item editor for review instead
        // of creating a transaction: surface a tappable "ready" card whose primary
        // action is Split by Item. Quick scans skip this and auto-create below.
        if (intent === 'split' && drafts.length === 1) {
          const d = drafts[0]!;
          // When the image isn't kept, the split still carries the parsed data
          // but no photo; free the file now since nothing downstream owns it.
          const splitReceiptUri = keepImage ? rel : null;
          if (!keepImage) deleteReceiptImage(rel);
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
              receiptUri: splitReceiptUri,
            },
          };
          const resolvedDetail = response.receiptDetail
            ? resolveScannedReceiptDetail(
                response.receiptDetail,
                response.transactions[0] ?? null,
                resolveContext,
                splitReceiptUri,
              )
            : null;
          // Prefer the parsed line items; a split-intent scan whose items couldn't
          // be read still opens Split by Item, seeded with just the total, so the
          // user lands in manual item entry.
          const splitPayload: ResolvedReceiptDetail =
            resolvedDetail && resolvedDetail.items.length >= 2
              ? resolvedDetail
              : {
                  items: [],
                  merchant: d.note,
                  currency: d.currency,
                  date: null,
                  receiptUri: splitReceiptUri,
                  categoryId: d.categoryId,
                  accountId: d.accountId,
                  lowConfidence: true,
                };
          setJobsBoth((prev) =>
            prev.map((j) =>
              j.id === id ? { ...j, status: 'ready', intent, reviewPayload, splitPayload } : j,
            ),
          );
          void triggerHaptic('success');
          return 'ready';
        }

        // Quick scans (and the rare multi-receipt image): create the parsed
        // transaction(s) immediately in the background so the user doesn't have to
        // tap-to-review — the scan runs entirely off the main flow, so this fires
        // even while the user is on another screen. Every transaction past the
        // first gets its own copy of the image, because receipt files are owned
        // exclusively — the editor deletes the file when its receipt is replaced
        // or removed.
        let firstId: string | null = null;
        drafts.forEach((d, index) => {
          // Keep the image only when opted in; otherwise no copies are made and
          // the original is freed once all drafts are created (below).
          const receiptUri = keepImage ? (index === 0 ? rel : copyReceiptImage(rel)) : null;
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
        if (!keepImage) deleteReceiptImage(rel);
        setJobsBoth((prev) => prev.filter((j) => j.id !== id));
        void trackEvent(AnalyticsEvents.RECEIPT_SCAN_SAVED, { count: drafts.length });
        if (firstId) requestHighlightTransaction(firstId);
        void triggerHaptic('success');
        return 'created';
      } catch (err) {
        const isLimit = err instanceof ReceiptScanError && err.code === 'limit_reached';
        // Ephemeral automation: a non-limit failure on a screenshot scan drops
        // silently (no error banner) — the user re-runs the shortcut. A limit
        // still routes through applyScanFailure so it opens the paywall once.
        // Hand scans always surface the error banner.
        if (intent === 'screenshot' && !isLimit) {
          void trackEvent(AnalyticsEvents.RECEIPT_SCAN_FAILED, {
            code: err instanceof ReceiptScanError ? err.code : 'unknown',
          });
          deleteReceiptImage(rel);
          setJobsBoth((prev) => prev.filter((j) => j.id !== id));
          return 'failed';
        }
        applyScanFailure(err, id, rel);
        // 'limit' is distinct so a batch drain can stop instead of re-hitting
        // the quota (and re-opening the paywall) for every remaining shot.
        return isLimit ? 'limit' : 'failed';
      }
    },
    [applyScanFailure, setJobsBoth],
  );

  // Enqueue the scanning job, fire the start haptic, and kick off the parse,
  // returning the settle promise so an awaiting caller (the screenshot drain)
  // can act on the outcome. `scanReceiptImage` below is the fire-and-forget
  // wrapper the camera screen uses.
  const startScanJob = useCallback(
    (
      rel: string,
      source: 'camera' | 'library' | 'shortcut',
      intent: ScanIntent = 'quick',
    ): Promise<ScanOutcome> => {
      const id = newId();
      setJobsBoth((prev) => [...prev, { id, status: 'scanning', receiptUri: rel, intent }]);
      void triggerHaptic('selection');
      void trackEvent(AnalyticsEvents.RECEIPT_SCAN_STARTED, { source, intent });
      return runScan(id, rel, intent);
    },
    [runScan, setJobsBoth],
  );

  // Scan an already-captured/picked receipt image in the background
  // (non-blocking). Invoked by the camera screen once it has saved the photo to
  // the receipt store.
  const scanReceiptImage = useCallback(
    (rel: string, source: 'camera' | 'library' | 'shortcut', intent: ScanIntent = 'quick') => {
      void startScanJob(rel, source, intent);
    },
    [startScanJob],
  );

  // Awaitable variant: resolves with how the scan settled once the transaction
  // is created (or the scan errors). The screenshot drain awaits this so it
  // clears its App Group entry only after the scan has taken ownership.
  const scanReceiptImageAsync = useCallback(
    (rel: string, source: 'camera' | 'library' | 'shortcut', intent: ScanIntent = 'quick') =>
      startScanJob(rel, source, intent),
    [startScanJob],
  );

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

  const openReadyJobAsSplit = useCallback(
    (id: string) => {
      const job = jobsRef.current.find((j) => j.id === id);
      if (!job || job.status !== 'ready' || !job.splitPayload) return;
      void triggerHaptic('selection');
      setReceiptSplitLaunch({
        mode: 'create',
        source: 'scan',
        entryPoint: job.intent === 'split' ? 'settleup' : 'banner',
        seed: job.splitPayload,
      });
      requestOpenReceiptSplit();
      // The split editor now owns the receipt image (attaches on save, deletes
      // on discard); drop the banner card without deleting it.
      setJobsBoth((prev) => prev.filter((j) => j.id !== id));
    },
    [setJobsBoth],
  );

  const value = useMemo<ReceiptScanContextValue>(
    () => ({
      jobs,
      startScan,
      scanReceiptImage,
      scanReceiptImageAsync,
      openReadyJob,
      openReadyJobAsSplit,
      dismissJob,
    }),
    [
      jobs,
      startScan,
      scanReceiptImage,
      scanReceiptImageAsync,
      openReadyJob,
      openReadyJobAsSplit,
      dismissJob,
    ],
  );
  return <ReceiptScanContext.Provider value={value}>{children}</ReceiptScanContext.Provider>;
}
