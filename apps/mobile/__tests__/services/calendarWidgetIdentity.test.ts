import { readFileSync } from 'node:fs';
import path from 'node:path';

// SwiftUI flattens both ForEach collections in the lazy grid. Integer day
// offsets collided with the leading blank cells, hiding October 1–3, 2026.
// The native decoder must retain the snapshot's full date key, including for
// financial months spanning two months with repeated day numbers.
const plugin = readFileSync(
  path.resolve(__dirname, '../../plugins/withMoney2TimeWidgets.js'),
  'utf8',
);
const model = plugin.match(/private struct CalendarDayData: Decodable \{([\s\S]*?)\n\}/)?.[1];
const view = plugin.match(/private struct CalendarView: View \{([\s\S]*?)\n\}/)?.[1];

describe('iOS calendar widget identity', () => {
  it('decodes the complete date key already sent by the snapshot', () => {
    expect(model).toMatch(/let dayKey: String/);
  });

  it('identifies dates by their full date instead of offsets shared with blank cells', () => {
    expect(view).toMatch(/ForEach\(data\.days, id: \\\\.dayKey\)/);
    expect(view).not.toMatch(/ForEach\(Array\(data\.days\.enumerated\(\)\)/);
  });
});
