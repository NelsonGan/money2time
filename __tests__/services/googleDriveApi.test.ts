/**
 * Coverage for the direct Google Drive REST client behind auto-backup.
 *
 * The previous `react-native-cloud-storage`-based provider failed backups on
 * every transient hiccup, sent a byte-count-wrong `Content-Length` that stalled
 * any upload containing non-ASCII text, and needed three API calls per file
 * just to list a backup's size. Each of those is pinned here.
 */

interface GoogleSigninMock {
  configure: jest.Mock;
  hasPreviousSignIn: jest.Mock<boolean, []>;
  getCurrentUser: jest.Mock<{ user: { email: string } } | null, []>;
  signInSilently: jest.Mock;
  signIn: jest.Mock;
  signOut: jest.Mock;
  getTokens: jest.Mock;
  hasPlayServices: jest.Mock;
  clearCachedAccessToken: jest.Mock;
}

const googleSignin: GoogleSigninMock = {
  configure: jest.fn(),
  hasPreviousSignIn: jest.fn(() => true),
  getCurrentUser: jest.fn(() => ({ user: { email: 'someone@example.com' } })),
  signInSilently: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  getTokens: jest.fn(async () => ({ accessToken: 'token-1' })),
  hasPlayServices: jest.fn(),
  clearCachedAccessToken: jest.fn(async () => undefined),
};

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: googleSignin,
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  },
}));

import {
  createFolder,
  deleteFile,
  DriveError,
  downloadFileText,
  escapeDriveQueryValue,
  findFolderId,
  findFolderIds,
  isRetryableDriveError,
  listFolderChildren,
  uploadJsonFile,
} from '~/services/autoBackupProviders/googleDriveApi';

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit]>;

function jsonResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  const status = init?.status ?? 200;
  const headerMap = new Map(
    Object.entries(init?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headerMap.get(name.toLowerCase()) ?? null },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

let fetchMock: FetchMock;

beforeEach(() => {
  jest.clearAllMocks();
  googleSignin.getTokens.mockImplementation(async () => ({ accessToken: 'token-1' }));
  googleSignin.getCurrentUser.mockImplementation(() => ({
    user: { email: 'someone@example.com' },
  }));
  fetchMock = jest.fn() as unknown as FetchMock;
  global.fetch = fetchMock as unknown as typeof fetch;
  // Two very different timers run through setTimeout here: the retry backoff
  // (sub-second) and each request's abort timer (20s / 120s). Collapse only the
  // backoff so the suite stays fast; firing the abort timer too would abort
  // every request before it started.
  jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
    if ((ms ?? 0) < 5_000) fn();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('error classification', () => {
  it.each([
    ['offline', true],
    ['timeout', true],
    ['rate_limited', true],
    ['server', true],
    ['auth', false],
    ['quota', false],
    ['client', false],
  ] as const)('treats %s as retryable=%s', (kind, expected) => {
    expect(isRetryableDriveError(kind)).toBe(expected);
  });

  it('reports a full Drive as quota, not a generic failure', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            message: "The user's Drive storage quota has been exceeded.",
            errors: [{ reason: 'storageQuotaExceeded' }],
          },
        },
        { status: 403 },
      ),
    );

    await expect(findFolderId('Money2Time')).rejects.toMatchObject({ kind: 'quota' });
    // Quota is permanent until the user acts, so we must not hammer Drive.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a timed-out request as timeout rather than a bare "Aborted"', async () => {
    fetchMock.mockRejectedValue(abortError());
    await expect(findFolderId('Money2Time')).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('surfaces a dropped connection as offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(findFolderId('Money2Time')).rejects.toMatchObject({ kind: 'offline' });
  });
});

