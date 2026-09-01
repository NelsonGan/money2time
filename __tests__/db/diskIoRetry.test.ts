import { retryDiskIO } from '~/lib/db/diskIoRetry';

describe('retryDiskIO', () => {
  it('returns the result once the operation succeeds', () => {
    let attempts = 0;
    const result = retryDiskIO(
      () => {
        attempts += 1;
        if (attempts < 3) throw new Error('disk I/O error');
        return 'ok';
      },
      () => {},
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('throws the underlying error once all attempts are spent', () => {
    expect(() =>
      retryDiskIO(
        () => {
          throw new Error('disk I/O error');
        },
        () => {},
      ),
    ).toThrow(/disk I\/O error/);
  });

  it('pauses with a growing gap before each retry', () => {
    const delays: number[] = [];

    expect(() =>
      retryDiskIO(
        () => {
          throw new Error('disk I/O error');
        },
        (ms) => delays.push(ms),
      ),
    ).toThrow(/disk I\/O error/);

    expect(delays).toEqual([20, 60, 150, 350]);
  });
});
