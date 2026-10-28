import { Check, ShieldCheck, Smartphone, TriangleAlert } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { Button, FatButton, Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { withColorAlpha } from '~/utils/color';

import { type CloudSyncChoice, useCloudSync } from '../CloudSyncContext';
import { errorMessage, formatSyncedAt } from '../lib/messages';
import { CLOUD_SYNC_HAPPY_ART } from './art';

/** "Keep which data?": both the phone and the cloud copy have data. */
export function KeepDataChoice({ choice }: { choice: CloudSyncChoice }) {
  const sync = useCloudSync();
  const colors = useThemeColors();
  const [keep, setKeep] = useState<'cloud' | 'phone'>('cloud');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { lastSyncedAt, lastDeviceName } = choice.cloud;
  const cloudMeta =
    lastSyncedAt && lastDeviceName
      ? I18n.t('cloud_sync.choice_cloud_meta', {
          device: lastDeviceName,
          date: formatSyncedAt(lastSyncedAt),
        })
      : null;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await sync.resolveChoice(keep);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    await sync.signOut();
  };

  const NoteIcon = keep === 'cloud' ? ShieldCheck : TriangleAlert;

  return (
    <View className="gap-4 pt-2">
      <Text variant="title">{I18n.t('cloud_sync.choice_title')}</Text>

      <View style={styles.tileRow}>
        <ChoiceTile
          selected={keep === 'cloud'}
          onPress={() => setKeep('cloud')}
          art={<Image source={CLOUD_SYNC_HAPPY_ART} style={styles.art} accessible={false} />}
          title={I18n.t('cloud_sync.choice_cloud')}
          count={choice.cloud.transactions}
          meta={cloudMeta}
        />
        <ChoiceTile
          selected={keep === 'phone'}
          onPress={() => setKeep('phone')}
          art={
            <View style={styles.art}>
              <Smartphone size={44} color={colors.primary} strokeWidth={1.6} />
            </View>
          }
          title={I18n.t('cloud_sync.choice_phone')}
          count={choice.local.transactions}
          meta={null}
        />
      </View>

      <View className="flex-row items-center justify-center gap-2">
        <NoteIcon size={16} color={keep === 'cloud' ? colors.success : colors.error} />
        <Text variant="caption" tone="muted">
          {keep === 'cloud'
            ? I18n.t('cloud_sync.choice_cloud_note')
            : I18n.t('cloud_sync.choice_phone_note')}
        </Text>
      </View>

      {error ? (
        <Text variant="caption" tone="error" className="text-center">
          {error}
        </Text>
      ) : null}

      <FatButton
        color={colors.primary}
        label={keep === 'cloud' ? I18n.t('cloud_sync.use_cloud') : I18n.t('cloud_sync.use_phone')}
        disabled={busy}
        onPress={() => void confirm()}
      />
      {busy ? <ActivityIndicator /> : null}
      <Button variant="ghost" size="sm" disabled={busy} onPress={() => void cancel()}>
        <Text tone="muted">{I18n.t('cloud_sync.cancel_sign_out')}</Text>
      </Button>
    </View>
  );
}

function ChoiceTile({
  selected,
  onPress,
  art,
  title,
  count,
  meta,
}: {
  selected: boolean;
  onPress: () => void;
  art: React.ReactNode;
  title: string;
  count: number;
  meta: string | null;
}) {
  const colors = useThemeColors();
  const unit = I18n.t('cloud_sync.choice_transactions');
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={[title, `${count} ${unit}`, meta].filter(Boolean).join(', ')}
      onPress={() => {
        triggerHaptic('selection');
        onPress();
      }}
      style={[
        styles.tile,
        {
          backgroundColor: colors.card,
          borderColor: selected ? colors.primary : withColorAlpha(colors.text, 0.08),
          borderWidth: selected ? 2 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.radio,
          {
            borderColor: selected ? colors.primary : withColorAlpha(colors.text, 0.25),
            backgroundColor: selected ? colors.primary : 'transparent',
          },
        ]}
      >
        {selected ? <Check size={14} color={colors.card} strokeWidth={3} /> : null}
      </View>
      {art}
      <Text variant="bodyStrong" className="text-center">
        {title}
      </Text>
      <Text variant="display" className="text-center">
        {count.toLocaleString(I18n.locale)}
      </Text>
      <Text variant="caption" tone="muted" className="text-center">
        {unit}
      </Text>
      {meta ? (
        <Text variant="caption" tone="muted" className="mt-1 text-center" numberOfLines={2}>
          {meta}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tileRow: { flexDirection: 'row', gap: 12 },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 16,
  },
  art: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  radio: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
