import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

// A shared album's cover photo, the same on every member's phone (README:
// Album members and shared albums).
// - album_groups.cover_photo_uri: the cover's image path
//   (`album-covers/<id>.<ext>`), synced with the group's database and its
//   image uploaded to the group's image space. NULL until someone sets one
//   (the owner's phone then publishes the cover the album already had); ''
//   once someone removed it.
export const migration092AlbumGroupCover: DbMigration = {
  version: 92,
  name: '092_album_group_cover',
  up(db) {
    addColumnIfMissing(db, 'album_groups', 'cover_photo_uri', 'TEXT');
  },
};

export default migration092AlbumGroupCover;
