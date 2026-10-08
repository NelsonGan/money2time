const drainListeners = new Set<() => void>();

/** Ask the mounted drain to run now (a setup test alert). */
export function requestPaymentAlertDrain() {
  drainListeners.forEach((listener) => listener());
}

export function subscribePaymentAlertDrain(listener: () => void): () => void {
  drainListeners.add(listener);
  return () => {
    drainListeners.delete(listener);
  };
}

/** What the pipeline made of the setup screen's test alert. */
export interface TestAlertResult {
  capturedAt: string;
  amount: number | null;
  currency: string | null;
  counterparty: string | null;
  accountId: string | null;
  categoryId: string | null;
  wouldLog: boolean;
  scanFailed?: boolean;
}

/** A slow or queued test must not complete a later setup attempt. */
export function isCurrentTestAlertResult(result: TestAlertResult, startedAt: number | null) {
  return startedAt !== null && Date.parse(result.capturedAt) >= startedAt;
}

const testListeners = new Set<(result: TestAlertResult) => void>();

export function emitTestAlertResult(result: TestAlertResult) {
  testListeners.forEach((listener) => listener(result));
}

export function subscribeTestAlertResult(listener: (result: TestAlertResult) => void): () => void {
  testListeners.add(listener);
  return () => {
    testListeners.delete(listener);
  };
}
