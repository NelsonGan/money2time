import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * `removeClippedSubviews` on a horizontal month/period pager whose pages nest
 * their own scrollable is the cause of the blank-page bug: Android detaches a
 * clipped cell's whole native subtree and does not always reattach it, so
 * swiping to the previous month landed on a page that stayed completely empty
 * (right month in the header, no total, no chart, no rows) until an unrelated
 * re-render rebuilt it. It also hangs the main thread walking that subtree on
 * every scroll (MONEY2TIME-G, MONEY2TIME-1R, MONEY2TIME-1K).
 *
 * Both pagers cap themselves with `windowSize`, so clipping was never buying
 * anything worth that risk. These live in two places (the shared config and
 * the insights screen's inline props) and the prop is an easy "optimization"
 * to reach for again, so pin the invariant here rather than in a comment.
 */
const PAGER_SOURCES = [
  'features/transactions/constants/monthPagerList.ts',
  'features/insights/screens/InsightsScreen.tsx',
] as const;

/** Comments explain the rule, so only real code counts as a violation. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function readPagerSource(relativePath: string): string {
  return stripComments(readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

describe('month pager virtualization', () => {
  it.each(PAGER_SOURCES)('%s does not clip pager subviews', (relativePath) => {
    expect(readPagerSource(relativePath)).not.toContain('removeClippedSubviews');
  });

  it.each(PAGER_SOURCES)('%s keeps a neighbour page mounted either side', (relativePath) => {
    const windowSizes = [
      ...readPagerSource(relativePath).matchAll(/windowSize[:=]\s*\{?(\d+)/g),
    ].map((match) => Number(match[1]));

    // A pager built out of `windowSize` viewports keeps `(windowSize - 1) / 2`
    // of them either side of the visible page. Below 3 the neighbouring month
    // is only rendered mid-swipe, which is what made the clipping bug so easy
    // to hit in the first place.
    expect(windowSizes.length).toBeGreaterThan(0);
    windowSizes.forEach((windowSize) => expect(windowSize).toBeGreaterThanOrEqual(3));
  });
});
