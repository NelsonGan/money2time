import {
  groupScanJobs,
  MAX_RECEIPT_BATCH,
  receiptBatchPickLimit,
  runReceiptQueue,
  summarizeScanBatch,
} from '~/features/transactions/lib/receiptScanBatch';

describe('receiptBatchPickLimit', () => {
  it('lets Pro users pick a full batch', () => {
    expect(
      receiptBatchPickLimit({
        isPro: true,
        keepImage: true,
        receiptCount: 29,
        freeReceiptLimit: 30,
      }),
    ).toBe(MAX_RECEIPT_BATCH);
  });

  it('ignores the receipt-image allowance when scanned photos are not kept', () => {
    expect(
      receiptBatchPickLimit({
        isPro: false,
        keepImage: false,
        receiptCount: 29,
        freeReceiptLimit: 30,
      }),
    ).toBe(MAX_RECEIPT_BATCH);
  });

  it('caps a free user who keeps photos at the images they have left', () => {
    expect(
      receiptBatchPickLimit({
        isPro: false,
        keepImage: true,
        receiptCount: 26,
        freeReceiptLimit: 30,
      }),
    ).toBe(4);
    expect(
      receiptBatchPickLimit({
        isPro: false,
        keepImage: true,
        receiptCount: 2,
        freeReceiptLimit: 30,
      }),
    ).toBe(MAX_RECEIPT_BATCH);
  });

  it('never goes below one pick', () => {
    expect(
      receiptBatchPickLimit({
        isPro: false,
        keepImage: true,
        receiptCount: 31,
        freeReceiptLimit: 30,
      }),
    ).toBe(1);
  });
});

describe('runReceiptQueue', () => {
  const deferred = () => {
    let resolve!: (value: 'continue' | 'stop') => void;
    const promise = new Promise<'continue' | 'stop'>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };

  it('runs every item, never more than the concurrency at once', async () => {
    let active = 0;
    let peak = 0;
    const seen: number[] = [];
    await runReceiptQueue([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      seen.push(item);
      active -= 1;
      return 'continue';
    });
    expect(peak).toBe(3);
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('starts items in order', async () => {
    const started: number[] = [];
    await runReceiptQueue([0, 1, 2, 3], 2, async (item, index) => {
      expect(item).toBe(index);
      started.push(index);
      return 'continue';
    });
    expect(started).toEqual([0, 1, 2, 3]);
  });

  it('stops starting new items after a stop and reports the skipped ones', async () => {
    const gates = [deferred(), deferred(), deferred()];
    const started: number[] = [];
    const skipped: number[] = [];
    const run = runReceiptQueue(
      [0, 1, 2, 3, 4, 5],
      2,
      (item) => {
        started.push(item);
        return gates[item]?.promise ?? Promise.resolve('continue');
      },
      (item) => skipped.push(item),
    );
    // 0 and 1 are in flight; 0 hits the quota while 1 is still scanning.
    gates[0]!.resolve('stop');
    await Promise.resolve();
    await Promise.resolve();
    gates[1]!.resolve('continue');
    await run;
    expect(started).toEqual([0, 1]);
    expect(skipped).toEqual([2, 3, 4, 5]);
  });

  it('treats a throwing worker as continue', async () => {
    const started: number[] = [];
    await runReceiptQueue([0, 1, 2], 1, async (item) => {
      started.push(item);
      if (item === 0) throw new Error('boom');
      return 'continue';
    });
    expect(started).toEqual([0, 1, 2]);
  });

  it('does nothing for an empty list', async () => {
    const worker = jest.fn();
    await runReceiptQueue([], 3, worker);
    expect(worker).not.toHaveBeenCalled();
  });
});

describe('groupScanJobs', () => {
  it('keeps single jobs alone and gathers a batch where its first job sits', () => {
    const jobs = [
      { id: 'a', status: 'created' },
      { id: 'b1', status: 'scanning', batchId: 'B' },
      { id: 'c', status: 'error' },
      { id: 'b2', status: 'created', batchId: 'B' },
      { id: 'd1', status: 'scanning', batchId: 'D' },
    ];
    const entries = groupScanJobs(jobs);
    expect(entries.map((e) => (e.kind === 'single' ? e.job.id : e.batchId))).toEqual([
      'a',
      'B',
      'c',
      'D',
    ]);
    const batch = entries[1];
    expect(batch?.kind === 'batch' ? batch.jobs.map((j) => j.id) : null).toEqual(['b1', 'b2']);
  });
});

describe('summarizeScanBatch', () => {
  it('counts receipts by state and expenses logged', () => {
    expect(
      summarizeScanBatch([
        { status: 'scanning' },
        { status: 'created', createdCount: 1 },
        { status: 'created', createdCount: 2 },
        { status: 'created' },
        { status: 'error' },
      ]),
    ).toEqual({ total: 5, scanning: 1, createdJobs: 3, createdTransactions: 4, failed: 1 });
  });
});
