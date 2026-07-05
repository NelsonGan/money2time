import { Sparkles } from 'lucide-react-native';
import { type ElementRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import Sortable from 'react-native-sortables';

import { EmptyState } from '~/components/feedback/EmptyState';
import { PlusIcon } from '~/components/icons/NavIcons';
import { useBottomNavContentInset } from '~/components/navigation/BottomNavMinimize';
import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { SelectField, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

import { AlbumCard } from '../components/AlbumCard';
import { AlbumMapPanel } from '../components/AlbumMapPanel';

interface AlbumsScreenProps {
  scrollToTopToken?: number;
  onOpenCreateAlbum: () => void;
  onOpenAlbumDetail: (albumId: string) => void;
}

type AlbumsTab = 'albums' | 'map';

const GRID_GAP = 14;
const SCREEN_PADDING = 18;

export function AlbumsScreen({
  scrollToTopToken,
  onOpenCreateAlbum,
  onOpenAlbumDetail,
}: AlbumsScreenProps) {
  const { albums, activeAlbumId, setActiveAlbum, reorderAlbums } = useApp();
  const { checkLimit } = useProGate();
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  // Match the accounts/items page's top inset exactly.
  const topInset = Math.max(
    insets.top,
    initialWindowMetrics?.insets.top ?? 0,
    Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0,
  );
  const bottomNavInset = useBottomNavContentInset();
  const { width: windowWidth } = useWindowDimensions();
  const scrollRef = useAnimatedRef<ElementRef<typeof Animated.ScrollView>>();

  const [tab, setTab] = useState<AlbumsTab>('albums');
  const pagerRef = useRef<ScrollView | null>(null);
  const [pageWidth, setPageWidth] = useState(Math.min(windowWidth, 640));
  const [pageHeight, setPageHeight] = useState(0);
  // Defer mounting the (native, GL-backed) map until the user first swipes
  // toward or taps the Map tab, then keep it mounted. Avoids paying MapLibre's
  // cost just for viewing the album list.
  const [mapMounted, setMapMounted] = useState(false);
  // Measured height of the floating header, so the albums list can clear it
  // (the map tab renders full-bleed behind it).
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    if (scrollToTopToken === undefined) return;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [scrollToTopToken]);

  const contentWidth = pageWidth - SCREEN_PADDING * 2;

  const activeOptions = useMemo(
    () => [
      { value: '', label: I18n.t('albums.active_none') },
      ...albums.map((a) => ({ value: a.id, label: a.name })),
    ],
    [albums],
  );

  // Tap a tab → animate the pager to that page (swipe is handled by the pager).
  const selectTab = useCallback(
    (value: AlbumsTab) => {
      if (value !== tab) void triggerHaptic('selection');
      if (value === 'map') setMapMounted(true);
      setTab(value);
      pagerRef.current?.scrollTo({ x: value === 'map' ? pageWidth : 0, animated: true });
    },
    [pageWidth, tab],
  );

  // Swipe settles on a page → sync the active tab.
  const handlePagerMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, pageWidth));
      const value: AlbumsTab = index === 1 ? 'map' : 'albums';
      if (value === tab) return;
      void triggerHaptic('selection');
      setTab(value);
    },
    [pageWidth, tab],
  );

  // Keep the pager aligned to the active tab when the page width changes
  // (tablet layout correction, orientation change).
  const activeTabRef = useRef(tab);
  activeTabRef.current = tab;
  useEffect(() => {
    if (activeTabRef.current !== 'map') return;
    pagerRef.current?.scrollTo({ x: pageWidth, animated: false });
  }, [pageWidth]);

  const tabsBar = (
    <View className="flex-row items-center justify-between pr-5 pt-2">
      <View className="flex-row px-5 pt-2" style={{ gap: 24 }}>
        {(
          [
            { value: 'albums', label: I18n.t('albums.title') },
            { value: 'map', label: I18n.t('albums.tab_map') },
          ] as const
        ).map((option) => {
          const active = tab === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => selectTab(option.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              className="pb-2"
            >
              <Text
                variant="subheading"
                className={cn(active ? 'text-foreground' : 'text-muted-foreground')}
              >
                {option.label}
              </Text>
              <View
                className="h-0.5 mt-1.5 rounded-full"
                style={{ backgroundColor: active ? themeColors.primary : 'transparent' }}
              />
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={() => {
          void triggerHaptic('selection');
          if (!checkLimit('albums', albums.length)) return;
          onOpenCreateAlbum();
        }}
        accessibilityRole="button"
        accessibilityLabel={I18n.t('albums.create')}
        className="h-11 w-11 items-center justify-center rounded-full bg-primary shadow-soft"
      >
        <PlusIcon size={20} color="#fff" />
      </Pressable>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <TabletContentContainer style={{ flex: 1 }}>
        <View
          className="flex-1"
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (width > 0 && width !== pageWidth) setPageWidth(width);
            if (height > 0 && height !== pageHeight) setPageHeight(height);
          }}
        >
          {pageHeight > 0 ? (
            <ScrollView
              ref={pagerRef}
              horizontal
              pagingEnabled
              directionalLockEnabled
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={32}
              onScroll={(e) => {
                if (e.nativeEvent.contentOffset.x > 1) setMapMounted(true);
              }}
              onMomentumScrollEnd={handlePagerMomentumEnd}
            >
              {/* Albums index page */}
              <View style={{ width: pageWidth, height: pageHeight }}>
                {albums.length === 0 ? (
                  <View className="flex-1" style={{ paddingTop: headerHeight }}>
                    <EmptyState
                      title={I18n.t('albums.empty_title')}
                      message={I18n.t('albums.empty_message')}
                      mascotMood="curious"
                    />
                  </View>
                ) : (
                  <>
                    <Animated.ScrollView
                      ref={scrollRef}
                      className="flex-1"
                      contentContainerStyle={{
                        paddingHorizontal: SCREEN_PADDING,
                        paddingTop: headerHeight + 6,
                        paddingBottom: 24,
                      }}
                      nestedScrollEnabled
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

                    <View
                      className="flex-row items-center gap-3 border-t border-border/40 bg-background px-5 pt-2"
                      style={{ paddingBottom: bottomNavInset }}
                    >
                      <View className="flex-row items-center gap-2" style={{ maxWidth: '46%' }}>
                        <Sparkles size={15} color={themeColors.textMuted} />
                        <Text variant="label" tone="muted" numberOfLines={2}>
                          {I18n.t('albums.active_label')}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <SelectField
                          triggerSize="header"
                          triggerTone={activeAlbumId ? 'active' : 'default'}
                          sheetTitle={I18n.t('albums.active_sheet_title')}
                          value={activeAlbumId ?? ''}
                          options={activeOptions}
                          onChange={(value) => setActiveAlbum(value || null)}
                        />
                      </View>
                    </View>
                  </>
                )}
              </View>

              {/* Map page — mounted lazily on first approach (see mapMounted). */}
              <View style={{ width: pageWidth, height: pageHeight }}>
                {mapMounted ? (
                  <AlbumMapPanel onOpenAlbumDetail={onOpenAlbumDetail} active={tab === 'map'} />
                ) : null}
              </View>
            </ScrollView>
          ) : null}
        </View>
      </TabletContentContainer>

      {/* Floating header — solid on the albums tab, transparent over the map so
          the map reads full-bleed behind the tabs and create button. */}
      <View
        pointerEvents="box-none"
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && h !== headerHeight) setHeaderHeight(h);
        }}
        className={cn('absolute left-0 right-0 top-0', tab === 'map' ? '' : 'bg-background')}
        style={{ paddingTop: topInset }}
      >
        <TabletContentContainer>{tabsBar}</TabletContentContainer>
      </View>
    </View>
  );
}
