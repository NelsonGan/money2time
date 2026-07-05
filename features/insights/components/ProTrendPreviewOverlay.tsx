import { Crown } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { Mascot } from '~/components/feedback/Mascot';
import { Button, Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { FONT } from '~/utils/fonts';

interface ProTrendPreviewOverlayProps {
  onUpgrade: () => void;
}

export function ProTrendPreviewOverlay({ onUpgrade }: ProTrendPreviewOverlayProps) {
  const tc = useThemeColors();

  // No reanimated `entering` animations or animated mascot here: this overlay is
  // rendered once per insights pager page (×3), and the whole insights tab mounts
  // hidden during the cold-start preload. Each entering animation / animated
  // shared value sets up worklets via `executeOnUIRuntimeSync` (a synchronous
  // JS↔UI-thread round-trip) at mount, which piled up in the launch commit and
  // stalled the JS thread — worst on the New-Architecture iOS simulator. A plain
  // static overlay commits cheaply.
  return (
    <View className="items-center justify-center px-8 py-16 relative overflow-hidden">
      <View
        className="absolute top-6 left-1/4 h-32 w-32 rounded-full"
        style={{ backgroundColor: tc.primary, opacity: 0.03 }}
      />
      <View
        className="absolute bottom-10 right-1/4 h-20 w-20 rounded-full"
        style={{ backgroundColor: tc.accent, opacity: 0.04 }}
      />

      <View className="w-[160px] h-[160px] rounded-full bg-primary/6 items-center justify-center">
        <Mascot size={150} animate={false} name="rich" />
      </View>

      <Text variant="heading" className="mt-5 text-center">
        {I18n.t('pro.trend_preview_title')}
      </Text>

      <Text variant="body" tone="muted" className="mt-2 max-w-[280px] text-center">
        {I18n.t('pro.trend_preview_message')}
      </Text>

      <Button
        onPress={onUpgrade}
        variant="warm"
        size="lg"
        className="mt-6 w-full shadow-warm-lg"
        haptic="medium"
      >
        <View className="flex-row items-center gap-2">
          <Crown size={16} color="#fff" fill="#fff" />
          <Text style={{ fontFamily: FONT.extrabold, fontWeight: '800', fontSize: 16 }}>
            {I18n.t('pro.trend_preview_cta')}
          </Text>
        </View>
      </Button>
    </View>
  );
}
