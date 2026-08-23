// Minimal File/Directory stand-ins so userAssets.ts can be imported and its
// pure/async helpers exercised without the real native module.
let fileExists = true;
let fileBase64: () => Promise<string> = async () => 'abc123';

jest.mock('expo-file-system/next', () => ({
  File: class {
    constructor(..._args: unknown[]) {}
    get exists() {
      return fileExists;
    }
    base64() {
      return fileBase64();
    }
  },
  Directory: class {
    constructor(..._args: unknown[]) {}
  },
  Paths: { document: '/doc' },
}));

import { readReceiptBase64 } from '~/services/userAssets';

describe('readReceiptBase64', () => {
  beforeEach(() => {
    fileExists = true;
    fileBase64 = async () => 'abc123';
  });

  it('returns null for a missing/invalid relative path', async () => {
    expect(await readReceiptBase64(null)).toBeNull();
    expect(await readReceiptBase64('../secret.jpg')).toBeNull();
    expect(await readReceiptBase64('/etc/passwd')).toBeNull();
  });

  it('returns null when the file does not exist', async () => {
    fileExists = false;
    expect(await readReceiptBase64('receipts/gone.jpg')).toBeNull();
  });

  it('reads a present file as base64 with the right mime type', async () => {
    const result = await readReceiptBase64('receipts/a.jpg');
    expect(result).toEqual({ base64: 'abc123', mime: 'image/jpeg' });
  });

  it('returns null instead of throwing when the file vanishes between the exists check and the read', async () => {
    // Regression: the orphan GC can delete a just-captured, not-yet-referenced
    // receipt out from under an in-flight scan between `file.exists` and
    // `file.base64()` (Sentry MONEY2TIME-R: "FileSystemFile.base64 has been
    // rejected" / ENOENT). This must resolve to null, per the function's
    // documented contract, not reject.
    fileExists = true;
    fileBase64 = async () => {
      throw new Error('ENOENT: no such file or directory');
    };

    await expect(readReceiptBase64('receipts/vanished.jpg')).resolves.toBeNull();
  });
});
