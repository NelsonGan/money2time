import { Map as MapIcon } from 'lucide-react-native';
import { type ElementRef, useEffect, useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Sortable from 'react-native-sortables';

import { EmptyState } from '~/components/feedback/EmptyState';
import { PlusIcon } from '~/components/icons/NavIcons';
import { useBottomNavContentInset } from '~/components/navigation/BottomNavMinimize';
import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { SelectField, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useProGate } from '~/hooks/useProGate';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import { AlbumCard } from '../components/AlbumCard';

interface AlbumsScreenProps {
  scrollToTopToken?: number;
  onOpenCreateAlbum: () => void;
  onOpenAlbumDetail: (albumId: string) => void;
  onOpenAlbumLocations: () => void;
}

const GRID_GAP = 14;
const SCREEN_PADDING = 18;

export function AlbumsScreen({
  scrollToTopToken,
  onOpenCreateAlbum,
  onOpenAlbumDetail,
  onOpenAlbumLocations,
}: AlbumsScreenProps) {
  const { albums, activeAlbumId, setActiveAlbum, reorderAlbums } = useApp();
  const { checkLimit } = useProGate();
  const insets = useSafeAreaInsets();
  const bottomNavInset = useBottomNavContentInset();
  const { width: windowWidth } = useWindowDimensions();
  const isSmallScreen = windowWidth < 380;
  const scrollRef = useAnimatedRef<ElementRef<typeof Animated.ScrollView>>();
  // Measured height of the sticky footer so the map FAB can float above it.
  const [footerHeight, setFooterHeight] = useState(0);

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
          <Text
            variant={isSmallScreen ? 'subheading' : 'heading'}
            className="flex-1 pr-3 tracking-tight"
            numberOfLines={1}
          >
            {I18n.t('albums.title')}
          </Text>
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              if (!checkLimit('albums', albums.length)) return;
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
          <Animated.ScrollView
            ref={scrollRef}
            className="flex-1"
            contentContainerStyle={{
              paddingHorizontal: SCREEN_PADDING,
              paddingTop: 6,
              paddingBottom: 24,
            }}
            showsVerticalScrollIndicator={false}
          >
            <Sortable.Flex
              activeItemScale={1.02}
              activeItemShadowOpacity={0.12}
              customHandle
              dragActivationDelay={0}
              flexDirection="column"
              flexWrap="nowrap"
              gap={GRID_GAP}
              inactiveItemOpacity={1}
              onDragEnd={({ fromIndex, order, toIndex }) => {
                if (fromIndex === toIndex) return;
                reorderAlbums(order(albums).map((album) => album.id));
                void triggerHaptic('selection');
              }}
              scrollableRef={scrollRef}
              width="fill"
            >
              {albums.map((album) => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  width={contentWidth}
                  isActive={album.id === activeAlbumId}
                  onPress={onOpenAlbumDetail}
                />
              ))}
            </Sortable.Flex>
          </Animated.ScrollView>
        )}

        {albums.length > 0 ? (
          <View
            onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
            className="border-t border-border/40 bg-background px-5 pt-1.5"
            style={{ paddingBottom: bottomNavInset }}
          >
            <SelectField
              compact
              label={I18n.t('albums.active_label')}
              sheetTitle={I18n.t('albums.active_sheet_title')}
              value={activeAlbumId ?? ''}
              options={activeOptions}
              onChange={(value) => setActiveAlbum(value || null)}
            />
          </View>
        ) : null}
      </TabletContentContainer>

      {albums.length > 0 ? (
        <Pressable
          onPress={() => {
            void triggerHaptic('selection');
            onOpenAlbumLocations();
          }}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('albums.location.screen_title')}
          className="absolute right-5 h-14 w-14 items-center justify-center rounded-full bg-primary shadow-soft active:opacity-85"
          style={{ bottom: footerHeight + 16 }}
        >
          <MapIcon size={24} color="#fff" />
        </Pressable>
      ) : null}
    </View>
  );
}
