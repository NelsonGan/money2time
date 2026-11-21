/**
 * Coverage for the Drive backup provider's folder handling.
 *
 * The provider this replaced could create several identically-named backup
 * folders and then only ever see one of them, so backups looked like they had
 * silently vanished. Reading across every duplicate is what makes those copies
 * visible (and rotatable) again.
 */
const api = {
  createFolder: jest.fn<Promise<string>, [string]>(),
  deleteFile: jest.fn<Promise<void>, [string]>(),
  downloadFileBytes: jest.fn<Promise<Uint8Array>, [string]>(),
  downloadFileText: jest.fn<Promise<string>, [string]>(),
  findFolderIds: jest.fn<Promise<string[]>, [string]>(),
  listFolderChildren: jest.fn<Promise<unknown[]>, [string]>(),
  uploadDriveFile: jest.fn<Promise<string>, [string, string, string | Uint8Array, string]>(),
};

class MockDriveError extends Error {
  readonly kind: string;
  readonly status: number | null;
  constructor(kind: string, message: string, status: number | null = null) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

jest.mock('~/services/autoBackupProviders/googleDriveApi', () => ({
  ...api,
  DriveError: MockDriveError,
}));

const auth = {
  getGoogleDriveSessionState: jest.fn(async (): Promise<string> => 'connected'),
  getGoogleAccessToken: jest.fn(async (): Promise<string | null> => 'token'),
  isGoogleDriveConfigured: jest.fn(() => true),
};

jest.mock('~/services/autoBackupProviders/googleDriveAuth', () => auth);
jest.mock('expo-file-system/next', () => ({
  File: class {
    constructor(public uri: string) {}
    async bytes() {
      return new Uint8Array([1, 2, 3]);
    }
  },
}));

/** Stands in for a gzipped backup's bytes. */
const BYTES = new Uint8Array([0x1f, 0x8b, 0]);

import {
  googleDriveProvider,
  resetGoogleDriveFolderCache,
} from '~/services/autoBackupProviders/googleDrive';

function driveFile(name: string, id: string, sizeBytes = 100) {
  return { id, name, sizeBytes, createdTime: null };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetGoogleDriveFolderCache();
});

describe('list', () => {
  it('gathers backups from every duplicate folder', async () => {
    api.findFolderIds.mockResolvedValue(['folder-1', 'folder-2']);
    api.listFolderChildren.mockImplementation(async (folderId) =>
      folderId === 'folder-1'
        ? [driveFile('money2time_AUTO_2026-07-01T10-00-00.json', 'file-a')]
        : [driveFile('money2time_AUTO_2026-07-02T10-00-00.json', 'file-b')],
    );

    const records = await googleDriveProvider.list();
    expect(records.map((r) => r.ref).sort()).toEqual(['file-a', 'file-b']);
  });

  it('collapses the same backup appearing in two folders', async () => {
    api.findFolderIds.mockResolvedValue(['folder-1', 'folder-2']);
    api.listFolderChildren.mockResolvedValue([
      driveFile('money2time_AUTO_2026-07-01T10-00-00.json', 'file-a'),
    ]);

    await expect(googleDriveProvider.list()).resolves.toHaveLength(1);
  });

  it('ignores files that are not auto-backups', async () => {
    api.findFolderIds.mockResolvedValue(['folder-1']);
    api.listFolderChildren.mockResolvedValue([
      driveFile('money2time_AUTO_2026-07-01T10-00-00.json', 'file-a'),
      driveFile('holiday-photo.jpg', 'file-b'),
      driveFile('money2time_AUTO_not-a-date.json', 'file-c'),
    ]);

    const records = await googleDriveProvider.list();
    expect(records.map((r) => r.ref)).toEqual(['file-a']);
  });

  it('does not create a folder just to list an account that has never backed up', async () => {
    api.findFolderIds.mockResolvedValue([]);
    await expect(googleDriveProvider.list()).resolves.toEqual([]);
    expect(api.createFolder).not.toHaveBeenCalled();
  });
});

