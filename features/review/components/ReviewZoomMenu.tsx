import { Check, ChevronDown } from 'lucide-react-native';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Text, ThemeModal } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import { REVIEW_ZOOMS, type ReviewZoom } from '../lib/reviewPeriods';

const MENU_WIDTH = 152;

/**
 * The week / month / year switch, as a dropdown in the Insights header rather
 * than a segmented control in the page body: it is a mode the whole page hangs
 * off, not a filter, and keeping it in the header leaves the content to the
 * cards.
 */
export function ReviewZoomMenu({
  zoom,
  onChange,
}: {
  zoom: ReviewZoom;
  onChange: (zoom: ReviewZoom) => void;
}) {
  const themeColors = useThemeColors();
  const { width: screenWidth } = useWindowDimensions();
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  const open = useCallback(() => {
    void triggerHaptic('selection');
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({
        top: y + height + 6,
        // Right-aligned to the trigger so the card never runs off the edge.
        right: Math.max(8, screenWidth - (x + width)),
      });
    });
  }, [screenWidth]);

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('review.zoom_label')}
          accessibilityValue={{ text: I18n.t(`review.zoom.${zoom}`) }}
          accessibilityState={{ expanded: anchor !== null }}
          className="h-10 flex-row items-center gap-1 rounded-full border border-border/40 bg-card pl-3 pr-2 shadow-soft active:opacity-80"
        >
          <Text variant="caption" className="text-foreground">
            {I18n.t(`review.zoom.${zoom}`)}
          </Text>
          <ChevronDown size={13} color={themeColors.textMuted} strokeWidth={2.5} />
        </Pressable>
      </View>

      <ThemeModal
        visible={anchor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setAnchor(null)}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setAnchor(null)}>
          <View
            className="rounded-2xl border border-border/40 bg-card shadow-soft"
            style={[styles.card, { top: anchor?.top ?? 0, right: anchor?.right ?? 8 }]}
          >
            {REVIEW_ZOOMS.map((value) => {
              const selected = value === zoom;
              return (
                <Pressable
                  key={value}
                  onPress={() => {
                    void triggerHaptic('selection');
                    setAnchor(null);
                    if (value !== zoom) onChange(value);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className="h-11 flex-row items-center justify-between gap-3 px-3.5 active:opacity-70"
                >
                  <Text variant={selected ? 'bodyStrong' : 'body'} className="text-foreground">
                    {I18n.t(`review.zoom.${value}`)}
                  </Text>
                  {selected ? (
                    <Check size={15} color={themeColors.primary} strokeWidth={2.6} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </ThemeModal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: MENU_WIDTH,
    paddingVertical: 4,
  },
});
