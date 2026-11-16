import { albumListing } from '~/features/cloudSync/lib/albumListing';

// Deleting a shared album (README: Album members and shared albums >
// Deleting): a list read finishes a deletion the Worker was not told about,
// and never brings a deleted album back unless the user joined it again.

const JOINED = Date.parse('2026-11-10T00:00:00.000Z');
const BEFORE = '2026-11-01T00:00:00.000Z';
const AFTER = '2026-11-12T00:00:00.000Z';

describe('a list read', () => {
  const base = {
    known: 'this_share',
    foreignId: false,
    deletedAt: null,
    joinedAt: JOINED,
  } as const;

  it('keeps an album the user is in, made here when it is new', () => {
    expect(albumListing({ ...base, role: 'member' })).toBe('keep');
    expect(albumListing({ ...base, role: 'owner', known: null })).toBe('keep');
  });

  it('leaves alone an album under another share, or with an id this phone uses', () => {
    expect(albumListing({ ...base, role: 'member', known: 'other_share' })).toBe('skip');
    expect(albumListing({ ...base, role: 'member', known: null, foreignId: true })).toBe('skip');
  });

  it('finishes a deletion made since the user came in: offline, signed out or on another phone', () => {
    // Still synced here (another phone's deletion came down first).
    expect(albumListing({ ...base, role: 'member', deletedAt: AFTER })).toBe('leave');
    expect(albumListing({ ...base, role: 'owner', deletedAt: AFTER })).toBe('stop');
    // Not synced here: deleted while signed out, or on a phone that signed in since.
    expect(albumListing({ ...base, role: 'member', known: null, deletedAt: AFTER })).toBe('leave');
    expect(albumListing({ ...base, role: 'owner', known: null, deletedAt: AFTER })).toBe('stop');
  });

  it('brings back an album the user joined again after deleting it', () => {
    // On the website, say, while this phone still held the share or did not.
    expect(albumListing({ ...base, role: 'member', deletedAt: BEFORE })).toBe('keep');
    expect(albumListing({ ...base, role: 'member', known: null, deletedAt: BEFORE })).toBe('keep');
  });

  it('with an older Worker, finishes only what it can tell', () => {
    const older = { ...base, joinedAt: undefined, deletedAt: AFTER };
    expect(albumListing({ ...older, role: 'member' })).toBe('leave');
    expect(albumListing({ ...older, role: 'owner', known: null })).toBe('stop');
    // A member's album not synced here may have been joined again: kept.
    expect(albumListing({ ...older, role: 'member', known: null })).toBe('keep');
  });

  it('reads a deletion time it cannot parse as the older Worker would', () => {
    expect(albumListing({ ...base, role: 'member', known: null, deletedAt: 'junk' })).toBe('keep');
    expect(albumListing({ ...base, role: 'member', deletedAt: 'junk' })).toBe('leave');
  });
});
