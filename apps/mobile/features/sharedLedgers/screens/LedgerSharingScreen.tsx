import * as Clipboard from 'expo-clipboard';
import { Check, Copy, LogOut, RefreshCw, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, View } from 'react-native';

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
  type InviteLink,
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
import { confirmLeaveLedger, leaveAskingFirst } from '../lib/confirmLeave';
import { MAX_MEMBERS, MAX_SHARED_LEDGERS, sharingErrorMessage } from '../lib/sharing';

/**
 * The Worker replaces a link with less than an hour left when asked again, so
 * the page asks again by then: the link it shows always has time to run.
 */
const LINK_RENEW_MARGIN_MS = 60 * 60 * 1000;

interface LedgerSharingScreenProps {
  ledgerId: string;
  onBack: () => void;
  onOpenCloudSync: () => void;
  onOpenProPaywall: (source: string) => void;
}

/**
 * One ledger's sharing. The owner shares it, invites people with its link
 * (one per ledger, reused for a day, shown with Copy and New link), removes
 * them, or stops sharing; a member sees who is in it and can leave.
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
  const [link, setLink] = useState<InviteLink | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
              // The Worker retired the link: never show the dead one.
              setLink(null);
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
          if (!(await leaveAskingFirst((opts) => sync.leaveLedger(ledgerId, opts), name))) return;
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

  // The owner's link, shown on the page. Only while someone can use it: not
  // when the ledger is full or paused, or the owner is signed out.
  const canInvite = isOwner && !!shared?.active && !!members && !full && !signedOut;
  const emoji = ledger?.emoji ?? null;
  // Only the latest request may set the link: a plain read that started
  // before New link would otherwise put the dead link back when it lands last.
  const linkRequestRef = useRef(0);
  const fetchLink = useCallback(
    async (rotate = false) => {
      if (!shareId) throw new Error('not shared');
      const request = ++linkRequestRef.current;
      const next = await getInviteLink(
        await getSessionToken(),
        shareId,
        { name, emoji },
        { rotate },
      );
      if (request === linkRequestRef.current) {
        setLink(next);
        setLinkError(null);
      }
      return next;
    },
    [emoji, getSessionToken, name, shareId],
  );
  const fetchLinkRef = useRef(fetchLink);
  fetchLinkRef.current = fetchLink;

  // Read on open, and again when the seats change: a removal retires the link.
  useEffect(() => {
    if (!canInvite) {
      setLink(null);
      return;
    }
    fetchLinkRef.current().catch((error: unknown) => setLinkError(sharingErrorMessage(error)));
  }, [canInvite, seatsTaken]);

  // The one working link, always: renewed before its last hour on a timer
  // while the page is open, and read again on coming back to the app (timers
  // do not run in the background, and the owner's other phone may have made
  // a new link meanwhile).
  const linkExpiresAt = link?.expiresAt ?? null;
  useEffect(() => {
    if (linkExpiresAt === null) return;
    const renew = () => void fetchLinkRef.current().catch(() => undefined);
    const renewAt = linkExpiresAt - LINK_RENEW_MARGIN_MS;
    const timer = setTimeout(renew, Math.max(0, renewAt - Date.now()) + 1000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') renew();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [linkExpiresAt]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyLink = () => {
    if (!link) return;
    void Clipboard.setStringAsync(link.url);
    void triggerHaptic('success');
    void trackEvent(AnalyticsEvents.SHARED_LEDGER_INVITE_CREATED);
    setCopied(true);
  };

  const confirmNewLink = () => {
    void triggerHaptic('warning');
    Alert.alert(
      I18n.t('shared_ledgers.new_link_title'),
      I18n.t('shared_ledgers.new_link_message'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('shared_ledgers.new_link'),
          style: 'destructive',
          onPress: () =>
            void run('rotate', async () => {
              setCopied(false);
              await fetchLink(true);
              void trackEvent(AnalyticsEvents.SHARED_LEDGER_INVITE_RESET);
              void triggerHaptic('success');
            }),
        },
      ],
    );
  };

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
          <Card className="overflow-hidden p-0">
            {members ? (
              <>
                <PersonRow
                  name={isOwner ? I18n.t('shared_ledgers.you') : members.owner.name}
                  initialOf={members.owner.name}
                  badge={I18n.t('shared_ledgers.owner_badge')}
                  first
                />
                {members.members.map((member) => {
                  const isMe = member.id === sync.user?.id;
                  return (
                    <PersonRow
                      key={member.id}
                      name={isMe ? I18n.t('shared_ledgers.you') : member.name}
                      initialOf={member.name}
                      detail={member.email}
                      joinedAt={member.joinedAt}
                      action={
                        isOwner ? (
                          <IconAction
                            label={I18n.t('shared_ledgers.remove_title', { name: member.name })}
                            busy={busy === `remove:${member.id}`}
                            onPress={() => confirmRemove(member)}
                            icon={
                              <View className="h-7 w-7 items-center justify-center rounded-full bg-secondary">
                                <X size={14} strokeWidth={2.5} color={colors.textMuted} />
                              </View>
                            }
                            testID={`ledger-member-remove-${member.id}`}
                          />
                        ) : null
                      }
                    />
                  );
                })}
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

        {canInvite ? (
          <View>
            <Text variant="label" tone="muted" className="mb-2.5 px-1">
              {I18n.t('shared_ledgers.invite_link')}
            </Text>
            <Card className="flex-row items-center gap-1 py-2 pl-4 pr-2">
              <View className="min-w-0 flex-1 py-1.5">
                {link ? (
                  <Text
                    variant="body"
                    numberOfLines={1}
                    ellipsizeMode="middle"
                    selectable
                    testID="ledger-invite-link"
                  >
                    {link.url.replace(/^https?:\/\//, '')}
                  </Text>
                ) : linkError ? (
                  <Pressable
                    onPress={() =>
                      void fetchLink().catch((error: unknown) =>
                        setLinkError(sharingErrorMessage(error)),
                      )
                    }
                    accessibilityRole="button"
                  >
                    <Text variant="caption" tone="muted" numberOfLines={2}>
                      {linkError}
                    </Text>
                  </Pressable>
                ) : (
                  <LoadingDots size="small" />
                )}
              </View>
              <IconAction
                label={copied ? I18n.t('common.copied') : I18n.t('common.copy')}
                busy={false}
                disabled={!link || busy === 'rotate'}
                onPress={copyLink}
                icon={
                  copied ? (
                    <Check size={18} color={colors.primary} />
                  ) : (
                    <Copy size={18} color={colors.primary} />
                  )
                }
                testID="ledger-invite-copy"
              />
              <View className="mx-1 h-6 w-px bg-border/40" />
              <IconAction
                label={I18n.t('shared_ledgers.new_link')}
                busy={busy === 'rotate'}
                disabled={!link || busy !== null}
                onPress={confirmNewLink}
                icon={<RefreshCw size={18} color={colors.primary} />}
                testID="ledger-invite-new-link"
              />
            </Card>
          </View>
        ) : null}

        {isOwner && full ? (
          <Text variant="caption" tone="muted" className="text-center">
            {I18n.t('shared_ledgers.full', { max: maxMembers })}
          </Text>
        ) : null}

        <Button
          variant="secondary"
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

/** "Joined today", else "Joined Oct 28" (with the year when it is not this one). */
function joinedLabel(joinedAt: number, now = Date.now()): string {
  const date = new Date(joinedAt);
  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) return I18n.t('shared_ledgers.joined_today');
  const sameYear = date.getFullYear() === today.getFullYear();
  return I18n.t('shared_ledgers.joined_on', {
    date: date.toLocaleDateString(I18n.locale, {
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    }),
  });
}

