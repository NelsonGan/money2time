import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  LIVE_ACTIVITY_ATTRIBUTES_TYPE,
  type LiveActivityAttributesPayload,
} from '../../cloudflare/workers/live-earnings/src/apns';

/**
 * The push-to-start payload against the Swift it has to decode into.
 *
 * A start push carries the *whole* activity: the type's name as a string, and
 * an `attributes` dictionary that ActivityKit hands to a JSONDecoder. Nothing
 * checks the two agree at build time - APNs returns 200 for a payload the
 * device then discards - so a renamed field in the Swift struct would ship as
 * a schedule that silently stops raising cards.
 *
 * The Swift lives in the config plugin (`ios/` is generated and gitignored),
 * which is why this reads it out of the plugin source.
 */

const REPO_ROOT = path.resolve(__dirname, '../..');
const PLUGIN = path.join(REPO_ROOT, 'plugins', 'withMoney2TimeWidgets.js');

function attributesStruct(): string {
  const source = readFileSync(PLUGIN, 'utf8');
  const start = source.indexOf(`struct ${LIVE_ACTIVITY_ATTRIBUTES_TYPE}: ActivityAttributes {`);
  expect(start).toBeGreaterThan(-1);
  // Up to the ContentState nested struct's close and on to the end of the
  // outer one: the stored properties we care about all sit after ContentState.
  const end = source.indexOf('\n}\n', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

/**
 * Stored properties of the outer struct, in declaration order. Computed ones
 * (`var startedAt: Date { ... }`) are deliberately excluded: they are neither
 * encoded nor decoded, which is the whole reason the pushed payload can carry
 * plain millis while every view keeps reading a `Date`.
 */
function storedProperties(struct: string): string[] {
  const body = struct.slice(struct.indexOf('  }') + 3); // past ContentState
  return [...body.matchAll(/^ {2}var (\w+): ([\w<>[\]?]+)(\s*\{)?$/gm)]
    .filter((match) => !match[3])
    .map((match) => match[1]);
}

/**
 * One key per stored property, typed. Written out rather than derived so a
 * change on either side has to be made deliberately on both.
 */
const PAYLOAD: LiveActivityAttributesPayload = {
  startedAtMillis: 1,
  endsAtMillis: 2,
  hourlyRate: 3,
  titleText: 'a',
  rateText: 'b',
  endsText: 'c',
  totalText: 'd',
  refreshText: 'e',
  accentLightHex: 0x1f8a6f,
  accentDarkHex: 0x34c99a,
};

describe('push-to-start attributes contract', () => {
  it('names the struct ActivityKit will look for', () => {
    expect(attributesStruct()).toContain(`struct ${LIVE_ACTIVITY_ATTRIBUTES_TYPE}`);
  });

  it('sends exactly the stored properties the Swift declares', () => {
    expect(storedProperties(attributesStruct()).sort()).toEqual(Object.keys(PAYLOAD).sort());
  });

  it('carries the two session times as millis, never as dates', () => {
    const struct = attributesStruct();
    // A Swift `Date` decodes as seconds since the 2001 reference date under
    // JSONDecoder's default strategy, so a Unix timestamp sent into one lands
    // 31 years out - silently, since nothing throws.
    expect(struct).toContain('var startedAtMillis: Double');
    expect(struct).toContain('var endsAtMillis: Double');
    expect(typeof PAYLOAD.startedAtMillis).toBe('number');
    expect(typeof PAYLOAD.endsAtMillis).toBe('number');
  });

  it('keeps the dates the views read as computed properties', () => {
    const struct = attributesStruct();
    expect(struct).toContain('var startedAt: Date {');
    expect(struct).toContain('var endsAt: Date {');
  });
});
