import { nameFromEmail } from '~/features/sharedLedgers/lib/ledgerPeople';

jest.mock('~/lib/db/client', () => ({ getSQLite: jest.fn() }));
jest.mock('~/services/userAssets', () => ({ getProfileAvatarUri: () => null }));

// A shared album names someone with no other name by their address's first
// part, as the website does (apps/web join-screen.tsx `defaultMemberName`),
// never by a masked address.
it('names a member after their address, as the website does', () => {
  expect(nameFromEmail('nelson@example.com')).toBe('Nelson');
  expect(nameFromEmail('tess.lim_92@example.com')).toBe('Tess lim 92');
  expect(nameFromEmail('@example.com')).toBeNull();
  expect(nameFromEmail(null)).toBeNull();
});
