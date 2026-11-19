import { useMemo } from 'react';

import { useApp } from '~/context/AppContext';
import type { CategoryIconPickerSession } from '~/features/settings/lib/categoryIconPickerBridge';
import { CategoryEditor } from '~/features/settings/screens/CategoriesScreen';
import { I18n } from '~/lib/i18n';
import { newId } from '~/utils/id';

import { useAlbumCategories } from '../hooks/useAlbumCategories';
import {
  albumCategoryIcon,
  albumCategoryIconOf,
  albumCategoryIn,
  albumCategoryLabel,
  albumCategoryNameOf,
} from '../lib/albumCategories';
import { ALBUM_CATEGORY_OTHER, isDefaultAlbumCategoryKey } from '../lib/groupPlan';

interface AlbumCategoryEditorScreenProps {
  albumId: string;
  /** The category to edit; none for a new one. */
  categoryKey?: string;
  onClose: () => void;
  onOpenIconPicker: (session: CategoryIconPickerSession) => void;
}

/** A new category's key: `c-` and twelve random hex digits (`CUSTOM_ALBUM_CATEGORY_KEY`). */
const newCategoryKey = () => `c-${newId().replace(/-/g, '').slice(0, 12)}`;

/**
 * One of a shared album's categories, in the app's category editor with no
 * parent (an album's categories have no subcategories): its name and icon,
 * for everyone in the album. Deleting one (never Other) moves its bills to
 * Other for everyone. The icon picker has no Uploads: another phone could not
 * draw an image that lives on this one.
 */
export function AlbumCategoryEditorScreen({
  albumId,
  categoryKey,
  onClose,
  onOpenIconPicker,
}: AlbumCategoryEditorScreenProps) {
  const { changeAlbumCategories } = useApp();
  const categories = useAlbumCategories(albumId);
  const editing = categoryKey
    ? (categories.find((category) => category.key === categoryKey) ?? null)
    : null;
  const initial = useMemo(
    () => ({
      type: 'expense' as const,
      parentId: null,
      name: editing ? albumCategoryNameOf(editing) : '',
      icon: editing ? albumCategoryIconOf(editing) : undefined,
    }),
    [editing],
  );

  return (
    <CategoryEditor
      mode={editing ? 'edit' : 'create'}
      topLevel={[]}
      initial={initial}
      disableParentSelect
      onClose={onClose}
      onOpenIconPicker={(session) => onOpenIconPicker({ ...session, noUploads: true })}
      deleteConfirmBody={I18n.t('albums.category_list.remove_body', {
        other: albumCategoryNameOf(albumCategoryIn(categories, ALBUM_CATEGORY_OTHER)),
      })}
      onSubmit={({ name, icon }) => {
        if (editing) {
          // A default keeps its own name (read in each person's language)
          // and icon unless they were changed.
          const isDefault = isDefaultAlbumCategoryKey(editing.key);
          const nextIcon = icon || (isDefault ? null : albumCategoryIcon(ALBUM_CATEGORY_OTHER));
          void changeAlbumCategories(albumId, 'edited', [
            {
              ...editing,
              name: isDefault && name === albumCategoryLabel(editing.key) ? null : name,
              icon: isDefault && nextIcon === albumCategoryIcon(editing.key) ? null : nextIcon,
            },
          ]);
        } else {
          const last = categories.reduce((top, category) => Math.max(top, category.sortOrder), 0);
          void changeAlbumCategories(albumId, 'added', [
            {
              key: newCategoryKey(),
              name,
              icon: icon || albumCategoryIcon(ALBUM_CATEGORY_OTHER),
              sortOrder: Math.min(last + 1, 1000),
            },
          ]);
        }
        onClose();
      }}
      onDelete={
        editing && editing.key !== ALBUM_CATEGORY_OTHER
          ? () => {
              void changeAlbumCategories(albumId, 'removed', [{ ...editing, removed: true }]);
              onClose();
            }
          : undefined
      }
    />
  );
}
