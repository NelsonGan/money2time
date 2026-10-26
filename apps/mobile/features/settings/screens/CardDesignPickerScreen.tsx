import { Check, ImagePlus, Lock, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountLogo, Button, Text } from '~/components/ui';
import { SettingsHeader } from '~/components/ui/settings';
import {
  CARD_DESIGN_ASPECT_RATIO,
  CARD_DESIGN_GENRES,
  type CardDesignAppearance,
  type CardDesignGenre,
  customCardDesignTextTone,
  getCardDesignTemplate,
  resolveCardDesignAppearance,
  templatesForGenre,
} from '~/constants/cardDesigns';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useResolvedTheme } from '~/context/ThemeContext';
import {
  CardDesignBackground,
  CardDesignPreview,
} from '~/features/settings/components/AccountCardDesign';
import {
  COLLAPSED_CARD_HEIGHT,
  getPlainCardColors,
} from '~/features/settings/components/AccountCardStack';
import { CardDesignCropModal } from '~/features/settings/components/CardDesignCropModal';
import type { CardDesignPickerSession } from '~/features/settings/lib/cardDesignPickerBridge';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import { pickLibraryImage } from '~/services/libraryImagePicker';
import { deleteCustomLogo, getCustomLogoUri, listCustomCardDesigns } from '~/services/userAssets';
import { withColorAlpha } from '~/utils/color';
import { formatAmount } from '~/utils/formatters';

type Filter = 'all' | 'uploads' | CardDesignGenre;

/** One tile in the grid: the plain card, the upload action, or a design. */
type Tile =
  | { kind: 'plain'; key: string }
  | { kind: 'upload'; key: string }
  | { kind: 'design'; key: string; value: string; custom: boolean; number: number };

type Row =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'tiles'; key: string; tiles: Tile[] };

const COLUMNS = 2;
const GRID_GAP = 12;
/** A sample figure for the preview card, so the balance's weight is judged too. */
const PREVIEW_AMOUNT = 2480.5;

function genreLabel(genre: CardDesignGenre): string {
  return String(I18n.t(`accounts.card_design.genre_${genre}`));
}

/** "Marble & stone card design 3": the genre plus the design's place in it. */
function templateLabel(id: string): string {
  const template = getCardDesignTemplate(id);
  if (!template) return String(I18n.t('accounts.card_design.label'));
  const number = templatesForGenre(template.genre).indexOf(template) + 1;
  return String(
    I18n.t('accounts.card_design.template_label', { genre: genreLabel(template.genre), number }),
  );
}

function chunk(tiles: Tile[], keyPrefix: string): Row[] {
  const rows: Row[] = [];
  for (let index = 0; index < tiles.length; index += COLUMNS) {
    const slice = tiles.slice(index, index + COLUMNS);
    rows.push({ kind: 'tiles', key: `${keyPrefix}-${slice[0]!.key}`, tiles: slice });
  }
  return rows;
}

interface CardDesignPickerScreenProps {
  session: CardDesignPickerSession;
  onClose: () => void;
}

/**
 * Full-page picker for the artwork behind an account's card. Templates are
 * free and grouped by genre; uploading a photo is Pro. The card at the top
 * previews the highlighted choice with the account's own logo and name, and
 * nothing is applied until the user confirms.
 */
