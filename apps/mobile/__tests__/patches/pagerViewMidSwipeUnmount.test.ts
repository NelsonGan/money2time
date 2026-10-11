import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * react-native-pager-view's iOS (Fabric) component backs each page with a
 * UIViewController that only its own `_nativeChildrenViewControllers` array
 * owns. Unmounting the pager while a swipe was still dragging or decelerating
 * (closing AddActionSheet from a tile, leaving the transaction editor) freed
 * the controller of the page being revealed, and when the swipe settled
 * UIPageViewController threw "No view controller managing visible view"
 * (Sentry MONEY2TIME-S). The orphan in every report is a page controller's
 * root view: `autoresize = W+H`, sized to the page. The page re-sync that
 * unmounting triggers threw the same way at once when it ended a swipe early
 * (Sentry MONEY2TIME-2F: unmountChildComponentView -> setViewControllers).
 *
 * patches/react-native-pager-view+6.9.1.patch keeps every unmounted controller
 * until the next main-queue turn, or until the swipe settles, and holds the
 * re-sync for the same moment. This reads the installed module so an upgrade that
 * drops the patch fails here instead of quietly bringing the crash back.
 */

const SOURCE = path.resolve(
  __dirname,
  '../../node_modules/react-native-pager-view/ios/Fabric/RNCPagerViewComponentView.mm',
);

const methodBody = (source: string, signature: string) => {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end);
};

describe('pager-view iOS unmount during a swipe', () => {
  const source = readFileSync(SOURCE, 'utf8');

  it('keeps every unmounted page controller alive past the unmount', () => {
    const unmount = methodBody(source, '- (void)unmountChildComponentView:');
    const park = unmount.indexOf('[_releasedChildViewControllers addObject:removed]');
    expect(park).toBeGreaterThanOrEqual(0);
    // Parked before the mid-swipe early return, so both paths keep it.
    expect(park).toBeLessThan(unmount.indexOf('return;'));
  });

  it('holds the page re-sync until a swipe in flight settles', () => {
    const unmount = methodBody(source, '- (void)unmountChildComponentView:');
    expect(unmount).toMatch(
      /if \(scrollView\.isDragging \|\| scrollView\.isDecelerating\) \{\s*_needsPageResyncAfterScroll = YES;\s*return;/,
    );
  });

  it('lets them go only once the swipe has settled', () => {
    expect(methodBody(source, '- (void)unmountChildComponentView:')).toContain(
      '[self releaseUnmountedPages]',
    );
    expect(methodBody(source, '- (void)scrollViewDidEndDecelerating:')).toContain(
      '[self releaseUnmountedPages]',
    );
    expect(methodBody(source, '- (void)scrollViewDidEndDragging:')).toContain(
      '[self releaseUnmountedPages]',
    );
    expect(methodBody(source, '- (void)releaseUnmountedPages')).toContain(
      'dispatch_async(dispatch_get_main_queue()',
    );
  });

  it('ignores a finished swipe onto a page that is no longer mounted', () => {
    const didFinish = methodBody(source, 'didFinishAnimating:(BOOL)finished');
    expect(didFinish).toMatch(/currentIndex == NSNotFound\)\s*\{\s*return;/);
  });
});
