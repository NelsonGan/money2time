import { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import { PlusIcon } from '~/components/icons/NavIcons';
import { useBottomNavContentInset } from '~/components/navigation/BottomNavMinimize';
import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { SelectField, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import { AlbumCard } from '../components/AlbumCard';

interface AlbumsScreenProps {
  scrollToTopToken?: number;
  onOpenCreateAlbum: () => void;
  onOpenAlbumDetail: (albumId: string) => void;
}

const GRID_GAP = 14;
const SCREEN_PADDING = 18;

export function AlbumsScreen({
  scrollToTopToken,
  onOpenCreateAlbum,
  onOpenAlbumDetail,
}: AlbumsScreenProps) {
  const { albums, activeAlbumId, setActiveAlbum } = useApp();
  const insets = useSafeAreaInsets();
  const bottomNavInset = useBottomNavContentInset();
  const { width: windowWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (scrollToTopToken === undefined) return;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [scrollToTopToken]);

  const contentWidth = Math.min(windowWidth, 640) - SCREEN_PADDING * 2;

  const activeOptions = useMemo(
    () => [
      { value: '', label: I18n.t('albums.active_none') },
      ...albums.map((a) => ({ value: a.id, label: a.name })),
    ],
    [albums],
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <TabletContentContainer style={{ flex: 1 }}>
        <View className="flex-row items-center justify-between px-5 pb-2 pt-3">
          <Text variant="heading" className="tracking-tight">
            {I18n.t('albums.title')}
          </Text>
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              onOpenCreateAlbum();
            }}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('albums.create')}
            className="h-10 w-10 items-center justify-center rounded-full bg-primary shadow-soft"
          >
            <PlusIcon size={20} color="#fff" />
          </Pressable>
        </View>

        {albums.length === 0 ? (
          <EmptyState
            title={I18n.t('albums.empty_title')}
            message={I18n.t('albums.empty_message')}
            mascotMood="curious"
          />
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{
              paddingHorizontal: SCREEN_PADDING,
              paddingTop: 6,
              paddingBottom: bottomNavInset + 24,
            }}
            showsVerticalScrollIndicator={false}
          >
            <View className="mb-3">
              <SelectField
                compact
                label={I18n.t('albums.active_label')}
                sheetTitle={I18n.t('albums.active_sheet_title')}
                value={activeAlbumId ?? ''}
                options={activeOptions}
                onChange={(value) => setActiveAlbum(value || null)}
              />
            </View>
            <View style={{ gap: GRID_GAP }}>
              {albums.map((album) => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  width={contentWidth}
                  onPress={onOpenAlbumDetail}
                />
              ))}
            </View>
          </ScrollView>
        )}
      </TabletContentContainer>
    </View>
  );
}
