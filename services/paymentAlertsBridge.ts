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
  amount: number | null;
  currency: string | null;
  counterparty: string | null;
  accountId: string | null;
  categoryId: string | null;
  wouldLog: boolean;
  scanFailed?: boolean;
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
