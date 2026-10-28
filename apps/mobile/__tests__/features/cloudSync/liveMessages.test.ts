import { parseLiveMessage, retryDelay } from '~/features/cloudSync/lib/liveMessages';

describe('parseLiveMessage', () => {
  it('reads a change and its reason', () => {
    expect(parseLiveMessage('{"type":"changed","channel":"personal","reason":"data"}')).toEqual({
      channel: 'personal',
      reason: 'data',
      actor: null,
    });
    expect(
      parseLiveMessage('{"type":"changed","channel":"abc123","reason":"access","actor":"u1"}'),
    ).toEqual({ channel: 'abc123', reason: 'access', actor: 'u1' });
  });

  it('treats an unknown reason as data', () => {
    expect(parseLiveMessage('{"type":"changed","channel":"personal"}')?.reason).toBe('data');
  });

  it('ignores pongs, other messages and garbage', () => {
    expect(parseLiveMessage('pong')).toBeNull();
    expect(parseLiveMessage('{"type":"hello"}')).toBeNull();
    expect(parseLiveMessage('{"type":"changed"}')).toBeNull();
    expect(parseLiveMessage('not json')).toBeNull();
    expect(parseLiveMessage(new ArrayBuffer(2))).toBeNull();
  });
});

describe('retryDelay', () => {
  it('doubles from 2 s up to a minute', () => {
    expect(retryDelay(0)).toBe(2_000);
    expect(retryDelay(1)).toBe(4_000);
    expect(retryDelay(4)).toBe(32_000);
    expect(retryDelay(5)).toBe(60_000);
    expect(retryDelay(50)).toBe(60_000);
  });
});