export function CardDesignPickerScreen({ session, onClose }: CardDesignPickerScreenProps) {
  const themeColors = useThemeColors();
  const isDark = useResolvedTheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { settings, currentMonthWage } = useApp();
  const { isPro, requirePro } = useProGate();

  const [selected, setSelected] = useState<string | null>(session.selectedDesign);
  const [filter, setFilter] = useState<Filter>('all');
  const [uploads, setUploads] = useState<{ id: string; uri: string }[]>([]);
  const [cropUri, setCropUri] = useState<string | null>(null);

  // Chip positions, so a chip tapped at the edge of the row slides into view.
  const filterScrollRef = useRef<ScrollViewInstance>(null);
  const filterChipX = useRef(new Map<Filter, number>());

  const refreshUploads = useCallback(() => setUploads(listCustomCardDesigns()), []);
  useEffect(() => {
    refreshUploads();
  }, [refreshUploads]);

  const accountName = session.accountName.trim() || String(I18n.t('accounts.account_name'));
  const balanceLabel = formatAmount(PREVIEW_AMOUNT, settings, {
    showSign: false,
    trueHourlyRate: currentMonthWage?.trueHourlyRate ?? 0,
  });

  const tileWidth = (windowWidth - spacing.lg * 2 - GRID_GAP) / COLUMNS;
  const tileHeight = tileWidth / CARD_DESIGN_ASPECT_RATIO;

  const rows = useMemo<Row[]>(() => {
    const uploadTiles: Tile[] = uploads.map((upload, index) => ({
      kind: 'design',
      key: upload.id,
      value: upload.id,
      custom: true,
      number: index + 1,
    }));
    const genreTiles = (genre: CardDesignGenre): Tile[] =>
      templatesForGenre(genre).map((template, index) => ({
        kind: 'design',
        key: template.id,
        value: template.id,
        custom: false,
        number: index + 1,
      }));

    if (filter === 'uploads') {
      return chunk([{ kind: 'upload', key: 'upload' }, ...uploadTiles], 'uploads');
    }
    if (filter !== 'all') return chunk(genreTiles(filter), filter);

    const result: Row[] = chunk(
      [
        { kind: 'plain', key: 'plain' },
        { kind: 'upload', key: 'upload' },
      ],
      'top',
    );
    if (uploadTiles.length > 0) {
      result.push({
        kind: 'header',
        key: 'h-uploads',
        label: String(I18n.t('accounts.card_design.my_uploads')),
      });
      result.push(...chunk(uploadTiles, 'uploads'));
    }
    for (const genre of CARD_DESIGN_GENRES) {
      result.push({ kind: 'header', key: `h-${genre}`, label: genreLabel(genre) });
      result.push(...chunk(genreTiles(genre), genre));
    }
    return result;
  }, [filter, uploads]);

  // Resolved every render (a map lookup, or one cached stat for an upload) so
  // deleting the selected upload drops its preview straight away.
  const appearance = resolveCardDesignAppearance(selected, getCustomLogoUri);
  const closeCrop = useCallback(() => setCropUri(null), []);

  const handleUpload = useCallback(async () => {
    void triggerHaptic('selection');
    // Pro-only with no free allowance, like uploaded category icons.
    if (!requirePro('custom_card_designs')) return;
    await pickLibraryImage((uri) => setCropUri(uri), {
      failureTitle: I18n.t('accounts.card_design.upload_failed'),
    });
  }, [requirePro]);

  const handleCropSaved = useCallback(
    (designId: string) => {
      setCropUri(null);
      refreshUploads();
      setSelected(designId);
      void trackEvent(AnalyticsEvents.CARD_DESIGN_UPLOADED, {
        textTone: customCardDesignTextTone(designId),
      });
    },
    [refreshUploads],
  );

  const handleDeleteUpload = useCallback(
    (designId: string) => {
      void triggerHaptic('warning');
      Alert.alert(
        I18n.t('accounts.card_design.delete_title'),
        I18n.t('accounts.card_design.delete_message'),
        [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          {
            text: I18n.t('common.delete'),
            style: 'destructive',
            onPress: () => {
              // Only the file goes. Accounts wearing it are not rewritten: a
              // design that no longer resolves already draws the plain card, and
              // an account write here would refresh the list, which re-seeds
              // the editor underneath (losing its unsaved edits) and runs the
              // orphan sweep over every other upload in this library.
              deleteCustomLogo(designId);
              if (designId === selected) setSelected(null);
              // The editor holds its own copy of the choice; without this a
              // back-out would save the deleted id.
              if (designId === session.selectedDesign) session.onSelect(null);
              refreshUploads();
            },
          },
        ],
      );
    },
    [refreshUploads, selected, session],
  );

  const handleApply = useCallback(() => {
    if (selected !== session.selectedDesign) {
      session.onSelect(selected);
      const template = getCardDesignTemplate(selected);
      void trackEvent(AnalyticsEvents.ACCOUNT_CARD_DESIGN_CHOSEN, {
        designKind: selected == null ? 'plain' : template ? 'template' : 'custom',
        genre: template?.genre ?? 'none',
        design: template?.id ?? 'none',
      });
    }
    void triggerHaptic('success');
    onClose();
  }, [onClose, selected, session]);

  const plainColors = getPlainCardColors(
    session.accountType,
    isDark,
    session.stackIndex,
    session.includeInTotals,
  );

  const renderTile = (tile: Tile) => {
    const isSelected =
      tile.kind === 'plain'
        ? selected == null
        : tile.kind === 'design'
          ? tile.value === selected
          : false;
    const frameStyle = [
      styles.tile,
      {
        width: tileWidth,
        height: tileHeight,
        borderColor: isSelected ? themeColors.primary : 'transparent',
      },
    ];

    if (tile.kind === 'upload') {
      return (
        <Pressable
          key={tile.key}
          onPress={handleUpload}
          accessibilityRole="button"
          accessibilityLabel={I18n.t(
            isPro ? 'accounts.card_design.upload' : 'accounts.card_design.upload_pro',
          )}
          style={[
            frameStyle,
            styles.uploadTile,
            {
              borderColor: themeColors.primary,
              backgroundColor: withColorAlpha(themeColors.primary, 0.06),
            },
          ]}
        >
          {isPro ? (
            <ImagePlus size={22} color={themeColors.primary} />
          ) : (
            <Lock size={20} color={themeColors.primary} />
          )}
          <Text variant="caption" className="mt-1.5 text-center font-medium text-primary">
            {I18n.t(isPro ? 'accounts.card_design.upload' : 'accounts.card_design.upload_pro')}
          </Text>
        </Pressable>
      );
    }

    if (tile.kind === 'plain') {
      return (
        <Pressable
          key={tile.key}
          onPress={() => {
            void triggerHaptic('selection');
            setSelected(null);
          }}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('accounts.card_design.plain')}
          accessibilityState={{ selected: isSelected }}
          style={frameStyle}
        >
          <View style={[styles.tileInner, { backgroundColor: plainColors.bg }]}>
            <Text variant="caption" style={[styles.tileLabel, { color: plainColors.text }]}>
              {I18n.t('accounts.card_design.plain')}
            </Text>
          </View>
          {isSelected ? <SelectedBadge color={themeColors.primary} /> : null}
        </Pressable>
      );
    }

    const tileAppearance: CardDesignAppearance | null = resolveCardDesignAppearance(
      tile.value,
      getCustomLogoUri,
    );
    return (
      <View key={tile.key}>
        <Pressable
          onPress={() => {
            void triggerHaptic('selection');
            setSelected(tile.value);
          }}
          accessibilityRole="button"
          accessibilityLabel={
            tile.custom
              ? I18n.t('accounts.card_design.upload_label', { number: tile.number })
              : templateLabel(tile.value)
          }
          accessibilityState={{ selected: isSelected }}
          style={frameStyle}
        >
          <View style={styles.tileInner}>
            {tileAppearance ? (
              <CardDesignBackground
                value={tile.value}
                appearance={tileAppearance}
                variant="thumb"
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: themeColors.border }]} />
            )}
          </View>
          {isSelected ? <SelectedBadge color={themeColors.primary} /> : null}
        </Pressable>
        {tile.custom ? (
          <Pressable
            onPress={() => handleDeleteUpload(tile.value)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('accounts.card_design.delete_label', {
              number: tile.number,
            })}
            style={[styles.deleteButton, { backgroundColor: themeColors.card }]}
          >
            <X size={12} color={themeColors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: String(I18n.t('accounts.card_design.filter_all')) },
    ...CARD_DESIGN_GENRES.map((genre) => ({ value: genre, label: genreLabel(genre) })),
    { value: 'uploads', label: String(I18n.t('accounts.card_design.my_uploads')) },
  ];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <SettingsHeader title={I18n.t('accounts.card_design.title')} onBack={onClose} />

      <View style={styles.previewWrap}>
        {appearance ? (
          <CardDesignPreview
            value={selected}
            appearance={appearance}
            accountName={accountName}
            logoId={session.logoId}
            accountType={session.accountType}
            balanceLabel={balanceLabel}
            height={COLLAPSED_CARD_HEIGHT}
          />
        ) : (
          <View
            style={[
              styles.plainPreview,
              { backgroundColor: plainColors.bg, borderColor: plainColors.border },
            ]}
          >
            <View style={styles.plainPreviewRow}>
              <AccountLogo logoId={session.logoId} type={session.accountType} size={30} />
              <Text
                variant="bodyStrong"
                numberOfLines={1}
                style={[styles.plainPreviewName, { color: plainColors.text }]}
              >
                {accountName}
              </Text>
              <Text
                variant="bodyStrong"
                numberOfLines={1}
                style={[styles.plainPreviewBalance, { color: plainColors.text }]}
              >
                {balanceLabel}
              </Text>
            </View>
          </View>
        )}
      </View>

      <View>
        <ScrollView
          ref={filterScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {filters.map((option) => {
            const active = option.value === filter;
            return (
              <Pressable
                key={option.value}
                onLayout={(event) => {
                  filterChipX.current.set(option.value, event.nativeEvent.layout.x);
                }}
                onPress={() => {
                  void triggerHaptic('selection');
                  setFilter(option.value);
                  const x = filterChipX.current.get(option.value) ?? 0;
                  filterScrollRef.current?.scrollTo({
                    x: Math.max(0, x - spacing.lg * 2),
                    animated: true,
                  });
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className={
                  active
                    ? 'rounded-full border border-primary/50 bg-primary/15 px-3.5 py-2'
                    : 'rounded-full border border-border/40 bg-card px-3.5 py-2'
                }
              >
                <Text
                  variant="caption"
                  className={active ? 'font-medium text-primary' : 'text-muted-foreground'}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        style={styles.flexOne}
        contentContainerStyle={styles.gridContent}
        ListHeaderComponent={
          !isPro && filter === 'uploads' ? (
            <Text variant="caption" tone="muted" className="pb-3">
              {I18n.t('accounts.card_design.upload_pro_hint')}
            </Text>
          ) : undefined
        }
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <Text variant="label" tone="muted" style={styles.sectionLabel}>
              {item.label}
            </Text>
          ) : (
            <View style={styles.tileRow}>{item.tiles.map(renderTile)}</View>
          )
        }
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Button onPress={handleApply}>
          <Text>{I18n.t('accounts.card_design.apply')}</Text>
        </Button>
      </View>

      <CardDesignCropModal
        sourceUri={cropUri}
        accountName={accountName}
        logoId={session.logoId}
        accountType={session.accountType}
        balanceLabel={balanceLabel}
        onCancel={closeCrop}
        onSaved={handleCropSaved}
      />
    </SafeAreaView>
  );
}

function SelectedBadge({ color }: { color: string }) {
  return (
    <View style={[styles.selectedBadge, { backgroundColor: color }]}>
      <Check size={12} color="#FFFFFF" strokeWidth={3} />
    </View>
  );
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  previewWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  plainPreview: {
    height: COLLAPSED_CARD_HEIGHT,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  plainPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  plainPreviewName: {
    flex: 1,
    fontSize: 14,
    letterSpacing: -0.3,
  },
  plainPreviewBalance: {
    fontSize: 16,
    letterSpacing: -0.5,
  },
  filterRow: {
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  gridContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
  },
  sectionLabel: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  tileRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  tile: {
    borderRadius: 14,
    borderWidth: 2.5,
    padding: 2,
  },
  tileInner: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  tileLabel: {
    padding: 10,
    fontWeight: '600',
  },
  uploadTile: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedBadge: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    position: 'absolute',
    left: 8,
    top: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
});
