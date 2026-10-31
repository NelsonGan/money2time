import { localProvider } from '~/services/autoBackupProviders/local';

jest.mock('expo-file-system/next', () => {
  class File {
    size = 1;
    constructor(public name: string) {}
    get uri() {
      return `file:///backups/${this.name}`;
    }
  }
  return {
    Paths: { document: 'file:///' },
    File,
    Directory: class {
      exists = true;
      list() {
        return [
          new File('money2time_AUTO_2026-10-31T12-00-00.json'),
          new File('money2time_RECOVERY_2026-10-31T12-00-01.json'),
          new File('money2time_RECOVERY_invalid.json'),
          new File('unrelated.json'),
        ];
      }
    },
  };
});

it('lists recovery files alongside automatic backups so they can be restored', async () => {
  const records = await localProvider.list();
  expect(records.map(({ id, createdAt }) => ({ id, createdAt }))).toEqual([
    { id: 'money2time_AUTO_2026-10-31T12-00-00.json', createdAt: '2026-10-31T12:00:00.000Z' },
    { id: 'money2time_RECOVERY_2026-10-31T12-00-01.json', createdAt: '2026-10-31T12:00:01.000Z' },
  ]);
});