describe('upload', () => {
  it('writes to the oldest folder and reuses it without re-querying', async () => {
    api.findFolderIds.mockResolvedValue(['folder-1', 'folder-2']);
    api.uploadDriveFile.mockResolvedValue('file-a');

    await googleDriveProvider.upload('money2time_AUTO_2026-07-01T10-00-00.json.gz', BYTES);
    await googleDriveProvider.upload('money2time_AUTO_2026-07-02T10-00-00.json.gz', BYTES);

    expect(api.uploadDriveFile.mock.calls.map((c) => c[0])).toEqual(['folder-1', 'folder-1']);
    // Resolved once, then cached: a burst of backups can't race Drive's lagging
    // index into creating duplicate folders.
    expect(api.findFolderIds).toHaveBeenCalledTimes(1);
  });

  it('creates the folder only when none exists', async () => {
    api.findFolderIds.mockResolvedValue([]);
    api.createFolder.mockResolvedValue('folder-new');
    api.uploadDriveFile.mockResolvedValue('file-a');

    const record = await googleDriveProvider.upload(
      'money2time_AUTO_2026-07-01T10-00-00.json.gz',
      BYTES,
    );
    expect(api.createFolder).toHaveBeenCalledTimes(1);
    expect(record.ref).toBe('file-a');
    expect(record.createdAt).toBe('2026-07-01T10:00:00.000Z');
  });

  it('re-resolves and retries when the cached folder has been deleted', async () => {
    api.findFolderIds.mockResolvedValueOnce(['stale-folder']).mockResolvedValueOnce([]);
    api.createFolder.mockResolvedValue('folder-new');
    api.uploadDriveFile
      .mockRejectedValueOnce(new MockDriveError('client', 'File not found', 404))
      .mockResolvedValueOnce('file-a');

    const record = await googleDriveProvider.upload(
      'money2time_AUTO_2026-07-01T10-00-00.json.gz',
      BYTES,
    );
    expect(record.ref).toBe('file-a');
    expect(api.uploadDriveFile.mock.calls.map((c) => c[0])).toEqual(['stale-folder', 'folder-new']);
  });

  it('propagates a failure that is not about a missing folder', async () => {
    api.findFolderIds.mockResolvedValue(['folder-1']);
    api.uploadDriveFile.mockRejectedValue(new MockDriveError('quota', 'Drive is full', 403));

    await expect(
      googleDriveProvider.upload('money2time_AUTO_2026-07-01T10-00-00.json.gz', BYTES),
    ).rejects.toMatchObject({ kind: 'quota' });
    expect(api.uploadDriveFile).toHaveBeenCalledTimes(1);
  });

  it('does not treat an arbitrary 400 as a missing folder', async () => {
    // Clearing the cache and creating a replacement on any 4xx would re-create
    // the duplicate-folder problem. Only a 404 means the parent is gone.
    api.findFolderIds.mockResolvedValue(['folder-1']);
    api.uploadDriveFile.mockRejectedValue(new MockDriveError('client', 'Bad request', 400));

    await expect(
      googleDriveProvider.upload('money2time_AUTO_2026-07-01T10-00-00.json.gz', BYTES),
    ).rejects.toMatchObject({ status: 400 });
    expect(api.createFolder).not.toHaveBeenCalled();
    expect(api.uploadDriveFile).toHaveBeenCalledTimes(1);
  });
});

describe('folder creation', () => {
  it('reuses a folder whose create response was lost rather than making another', async () => {
    api.findFolderIds
      .mockResolvedValueOnce([]) // nothing yet
      .mockResolvedValueOnce(['folder-late']); // the create actually landed
    api.createFolder.mockRejectedValue(new MockDriveError('timeout', 'Timed out'));
    api.uploadDriveFile.mockResolvedValue('file-a');

    const record = await googleDriveProvider.upload(
      'money2time_AUTO_2026-07-01T10-00-00.json.gz',
      BYTES,
    );
    expect(record.ref).toBe('file-a');
    expect(api.uploadDriveFile).toHaveBeenCalledWith(
      'folder-late',
      expect.anything(),
      BYTES,
      'application/gzip',
    );
    expect(api.createFolder).toHaveBeenCalledTimes(1);
  });

  it('surfaces the create failure when nothing landed', async () => {
    api.findFolderIds.mockResolvedValue([]);
    api.createFolder.mockRejectedValue(new MockDriveError('offline', 'Network request failed'));

    await expect(
      googleDriveProvider.upload('money2time_AUTO_2026-07-01T10-00-00.json.gz', BYTES),
    ).rejects.toMatchObject({ kind: 'offline' });
    expect(api.uploadDriveFile).not.toHaveBeenCalled();
  });
});

describe('availability', () => {
  it('is available with a connected session and a token', async () => {
    await expect(googleDriveProvider.unavailableReason()).resolves.toBeNull();
    await expect(googleDriveProvider.isAvailable()).resolves.toBe(true);
  });

  it('says why the session cannot reach Drive', async () => {
    auth.getGoogleDriveSessionState.mockResolvedValueOnce('no_drive_access');

    await expect(googleDriveProvider.unavailableReason()).resolves.toBe('no_drive_access');
    expect(auth.getGoogleAccessToken).not.toHaveBeenCalled();
  });

  it('reports a session that could not mint a token', async () => {
    auth.getGoogleAccessToken.mockResolvedValueOnce(null);

    await expect(googleDriveProvider.unavailableReason()).resolves.toBe('no_token');
  });

  it('reports a build without a Google client id', async () => {
    auth.isGoogleDriveConfigured.mockReturnValueOnce(false).mockReturnValueOnce(false);

    await expect(googleDriveProvider.unavailableReason()).resolves.toBe('not_configured');
    await expect(googleDriveProvider.isAvailable()).resolves.toBe(false);
  });
});
