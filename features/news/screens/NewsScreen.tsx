import { ChevronRight, Newspaper } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import { FeatureAnnouncementModal } from '../components/FeatureAnnouncementModal';
import {
  announcementTitle,
  type FeatureAnnouncement,
  getFeatureAnnouncementsNewestFirst,
} from '../featureAnnouncements';

interface NewsScreenProps {
  onBack: () => void;
  onOpenShareEarn?: () => void;
  onOpenQuickEntrySettings?: () => void;
  onOpenAutoLog?: () => void;
}

function formatAnnouncementDate(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);
  if (!year || !month || !day) return dateString;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function NewsScreen({
  onBack,
  onOpenShareEarn,
  onOpenQuickEntrySettings,
  onOpenAutoLog,
}: NewsScreenProps) {
  const colors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();
  const announcements = useMemo(() => getFeatureAnnouncementsNewestFirst(), []);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<FeatureAnnouncement | null>(
    null,
  );

  return (
    <SettingsPageLayout>
      <SettingsHeader className="px-5 pt-5 pb-3" onBack={onBack} title={I18n.t('settings.news')} />
      <ScrollView className="flex-1" contentContainerStyle={[styles.scrollContent, bottomNavInset]}>
        <View style={styles.contentBody}>
          <View style={styles.list}>
            {announcements.map((announcement) => (
              <Pressable
                key={announcement.id}
                accessibilityRole="button"
                onPress={() => {
                  void triggerHaptic('selection');
                  setSelectedAnnouncement(announcement);
                }}
                className="flex-row items-center gap-4 rounded-[24px] border border-border/30 bg-card px-4 py-4 shadow-soft active:scale-[0.98] active:opacity-90"
              >
                <View className="h-11 w-11 items-center justify-center rounded-2xl border border-primary/10 bg-primary/8">
                  <Newspaper size={18} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {announcementTitle(announcement)}
                  </Text>
                  <Text variant="caption" tone="muted" className="mt-0.5">
                    {formatAnnouncementDate(announcement.releaseDate)}
                  </Text>
                </View>
                <View className="h-7 w-7 items-center justify-center rounded-full bg-secondary/50">
                  <ChevronRight size={14} color={colors.textMuted} />
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      <FeatureAnnouncementModal
        announcement={selectedAnnouncement}
        visible={!!selectedAnnouncement}
        onDismiss={() => setSelectedAnnouncement(null)}
        onOpenShareEarn={onOpenShareEarn}
        onOpenQuickEntrySettings={onOpenQuickEntrySettings}
        onOpenAutoLog={onOpenAutoLog}
      />
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  contentBody: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  list: {
    gap: spacing.xs,
  },
});
