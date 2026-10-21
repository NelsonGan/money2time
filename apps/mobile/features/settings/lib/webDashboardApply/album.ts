import type { AlbumExtra } from '~/services/webDashboardEditModules/album';

import type { ApplyModule } from './types';

type Payload = {
  id?: string;
  name?: string;
  startDate?: string | null;
  endDate?: string | null;
  transactionIds?: string[];
  add?: string[];
  remove?: string[];
  ids?: string[];
};

/** Saves the `module:album` steps planned in services/webDashboardEditModules/album.ts. */
export const albumApply: ApplyModule = {
  select: (app): AlbumExtra => ({ albums: app.albums }),
  apply: (app, step) => {
    const p = step.payload as Payload;
    switch (step.action) {
      case 'create':
        // CreateAlbumScreen, with no cover photo and no location picked.
        app.createAlbum({
          name: p.name ?? '',
          coverPhotoUri: null,
          startDate: p.startDate ?? null,
          endDate: p.endDate ?? null,
          transactionIds: p.transactionIds ?? [],
          location: null,
        });
        return;
      case 'update':
        // EditAlbumDetailsScreen with the location untouched.
        app.updateAlbum(p.id!, {
          name: p.name ?? '',
          startDate: p.startDate ?? null,
          endDate: p.endDate ?? null,
        });
        return;
      case 'delete':
        app.deleteAlbum(p.id!);
        return;
      case 'transactions':
        // AddAlbumTransactionsScreen: adds first, then removals.
        if (p.add?.length) app.addTransactionsToAlbum(p.id!, p.add);
        if (p.remove?.length) app.removeTransactionsFromAlbum(p.id!, p.remove);
        return;
      case 'reorder':
        app.reorderAlbums(p.ids ?? []);
        return;
      case 'active':
        // AlbumsScreen's active-album picker.
        app.setActiveAlbum(p.id ?? null);
        return;
      default:
        throw new Error(`unknown album step ${step.action}`);
    }
  },
};
