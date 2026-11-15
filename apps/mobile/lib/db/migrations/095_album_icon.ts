import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

// An album's own icon (README: Key patterns > Albums): the icon its line
// shows in the category lists and its card on the Albums page, picked like a
// category's (a bundled icon id, `emoji:X` or `custom:category-icons/<id>.png`,
// see constants/categoryIcons.ts). NULL or '' is none. The user's own, like
// the album's name: a shared album's group does not carry it.
export const migration095AlbumIcon: DbMigration = {
  version: 95,
  name: '095_album_icon',
  up(db) {
    addColumnIfMissing(db, 'albums', 'icon', 'TEXT');
  },
};

export default migration095AlbumIcon;