function PersonRow({
  name,
  initialOf,
  badge,
  detail,
  joinedAt,
  action,
  first,
}: {
  name: string;
  /** The name the avatar letter comes from, when `name` says "You". */
  initialOf?: string;
  /** A small tag beside the name ("Owner"). */
  badge?: string;
  /** The address, shown to the owner only. */
  detail?: string | null;
  joinedAt?: number;
  action?: React.ReactNode;
  first?: boolean;
}) {
  const initial = (initialOf ?? name).trim().charAt(0).toUpperCase() || '?';
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      {/* Inset divider: starts at the text, not under the avatar. */}
      {first ? null : <View className="absolute left-[68px] right-0 top-0 h-px bg-border/30" />}
      <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Text variant="bodyStrong" tone="primary">
          {initial}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text variant="bodyStrong" numberOfLines={1} className="shrink">
            {name}
          </Text>
          {badge ? (
            <View className="rounded-full bg-secondary px-2 py-0.5">
              <Text variant="caption" tone="muted">
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        {detail ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
        {joinedAt ? (
          <Text variant="caption" tone="muted" numberOfLines={1} className="opacity-80">
            {joinedLabel(joinedAt)}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

function IconAction({
  label,
  icon,
  busy,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  icon: React.ReactNode;
  busy: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      disabled={busy || disabled}
      hitSlop={6}
      className="h-10 w-10 items-center justify-center rounded-full active:bg-secondary/60"
    >
      {busy ? <LoadingDots size="tiny" /> : icon}
    </Pressable>
  );
}
