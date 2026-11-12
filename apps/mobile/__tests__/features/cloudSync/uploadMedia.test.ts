import { CloudSyncApiError, uploadMedia } from '~/features/cloudSync/services/cloudSyncApi';

// What an image upload's failure turns into. The sync engine tries a
// `network` failure and a `server` one without a 4xx status again, and stops
// at a refusal, so the mapping decides which blips get another try.

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
}));
jest.mock('expo-file-system', () => ({ File: class {} }));

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

function fileThat(upload: jest.Mock) {
  return { upload } as unknown as Parameters<typeof uploadMedia>[3];
}

async function failure(upload: jest.Mock): Promise<CloudSyncApiError> {
  try {
    await uploadMedia('token', '/v1/media', 'receipts/r.jpg', fileThat(upload));
  } catch (error) {
    return error as CloudSyncApiError;
  }
  throw new Error('the upload did not fail');
}

it('reports an upload that broke on the phone as network', async () => {
  // expo-file-system rejects a dropped connection with a coded native error.
  const error = await failure(
    jest.fn().mockRejectedValue(
      Object.assign(new Error('Unable to upload a file: The network connection was lost.'), {
        code: 'ERR_UNABLE_TO_UPLOAD',
      }),
    ),
  );
  expect(error).toBeInstanceOf(CloudSyncApiError);
  expect(error.code).toBe('network');
});

it('names the status of a server failure', async () => {
  const error = await failure(
    jest.fn().mockResolvedValue({ status: 500, body: '{"error":"server_error"}', headers: {} }),
  );
  expect(error.code).toBe('server');
  expect(error.status).toBe(500);
  expect(error.message).toBe('server: http_500');
});

// 2026-11-12: a sync on 1.7.5 failed with "server: http_408". Cloudflare
// logged no 408 for the Worker's host that week, so something between the
// phone and Cloudflare timed the upload out. It is the upload not getting
// through, like a dropped connection, so it is tried again, not refused.
it('reports a request timeout (408) as network', async () => {
  const error = await failure(
    jest.fn().mockResolvedValue({ status: 408, body: '<html>Request Timeout</html>', headers: {} }),
  );
  expect(error.code).toBe('network');
  expect(error.status).toBe(408);
});

it("keeps the Worker's refusals apart", async () => {
  const refused = (status: number, body: string) =>
    failure(jest.fn().mockResolvedValue({ status, body, headers: {} }));
  expect((await refused(401, '{"error":"unauthorized"}')).code).toBe('unauthorized');
  expect((await refused(403, '{"error":"not_pro"}')).code).toBe('not_pro');
  expect((await refused(403, '{"error":"ledger_paused"}')).code).toBe('ledger_paused');
  expect((await refused(413, '{"error":"too_large"}')).status).toBe(413);
});

it('succeeds on a 2xx answer', async () => {
  await expect(
    uploadMedia(
      'token',
      '/v1/media',
      'receipts/r.jpg',
      fileThat(jest.fn().mockResolvedValue({ status: 200, body: '{"ok":true}', headers: {} })),
    ),
  ).resolves.toBeUndefined();
});
