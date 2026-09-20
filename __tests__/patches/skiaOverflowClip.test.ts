import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The Android view capture behind the Settle Up share receipt, against the
 * `overflow: hidden` clip it has to honour.
 *
 * `makeImageFromView` walks the view tree by hand on Android (TextureView and
 * SurfaceView children need their own path), so it never reaches
 * ReactViewGroup.dispatchDraw() and has to replicate that clip itself.
 * @shopify/react-native-skia 2.2.12 did it by reflecting for
 * `dispatchOverflowDraw`, a method React Native dropped in 0.81 - the lookup
 * throws, the failure is only logged, and every clipped child draws unclipped.
 * A bundled category icon is one cell of a sprite atlas held to size by exactly
 * that clip, so the shared receipt came out with the whole sheet of icons
 * stamped across it (the app's own screens were fine: they draw normally).
 *
 * patches/@shopify+react-native-skia+2.2.12.patch backports the upstream fix
 * (released in 2.12.0). This reads the installed module so it keeps holding
 * after an upgrade drops the patch, since nothing else would notice: the
 * capture succeeds either way and only the pixels are wrong.
 */

const SERVICE = path.resolve(
  __dirname,
  '../../node_modules/@shopify/react-native-skia/android/src/main/java/com/shopify/reactnative/skia/ViewScreenshotService.java',
);

describe('skia android view capture', () => {
  const source = readFileSync(SERVICE, 'utf8');

  it('clips children of a view whose overflow is not visible', () => {
    expect(source).toContain('getOverflow()');
    expect(source).toContain('BackgroundStyleApplicator.clipToPaddingBox(');
  });

  // Narrowed to the reflective lookup itself rather than the bare method name:
  // a later version is free to mention `dispatchOverflowDraw` in a comment
  // explaining what it replaced, and that must not fail the suite.
  it('does not reach for the dispatchOverflowDraw() removed in RN 0.81', () => {
    expect(source).not.toContain('getDeclaredMethod("dispatchOverflowDraw"');
  });
});
