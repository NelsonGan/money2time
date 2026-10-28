import { Link2, LogOut, UserMinus, UserPlus, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, View } from 'react-native';

import {
  Button,
  Card,
  CategoryEmoji,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useIsPro } from '~/context/ProContext';
import { useCloudSync } from '~/features/cloudSync/CloudSyncContext';
import {
  cancelInvite,
  createInvite,
  getLedgerMembers,
  type LedgerMembers,
  removeMember,
} from '~/features/cloudSync/services/sharedLedgersApi';
import { ledgerDisplayName, ledgerIcon } from '~/features/ledgers/lib/ledgerDisplay';
import { useThemeColors } from '~/hooks/useThemeColors';
import { DEFAULT_LEDGER_ID } from '~/lib/db/ledgerScope';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';

import { SharedLedgerHero } from '../components/SharedLedgerHero';
import { useSharedLedger, useSharedLedgers } from '../hooks/useSharedLedgers';
import { MAX_MEMBERS, MAX_SHARED_LEDGERS, sharingErrorMessage } from '../lib/sharing';

interface LedgerSharingScreenProps {
  ledgerId: string;
  onBack: () => void;
  onOpenCloudSync: () => void;
  onOpenProPaywall: (source: string) => void;
}

/**
 * One ledger's sharing. The owner shares it, invites people with links,
 * removes them, or stops sharing; a member sees who is in it and can leave.
 */
