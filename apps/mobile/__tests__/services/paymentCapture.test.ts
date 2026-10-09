import { readQueuedCaptures } from '~/services/paymentCapture';

const mockFiles = new Map<string, string>();
const mockReadFailures = new Set<string>();

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: {},
  DeviceEventEmitter: { addListener: jest.fn() },
}));
jest.mock('~/services/autoLog', () => ({
  isPaymentAlertIntentSupported: () => false,
}));
jest.mock('expo-file-system/next', () => {
  class File {
    name: string;
    modificationTime = Date.now();
    constructor(_: unknown, name: string) {
      this.name = name;
    }
    get exists() {
      return mockFiles.has(this.name);
    }
    textSync() {
      if (mockReadFailures.delete(this.name)) throw new Error('Temporary read failure');
      return mockFiles.get(this.name);
    }
    delete() {
      mockFiles.delete(this.name);
    }
  }
  return {
    File,
    Directory: class {
      exists = true;
      list() {
        return [...mockFiles.keys()].map((name) => new File(this, name));
      }
    },
    Paths: { document: '/documents' },
  };
});

const alertJson = JSON.stringify({ package: 'bank', text: 'You spent RM25.00 at SHELL.' });
const first = '1791201600000-first.json';
const second = '1791201601000-second.json';

describe('Android payment capture file retries', () => {
  beforeEach(() => {
    mockFiles.clear();
    mockReadFailures.clear();
  });

  it('retains a temporarily unreadable alert and continues reading the other files', async () => {
    mockFiles.set(first, alertJson);
    mockFiles.set(second, alertJson);
    mockReadFailures.add(first);
    expect((await readQueuedCaptures()).map((capture) => capture.id)).toEqual([
      second.replace('.json', ''),
    ]);
    expect(mockFiles.has(first)).toBe(true);
    expect((await readQueuedCaptures()).map((capture) => capture.id)).toEqual([
      first.replace('.json', ''),
      second.replace('.json', ''),
    ]);
  });

  it('discards completed malformed files without blocking valid alerts', async () => {
    mockFiles.set(first, '{');
    mockFiles.set(second, alertJson);
    expect((await readQueuedCaptures()).map((capture) => capture.id)).toEqual([
      second.replace('.json', ''),
    ]);
    expect(mockFiles.has(first)).toBe(false);
    expect(mockFiles.has(second)).toBe(true);
  });
});
