import { ChevronDown, ChevronUp } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import { CLOUD_SYNC_FAQ_KEYS, type CloudSyncFaqKey } from '../lib/faq';

/** Cloud Sync screen: tap a question to read its answer. One open at a time. */
export function CloudSyncFaq() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View className="mt-6 gap-2.5" testID="cloud-sync-faq">
      <Text variant="label" tone="muted" className="px-1">
        {I18n.t('cloud_sync.faq.title')}
      </Text>
      <View className="overflow-hidden rounded-3xl border border-border/45 bg-card">
        {CLOUD_SYNC_FAQ_KEYS.map((key, index) => (
          <FaqItem
            key={key}
            id={key}
            first={index === 0}
            expanded={open === key}
            onToggle={() => {
              void triggerHaptic('selection');
              setOpen((current) => (current === key ? null : key));
            }}
          />
        ))}
      </View>
    </View>
  );
}

function FaqItem({
  id,
  first,
  expanded,
  onToggle,
}: {
  id: CloudSyncFaqKey;
  first: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const colors = useThemeColors();
  const question = I18n.t(`cloud_sync.faq.items.${id}.q`);
  return (
    <View className={first ? undefined : 'border-t border-border/30'}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={question}
        testID={`cloud-sync-faq-${id}`}
        className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-80"
      >
        <Text variant="bodyStrong" className="flex-1">
          {question}
        </Text>
        {expanded ? (
          <ChevronUp size={18} color={colors.textMuted} />
        ) : (
          <ChevronDown size={18} color={colors.textMuted} />
        )}
      </Pressable>
      {expanded ? (
        <Animated.View entering={FadeIn.duration(160)} className="px-4 pb-4">
          <Text variant="body" tone="muted">
            {I18n.t(`cloud_sync.faq.items.${id}.a`)}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