export function LedgerSharingScreen({
  ledgerId,
  onBack,
  onOpenCloudSync,
  onOpenProPaywall,
}: LedgerSharingScreenProps) {
  const { ledgers } = useApp();
  const sync = useCloudSync();
  const isPro = useIsPro();
  const colors = useThemeColors();
  const bottomInset = useSettingsBottomNavInset();
  const shared = useSharedLedger(ledgerId);
  const ownedCount = useSharedLedgers().filter((l) => l.role === 'owner').length;
  const ledger = ledgers.find((l) => l.id === ledgerId) ?? null;
  const name = ledger ? ledgerDisplayName(ledger) : (shared?.name ?? '');

  const [members, setMembers] = useState<LedgerMembers | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Left the ledger, or it was deleted: nothing to show. Once.
  const leftRef = useRef(false);
  useEffect(() => {
    if (ledger || leftRef.current) return;
    leftRef.current = true;
    onBack();
  }, [ledger, onBack]);

  const shareId = shared?.shareId ?? null;
  const { getSessionToken } = sync;
  const load = useCallback(async () => {
    if (!shareId) return;
    try {
      setMembers(await getLedgerMembers(await getSessionToken(), shareId));
      setLoadError(null);
    } catch (error) {
      setLoadError(sharingErrorMessage(error));
    }
  }, [getSessionToken, shareId]);

  useEffect(() => {
    setMembers(null);
    void load();
  }, [load]);

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try {
      await work();
    } catch (error) {
      Alert.alert(sharingErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const share = () => {
    if (!ledger) return;
    if (!isPro) {
      onOpenProPaywall('ledger_share');
      return;
    }
    if (sync.status !== 'ready') {
      onOpenCloudSync();
      return;
    }
    void triggerHaptic('selection');
    void run('share', async () => {
      await sync.shareLedger({ id: ledger.id, name, emoji: ledger.emoji });
      void triggerHaptic('success');
    });
  };

  const invite = () => {
    if (!shareId || !ledger) return;
    void triggerHaptic('selection');
    void run('invite', async () => {
      const created = await createInvite(await sync.getSessionToken(), shareId, {
        name,
        emoji: ledger.emoji,
      });
      void trackEvent(AnalyticsEvents.SHARED_LEDGER_INVITE_CREATED);
      await load();
      await Share.share({
        message: I18n.t('shared_ledgers.invite_message', { name, url: created.url }) ?? created.url,
      });
    });
  };

  const confirmRemove = (member: { id: string; name: string }) => {
    void triggerHaptic('warning');
    Alert.alert(
      I18n.t('shared_ledgers.remove_title', { name: member.name }),
      I18n.t('shared_ledgers.remove_message', { name: member.name, ledger: name }),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('shared_ledgers.remove'),
          style: 'destructive',
          onPress: () =>
            void run(`remove:${member.id}`, async () => {
              if (!shareId) return;
              await removeMember(await sync.getSessionToken(), shareId, member.id);
              void trackEvent(AnalyticsEvents.SHARED_LEDGER_MEMBER_REMOVED);
              await load();
            }),
        },
      ],
    );
  };

  const cancel = (inviteId: string) => {
    void triggerHaptic('selection');
    void run(`invite:${inviteId}`, async () => {
      if (!shareId) return;
      await cancelInvite(await sync.getSessionToken(), shareId, inviteId);
      await load();
    });
  };

  const confirmStop = () => {
    void triggerHaptic('warning');
    Alert.alert(
      I18n.t('shared_ledgers.stop_title', { name }),
      I18n.t('shared_ledgers.stop_message'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('shared_ledgers.stop_sharing'),
          style: 'destructive',
          onPress: () =>
            void run('stop', async () => {
              await sync.stopSharingLedger(ledgerId);
              void triggerHaptic('success');
            }),
        },
      ],
    );
  };

  const confirmLeave = () => {
    void triggerHaptic('warning');
    Alert.alert(
      I18n.t('shared_ledgers.leave_title', { name }),
      I18n.t('shared_ledgers.leave_message', { owner: shared?.ownerName ?? '' }),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('shared_ledgers.leave'),
          style: 'destructive',
          onPress: () => void run('leave', () => sync.leaveLedger(ledgerId)),
        },
      ],
    );
  };

  const isOwner = shared?.role === 'owner';
  const seatsTaken = (members?.members.length ?? 0) + (members?.invites.length ?? 0);
  const maxMembers = members?.maxMembers ?? MAX_MEMBERS;
  const full = seatsTaken >= maxMembers;

  let body: React.ReactNode;
  if (!shared) {
    const atLimit = ownedCount >= MAX_SHARED_LEDGERS;
    const needsSync = sync.status !== 'ready';
    body = (
      <View className="gap-4">
        <SharedLedgerHero icon={ledger ? ledgerIcon(ledger) : null} />
        <View className="items-center gap-2 px-2">
          <Text variant="title" className="text-center">
            {I18n.t('shared_ledgers.intro_title')}
          </Text>
          <Text variant="body" tone="muted" className="text-center">
            {I18n.t('shared_ledgers.intro_body', { name })}
          </Text>
        </View>
        <Card className="gap-3 px-4 py-4">
          <IntroPoint text={I18n.t('shared_ledgers.point_members', { max: MAX_MEMBERS })} />
          <IntroPoint text={I18n.t('shared_ledgers.point_private')} />
          <IntroPoint text={I18n.t('shared_ledgers.point_control')} />
        </Card>
        {ledgerId === DEFAULT_LEDGER_ID ? (
          <Text variant="caption" tone="muted" className="text-center">
            {I18n.t('shared_ledgers.default_not_shareable')}
          </Text>
        ) : (
          <>
            <Button
              testID="ledger-share"
              onPress={share}
              disabled={busy !== null || (atLimit && isPro)}
            >
              {busy === 'share' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text>{I18n.t('shared_ledgers.share_button', { name })}</Text>
              )}
            </Button>
            {atLimit && isPro ? (
              <Text variant="caption" tone="muted" className="text-center">
                {I18n.t('shared_ledgers.limit_reached', { max: MAX_SHARED_LEDGERS })}
              </Text>
            ) : isPro && needsSync ? (
              <Text variant="caption" tone="muted" className="text-center">
                {I18n.t('shared_ledgers.needs_cloud_sync')}
              </Text>
            ) : null}
          </>
        )}
      </View>
    );
  } else {
    body = (
      <View className="gap-4">
        <View className="items-center gap-2 pt-2">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-secondary/60">
            <CategoryEmoji icon={ledger ? ledgerIcon(ledger) : null} size={42} />
          </View>
          <Text variant="subheading" className="text-center">
            {name}
          </Text>
          <Text variant="caption" tone="muted" className="text-center">
            {isOwner
              ? I18n.t('shared_ledgers.owner_note')
              : I18n.t('shared_ledgers.member_note', { owner: shared.ownerName ?? '' })}
          </Text>
        </View>

        {!shared.active ? (
          <Card className="gap-1 border-warning/30 bg-warning/10 px-4 py-3.5">
            <Text variant="bodyStrong">{I18n.t('shared_ledgers.paused_title')}</Text>
            <Text variant="caption" tone="muted">
              {isOwner
                ? I18n.t('shared_ledgers.paused_owner_body')
                : I18n.t('shared_ledgers.paused_body', {
                    owner: shared.ownerName ?? '',
                    name,
                  })}
            </Text>
          </Card>
        ) : null}

        <View>
          <View className="mb-2.5 flex-row items-center justify-between px-1">
            <Text variant="label" tone="muted">
              {I18n.t('shared_ledgers.people')}
            </Text>
            {isOwner && members ? (
              <Text variant="label" tone="muted">
                {I18n.t('shared_ledgers.seats', { count: seatsTaken, max: maxMembers })}
              </Text>
            ) : null}
          </View>
          <Card className="overflow-hidden">
            {members ? (
              <>
                <PersonRow
                  name={isOwner ? I18n.t('shared_ledgers.you') : members.owner.name}
                  initialOf={members.owner.name}
                  detail={I18n.t('shared_ledgers.owner_badge')}
                  first
                />
                {members.members.map((member) => (
                  <PersonRow
                    key={member.id}
                    name={member.id === sync.user?.id ? I18n.t('shared_ledgers.you') : member.name}
                    initialOf={member.name}
                    detail={member.email ?? I18n.t('shared_ledgers.member_badge')}
                    action={
                      isOwner ? (
                        <IconAction
                          label={I18n.t('shared_ledgers.remove_title', { name: member.name })}
                          busy={busy === `remove:${member.id}`}
                          onPress={() => confirmRemove(member)}
                          icon={<UserMinus size={18} color={colors.error} />}
                          testID={`ledger-member-remove-${member.id}`}
                        />
                      ) : null
                    }
                  />
                ))}
                {members.invites.map((pending) => (
                  <PersonRow
                    key={pending.id}
                    icon={<Link2 size={18} color={colors.textMuted} />}
                    name={I18n.t('shared_ledgers.pending_invite')}
                    detail={I18n.t('shared_ledgers.pending_expires', {
                      date: new Date(pending.expiresAt).toLocaleDateString(I18n.locale, {
                        month: 'short',
                        day: 'numeric',
                      }),
                    })}
                    muted
                    action={
                      <IconAction
                        label={I18n.t('shared_ledgers.cancel_invite')}
                        busy={busy === `invite:${pending.id}`}
                        onPress={() => cancel(pending.id)}
                        icon={<X size={18} color={colors.textMuted} />}
                        testID={`ledger-invite-cancel-${pending.id}`}
                      />
                    }
                  />
                ))}
              </>
            ) : (
              <View className="items-center px-4 py-6">
                {loadError ? (
                  <Pressable onPress={() => void load()} accessibilityRole="button">
                    <Text variant="caption" tone="muted" className="text-center">
                      {loadError}
                    </Text>
                  </Pressable>
                ) : (
                  <ActivityIndicator />
                )}
              </View>
            )}
          </Card>
        </View>

        {isOwner ? (
          <View className="gap-2">
            <Button
              testID="ledger-invite"
              onPress={invite}
              disabled={busy !== null || !members || full || !shared.active}
            >
              {busy === 'invite' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View className="flex-row items-center gap-2">
                  <UserPlus size={18} color="#fff" />
                  <Text>{I18n.t('shared_ledgers.invite')}</Text>
                </View>
              )}
            </Button>
            <Text variant="caption" tone="muted" className="text-center">
              {full
                ? I18n.t('shared_ledgers.full', { max: maxMembers })
                : I18n.t('shared_ledgers.invite_caption')}
            </Text>
          </View>
        ) : null}

        <Button
          variant="secondary"
          className="mt-2"
          testID={isOwner ? 'ledger-stop-sharing' : 'ledger-leave'}
          disabled={busy !== null}
          onPress={isOwner ? confirmStop : confirmLeave}
        >
          {busy === 'stop' || busy === 'leave' ? (
            <ActivityIndicator color={colors.error} />
          ) : (
            <View className="flex-row items-center gap-2">
              {isOwner ? null : <LogOut size={18} color={colors.error} />}
              <Text tone="error">
                {isOwner ? I18n.t('shared_ledgers.stop_sharing') : I18n.t('shared_ledgers.leave')}
              </Text>
            </View>
          )}
        </Button>
      </View>
    );
  }

  return (
    <SettingsPageLayout>
      <SettingsHeader title={I18n.t('shared_ledgers.title')} onBack={onBack} />
      <ScrollView
        contentContainerStyle={[
          { paddingHorizontal: SETTINGS_HORIZONTAL_PADDING, paddingTop: 4 },
          bottomInset,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {body}
      </ScrollView>
    </SettingsPageLayout>
  );
}

function IntroPoint({ text }: { text: string }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-start gap-3">
      <View className="mt-2 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.primary }} />
      <Text variant="body" className="flex-1">
        {text}
      </Text>
    </View>
  );
}

function PersonRow({
  name,
  initialOf,
  detail,
  icon,
  action,
  first,
  muted,
}: {
  name: string;
  /** The name the avatar letter comes from, when `name` says "You". */
  initialOf?: string;
  detail: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  first?: boolean;
  muted?: boolean;
}) {
  const initial = (initialOf ?? name).trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      className={`flex-row items-center gap-3 px-4 py-3 ${first ? '' : 'border-t border-border/30'}`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        {icon ?? (
          <Text variant="bodyStrong" tone="primary">
            {initial}
          </Text>
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="bodyStrong" tone={muted ? 'muted' : undefined} numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {detail}
        </Text>
      </View>
      {action}
    </View>
  );
}

function IconAction({
  label,
  icon,
  busy,
  onPress,
  testID,
}: {
  label: string;
  icon: React.ReactNode;
  busy: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      disabled={busy}
      hitSlop={6}
      className="h-10 w-10 items-center justify-center rounded-full active:bg-secondary/60"
    >
      {busy ? <ActivityIndicator /> : icon}
    </Pressable>
  );
}
