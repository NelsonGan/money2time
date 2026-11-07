import { isOfflineMessage } from '~/features/cloudSync/lib/offlineError';

// The Turso engine's errors as they reach CloudSyncContext `errorKind`.
const engine = (io: string) => `sync engine operation failed: database sync engine error: ${io}`;

describe('isOfflineMessage', () => {
  it('reads a connection lost mid-response as offline, whatever language iOS uses', () => {
    // The patched ioProcessor wraps the OS's localized words.
    expect(
      isOfflineMessage(
        engine(
          'HTTP response failed (network error): 网络连接已中断。. URL: https://x.turso.io/pull-updates, Method: POST',
        ),
      ),
    ).toBe(true);
  });

  it('reads a request that never left as offline', () => {
    expect(
      isOfflineMessage(engine('HTTP request failed: Network request failed. URL: x, Method: POST')),
    ).toBe(true);
  });

  it('leaves other failures to be shown and reported', () => {
    expect(isOfflineMessage(engine('网络连接已中断。'))).toBe(false);
    expect(isOfflineMessage('Could not apply a pulled transactions row')).toBe(false);
  });
});
