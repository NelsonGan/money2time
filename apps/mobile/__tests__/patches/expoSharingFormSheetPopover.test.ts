import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * expo-sharing's iOS share sheet, opened from inside an iPad form sheet.
 *
 * Settle Up's Send receipt shares the receipt image with `Sharing.shareAsync`
 * from `SplitReceiptShareModal`, which `ThemeModal` presents as a form sheet on
 * iPad. A view controller in a form sheet reports a compact horizontal size
 * class, so expo-sharing skipped anchoring the share sheet's popover. The
 * window stays regular, so UIKit still presented a popover and threw
 * "UIPopoverPresentationController … should have a non-nil sourceView or
 * barButtonItem set" (an uncatchable NSGenericException: PostHog
 * 01a1f7c9-fd00-71c1-b131-d56d5d61c8de, iPadOS, 1.8.0).
 *
 * patches/expo-sharing+58.0.20.patch anchors the popover on iPad and whenever
 * the view controller or its window is regular, measured from the view's
 * bounds (upstream used its frame, which is offset inside a form sheet). This
 * reads the installed module's code, comments stripped, so the fix is noticed
 * if an upgrade drops the patch (upstream 58.0.23 still checks the view
 * controller alone).
 */

const MODULE = path.resolve(__dirname, '../../node_modules/expo-sharing/ios/SharingModule.swift');

/** The popover helper's code, without comments, so a fix left in a comment fails. */
function popoverHelperCode(): string {
  const source = readFileSync(MODULE, 'utf8');
  const start = source.indexOf('private func configurePopoverIfNeeded(');
  const end = source.indexOf('private func ', start + 1);
  if (start === -1) throw new Error('configurePopoverIfNeeded not found in SharingModule.swift');
  return source
    .slice(start, end === -1 ? undefined : end)
    .replace(/\/\/.*$/gm, '')
    .replace(/\s+/g, ' ');
}

describe('expo-sharing iOS share popover', () => {
  const code = popoverHelperCode();

  it("anchors the popover on iPad and when the window is regular, not only on the view controller's width", () => {
    expect(code).toContain('UIDevice.current.userInterfaceIdiom == .pad');
    expect(code).toContain(
      'viewController.view.window?.traitCollection.horizontalSizeClass == .regular',
    );
    expect(code).not.toContain(
      'guard viewController.traitCollection.horizontalSizeClass == .regular else',
    );
  });

  it("places the default anchor in the view's own coordinates", () => {
    expect(code).toContain('viewController.view.bounds');
    expect(code).not.toContain('viewController.view.frame');
  });
});
