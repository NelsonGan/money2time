/**
 * Regression guard for Sentry MONEY2TIME-3R: `saveReceiptImage` used to call
 * straight into `File(sourceUri).copy(dest)`, so a source that had already
 * vanished (the auto-log screenshot drain's one legitimate case) surfaced as
 * an opaque native "no such file" error indistinguishable from a real bug.
 */
interface FakeFileInstance {
  uri: string;
  exists: boolean;
  copy: jest.Mock;
}

const fileInstances: FakeFileInstance[] = [];
const existsByUri = new Map<string, boolean>();

jest.mock('expo-file-system/next', () => {
  class FakeFile {
    uri: string;
    exists: boolean;
    copy = jest.fn();

    constructor(...segments: string[]) {
      this.uri = segments.join('/');
      this.exists = existsByUri.get(this.uri) ?? true;
      fileInstances.push(this);
    }
  }

  class FakeDirectory {
    exists = false;
    create = jest.fn();
    constructor(..._segments: string[]) {}
  }

  return {
    File: FakeFile,
    Directory: FakeDirectory,
    Paths: { document: 'file:///document' },
  };
});

import { MissingSourceImageError, saveReceiptImage } from '~/services/userAssets';

describe('saveReceiptImage', () => {
  beforeEach(() => {
    existsByUri.clear();
    fileInstances.length = 0;
  });

  it('throws MissingSourceImageError instead of attempting the copy when the source is gone', () => {
    const sourceUri = 'file:///app-group/scans/missing.jpg';
    existsByUri.set(sourceUri, false);

    expect(() => saveReceiptImage(sourceUri)).toThrow(MissingSourceImageError);
    expect(fileInstances.some((f) => f.copy.mock.calls.length > 0)).toBe(false);
  });

  it('copies the source into the receipts store when it still exists', () => {
    const sourceUri = 'file:///app-group/scans/present.jpg';
    existsByUri.set(sourceUri, true);

    const relativePath = saveReceiptImage(sourceUri);

    expect(relativePath).toMatch(/^receipts\/.+\.jpg$/);
    const source = fileInstances.find((f) => f.uri === sourceUri);
    expect(source?.copy).toHaveBeenCalledTimes(1);
  });
});
