import React, { useMemo } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Button, Text } from '~/components/ui';
import { useResolvedTheme } from '~/context/ThemeContext';
import type { TutorialTargetId, TutorialTargetRect } from '~/features/tutorial/types';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

interface TutorialCoachmarkOverlayProps {
  visible: boolean;
  stepIndex: number;
  totalSteps: number;
  title: string;
  body: string;
  targetId?: TutorialTargetId | null;
  targetRect?: TutorialTargetRect | null;
  secondaryTargetRect?: TutorialTargetRect | null;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  isLastStep: boolean;
}

const HORIZONTAL_MARGIN = 16;
const HIGHLIGHT_PADDING = 8;
const SECONDARY_HIGHLIGHT_PADDING = 5;
const TOOLTIP_ESTIMATED_HEIGHT = 260;
const SPOTLIGHT_EDGE_MARGIN = 8;
const DEFAULT_TOOLTIP_BOTTOM_CLEARANCE = 16;
const FAB_TOOLTIP_BOTTOM_CLEARANCE = 132;

function roundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  borderRadius: number,
): string {
  const radius = Math.max(0, Math.min(borderRadius, width / 2, height / 2));
  return [
    `M${x + radius} ${y}`,
    `H${x + width - radius}`,
    `A${radius} ${radius} 0 0 1 ${x + width} ${y + radius}`,
    `V${y + height - radius}`,
    `A${radius} ${radius} 0 0 1 ${x + width - radius} ${y + height}`,
    `H${x + radius}`,
    `A${radius} ${radius} 0 0 1 ${x} ${y + height - radius}`,
    `V${y + radius}`,
    `A${radius} ${radius} 0 0 1 ${x + radius} ${y}`,
    'Z',
  ].join(' ');
}

