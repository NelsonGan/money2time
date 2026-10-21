import { randomBytes } from 'crypto';

import {
  decryptChunk,
  deriveLink,
  encryptChunk,
  fromBase64Url,
  linkKeyPair,
  openMessage,
  sealMessage,
  toBase64Url,
} from '~/services/webDashboardCrypto';
import {
  CHUNK_BYTES,
  cleanBrowserName,
  LinkError,
  MAX_TRANSFER_BYTES,
  parsePairQr,
  PhoneSession,
  prepareTransfer,
} from '~/services/webDashboardLink';

const random = (length: number) => new Uint8Array(randomBytes(length));

describe('parsePairQr', () => {
  const browser = linkKeyPair(random);
  const room = toBase64Url(random(16));
  const secret = toBase64Url(random(16));
  const qr = `money2time://pair?r=${room}&pk=${toBase64Url(browser.publicKey)}&s=${secret}`;

  it('reads the code app.money2time.com shows', () => {
    const parsed = parsePairQr(qr);
    expect(parsed?.roomId).toBe(room);
    expect(toBase64Url(parsed!.secret)).toBe(secret);
  });

  it('rejects anything else', () => {
    expect(parsePairQr('https://example.com')).toBeNull();
    expect(parsePairQr('money2time://tutorial?id=albums')).toBeNull();
    expect(parsePairQr(qr.replace(/s=[^&]+/, 's=short'))).toBeNull();
  });
});

describe('cleanBrowserName', () => {
  it('keeps the names the website makes', () => {
    expect(cleanBrowserName('Chrome on Mac')).toBe('Chrome on Mac');
    expect(cleanBrowserName('Safari')).toBe('Safari');
  });

  it('drops anything a page could have written itself', () => {
    expect(cleanBrowserName('Your bank — tap Link to continue')).toBeNull();
    expect(cleanBrowserName('Chrome on Mac\nPlease confirm')).toBeNull();
    expect(cleanBrowserName(42)).toBeNull();
  });
});

describe('link crypto', () => {
  it('derives the same key, room and code on both sides, and only with the QR secret', () => {
    const phone = linkKeyPair(random);
    const browser = linkKeyPair(random);
    const secret = random(16);
    const a = deriveLink(phone.secretKey, browser.publicKey, secret);
    const b = deriveLink(browser.secretKey, phone.publicKey, secret);
    expect(toBase64Url(a.key)).toBe(toBase64Url(b.key));
    expect(a.roomId).toBe(b.roomId);
    expect(a.code).toMatch(/^\d{6}$/);
    expect(a.code).toBe(b.code);
    const wrong = deriveLink(phone.secretKey, browser.publicKey, random(16));
    expect(toBase64Url(wrong.key)).not.toBe(toBase64Url(a.key));
  });

  it('seals messages so only the link key, in the right direction, opens them', () => {
    const key = random(32);
    const sealed = sealMessage(key, { type: 'want' }, random, 'b2p');
    expect(openMessage(key, sealed, 'b2p')).toEqual({ type: 'want' });
    // Reflected back the other way, it does not open.
    expect(openMessage(key, sealed, 'p2b')).toBeNull();
    expect(openMessage(random(32), sealed, 'b2p')).toBeNull();
  });

  it('binds each chunk to its transfer, place and count', () => {
    const key = random(32);
    const iv = random(8);
    const place = { id: 'abc', index: 2, count: 5 };
    const sealed = encryptChunk(key, iv, place, random(100));
    expect(decryptChunk(key, iv, place, sealed)).toHaveLength(100);
    expect(() => decryptChunk(key, iv, { ...place, index: 3 }, sealed)).toThrow();
    expect(() => decryptChunk(key, iv, { ...place, count: 4 }, sealed)).toThrow();
    expect(() => decryptChunk(key, iv, { ...place, id: 'abd' }, sealed)).toThrow();
  });

  it('round-trips base64url', () => {
    const bytes = random(65);
    expect(Array.from(fromBase64Url(toBase64Url(bytes)))).toEqual(Array.from(bytes));
  });
});

describe('prepareTransfer', () => {
  const meta = {
    exportedAt: null,
    appVersion: null,
    deviceName: null,
    timeZone: 'Asia/Kuala_Lumpur',
    pro: false,
  };

  it('cuts the data into chunks that reassemble to the original', async () => {
    const data = random(CHUNK_BYTES * 2 + 123);
    const prepared = await prepareTransfer(data, meta, random, async () => undefined);
    expect(prepared.meta.count).toBe(3);
    expect(prepared.meta.size).toBe(data.length);
    const parts = prepared.frames.map((frame, index) => {
      expect(new DataView(frame.buffer, frame.byteOffset).getUint32(0)).toBe(index);
      return decryptChunk(
        prepared.dataKey,
        prepared.ivPrefix,
        { id: prepared.meta.id, index, count: 3 },
        frame.subarray(4),
      );
    });
    expect(Buffer.concat(parts).equals(Buffer.from(data))).toBe(true);
  });

  it('refuses an export too large to send', async () => {
    const big = { length: MAX_TRANSFER_BYTES + 1 } as Uint8Array;
    await expect(prepareTransfer(big, meta, random, async () => undefined)).rejects.toEqual(
      new LinkError('too_large'),
    );
  });
});

