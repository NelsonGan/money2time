import { ArrowRight, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, FatButton, Text, ThemeModal } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import {
  announcementCtaLabel,
  announcementPageBody,
  announcementPageTitle,
  type FeatureAnnouncement,
  type FeatureAnnouncementPage,
} from '../featureAnnouncements';
import { AccountLogoShowcase } from './AccountLogoShowcase';
import { AddSplitShowcase } from './AddSplitShowcase';
import { AlbumShowcase } from './AlbumShowcase';
import { AppLockShowcase } from './AppLockShowcase';
import { AutoLogShowcase } from './AutoLogShowcase';
import { BudgetShowcase } from './BudgetShowcase';
import { ExcelExportShowcase } from './ExcelExportShowcase';
import { FinancialMonthShowcase } from './FinancialMonthShowcase';
import { GoalsShowcase } from './GoalsShowcase';
import { ItemsShowcase } from './ItemsShowcase';
import { MultiCurrencyShowcase } from './MultiCurrencyShowcase';
import { ReceiptSplitShowcase } from './ReceiptSplitShowcase';
import { RedesignShowcase } from './RedesignShowcase';
import { ShareEarnShowcase } from './ShareEarnShowcase';
import { VoiceShowcase } from './VoiceShowcase';
import { WidgetShowcase, type WidgetShowcaseKind } from './WidgetShowcase';

interface FeatureAnnouncementModalProps {
  announcement: FeatureAnnouncement | null;
  visible: boolean;
  onDismiss: () => void;
  /** Invoked when a page with the `openShareEarn` CTA is confirmed. */
  onOpenShareEarn?: () => void;
  /** Invoked when a page with the `openQuickEntrySettings` CTA is confirmed. */
  onOpenQuickEntrySettings?: () => void;
  /** Invoked when a page with the `openAutoLog` CTA is confirmed. */
  onOpenAutoLog?: () => void;
  /** Invoked when a page with the `openFirstDayOfMonth` CTA is confirmed. */
  onOpenFirstDayOfMonth?: () => void;
  /** Invoked when a page with the `openExcelExport` CTA is confirmed. */
  onOpenExcelExport?: () => void;
}

const MODAL_HORIZONTAL = 16;
const PANEL_PADDING = 18;

function withColorAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function resolveAccentColor(
  page: FeatureAnnouncementPage,
  colors: ReturnType<typeof useThemeColors>,
) {
  switch (page.accent) {
    case 'success':
      return colors.success;
    case 'warning':
      return colors.accent;
    case 'error':
      return colors.error;
    case 'lavender':
      return colors.lavender;
    case 'sky':
      return colors.sky;
    case 'primary':
    default:
      return colors.primary;
  }
}

function visualToKind(visual: FeatureAnnouncementPage['visual']): WidgetShowcaseKind {
  switch (visual) {
    case 'quickAdd':
      return 'quickAdd';
    case 'weekly':
      return 'weekly';
    case 'calendar':
      return 'calendar';
    case 'savings':
      return 'savings';
    case 'savingsHistory':
      return 'savingsHistory';
    case 'monthly':
    default:
      return 'monthly';
  }
}

