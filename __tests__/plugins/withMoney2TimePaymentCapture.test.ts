import path from 'path';

import {
  PAYMENT_CAPTURE_TEST_TAG,
  PAYMENT_CAPTURES_DIR,
} from '~/features/autoLog/lib/captureQueue';
import { PAYMENT_APPS } from '~/features/autoLog/lib/paymentApps';

// The Kotlin this plugin generates and the TypeScript that reads its files
// share a handful of names. Nothing at runtime would notice a mismatch: the
// listener would write into a folder nobody drains, or the picker would never
// see an installed bank. So the contract is checked here.
const plugin = require('../../plugins/withMoney2TimePaymentCapture.js') as {
  PAYMENT_CAPTURES_DIR: string;
  PAYMENT_CAPTURE_TEST_TAG: string;
  CAPTURE_QUEUED_EVENT: string;
  MODULE_NAME: string;
  paymentAppPackages: (projectRoot: string) => string[];
};

describe('withMoney2TimePaymentCapture', () => {
  it('writes where the drain reads, and tags the test alert the same way', () => {
    expect(plugin.PAYMENT_CAPTURES_DIR).toBe(PAYMENT_CAPTURES_DIR);
    expect(plugin.PAYMENT_CAPTURE_TEST_TAG).toBe(PAYMENT_CAPTURE_TEST_TAG);
  });

  it('names the module and event the service listens for', () => {
    const fs = require('fs') as typeof import('fs');
    const service = fs.readFileSync(
      path.join(__dirname, '../../services/paymentCapture.ts'),
      'utf8',
    );
    expect(service).toContain(`NativeModules.${plugin.MODULE_NAME}`);
    expect(service).toContain(`'${plugin.CAPTURE_QUEUED_EVENT}'`);
  });

  it('declares every suggested payment app for package visibility', () => {
    const declared = plugin.paymentAppPackages(path.join(__dirname, '../..'));
    expect(declared).toEqual([...new Set(PAYMENT_APPS.map((app) => app.package))].sort());
  });

  it('lists each payment app once', () => {
    const packages = PAYMENT_APPS.map((app) => app.package);
    expect(new Set(packages).size).toBe(packages.length);
  });
});