describe('PhoneSession requests', () => {
  class FakeSocket {
    static last: FakeSocket;
    readyState = 1;
    binaryType = '';
    sent: string[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: (() => void) | null = null;
    constructor() {
      FakeSocket.last = this;
    }
    send(data: string) {
      this.sent.push(data);
    }
    close() {}
  }

  const key = random(32);
  const link = {
    roomId: toBase64Url(random(16)),
    key: toBase64Url(key),
    name: null,
    createdAt: 0,
    lastSentAt: null,
  };
  let original: unknown;
  beforeAll(() => {
    original = (globalThis as { WebSocket?: unknown }).WebSocket;
    (globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket;
  });
  afterAll(() => {
    (globalThis as { WebSocket?: unknown }).WebSocket = original;
  });

  function open() {
    const wants: unknown[] = [];
    const session = new PhoneSession(
      link,
      { relayUrl: 'https://relay.test', random },
      { onWant: (request) => wants.push(request) },
    );
    const socket = FakeSocket.last;
    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify({ t: 'peer', present: true }) });
    const want = (body: Record<string, unknown>) =>
      socket.onmessage?.({
        data: JSON.stringify(sealMessage(key, { type: 'want', ...body }, random, 'b2p')),
      });
    const replies = () =>
      socket.sent
        .filter((data) => data.startsWith('{'))
        .map((data) => openMessage<Record<string, unknown>>(key, JSON.parse(data), 'p2b'));
    return { session, wants, want, replies };
  }

  it('passes on which copy the browser holds, and a repair', () => {
    const { session, wants, want } = open();
    want({ nonce: 'a'.repeat(16), force: true, have: 'h'.repeat(16), repair: true });
    want({ nonce: 'b'.repeat(16), have: 'not an id' });
    expect(wants).toEqual([
      { nonce: 'a'.repeat(16), force: true, have: 'h'.repeat(16), repair: true },
      { nonce: 'b'.repeat(16), force: false, have: null, repair: false },
    ]);
    session.close();
  });

  it('declines only the request it was asked about', () => {
    const { session, want, replies } = open();
    want({ nonce: 'a'.repeat(16) });
    want({ nonce: 'b'.repeat(16) });
    // The older request's turn: the newer one is still waiting to be answered.
    session.decline('a'.repeat(16), false);
    expect(replies()).toEqual([]);
    expect(session.isPending('b'.repeat(16))).toBe(true);
    session.decline('b'.repeat(16), true);
    expect(replies()).toEqual([{ type: 'unchanged', nonce: 'b'.repeat(16), current: true }]);
    expect(session.isPending('b'.repeat(16))).toBe(false);
    session.close();
  });

  it('forgets the request when a reload or new tab takes the browser seat', () => {
    const { session, want } = open();
    want({ nonce: 'a'.repeat(16) });
    expect(session.isPending('a'.repeat(16))).toBe(true);
    // The room says the browser arrived again; the old tab is gone.
    FakeSocket.last.onmessage?.({ data: JSON.stringify({ t: 'peer', present: true }) });
    expect(session.isPending('a'.repeat(16))).toBe(false);
    session.close();
  });

  it('drops a send whose tab was replaced while the export was built', async () => {
    const { session, want, replies } = open();
    want({ nonce: 'a'.repeat(16) });
    let finish: () => void = () => undefined;
    const sending = session.send(async () => {
      await new Promise<void>((resolve) => (finish = resolve));
      return prepareTransfer(
        random(10),
        { exportedAt: null, appVersion: null, deviceName: null, timeZone: null, pro: false },
        random,
        async () => undefined,
      );
    });
    // A reload takes the browser's seat before the export is ready.
    FakeSocket.last.onmessage?.({ data: JSON.stringify({ t: 'peer', present: true }) });
    finish();
    await expect(sending).rejects.toMatchObject({ code: 'closed' });
    // Nothing was sent to the new tab for the old request.
    expect(replies().some((reply) => reply?.type === 'begin')).toBe(false);
    session.close();
  });

  it('answers a request whose data could not be prepared', async () => {
    const { session, want, replies } = open();
    want({ nonce: 'a'.repeat(16) });
    await expect(
      session.send(() => Promise.reject(new LinkError('too_large'))),
    ).rejects.toMatchObject({ code: 'too_large' });
    expect(replies()).toEqual([{ type: 'unchanged', nonce: 'a'.repeat(16) }]);
    session.close();
  });
});
