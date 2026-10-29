import {
  Check,
  CircleAlert,
  Crown,
  Info,
  type LucideIcon,
  PauseCircle,
  ShieldCheck,
  Users,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Card,
  CategoryEmoji,
  FatButton,
  LoadingDots,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useCloudSync, useCloudSyncEnabled } from '~/features/cloudSync/CloudSyncContext';
import { KeepDataChoice } from '~/features/cloudSync/components/KeepDataChoice';
import { SignedOutView } from '~/features/cloudSync/components/SignedOutView';
import { type InvitePreview, previewInvite } from '~/features/cloudSync/services/sharedLedgersApi';
import { ledgerDisplayName } from '~/features/ledgers/lib/ledgerDisplay';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { withColorAlpha } from '~/utils/color';

import { SharedLedgerHero } from '../components/SharedLedgerHero';
import { useSharedLedgers } from '../hooks/useSharedLedgers';
import { sharingErrorMessage } from '../lib/sharing';

interface JoinLedgerScreenProps {
  code: string;
  onClose: () => void;
  /** After joining: the ledger is open, go to the app. */
  onJoined: () => void;
}

/**
 * Where an invite link lands: what the ledger is and who shares it, a sign-in
 * if needed (anyone can join, Pro or not), then Join.
 */
export function JoinLedgerScreen({ code, onClose, onJoined }: JoinLedgerScreenProps) {
  const enabled = useCloudSyncEnabled();
  const sync = useCloudSync();
  const { ledgers, switchLedger } = useApp();
  const sharedLedgers = useSharedLedgers();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    previewInvite(code)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(sharingErrorMessage(e, 'join'));
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const join = async () => {
    if (joining) return;
    setError(null);
    setJoining(true);
    try {
      const ledgerId = await sync.joinLedger(code);
      void triggerHaptic('success');
      switchLedger(ledgerId);
      onJoined();
    } catch (e) {
      setError(sharingErrorMessage(e, 'join'));
      setJoining(false);
    }
  };

  const signedIn = sync.user !== null && sync.status !== 'signedOut';
  // The invited ledger is already on this phone: the user's own (sharing it
  // from here or another phone of theirs), or one they already joined.
  const here = preview?.ledgerId ? (ledgers.find((l) => l.id === preview.ledgerId) ?? null) : null;
  const hereRole = here
    ? (sharedLedgers.find((l) => l.ledgerId === here.id)?.role ?? 'owner')
    : null;

  let action: React.ReactNode;
  if (!enabled) {
    action = <Callout icon={Info} text={I18n.t('shared_ledgers.join_unavailable')} />;
  } else if (!preview) {
    action = null;
  } else if (here && hereRole) {
    action = (
      <View className="gap-3">
        <Callout
          icon={hereRole === 'owner' ? Crown : Check}
          text={
            hereRole === 'owner'
              ? I18n.t('shared_ledgers.join_own')
              : I18n.t('shared_ledgers.join_already')
          }
        />
        <FatButton
          label={I18n.t('shared_ledgers.open_ledger', { name: ledgerDisplayName(here) })}
          onPress={() => {
            switchLedger(here.id);
            onJoined();
          }}
        />
      </View>
    );
  } else if (!preview.active) {
    action = <Callout icon={PauseCircle} text={I18n.t('shared_ledgers.join_paused')} />;
  } else if (preview.full) {
    action = <Callout icon={Users} text={I18n.t('shared_ledgers.join_full')} />;
  } else if (sync.status === 'loading' || sync.status === 'linking') {
    action = (
      <View className="items-center py-4">
        <LoadingDots />
      </View>
    );
  } else if (sync.status === 'needsChoice' && sync.choice) {
    // A Pro user signing in here first settles their own data, as on the Cloud Sync screen.
    action = <KeepDataChoice choice={sync.choice} />;
  } else if (!signedIn) {
    action = (
      <View className="gap-2">
        <Text variant="body" tone="muted" className="text-center">
          {I18n.t('shared_ledgers.join_sign_in')}
        </Text>
        <SignedOutView hideHero />
      </View>
    );
  } else {
    action = (
      <View className="gap-3">
        <FatButton
          label={I18n.t('shared_ledgers.join_button', { name: preview.name })}
          loading={joining}
          onPress={() => void join()}
        />
        {sync.user?.email ? <IdentityRow email={sync.user.email} /> : null}
        <Callout icon={ShieldCheck} text={I18n.t('shared_ledgers.join_note')} tinted />
      </View>
    );
  }

  return (
    <SettingsPageLayout>
      <SettingsHeader title={I18n.t('shared_ledgers.join_title')} onBack={onClose} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
          paddingTop: 4,
          paddingBottom: insets.bottom + 24,
          gap: 20,
        }}
      >
        <SharedLedgerHero icon={null} />
        {preview ? (
          <Card className="items-center gap-2 px-5 py-6">
            <View className="h-[72px] w-[72px] items-center justify-center rounded-full bg-primary/10">
              <CategoryEmoji icon={preview.emoji} size={38} />
            </View>
            <Text variant="title" className="mt-1 text-center" numberOfLines={2}>
              {preview.name}
            </Text>
            <Text variant="body" tone="muted" className="text-center">
              {I18n.t('shared_ledgers.join_from', { owner: preview.ownerName })}
            </Text>
            <View className="mt-1 flex-row items-center gap-1.5 rounded-full bg-secondary/60 px-3 py-1.5">
              <Users size={14} color={colors.textMuted} />
              <Text variant="caption" tone="muted">
                {I18n.t(
                  preview.memberCount + 1 === 1
                    ? 'shared_ledgers.people_one'
                    : 'shared_ledgers.people_other',
                  { count: preview.memberCount + 1 },
                )}
              </Text>
            </View>
          </Card>
        ) : error ? null : (
          // The card's place while the invite is read, so nothing jumps.
          <Card className="items-center justify-center px-5" style={{ minHeight: 196 }}>
            <LoadingDots accessibilityLabel={I18n.t('common.loading')} />
          </Card>
        )}
        {error ? <Callout icon={CircleAlert} text={error} tone="error" /> : null}
        {action}
      </ScrollView>
    </SettingsPageLayout>
  );
}

/** Who is joining: the signed-in account, on one line. */
function IdentityRow({ email }: { email: string }) {
  const initial = email.trim().charAt(0).toUpperCase() || '?';
  return (
    <Card className="flex-row items-center gap-3 px-4 py-3">
      <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10">
        <Text variant="bodyStrong" tone="primary">
          {initial}
        </Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="caption" tone="muted">
          {I18n.t('shared_ledgers.joining_as')}
        </Text>
        <Text variant="bodyStrong" numberOfLines={1}>
          {email}
        </Text>
      </View>
    </Card>
  );
}

/** A short note with its icon, in a soft box: one idea, not a line of grey text. */
function Callout({
  icon: Icon,
  text,
  tinted = false,
  tone,
}: {
  icon: LucideIcon;
  text: string;
  tinted?: boolean;
  tone?: 'error';
}) {
  const colors = useThemeColors();
  const accent = tone === 'error' ? colors.error : colors.primary;
  return (
    <View
      className="flex-row items-center gap-3 rounded-3xl border px-4 py-3.5"
      style={{
        backgroundColor: withColorAlpha(accent, tinted || tone ? 0.08 : 0.04),
        borderColor: withColorAlpha(accent, 0.16),
      }}
    >
      <View
        className="h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: withColorAlpha(accent, 0.14) }}
      >
        <Icon size={18} color={accent} />
      </View>
      <Text variant="body" tone={tone} className="flex-1">
        {text}
      </Text>
    </View>
  );
}
