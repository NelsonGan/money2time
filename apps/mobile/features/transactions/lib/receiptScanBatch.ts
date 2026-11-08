/**
 * Pure helpers for scanning several receipts picked from the album in one go
 * (the Add tab's "Scan receipt" only — split scans stay one receipt at a time).
 * The context wires these to the scan pipeline; the banner uses the grouping
 * and summary to show a batch as one card.
 */

/** Most receipts one album pick can hand to the scanner. */
export const MAX_RECEIPT_BATCH = 10;

/**
 * How many receipts of a batch are prepared and scanned at once. Each scan is
 * a slow vision-model call, so a strictly serial batch of ten would take
 * minutes; three keeps the wait short without a burst of parallel uploads.
 * The Worker checks the quota before it consumes it, so at most this many
 * minus one scans can slip past a free user's last remaining scan.
 */
export const RECEIPT_BATCH_CONCURRENCY = 3;

/**
 * How many receipts the album may hand over at once. Free users with "Save
 * scanned receipts" on attach every scanned photo, so the pick never exceeds
 * the receipt images they have left; otherwise only the batch cap applies.
 */
export function receiptBatchPickLimit({
  isPro,
  keepImage,
  receiptCount,
  freeReceiptLimit,
}: {
  isPro: boolean;
  keepImage: boolean;
  receiptCount: number;
  freeReceiptLimit: number;
}): number {
  if (isPro || !keepImage) return MAX_RECEIPT_BATCH;
  return Math.max(1, Math.min(MAX_RECEIPT_BATCH, freeReceiptLimit - receiptCount));
}

/**
 * Run `worker` over `items`, at most `concurrency` at a time, in order. A
 * worker that resolves `'stop'` (the scan quota ran out) lets the in-flight
 * ones finish but starts no more; each item never started is passed to
 * `onSkipped`. A worker that throws counts as `'continue'`.
 */
export async function runReceiptQueue<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<'continue' | 'stop'>,
  onSkipped?: (item: T) => void,
): Promise<void> {
  let next = 0;
  let stopped = false;
  const runner = async () => {
    while (!stopped && next < items.length) {
      const index = next;
      next += 1;
      let result: 'continue' | 'stop' = 'continue';
      try {
        result = await worker(items[index] as T, index);
      } catch {
        result = 'continue';
      }
      if (result === 'stop') stopped = true;
    }
  };
  const lanes = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: lanes }, runner));
  for (let index = next; index < items.length; index += 1) onSkipped?.(items[index] as T);
}

interface BatchableJob {
  status: string;
  batchId?: string;
  /** Transactions a created job logged (one image can hold several receipts). */
  createdCount?: number;
}

export type ScanBannerEntry<J> =
  | { kind: 'single'; job: J }
  | { kind: 'batch'; batchId: string; jobs: J[] };

/**
 * Banner entries in job order: a job without a batch stands alone, and every
 * job of a batch is gathered into one entry where its first job sits.
 */
export function groupScanJobs<J extends BatchableJob>(jobs: readonly J[]): ScanBannerEntry<J>[] {
  const entries: ScanBannerEntry<J>[] = [];
  const batches = new Map<string, J[]>();
  for (const job of jobs) {
    if (!job.batchId) {
      entries.push({ kind: 'single', job });
      continue;
    }
    const existing = batches.get(job.batchId);
    if (existing) {
      existing.push(job);
      continue;
    }
    const group = [job];
    batches.set(job.batchId, group);
    entries.push({ kind: 'batch', batchId: job.batchId, jobs: group });
  }
  return entries;
}

export interface ScanBatchSummary {
  /** Receipts still in the batch (opened and dismissed ones have left it). */
  total: number;
  scanning: number;
  /** Receipts that logged at least one expense. */
  createdJobs: number;
  /** Expenses logged across those receipts. */
  createdTransactions: number;
  failed: number;
}

export function summarizeScanBatch(jobs: readonly BatchableJob[]): ScanBatchSummary {
  const summary: ScanBatchSummary = {
    total: jobs.length,
    scanning: 0,
    createdJobs: 0,
    createdTransactions: 0,
    failed: 0,
  };
  for (const job of jobs) {
    if (job.status === 'scanning') summary.scanning += 1;
    else if (job.status === 'created') {
      summary.createdJobs += 1;
      summary.createdTransactions += Math.max(1, job.createdCount ?? 1);
    } else if (job.status === 'error') summary.failed += 1;
  }
  return summary;
}
