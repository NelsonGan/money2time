import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * react-native-pager-view's iOS pager, torn down by an unmount.
 *
 * Up to 7.x the iOS pager was a UIPageViewController whose page controllers
 * only the component's own array owned. Unmounting a pager mid-swipe freed the
 * page being revealed and UIKit threw "No view controller managing visible
 * view" (Sentry MONEY2TIME-S, MONEY2TIME-2F). Since 8.0 the pager is a SwiftUI
 * `TabView` in page style, which is a UICollectionView whose page controllers
 * SwiftUI owns, so that crash cannot happen and the old 6.9.1 patch is gone.
 * The first test fails if an upgrade brings a UIPageViewController back.
 *
 * The SwiftUI pager has its own teardown hazard. React unmounts the pages one
 * at a time, and `.id(children.count)` rebuilds the TabView on every count
 * change. The scroll delegate was installed again whenever its weak
 * `originalDelegate` went nil, which re-adopted itself as its own original
 * delegate and overflowed the stack in `responds(to:)` (upstream issue #1146).
 * Its callbacks also used the Fabric event emitter without a nil check
 * (upstream issue #1113). patches/react-native-pager-view+9.0.7.patch ports
 * upstream PR #1147 and adds the nil checks. The other tests fail if an
 * upgrade drops the patch.
 */

const IOS_DIR = path.resolve(__dirname, '../../node_modules/react-native-pager-view/ios');
const read = (file: string) => readFileSync(path.join(IOS_DIR, file), 'utf8');

const methodBody = (source: string, signature: string) => {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end);
};

describe('pager-view iOS teardown', () => {
  it('has no UIPageViewController, so the 6.x mid-swipe unmount crash cannot happen', () => {
    const sources = readdirSync(IOS_DIR).filter((file) => /\.(swift|mm?|h)$/.test(file));
    expect(sources).toContain('PagerView.swift');
    for (const file of sources) {
      expect({ file, usesPageViewController: read(file).includes('UIPageViewController') }).toEqual(
        { file, usesPageViewController: false },
      );
    }
  });

  it('installs the scroll delegate only when it is not already the delegate', () => {
    const pagerView = read('PagerView.swift');
    expect(pagerView).not.toContain('if scrollDelegate.originalDelegate == nil');
    expect(pagerView).toMatch(
      /if collectionView\.delegate !== scrollDelegate \{[\s\S]*?collectionView\.delegate = scrollDelegate/,
    );
  });

  it('never forwards delegate queries back to itself', () => {
    const delegate = read('PagerScrollDelegate.swift');
    expect(delegate).toContain('if originalDelegate === self { originalDelegate = nil }');
    expect(delegate).toContain('guard !isQueryingOriginalDelegate else { return false }');
    expect(delegate).toContain('return target === self ? nil : target');
  });

  it('drops pager events when the Fabric event emitter is missing', () => {
    const component = read('RNCPagerViewComponentView.mm');
    for (const signature of [
      '- (void)onPageSelectedWithPosition:',
      '- (void)onPageScrollStateChangedWithState:',
      '- (void)sendScrollEventsForPosition:',
    ]) {
      expect(methodBody(component, signature)).toMatch(
        /const auto eventEmitter = \[self pagerEventEmitter\];[\s\S]*?if \(!eventEmitter\) \{\s*return;\s*\}/,
      );
    }
  });
});
