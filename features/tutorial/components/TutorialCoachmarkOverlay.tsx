import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Button, Text } from '~/components/ui';
import { useResolvedTheme } from '~/context/ThemeContext';
import type { TutorialTargetId, TutorialTargetRect } from '~/features/tutorial/types';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

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
const TOOLTIP_ESTIMATED_HEIGHT = 286;
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
    const maxTop = Math.max(minTop, windowHeight - TOOLTIP_ESTIMATED_HEIGHT - tooltipBottomClearance);
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

  const overlayPalette = useMemo(
    () => {
      const tooltipIsDark = !isDark;
      return {
        backdrop: isDark ? 'rgba(9, 14, 24, 0.62)' : 'rgba(15, 23, 42, 0.44)',
        // Invert tooltip surface by theme for stronger contrast.
        tooltipBackground: tooltipIsDark ? '#0F172A' : '#F8FAFC',
        tooltipBorder: tooltipIsDark ? 'rgba(255, 255, 255, 0.20)' : 'rgba(15, 23, 42, 0.18)',
        titleText: tooltipIsDark ? '#F8FAFC' : '#0F172A',
        bodyText: tooltipIsDark ? '#E2E8F0' : '#334155',
        mutedText: tooltipIsDark ? '#94A3B8' : '#64748B',
        badgeText: tooltipIsDark ? '#C9D6EB' : themeColors.primary,
      highlightBorder: isDark ? 'rgba(255,255,255,0.92)' : 'rgba(15,23,42,0.80)',
      highlightFill: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.02)',
      highlightHaloBorder: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.30)',
      highlightHaloFill: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.04)',
      highlightShadowColor: isDark ? '#FFFFFF' : '#0F172A',
      highlightShadowOpacity: isDark ? 0.32 : 0.2,
      secondaryHighlightBorder: isDark ? 'rgba(255,255,255,0.72)' : 'rgba(15,23,42,0.58)',
      secondaryHighlightFill: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.04)',
      loadingHighlightBorder: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.22)',
      loadingHighlightFill: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.34)',
        // Restore neutral button styling (no green tint), matched to tooltip surface.
        subtleButtonBorder: tooltipIsDark
          ? 'rgba(255, 255, 255, 0.32)'
          : 'rgba(15, 23, 42, 0.24)',
        subtleButtonBackground: tooltipIsDark
          ? 'rgba(255, 255, 255, 0.10)'
          : 'rgba(15, 23, 42, 0.07)',
        subtleButtonText: tooltipIsDark ? '#F8FAFC' : '#0F172A',
        spinner: tooltipIsDark ? '#94A3B8' : '#475569',
      };
    },
    [isDark, themeColors],
  );

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlayRoot]} pointerEvents="box-none">
      {highlightFrame || secondaryHighlightFrame ? (
        <>
          <Svg style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <Path d={backdropMaskPath ?? ''} fill={overlayPalette.backdrop} fillRule="evenodd" />
          </Svg>

          {highlightFrame ? (
            <>
              <View
                pointerEvents="none"
                style={[
                  styles.highlightHalo,
                  {
                    left: highlightFrame.left - 4,
                    top: highlightFrame.top - 4,
                    width: highlightFrame.width + 8,
                    height: highlightFrame.height + 8,
                    borderRadius: highlightRadius + 6,
                    borderColor: overlayPalette.highlightHaloBorder,
                    backgroundColor: overlayPalette.highlightHaloFill,
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
                    borderColor: overlayPalette.highlightBorder,
                    backgroundColor: overlayPalette.highlightFill,
                    shadowColor: overlayPalette.highlightShadowColor,
                    shadowOpacity: overlayPalette.highlightShadowOpacity,
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
                  borderColor: overlayPalette.secondaryHighlightBorder,
                  backgroundColor: overlayPalette.secondaryHighlightFill,
                },
              ]}
            />
          ) : null}
        </>
      ) : (
        <>
          <View
            style={[styles.backdrop, StyleSheet.absoluteFillObject, { backgroundColor: overlayPalette.backdrop }]}
          />
          <View
            style={[
              styles.loadingHighlight,
              {
                borderColor: overlayPalette.loadingHighlightBorder,
                backgroundColor: overlayPalette.loadingHighlightFill,
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
            borderColor: overlayPalette.tooltipBorder,
            backgroundColor: overlayPalette.tooltipBackground,
          },
        ]}
      >
        <Text variant="label" style={{ color: overlayPalette.badgeText }}>
          {I18n.t('tutorial.coachmark_badge')}
        </Text>
        <Text variant="subheading" className="mt-1" style={{ color: overlayPalette.titleText }}>
          {title}
        </Text>
        <Text variant="friendly" className="mt-2" style={{ color: overlayPalette.bodyText }}>
          {body}
        </Text>
        <Text variant="label" className="mt-2" style={{ color: overlayPalette.mutedText }}>
          {I18n.t('tutorial.progress', { current: stepIndex + 1, total: totalSteps })}
        </Text>
        {!highlightFrame ? (
          <View className="mt-2 flex-row items-center gap-2">
            <ActivityIndicator size="small" color={overlayPalette.spinner} />
            <Text variant="label" style={{ color: overlayPalette.mutedText }}>
              {I18n.t('tutorial.locating_target')}
            </Text>
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          {stepIndex > 0 ? (
            <View style={styles.actionSlot}>
              <Button
                variant="ghost"
                className="w-full"
                style={{
                  borderWidth: 1,
                  borderColor: overlayPalette.subtleButtonBorder,
                  backgroundColor: overlayPalette.subtleButtonBackground,
                }}
                onPress={onBack}
              >
                <Text style={{ color: overlayPalette.subtleButtonText }}>{I18n.t('common.back')}</Text>
              </Button>
            </View>
          ) : null}
          <View style={styles.actionSlot}>
            <Button className="w-full" onPress={onNext}>
              <Text>{isLastStep ? I18n.t('tutorial.finish') : I18n.t('tutorial.next')}</Text>
            </Button>
          </View>
        </View>

        {!isLastStep ? (
          <Button
            variant="ghost"
            className="mt-2"
            style={{
              borderWidth: 1,
              borderColor: overlayPalette.subtleButtonBorder,
              backgroundColor: overlayPalette.subtleButtonBackground,
            }}
            onPress={onSkip}
          >
            <Text style={{ color: overlayPalette.subtleButtonText }}>{I18n.t('tutorial.skip')}</Text>
          </Button>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    zIndex: 4000,
    elevation: 4000,
  },
  backdrop: {
    position: 'absolute',
    backgroundColor: 'rgba(11, 18, 32, 0.58)',
  },
  highlightHalo: {
    position: 'absolute',
    borderWidth: 1,
  },
  highlight: {
    position: 'absolute',
    borderWidth: 2,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.32,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
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
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    maxHeight: 286,
  },
  actionsRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  actionSlot: {
    flex: 1,
  },
});
