import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration065GoalCoverPhoto: DbMigration = {
  version: 65,
  name: '065_goal_cover_photo',
  up(db) {
    // Optional cover photo for a savings goal (type = 'goal'); null on every
    // other account and on a goal that has not been given one. Holds the path
    // relative to the user-assets root, e.g. `goal-covers/9f3c.jpg`, the same
    // shape `albums.cover_photo_uri` uses — which is what lets the orphan sweep
    // in services/userAssetGc.ts recognise it as a live reference and the
    // backup walk pick the file up without knowing anything about goals.
    addColumnIfMissing(db, 'accounts', 'goal_cover_uri', 'TEXT');
  },
};

export default migration065GoalCoverPhoto;