describe('retries', () => {
  it('rides out a transient network drop instead of failing the backup', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'folder-1', name: 'Money2Time' }] }));

    await expect(findFolderId('Money2Time')).resolves.toBe('folder-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after three attempts and reports the last failure', async () => {
    fetchMock.mockRejectedValue(abortError());
    await expect(findFolderId('Money2Time')).rejects.toBeInstanceOf(DriveError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a request Drive rejected as malformed', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: 'Invalid query' } }, { status: 400 }),
    );
    await expect(findFolderId('Money2Time')).rejects.toMatchObject({ kind: 'client' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 5xx from Drive', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'Backend Error' } }, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ files: [] }));

    await expect(findFolderId('Money2Time')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('expired access tokens', () => {
  it('drops the cached token on a 401 and retries with a fresh one', async () => {
    googleSignin.getTokens
      .mockResolvedValueOnce({ accessToken: 'stale' })
      .mockResolvedValueOnce({ accessToken: 'fresh' });

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { message: 'Request had invalid authentication credentials.' } },
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'folder-1', name: 'Money2Time' }] }));

    await expect(findFolderId('Money2Time')).resolves.toBe('folder-1');
    expect(googleSignin.clearCachedAccessToken).toHaveBeenCalledWith('stale');
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer fresh',
    });
  });

  it('fails with an auth error when there is no signed-in account', async () => {
    googleSignin.getCurrentUser.mockReturnValue(null);
    googleSignin.hasPreviousSignIn.mockReturnValue(false);

    await expect(findFolderId('Money2Time')).rejects.toMatchObject({ kind: 'auth' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('folder resolution', () => {
  it('scopes the lookup to a non-trashed folder at the Drive root', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ files: [{ id: 'folder-1', name: 'Money2Time' }] }));
    await findFolderId('Money2Time');

    const url = fetchMock.mock.calls[0]![0];
    const q = decodeURIComponent(new URL(url).searchParams.get('q') ?? '');
    expect(q).toContain("name = 'Money2Time'");
    expect(q).toContain("mimeType = 'application/vnd.google-apps.folder'");
    expect(q).toContain("'root' in parents");
    expect(q).toContain('trashed = false');
  });

  it('returns null rather than inventing a folder when none exists', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ files: [] }));
    await expect(findFolderId('Money2Time')).resolves.toBeNull();
  });

  it('asks Drive for the oldest match first, so every run picks the same folder', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ files: [{ id: 'folder-1', name: 'Money2Time' }] }));
    await findFolderId('Money2Time');
    expect(new URL(fetchMock.mock.calls[0]![0]).searchParams.get('orderBy')).toBe('createdTime');
  });

  it('reports every duplicate folder, not just the first', async () => {
    // The old provider could create same-named siblings when Drive's lagging
    // file-list index hid a folder it had just made.
    fetchMock.mockResolvedValue(
      jsonResponse({
        files: [
          { id: 'folder-1', name: 'Money2Time', createdTime: '2026-01-01' },
          { id: 'folder-2', name: 'Money2Time', createdTime: '2026-02-01' },
        ],
      }),
    );

    await expect(findFolderIds('Money2Time')).resolves.toEqual(['folder-1', 'folder-2']);
    // The write target stays the oldest of them.
    await expect(findFolderId('Money2Time')).resolves.toBe('folder-1');
  });

  it('creates the folder at the root', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'folder-new' }));
    await expect(createFolder('Money2Time')).resolves.toBe('folder-new');

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(body).toEqual({
      name: 'Money2Time',
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['root'],
    });
  });

  it('never retries a folder create, which would leave a duplicate behind', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(createFolder('Money2Time')).rejects.toMatchObject({ kind: 'offline' });
    // A create whose response was merely lost still landed server-side; a
    // retry would produce a second same-named folder.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('escapes quotes so a folder name cannot break the query', () => {
    expect(escapeDriveQueryValue("it's")).toBe("it\\'s");
    expect(escapeDriveQueryValue('a\\b')).toBe('a\\\\b');
  });
});

describe('listing', () => {
  it('reads name, size and id from a single listing call', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        files: [
          { id: 'a', name: 'money2time_AUTO_1.json', size: '2048', createdTime: '2026-07-01' },
          { id: 'b', name: 'money2time_AUTO_2.json', size: '4096', createdTime: '2026-07-02' },
        ],
      }),
    );

    const files = await listFolderChildren('folder-1');
    // One call for two files. The old provider took three calls *per file*
    // just to stat a size, which is what made the list screen crawl.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(files).toEqual([
      { id: 'a', name: 'money2time_AUTO_1.json', sizeBytes: 2048, createdTime: '2026-07-01' },
      { id: 'b', name: 'money2time_AUTO_2.json', sizeBytes: 4096, createdTime: '2026-07-02' },
    ]);
  });

  it('follows pagination', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: 'a', name: 'one' }], nextPageToken: 'page-2' }),
      )
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'b', name: 'two' }] }));

    const files = await listFolderChildren('folder-1');
    expect(files.map((f) => f.id)).toEqual(['a', 'b']);
    expect(new URL(fetchMock.mock.calls[1]![0]).searchParams.get('pageToken')).toBe('page-2');
  });

  it('defaults a missing size to zero instead of NaN', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ files: [{ id: 'a', name: 'one' }] }));
    const [file] = await listFolderChildren('folder-1');
    expect(file?.sizeBytes).toBe(0);
  });
});

const RESUMABLE_URI = 'https://www.googleapis.com/upload/drive/v3/files?upload_id=xyz';

