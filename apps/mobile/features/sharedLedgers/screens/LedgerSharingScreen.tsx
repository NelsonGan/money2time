import { LogOut, UserMinus, UserPlus } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, View } from 'react-native';

import { LoadingDots } from '~/components/feedback/LoadingDots';
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
import { CloudSyncApiError } from '~/features/cloudSync/services/cloudSyncApi';
import {
  getInviteLink,
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
import { confirmLeaveLedger } from '../lib/confirmLeave';
import { MAX_MEMBERS, MAX_SHARED_LEDGERS, sharingErrorMessage } from '../lib/sharing';

interface LedgerSharingScreenProps {
  ledgerId: string;
  onBack: () => void;
  onOpenCloudSync: () => void;
  onOpenProPaywall: (source: string) => void;
}

/**
 * One ledger's sharing. The owner shares it, invites people with its link
 * (one per ledger, reused for a day), removes them, or stops sharing; a
 * member sees who is in it and can leave.
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
  // The People list cannot be read: signed out (or the account is gone), or
  // the ledger is no longer shared. Each shows its own message, not an error.
  const [unreadable, setUnreadable] = useState<'signed_out' | 'gone' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Left the ledger, or it was deleted: nothing to show. Once.
  const leftRef = useRef(false);
  useEffect(() => {
    if (ledger || leftRef.current) return;
    leftRef.current = true;
    onBack();
  }, [ledger, onBack]);

  const shareId = shared?.shareId ?? null;
  const signedOut = sync.status === 'signedOut' || sync.status === 'unavailable';
  const { getSessionToken, refreshSharedLedgers } = sync;
  const load = useCallback(async () => {
    if (!shareId) return;
    if (signedOut) {
      setUnreadable('signed_out');
      return;
    }
    try {
      setMembers(await getLedgerMembers(await getSessionToken(), shareId));
      setLoadError(null);
      setUnreadable(null);
    } catch (error) {
      if (error instanceof CloudSyncApiError && error.code === 'unauthorized') {
        setUnreadable('signed_out');
      } else if (error instanceof CloudSyncApiError && error.code === 'not_found') {
        // The owner stopped sharing or deleted their account, or removed this
        // user: the list read lets the ledger go (a member's copy leaves the
        // phone, an owner keeps theirs as a private ledger).
        setUnreadable('gone');
        void refreshSharedLedgers().catch(() => undefined);
      } else {
        setLoadError(sharingErrorMessage(error));
      }
    }
  }, [getSessionToken, refreshSharedLedgers, shareId, signedOut]);

  useEffect(() => {
    setMembers(null);
    void load();
  }, [load]);

  // The paused state and member count come from the shared list, read at
  // most once a minute in the background: read it now, so the page never
  // opens on a stale "paused" after someone's Pro came back.
  useEffect(() => {
    if (signedOut || !shareId) return;
    void refreshSharedLedgers().catch(() => undefined);
  }, [refreshSharedLedgers, shareId, signedOut]);

  // Someone joined, left or was removed (the list read, often after a live
  // nudge, changed the count): show it without a trip back.
  const memberCount = shared?.memberCount;
  const loadRef = useRef(load);
  loadRef.current = load;
  const seenCountRef = useRef(memberCount);
  useEffect(() => {
    if (seenCountRef.current === memberCount) return;
    seenCountRef.current = memberCount;
    void loadRef.current();
  }, [memberCount]);

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
      // The same link until it expires, so anyone it was sent to can use it.
      const link = await getInviteLink(await sync.getSessionToken(), shareId, {
        name,
        emoji: ledger.emoji,
      });
      void trackEvent(AnalyticsEvents.SHARED_LEDGER_INVITE_CREATED);
      await Share.share({
        message: I18n.t('shared_ledgers.invite_message', { name, url: link.url }) ?? link.url,
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
              // Signed out (or the account was deleted on another phone):
              // stop here, and tell the Worker after the next sign-in.
              await sync.stopSharingLedger(ledgerId, {
                whenUnreachable: signedOut ? 'local' : 'fail',
              });
              void triggerHaptic('success');
            }),
        },
      ],
    );
  };

  const confirmLeave = () =>
    confirmLeaveLedger(
      name,
      shared?.ownerName ?? '',
      () =>
        void run('leave', async () => {
          await sync.leaveLedger(ledgerId);
          // An open ledger is only deleted back on the main screens; this page
          // has nothing left to show for it. Once, with the effect above.
          if (leftRef.current) return;
          leftRef.current = true;
          onBack();
        }),
    );

  const isOwner = shared?.role === 'owner';
  const seatsTaken = members?.members.length ?? 0;
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
                <LoadingDots color="#fff" size="small" />
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
        </View>

        {!shared.active ? (
          <Card className="gap-1 border-warning/30 bg-warning/10 px-4 py-3.5">
            <Text variant="bodyStrong">{I18n.t('shared_ledgers.paused_title')}</Text>
            <Text variant="caption" tone="muted">
              {isOwner && !isPro
                ? I18n.t('shared_ledgers.paused_owner_body')
                : I18n.t('shared_ledgers.paused_body', { name })}
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
              </>
            ) : (
              <View className="items-center px-4 py-6">
                {unreadable === 'signed_out' ? (
                  <Pressable
                    onPress={onOpenCloudSync}
                    accessibilityRole="button"
                    testID="ledger-people-sign-in"
                  >
                    <Text variant="caption" tone="muted" className="text-center">
                      {I18n.t('shared_ledgers.people_signed_out')}
                    </Text>
                    <Text variant="caption" tone="primary" className="mt-1 text-center">
                      {I18n.t('cloud_sync.title')}
                    </Text>
                  </Pressable>
                ) : unreadable === 'gone' ? (
                  <Text variant="caption" tone="muted" className="text-center">
                    {I18n.t('shared_ledgers.no_longer_shared')}
                  </Text>
                ) : loadError ? (
                  <Pressable onPress={() => void load()} accessibilityRole="button">
                    <Text variant="caption" tone="muted" className="text-center">
                      {loadError}
                    </Text>
                  </Pressable>
                ) : (
                  <LoadingDots />
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
              disabled={busy !== null || !members || full || !shared.active || signedOut}
            >
              {busy === 'invite' ? (
                <LoadingDots color="#fff" size="small" />
              ) : (
                <View className="flex-row items-center gap-2">
                  <UserPlus size={18} color="#fff" />
                  <Text>{I18n.t('shared_ledgers.invite')}</Text>
                </View>
              )}
            </Button>
            {full ? (
              <Text variant="caption" tone="muted" className="text-center">
                {I18n.t('shared_ledgers.full', { max: maxMembers })}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Button
          variant="secondary"
          className="-mt-1"
          testID={isOwner ? 'ledger-stop-sharing' : 'ledger-leave'}
          disabled={busy !== null}
          onPress={isOwner ? confirmStop : confirmLeave}
        >
          {busy === 'stop' || busy === 'leave' ? (
            <LoadingDots color={colors.error} size="small" />
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
      <SettingsHeader
        title={I18n.t('shared_ledgers.title')}
        // Who shares it and what everyone can do: on demand, not under the name.
        infoTooltip={
          shared
            ? isOwner
              ? I18n.t('shared_ledgers.owner_note')
              : I18n.t('shared_ledgers.member_note', { owner: shared.ownerName ?? '' })
            : undefined
        }
        onBack={onBack}
      />
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
      {busy ? <LoadingDots size="tiny" /> : icon}
    </Pressable>
  );
}