export function FeatureAnnouncementModal({
  announcement,
  visible,
  onDismiss,
  onOpenShareEarn,
  onOpenQuickEntrySettings,
  onOpenAutoLog,
  onOpenFirstDayOfMonth,
  onOpenExcelExport,
}: FeatureAnnouncementModalProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    if (visible) {
      setPageIndex(0);
    }
  }, [announcement?.id, visible]);

  const page = announcement?.pages[pageIndex] ?? null;
  const pageCount = announcement?.pages.length ?? 0;
  const isLastPage = pageIndex >= pageCount - 1;
  const accentColor = useMemo(
    () => (page ? resolveAccentColor(page, colors) : colors.primary),
    [colors, page],
  );

  if (!announcement || !page) {
    return null;
  }

  // Match the dev preview width so the calendar grid renders full (7 columns,
  // all rows, income + expense) instead of being squished.
  const showcaseWidth = Math.min(338, windowWidth - MODAL_HORIZONTAL * 2 - PANEL_PADDING * 2);

  // A page CTA is only live when its handler is wired — otherwise the page
  // falls back to the normal Done/Next flow.
  const ctaHandlers: Record<
    NonNullable<FeatureAnnouncementPage['cta']>,
    (() => void) | undefined
  > = {
    openShareEarn: onOpenShareEarn,
    openQuickEntrySettings: onOpenQuickEntrySettings,
    openAutoLog: onOpenAutoLog,
    openFirstDayOfMonth: onOpenFirstDayOfMonth,
    openExcelExport: onOpenExcelExport,
  };
  const activeCta = page.cta ?? null;
  const ctaHandler = activeCta ? ctaHandlers[activeCta] : undefined;
  // On the last page the CTA *is* the primary button. On an earlier page it sits
  // above the footer instead, so Next still advances the pager.
  const ctaIsPrimary = isLastPage && !!ctaHandler;
  const secondaryCta = !isLastPage && ctaHandler ? activeCta : null;

  const handleCta = () => {
    if (!activeCta || !ctaHandler) return;
    void triggerHaptic('selection');
    onDismiss();
    ctaHandler();
  };

  const handlePrevious = () => {
    if (pageIndex <= 0) return;
    void triggerHaptic('selection');
    setPageIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    void triggerHaptic('selection');
    if (isLastPage) {
      onDismiss();
      return;
    }
    setPageIndex((prev) => Math.min(pageCount - 1, prev + 1));
  };

  return (
    <ThemeModal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onDismiss}
    >
      <View
        className="flex-1 justify-end bg-black/50 px-4"
        style={{ paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }}
      >
        <View className="overflow-hidden rounded-[30px] border border-border/30 bg-background shadow-float">
          {/* Hero panel — progress dots and the real widget preview sit on the
              tinted panel so there is no white bar at the top. */}
          <View style={[styles.panel, { backgroundColor: withColorAlpha(accentColor, 0.1) }]}>
            {pageCount > 1 ? (
              <View style={styles.dotsRow}>
                {announcement.pages.map((item, index) => (
                  <View
                    key={item.key}
                    style={[
                      styles.dot,
                      {
                        width: index === pageIndex ? 18 : 7,
                        backgroundColor:
                          index === pageIndex ? accentColor : withColorAlpha(colors.text, 0.16),
                      },
                    ]}
                  />
                ))}
              </View>
            ) : null}
            <View style={styles.showcaseSlot}>
              {page.visual === 'goals' ? (
                <GoalsShowcase width={Math.round(showcaseWidth * 0.92)} />
              ) : page.visual === 'financialMonth' ? (
                <FinancialMonthShowcase width={Math.round(showcaseWidth * 0.92)} />
              ) : page.visual === 'excelExport' ? (
                <ExcelExportShowcase width={Math.round(showcaseWidth * 0.92)} />
              ) : page.visual === 'voice' ? (
                <VoiceShowcase width={Math.round(showcaseWidth * 0.84)} />
              ) : page.visual === 'shareEarn' ? (
                <ShareEarnShowcase width={Math.round(showcaseWidth * 0.9)} />
              ) : page.visual === 'albums' ? (
                <AlbumShowcase width={Math.round(showcaseWidth * 0.92)} />
              ) : page.visual === 'budget' ? (
                <BudgetShowcase width={Math.round(showcaseWidth * 0.92)} />
              ) : page.visual === 'items' ? (
                <ItemsShowcase width={Math.round(showcaseWidth * 0.92)} />
              ) : page.visual === 'receiptSplit' ? (
                <ReceiptSplitShowcase width={Math.round(showcaseWidth * 0.88)} />
              ) : page.visual === 'addSplitSelector' ? (
                <AddSplitShowcase width={Math.round(showcaseWidth * 0.92)} />
              ) : page.visual === 'autoLog' ? (
                <AutoLogShowcase width={Math.round(showcaseWidth * 0.9)} />
              ) : page.visual === 'accountLogos' ? (
                <AccountLogoShowcase width={Math.round(showcaseWidth * 0.9)} />
              ) : page.visual === 'multiCurrency' ? (
                <MultiCurrencyShowcase width={Math.round(showcaseWidth * 0.92)} />
              ) : page.visual === 'redesign' ? (
                <RedesignShowcase width={Math.round(showcaseWidth * 0.92)} />
              ) : page.visual === 'appLock' ? (
                <AppLockShowcase width={Math.round(showcaseWidth * 0.72)} />
              ) : (
                <WidgetShowcase
                  kind={visualToKind(page.visual)}
                  width={showcaseWidth}
                  hidePro={page.hidePro}
                />
              )}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={I18n.t('common.close')}
            onPress={onDismiss}
            hitSlop={8}
            style={[
              styles.closeBtn,
              { backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.08) },
            ]}
          >
            <X size={17} color={colors.textSoft} />
          </Pressable>

          <View style={styles.body}>
            <View style={styles.textArea}>
              <Text variant="heading" style={{ color: colors.text }}>
                {announcementPageTitle(announcement, page)}
              </Text>
              <Text variant="friendly" tone="muted" className="mt-2">
                {announcementPageBody(announcement, page)}
              </Text>
            </View>

            {secondaryCta ? (
              <Pressable
                accessibilityRole="button"
                onPress={handleCta}
                style={[
                  styles.secondaryCta,
                  {
                    backgroundColor: withColorAlpha(accentColor, 0.12),
                    borderColor: withColorAlpha(accentColor, 0.24),
                  },
                ]}
                className="active:opacity-80"
              >
                <Text variant="bodyStrong" numberOfLines={1} style={{ color: accentColor }}>
                  {announcementCtaLabel(secondaryCta)}
                </Text>
                <ArrowRight size={16} color={accentColor} />
              </Pressable>
            ) : null}

            <View style={[styles.footer, secondaryCta ? styles.footerWithCta : null]}>
              {pageIndex > 0 ? (
                <Button variant="ghost" size="sm" className="flex-1" onPress={handlePrevious}>
                  <Text>{I18n.t('common.back')}</Text>
                </Button>
              ) : null}
              <FatButton
                className="flex-[2]"
                color={accentColor}
                label={
                  ctaIsPrimary
                    ? announcementCtaLabel(activeCta!)
                    : isLastPage
                      ? I18n.t('common.done')
                      : I18n.t('common.next')
                }
                onPress={ctaIsPrimary ? handleCta : handleNext}
              />
            </View>
          </View>
        </View>
      </View>
    </ThemeModal>
  );
}

const styles = StyleSheet.create({
  dotsRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 6,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    height: 32,
    width: 32,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  panel: {
    paddingHorizontal: PANEL_PADDING,
    paddingTop: 18,
    paddingBottom: 18,
  },
  showcaseSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 22,
  },
  textArea: {
    minHeight: 84,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
  },
  footerWithCta: {
    marginTop: 10,
  },
  secondaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 18,
  },
  toggleIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    flex: 1,
    minWidth: 0,
  },
  dot: {
    height: 7,
    borderRadius: 999,
  },
});