describe('upload', () => {
  function mockResumableSession() {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, { headers: { Location: RESUMABLE_URI } }))
      .mockResolvedValueOnce(jsonResponse({ id: 'file-1' }));
  }

  it('uses a resumable session and PUTs the body to it', async () => {
    mockResumableSession();
    await expect(uploadJsonFile('folder-1', 'backup.json', '{"a":1}')).resolves.toBe('file-1');

    const [initUrl, initInit] = fetchMock.mock.calls[0]!;
    expect(new URL(initUrl).searchParams.get('uploadType')).toBe('resumable');
    expect(JSON.parse(String(initInit.body))).toMatchObject({
      name: 'backup.json',
      parents: ['folder-1'],
    });

    const [uploadUrl, uploadInit] = fetchMock.mock.calls[1]!;
    expect(uploadUrl).toBe(RESUMABLE_URI);
    expect(uploadInit.method).toBe('PUT');
    expect(uploadInit.body).toBe('{"a":1}');
  });

  it('never sets Content-Length, which is what stalled uploads containing emoji', async () => {
    mockResumableSession();
    // 'emoji:🍔' is a real stored icon value, and its UTF-16 length is shorter
    // than its UTF-8 byte length. The old client declared the former and sent
    // the latter, so the request hung until it aborted.
    await uploadJsonFile('folder-1', 'backup.json', '{"icon":"emoji:🍔"}');

    for (const [, init] of fetchMock.mock.calls) {
      const headers = (init.headers ?? {}) as Record<string, string>;
      const names = Object.keys(headers).map((n) => n.toLowerCase());
      expect(names).not.toContain('content-length');
    }
  });

  it('falls back to multipart when the session URI is stripped', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ id: 'file-1' }));

    await expect(uploadJsonFile('folder-1', 'backup.json', '{"a":1}')).resolves.toBe('file-1');

    const [url, init] = fetchMock.mock.calls[1]!;
    expect(new URL(url).searchParams.get('uploadType')).toBe('multipart');
    const contentType = (init.headers as Record<string, string>)['Content-Type'];
    expect(contentType).toContain('multipart/related; boundary=');
    expect(String(init.body)).toContain('{"a":1}');
  });

  it('restarts from a fresh session after an interrupted transfer', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, { headers: { Location: RESUMABLE_URI } }))
      .mockRejectedValueOnce(abortError())
      .mockResolvedValueOnce(jsonResponse({}, { headers: { Location: RESUMABLE_URI } }))
      .mockResolvedValueOnce(jsonResponse({ id: 'file-1' }));

    await expect(uploadJsonFile('folder-1', 'backup.json', '{"a":1}')).resolves.toBe('file-1');
    // A new session is negotiated rather than re-PUTting into the dead one.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('retries once with a fresh token when the upload is rejected as unauthenticated', async () => {
    // The two upload requests run with retries disabled, so the 401 refresh has
    // to happen at the operation level or a merely-expired token kills the
    // backup outright.
    googleSignin.getTokens
      .mockResolvedValueOnce({ accessToken: 'stale' })
      .mockResolvedValue({ accessToken: 'fresh' });

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'expired' } }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({}, { headers: { Location: RESUMABLE_URI } }))
      .mockResolvedValueOnce(jsonResponse({ id: 'file-1' }));

    await expect(uploadJsonFile('folder-1', 'backup.json', '{}')).resolves.toBe('file-1');
    expect(googleSignin.clearCachedAccessToken).toHaveBeenCalledWith('stale');
  });

  it('gives up rather than looping when the grant is genuinely revoked', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'revoked' } }, { status: 401 }));

    await expect(uploadJsonFile('folder-1', 'backup.json', '{}')).rejects.toMatchObject({
      kind: 'auth',
    });
    // One initial try plus exactly one refreshed retry.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry when Drive says the account is out of space', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { message: 'quota', errors: [{ reason: 'storageQuotaExceeded' }] } },
        { status: 403 },
      ),
    );

    await expect(uploadJsonFile('folder-1', 'backup.json', '{}')).rejects.toMatchObject({
      kind: 'quota',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('download and delete', () => {
  it('downloads the raw file text', async () => {
    fetchMock.mockResolvedValue(jsonResponse('{"version":1}'));
    await expect(downloadFileText('file-1')).resolves.toBe('{"version":1}');
    expect(new URL(fetchMock.mock.calls[0]![0]).searchParams.get('alt')).toBe('media');
  });

  it('treats an already-deleted file as success', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: 'File not found' } }, { status: 404 }),
    );
    await expect(deleteFile('file-1')).resolves.toBeUndefined();
  });

  it('still reports a delete that failed for another reason', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: 'Insufficient permissions' } }, { status: 403 }),
    );
    await expect(deleteFile('file-1')).rejects.toBeInstanceOf(DriveError);
  });
});
