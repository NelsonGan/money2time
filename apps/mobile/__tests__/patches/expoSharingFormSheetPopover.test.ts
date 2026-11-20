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
 * patches/expo-sharing+58.0.20.patch anchors the popover when either the view
 * controller or its window is regular. This reads the installed module so the
 * fix is noticed if an upgrade drops the patch (upstream 58.0.23 still checks
 * the view controller alone).
 */

const MODULE = path.resolve(__dirname, '../../node_modules/expo-sharing/ios/SharingModule.swift');

describe('expo-sharing iOS share popover', () => {
  const source = readFileSync(MODULE, 'utf8');

  it("anchors the popover when the window is regular, not only the view controller's traits", () => {
    expect(source).toContain('viewController.view.window?.traitCollection');
    expect(source).not.toMatch(
      /guard viewController\.traitCollection\.horizontalSizeClass == \.regular else/,
    );
  });

  it('still anchors to the presenting view', () => {
    expect(source).toMatch(
      /SceneGeometry\.anchorPopover\(\s*of: activityController,\s*to: viewController\.view/,
    );
  });
});
