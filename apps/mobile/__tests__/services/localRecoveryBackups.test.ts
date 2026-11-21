import { localProvider } from '~/services/autoBackupProviders/local';

const PHOTO = `money2time_PHOTO_${'a'.repeat(32)}.jpg`;

jest.mock('expo-file-system/next', () => {
  class File {
    size = 1;
    creationTime = 1_700_000_000_000;
    modificationTime = null;
    constructor(public name: string) {}
    get uri() {
      return `file:///backups/${this.name}`;
    }
  }
  return {
    Paths: { document: 'file:///' },
    File,
    FileMode: { ReadOnly: 'r' },
    Directory: class {
      exists = true;
      list() {
        return [
          new File('money2time_AUTO_2026-10-31T12-00-00.json'),
          new File('money2time_AUTO_2026-11-21T06-34-22.json.gz'),
          new File('money2time_RECOVERY_2026-10-31T12-00-01.json'),
          new File('money2time_RECOVERY_invalid.json'),
          new File('unrelated.json'),
          new File(PHOTO),
        ];
      }
    },
  };
});

it('lists recovery files alongside automatic backups so they can be restored', async () => {
  const records = await localProvider.list();
  expect(records.map(({ id, createdAt }) => ({ id, createdAt }))).toEqual([
    { id: 'money2time_AUTO_2026-10-31T12-00-00.json', createdAt: '2026-10-31T12:00:00.000Z' },
    { id: 'money2time_AUTO_2026-11-21T06-34-22.json.gz', createdAt: '2026-11-21T06:34:22.000Z' },
    { id: 'money2time_RECOVERY_2026-10-31T12-00-01.json', createdAt: '2026-10-31T12:00:01.000Z' },
  ]);
});

it('lists the stored photos beside the backups, and only those', async () => {
  await expect(localProvider.listPhotos()).resolves.toEqual([
    { name: PHOTO, ref: `file:///backups/${PHOTO}`, createdAt: 1_700_000_000_000 },
  ]);
});