function resolveSpotlightFrame(
  rect: TutorialTargetRect | null | undefined,
  padding: number,
  windowWidth: number,
  windowHeight: number,
  edgeMargin: number = SPOTLIGHT_EDGE_MARGIN,
) {
  if (!rect) return null;
  const left = Math.max(edgeMargin, rect.x - padding);
  const top = Math.max(edgeMargin, rect.y - padding);
  const right = Math.min(windowWidth - edgeMargin, rect.x + rect.width + padding);
  const bottom = Math.min(windowHeight - edgeMargin, rect.y + rect.height + padding);
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

export function TutorialCoachmarkOverlay({
  visible,
  stepIndex,
  totalSteps,
  title,
  body,
  targetId = null,
  targetRect,
  secondaryTargetRect = null,
  onBack,
  onNext,
  onSkip,
  isLastStep,
}: TutorialCoachmarkOverlayProps) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const themeColors = useThemeColors();
  const resolvedTheme = useResolvedTheme();
  const isDark = resolvedTheme === 'dark';

  const highlightFrame = useMemo(
    () => resolveSpotlightFrame(targetRect, HIGHLIGHT_PADDING, windowWidth, windowHeight),
    [targetRect, windowHeight, windowWidth],
  );
  const secondaryHighlightFrame = useMemo(
    () =>
      resolveSpotlightFrame(
        secondaryTargetRect,
        SECONDARY_HIGHLIGHT_PADDING,
        windowWidth,
        windowHeight,
        0,
      ),
    [secondaryTargetRect, windowHeight, windowWidth],
  );

  const highlightRadius = useMemo(() => {
    if (!highlightFrame) return 18;
    const shortest = Math.min(highlightFrame.width, highlightFrame.height);
    const nearSquare = Math.abs(highlightFrame.width - highlightFrame.height) <= 14;
    if (targetId === 'nav.add' || (nearSquare && shortest <= 98)) {
      return shortest / 2;
    }
    return Math.max(14, Math.min(26, shortest * 0.28));
  }, [highlightFrame, targetId]);
  const secondaryHighlightRadius = useMemo(() => {
    if (!secondaryHighlightFrame) return 16;
    const shortest = Math.min(secondaryHighlightFrame.width, secondaryHighlightFrame.height);
    return Math.max(12, Math.min(20, shortest * 0.34));
  }, [secondaryHighlightFrame]);

  const backdropMaskPath = useMemo(() => {
    if (!highlightFrame && !secondaryHighlightFrame) return null;
    const outerPath = `M0 0 H${windowWidth} V${windowHeight} H0 Z`;
    const holes: string[] = [];
    if (highlightFrame) {
      holes.push(
        roundedRectPath(
          highlightFrame.left,
          highlightFrame.top,
          highlightFrame.width,
          highlightFrame.height,
          highlightRadius,
        ),
      );
    }
    if (secondaryHighlightFrame) {
      holes.push(
        roundedRectPath(
          secondaryHighlightFrame.left,
          secondaryHighlightFrame.top,
          secondaryHighlightFrame.width,
          secondaryHighlightFrame.height,
          secondaryHighlightRadius,
        ),
      );
    }
    return `${outerPath} ${holes.join(' ')}`;
  }, [
    highlightFrame,
    highlightRadius,
    secondaryHighlightFrame,
    secondaryHighlightRadius,
    windowHeight,
    windowWidth,
  ]);

  const tooltipTop = useMemo(() => {
    const isAddStep = targetId === 'nav.add';
    const isConverterStep = targetId === 'home.converter';
    const minTop = isAddStep ? 24 : 16;
    const tooltipBottomClearance = isConverterStep
      ? FAB_TOOLTIP_BOTTOM_CLEARANCE
      : DEFAULT_TOOLTIP_BOTTOM_CLEARANCE;
    const maxTop = Math.max(
      minTop,
      windowHeight - TOOLTIP_ESTIMATED_HEIGHT - tooltipBottomClearance,
    );
    if (isConverterStep) {
      return maxTop;
    }
    if (!highlightFrame) {
      return Math.min(maxTop, Math.max(96, windowHeight - TOOLTIP_ESTIMATED_HEIGHT - 32));
    }
    const belowTargetY = highlightFrame.bottom + (isAddStep ? 24 : 16);
    const aboveTargetY = highlightFrame.top - TOOLTIP_ESTIMATED_HEIGHT - (isAddStep ? 44 : 16);
    if (isAddStep) {
      return Math.max(minTop, Math.min(maxTop, aboveTargetY));
    }
    if (belowTargetY + TOOLTIP_ESTIMATED_HEIGHT <= windowHeight - 16 && belowTargetY <= maxTop) {
      return Math.max(minTop, belowTargetY);
    }
    return Math.max(minTop, Math.min(maxTop, aboveTargetY));
  }, [highlightFrame, targetId, windowHeight]);

  const palette = useMemo(() => {
    const primary = themeColors.primary;
    return {
      backdrop: isDark ? 'rgba(2, 6, 15, 0.72)' : 'rgba(15, 23, 42, 0.55)',
      tooltipBackground: isDark ? '#14181F' : '#FFFFFF',
      tooltipBorder: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)',
      titleText: isDark ? '#F8FAFC' : '#0F172A',
      bodyText: isDark ? '#CBD5E1' : '#475569',
      mutedText: isDark ? '#64748B' : '#94A3B8',
      primary,
      primaryText: '#FFFFFF',
      pillBackground: isDark ? `${primary}22` : `${primary}1A`,
      pillText: primary,
      progressTrack: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(15, 23, 42, 0.08)',
      progressFill: primary,
      highlightBorder: primary,
      highlightGlow: primary,
      secondaryHighlightBorder: isDark ? 'rgba(255, 255, 255, 0.80)' : 'rgba(255, 255, 255, 0.95)',
      secondaryHighlightFill: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.08)',
      backButtonBackground: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.05)',
      backButtonText: isDark ? '#CBD5E1' : '#334155',
      skipText: isDark ? '#64748B' : '#94A3B8',
      loadingBorder: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.65)',
      loadingFill: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.12)',
    };
  }, [isDark, themeColors]);

  if (!visible) return null;

  const handleSkip = () => {
    void triggerHaptic('selection');
    onSkip();
  };

  const progressPercent = Math.max(
    0,
    Math.min(100, ((stepIndex + 1) / Math.max(1, totalSteps)) * 100),
  );

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlayRoot]} pointerEvents="box-none">
      {highlightFrame || secondaryHighlightFrame ? (
        <>
          <Svg style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <Path d={backdropMaskPath ?? ''} fill={palette.backdrop} fillRule="evenodd" />
          </Svg>

          {highlightFrame ? (
            <>
              <View
                pointerEvents="none"
                style={[
                  styles.highlightGlow,
                  {
                    left: highlightFrame.left - 6,
                    top: highlightFrame.top - 6,
                    width: highlightFrame.width + 12,
                    height: highlightFrame.height + 12,
                    borderRadius: highlightRadius + 8,
                    borderColor: `${palette.highlightGlow}33`,
                  },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.highlight,
                  {
                    left: highlightFrame.left,
                    top: highlightFrame.top,
                    width: highlightFrame.width,
                    height: highlightFrame.height,
                    borderRadius: highlightRadius,
                    borderColor: palette.highlightBorder,
                    shadowColor: palette.highlightGlow,
                  },
                ]}
              />
            </>
          ) : null}
          {secondaryHighlightFrame ? (
            <View
              pointerEvents="none"
              style={[
                styles.secondaryHighlight,
                {
                  left: secondaryHighlightFrame.left,
                  top: secondaryHighlightFrame.top,
                  width: secondaryHighlightFrame.width,
                  height: secondaryHighlightFrame.height,
                  borderRadius: secondaryHighlightRadius,
                  borderColor: palette.secondaryHighlightBorder,
                  backgroundColor: palette.secondaryHighlightFill,
                },
              ]}
            />
          ) : null}
        </>
      ) : (
        <>
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: palette.backdrop },
            ]}
          />
          <View
            style={[
              styles.loadingHighlight,
              {
                borderColor: palette.loadingBorder,
                backgroundColor: palette.loadingFill,
              },
            ]}
            pointerEvents="none"
          />
        </>
      )}

      <View
        style={[
          styles.tooltip,
          {
            top: tooltipTop,
            borderColor: palette.tooltipBorder,
            backgroundColor: palette.tooltipBackground,
            shadowColor: isDark ? '#000000' : '#0F172A',
          },
        ]}
      >
        <View style={styles.tooltipHeader}>
          <View style={[styles.pill, { backgroundColor: palette.pillBackground }]}>
            <Text variant="label" style={[styles.pillText, { color: palette.pillText }]}>
              {I18n.t('tutorial.coachmark_badge')}
            </Text>
          </View>
          <Text variant="label" style={[styles.progressLabel, { color: palette.mutedText }]}>
            {I18n.t('tutorial.progress', { current: stepIndex + 1, total: totalSteps })}
          </Text>
        </View>

        <View style={[styles.progressTrack, { backgroundColor: palette.progressTrack }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${progressPercent}%`, backgroundColor: palette.progressFill },
            ]}
          />
        </View>

        <Text variant="subheading" style={[styles.title, { color: palette.titleText }]}>
          {title}
        </Text>
        <Text variant="friendly" style={[styles.body, { color: palette.bodyText }]}>
          {body}
        </Text>

        {!highlightFrame ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={palette.mutedText} />
            <Text variant="label" style={{ color: palette.mutedText }}>
              {I18n.t('tutorial.locating_target')}
            </Text>
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          {!isLastStep ? (
            <Pressable
              onPress={handleSkip}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('tutorial.skip')}
              style={({ pressed }) => [styles.skipInline, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text variant="label" style={[styles.skipText, { color: palette.skipText }]}>
                {I18n.t('tutorial.skip')}
              </Text>
            </Pressable>
          ) : (
            <View />
          )}

          <View style={styles.rightActions}>
            {stepIndex > 0 ? (
              <Button
                variant="outline"
                size="sm"
                haptic="selection"
                onPress={onBack}
                accessibilityLabel={I18n.t('common.back')}
              >
                <Text>{I18n.t('common.back')}</Text>
              </Button>
            ) : null}
            <Button
              variant="default"
              size="sm"
              haptic={isLastStep ? 'success' : 'selection'}
              onPress={onNext}
              accessibilityLabel={isLastStep ? I18n.t('tutorial.finish') : I18n.t('tutorial.next')}
            >
              <Text>{isLastStep ? I18n.t('tutorial.finish') : I18n.t('tutorial.next')}</Text>
            </Button>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    zIndex: 4000,
    elevation: 4000,
  },
  highlightGlow: {
    position: 'absolute',
    borderWidth: 2,
  },
  highlight: {
    position: 'absolute',
    borderWidth: 2.5,
    ...Platform.select({
      ios: {
        shadowOpacity: 0.55,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 0 },
      },
      android: {
        elevation: 0,
      },
    }),
  },
  secondaryHighlight: {
    position: 'absolute',
    borderWidth: 1.5,
  },
  loadingHighlight: {
    position: 'absolute',
    left: HORIZONTAL_MARGIN,
    right: HORIZONTAL_MARGIN,
    top: 124,
    height: 88,
    borderRadius: 18,
    borderWidth: 1,
  },
  tooltip: {
    position: 'absolute',
    left: HORIZONTAL_MARGIN,
    right: HORIZONTAL_MARGIN,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    ...Platform.select({
      ios: {
        shadowOpacity: 0.18,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
      },
      android: {
        elevation: 8,
      },
    }),
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: {
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontSize: 10,
    fontWeight: '700',
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  progressTrack: {
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  body: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  loadingRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionsRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  skipInline: {
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  skipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
