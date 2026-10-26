import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The Insights asset history chart (react-native-graph's LineGraph) against
 * the immutable paths of @shopify/react-native-skia 2.14.
 *
 * Skia 2.14 moved `moveTo`, `lineTo` and `cubicTo` off `SkPath` onto
 * `Skia.PathBuilder`. react-native-graph (1.1.0 here, and 1.4.0 upstream) still
 * calls them on a path, so the chart threw "undefined is not a function" while
 * rendering and the whole app fell back to the "Unable to load your data" card
 * (release 1.6.1, the Expo SDK 58 upgrade).
 *
 * patches/react-native-graph+1.1.0.patch builds the paths with a PathBuilder.
 * This reads the installed module, which is what Metro bundles (the package's
 * `react-native` entry is `src/`), plus the compiled copies other resolvers
 * use, so an upgrade that drops the patch fails here instead of on users'
 * phones. Type checks never see it: installed packages are not type-checked.
 */

const GRAPH = path.resolve(__dirname, '../../node_modules/react-native-graph');

const FILES = [
  'src/AnimatedLineGraph.tsx',
  'src/CreateGraphPath.ts',
  'lib/module/AnimatedLineGraph.js',
  'lib/module/CreateGraphPath.js',
  'lib/commonjs/AnimatedLineGraph.js',
  'lib/commonjs/CreateGraphPath.js',
];

describe('react-native-graph on immutable Skia paths', () => {
  it.each(FILES)('%s builds its paths with Skia.PathBuilder', (file) => {
    const source = readFileSync(path.join(GRAPH, file), 'utf8');

    expect(source).toContain('Skia.PathBuilder.Make()');
    expect(source).not.toContain('Skia.Path.Make()');
    // The removed SkPath mutators, called on the path and not the builder.
    expect(source).not.toMatch(/\bpath\.(moveTo|lineTo|cubicTo)\(/);
    expect(source).not.toMatch(/\bgradientPath\.lineTo\(/);
  });

  it('still targets a Skia whose SkPath has no mutators', () => {
    const types = readFileSync(
      path.resolve(
        __dirname,
        '../../node_modules/@shopify/react-native-skia/lib/typescript/src/skia/types/Path/Path.d.ts',
      ),
      'utf8',
    );

    // If a future Skia brings the mutators back this patch is harmless, but the
    // comments above stop being true: revisit it then.
    expect(types).not.toMatch(/^\s*moveTo\(/m);
  });
});
