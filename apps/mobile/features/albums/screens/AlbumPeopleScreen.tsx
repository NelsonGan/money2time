import * as Clipboard from 'expo-clipboard';
import { Check, Copy, LogOut, Plus, RefreshCw, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';

import { LoadingDots } from '~/components/feedback/LoadingDots';
import {
  Button,
  Card,
  FormScrollView,
  Input,
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
  removeMember,
} from '~/features/cloudSync/services/sharedLedgersApi';
import { leaveAskingFirst } from '~/features/sharedLedgers/lib/confirmLeave';
import { ownDisplayName } from '~/features/sharedLedgers/lib/ledgerPeople';
import { sharingErrorMessage } from '~/features/sharedLedgers/lib/sharing';
import { PersonAvatar } from '~/features/transactions/components/PersonAvatar';
import { debtPartyKey } from '~/features/transactions/lib/debtParty';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import { newId } from '~/utils/id';

import { useAlbumGroup } from '../hooks/useAlbumGroup';
import { memberIsOnBill } from '../lib/albumGroup';
import {
  type AlbumGroupPerson,
  cleanPersonName,
  MAX_ALBUM_PEOPLE,
  type PeopleEditError,
  withPersonAdded,
  withPersonRemoved,
  withPersonRenamed,
} from '../lib/albumPeople';
import { listGroupExpenses } from '../services/albumGroupStore';

/** Albums one Pro user can share at a time, and people who can join one (the Worker's limits). */
const MAX_SHARED_ALBUMS = 3;
const MAX_ALBUM_JOINERS = 9;

interface AlbumPeopleScreenProps {
  albumId: string;
  onBack: () => void;
  onOpenCloudSync: () => void;
  onOpenProPaywall: (source: string) => void;
}

function editError(error: PeopleEditError): string | null {
  if (error === 'taken') return I18n.t('albums.people.name_taken');
  if (error === 'full') return I18n.t('albums.people.full', { max: MAX_ALBUM_PEOPLE });
  return null;
}

function albumSharingError(error: unknown): string {
  if (error instanceof CloudSyncApiError) {
    if (error.code === 'limit_reached') {
      return I18n.t('albums.share.limit', { max: MAX_SHARED_ALBUMS });
    }
    if (error.code === 'full') return I18n.t('albums.share.full', { max: MAX_ALBUM_JOINERS });
  }
  return sharingErrorMessage(error);
}

/**
 * Who an album is split with, and its sharing. The people are names on the
 * album until it is shared; then they are its group's members, some of them
 * people who joined with the album's link. The owner shares it, invites with
 * the link, removes people or stops; someone who joined says who they are and
 * can leave.
 */
export function AlbumPeopleScreen({
  albumId,
  onBack,
  onOpenCloudSync,
  onOpenProPaywall,
}: AlbumPeopleScreenProps) {
  const {
    albums,
    setAlbumPeople,
    addAlbumMember,
    renameAlbumMember,
    removeAlbumMember,
    claimAlbumMember,
  } = useApp();
  const sync = useCloudSync();
  const isPro = useIsPro();
  const colors = useThemeColors();
  const bottomInset = useSettingsBottomNavInset();
  const album = albums.find((item) => item.id === albumId) ?? null;
  const group = useAlbumGroup(album);
  const { share } = group;
  const shareId = share?.shareId ?? null;
  const isOwner = share?.role === 'owner';
  const signedOut = sync.status === 'signedOut' || sync.status === 'unavailable';

  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<InviteLink | null>(null);
  const [copied, setCopied] = useState(false);
  // The accounts in the share now, as the Worker lists them: someone who left
  // keeps their row and name, and reads as not joined again.
  const [joinedIds, setJoinedIds] = useState<Set<string> | null>(null);

  // The album was deleted: nothing to show. Once.
  const goneRef = useRef(false);
  useEffect(() => {
    if (album || goneRef.current) return;
    goneRef.current = true;
    onBack();
  }, [album, onBack]);

  const { getSessionToken } = sync;
  const ownerUserId = share?.ownerUserId ?? null;
  const loadJoined = useCallback(async () => {
    if (!shareId || signedOut) return;
    try {
      const listed = await getLedgerMembers(await getSessionToken(), shareId);
      setJoinedIds(
        new Set([...(ownerUserId ? [ownerUserId] : []), ...listed.members.map((m) => m.id)]),
      );
    } catch {
      // Offline: a member with an account reads as joined.
      setJoinedIds(null);
    }
  }, [getSessionToken, ownerUserId, shareId, signedOut]);
  useEffect(() => {
    void loadJoined();
  }, [loadJoined, share?.memberCount]);

  const canInvite = isOwner && !!share?.active && !signedOut;
  const albumName = album?.name ?? '';
  const linkRequestRef = useRef(0);
  const fetchLink = useCallback(
    async (rotate = false) => {
      if (!shareId) return;
      const request = ++linkRequestRef.current;
      const next = await getInviteLink(
        await getSessionToken(),
        shareId,
        { name: albumName, emoji: null },
        { rotate },
      );
      if (request === linkRequestRef.current) setLink(next);
    },
    [albumName, getSessionToken, shareId],
  );
  useEffect(() => {
    if (!canInvite) {
      setLink(null);
      return;
    }
    fetchLink().catch(() => undefined);
  }, [canInvite, fetchLink]);

  const run = async (key: string, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await work();
    } catch (error) {
      Alert.alert(albumSharingError(error));
    } finally {
      setBusy(null);
    }
  };

  if (!album) return <SettingsPageLayout>{null}</SettingsPageLayout>;

  const showEditError = (error: PeopleEditError | null) => {
    const message = error ? editError(error) : null;
    if (message) Alert.alert(message);
    return error === null;
  };

  const addPerson = () => {
    const name = newName;
    if (!name.trim()) return;
    void triggerHaptic('selection');
    if (share) {
      if (showEditError(addAlbumMember(album.id, name))) setNewName('');
      return;
    }
    const next = withPersonAdded(album.splitWith, name, newId());
    if (typeof next === 'string') {
      showEditError(next);
      return;
    }
    setAlbumPeople(album.id, next);
    setNewName('');
  };

  /** Ends a rename in the list: kept when the name changed and is free, else dropped. */
  const endRename = () => {
    if (!renaming) return;
    setRenaming(null);
    const name = cleanPersonName(renaming.name);
    const current = share
      ? group.members.find((member) => member.id === renaming.id)?.name
      : album.splitWith.find((person) => person.id === renaming.id)?.name;
    if (!name || name === current) return;
    if (share) {
      showEditError(renameAlbumMember(album.id, renaming.id, name));
      return;
    }
    const next = withPersonRenamed(album.splitWith, renaming.id, name);
    if (typeof next === 'string') showEditError(next);
    else setAlbumPeople(album.id, next);
  };

  const isJoined = (person: AlbumGroupPerson) => {
    if (!share || !person.joined) return false;
    const member = group.members.find((item) => item.id === person.id);
    return joinedIds && member?.userId ? joinedIds.has(member.userId) : person.joined;
  };

  const confirmRemove = (person: AlbumGroupPerson) => {
    if (!person.id) return;
    const id = person.id;
    void triggerHaptic('warning');
    const member = group.members.find((item) => item.id === id);
    if (share && member?.userId && isJoined(person)) {
      // Someone who joined: the owner takes them out of the share.
      if (!isOwner) return;
      Alert.alert(
        I18n.t('albums.people.remove_joined_title', { name: person.name }),
        I18n.t('albums.people.remove_joined_message'),
        [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          {
            text: I18n.t('common.remove'),
            style: 'destructive',
            onPress: () =>
              void run(`remove:${id}`, async () => {
                if (!shareId || !member.userId) return;
                await removeMember(await getSessionToken(), shareId, member.userId);
                setLink(null);
                void trackEvent(AnalyticsEvents.ALBUM_MEMBER_REMOVED);
                await loadJoined();
                fetchLink().catch(() => undefined);
              }),
          },
        ],
      );
      return;
    }
    // Someone still on a bill stays: said before asking, not after.
    if (share && memberIsOnBill(listGroupExpenses(share.ledgerId), id)) {
      Alert.alert(I18n.t('albums.people.remove_in_use', { name: person.name }));
      return;
    }
    Alert.alert(
      I18n.t('albums.people.remove_title', { name: person.name }),
      I18n.t('albums.people.remove_message'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.remove'),
          style: 'destructive',
          onPress: () => {
            if (!share) {
              setAlbumPeople(album.id, withPersonRemoved(album.splitWith, id));
            } else if (!removeAlbumMember(album.id, id)) {
              Alert.alert(I18n.t('albums.people.remove_in_use', { name: person.name }));
            }
          },
        },
      ],
    );
  };

  const toggleShare = (next: boolean) => {
    if (next) {
      if (!isPro) {
        onOpenProPaywall('album_share');
        return;
      }
      if (sync.status !== 'ready') {
        onOpenCloudSync();
        return;
      }
      void triggerHaptic('selection');
      void run('share', async () => {
        await sync.shareAlbum({ id: album.id, name: album.name });
        void triggerHaptic('success');
      });
      return;
    }
    void triggerHaptic('warning');
    Alert.alert(
      I18n.t('albums.share.stop_title', { name: album.name }),
      I18n.t('albums.share.stop_message'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('shared_ledgers.stop_sharing'),
          style: 'destructive',
          onPress: () =>
            void run('stop', async () => {
              // Also with no session or network: the Worker is told later.
              await sync.stopSharingLedger(album.id, { whenUnreachable: 'local' });
            }),
        },
      ],
    );
  };

  const confirmLeave = () => {
    void triggerHaptic('warning');
    Alert.alert(
      I18n.t('albums.share.leave_title', { name: album.name }),
      I18n.t('albums.share.leave_message'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('albums.share.leave'),
          style: 'destructive',
          onPress: () =>
            void run('leave', async () => {
              await leaveAskingFirst((opts) => sync.leaveLedger(album.id, opts), album.name);
            }),
        },
      ],
    );
  };

  const copyLink = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link.url);
    void triggerHaptic('success');
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const confirmNewLink = () => {
    Alert.alert(
      I18n.t('shared_ledgers.new_link_title'),
      I18n.t('shared_ledgers.new_link_message'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('shared_ledgers.new_link'),
          onPress: () => void run('link', () => fetchLink(true)),
        },
      ],
    );
  };

  // Joined, and not yet said who they are: nothing of the group reaches their
  // ledger until they do.
  const mustClaim = !!share && !group.self;
  const placeholders = group.members.filter((member) => !member.userId);
  const claim = (memberId: string | null) => {
    void triggerHaptic('success');
    claimAlbumMember(album.id, memberId, ownDisplayName() ?? '');
  };

  const canAdd = group.others.length < MAX_ALBUM_PEOPLE && !mustClaim;

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onBack}
        title={I18n.t('albums.people.title')}
      />
      <FormScrollView
        className="flex-1"
        contentContainerStyle={[
          { paddingHorizontal: SETTINGS_HORIZONTAL_PADDING, gap: 16 },
          bottomInset,
        ]}
      >
        {share && !share.active ? (
          <Card className="border-warning/30 bg-warning/10 px-4 py-3.5">
            <Text variant="caption">{I18n.t('albums.share.paused')}</Text>
          </Card>
        ) : null}

        {mustClaim ? (
          <Card className="gap-3 px-4 py-4">
            <View className="gap-1">
              <Text variant="bodyStrong">{I18n.t('albums.people.who_title')}</Text>
              <Text variant="caption" tone="muted">
                {I18n.t('albums.people.who_message')}
              </Text>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {placeholders.map((member) => (
                <Pressable
                  key={member.id}
                  onPress={() => claim(member.id)}
                  accessibilityRole="button"
                  className="flex-row items-center gap-2 rounded-full border border-border/40 bg-card py-1.5 pl-1.5 pr-3.5 active:opacity-70"
                >
                  <PersonAvatar name={member.name} partyKey={debtPartyKey(member.name)} size={26} />
                  <Text variant="bodyStrong">{member.name}</Text>
                </Pressable>
              ))}
            </View>
            <Button variant="secondary" onPress={() => claim(null)}>
              <Text>{I18n.t('albums.people.who_new')}</Text>
            </Button>
          </Card>
        ) : null}

        <View>
          <Text variant="label" tone="muted" className="mb-2.5 px-1">
            {I18n.t('albums.people.split_with')}
          </Text>
          <Card className="overflow-hidden p-0">
            {group.people.map((person, index) => {
              const joined = isJoined(person);
              // Someone who joined is the owner's to remove; a name is anyone's.
              const removable =
                !person.isSelf && !mustClaim && (!share || !joined || (isOwner && !!person.id));
              // In a shared album the user reads as the others see them, and
              // can change that name like anyone's.
              const name = person.isSelf && group.self ? group.self.name : person.name;
              return (
                <View
                  key={person.id ?? 'me'}
                  className={`flex-row items-center gap-3 px-4 py-3 ${index > 0 ? 'border-t border-border/15' : ''}`}
                >
                  <PersonAvatar
                    name={name}
                    partyKey={person.isSelf ? null : debtPartyKey(name)}
                    size={38}
                  />
                  {renaming && renaming.id === person.id ? (
                    // Renamed in place: Return or a tap elsewhere keeps it.
                    <View className="flex-1">
                      <Input
                        testID="album-person-rename"
                        value={renaming.name}
                        onChangeText={(text) => setRenaming({ id: renaming.id, name: text })}
                        autoFocus
                        selectTextOnFocus
                        autoCapitalize="words"
                        autoCorrect={false}
                        returnKeyType="done"
                        onBlur={endRename}
                      />
                    </View>
                  ) : (
                    <Pressable
                      className="flex-1"
                      disabled={!person.id || mustClaim}
                      onPress={() => person.id && setRenaming({ id: person.id, name })}
                      accessibilityRole="button"
                    >
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {name}
                      </Text>
                      {share ? (
                        <Text variant="caption" tone="muted">
                          {person.isSelf
                            ? I18n.t('albums.people.me_tag')
                            : joined
                              ? I18n.t('albums.people.joined')
                              : I18n.t('albums.people.not_joined')}
                        </Text>
                      ) : null}
                    </Pressable>
                  )}
                  {removable && renaming?.id !== person.id ? (
                    <Pressable
                      onPress={() => confirmRemove(person)}
                      accessibilityRole="button"
                      accessibilityLabel={`${I18n.t('common.remove')} ${name}`}
                      hitSlop={8}
                      className="h-8 w-8 items-center justify-center rounded-full bg-secondary/50 active:opacity-70"
                    >
                      <X size={15} color={colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            {canAdd ? (
              <View className="flex-row items-center gap-3 border-t border-border/15 px-4 py-2.5">
                <View className="h-[38px] w-[38px] items-center justify-center rounded-full bg-primary/15">
                  <Plus size={18} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Input
                    testID="album-person-name"
                    value={newName}
                    onChangeText={setNewName}
                    placeholder={I18n.t('albums.people.add_person')}
                    returnKeyType="done"
                    autoCapitalize="words"
                    autoCorrect={false}
                    onSubmitEditing={addPerson}
                    blurOnSubmit={false}
                  />
                </View>
                {newName.trim() ? (
                  <Pressable
                    onPress={addPerson}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('albums.people.add_person')}
                    className="h-9 items-center justify-center rounded-full bg-primary px-4 active:opacity-80"
                  >
                    <Text variant="label" className="text-primary-foreground">
                      {I18n.t('albums.people.add')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </Card>
          {!share ? (
            <Text variant="caption" tone="muted" className="mt-2 px-1">
              {I18n.t('albums.people.hint')}
            </Text>
          ) : null}
        </View>

        {!share || isOwner ? (
          <Card className="px-4 py-3.5">
            <View className="flex-row items-center gap-3">
              <View className="flex-1 gap-0.5">
                <Text variant="bodyStrong">{I18n.t('albums.share.row')}</Text>
                <Text variant="caption" tone="muted">
                  {I18n.t(
                    !share && isPro && sync.status !== 'ready'
                      ? 'albums.share.needs_cloud_sync'
                      : 'albums.share.caption',
                  )}
                </Text>
              </View>
              {busy === 'share' || busy === 'stop' ? (
                <LoadingDots size="small" />
              ) : (
                <Switch
                  testID="album-share-switch"
                  value={!!share}
                  onValueChange={toggleShare}
                  trackColor={{ false: undefined, true: colors.primary }}
                />
              )}
            </View>
          </Card>
        ) : null}

        {canInvite ? (
          <Card className="gap-2.5 px-4 py-3.5">
            <Text variant="bodyStrong">{I18n.t('shared_ledgers.invite_link')}</Text>
            <View className="flex-row items-center gap-2">
              <View className="flex-1 rounded-xl bg-secondary/40 px-3 py-2.5">
                {link ? (
                  <Text variant="caption" numberOfLines={1} selectable testID="album-invite-link">
                    {link.url.replace(/^https?:\/\//, '')}
                  </Text>
                ) : (
                  <LoadingDots size="small" />
                )}
              </View>
              <Pressable
                onPress={() => void copyLink()}
                disabled={!link}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.copy')}
                className="h-10 w-10 items-center justify-center rounded-xl bg-secondary/50 active:opacity-70"
              >
                {copied ? (
                  <Check size={17} color={colors.success} />
                ) : (
                  <Copy size={17} color={colors.textMuted} />
                )}
              </Pressable>
              <Pressable
                onPress={confirmNewLink}
                disabled={!link || busy !== null}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('shared_ledgers.new_link')}
                className="h-10 w-10 items-center justify-center rounded-xl bg-secondary/50 active:opacity-70"
              >
                <RefreshCw size={16} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text variant="caption" tone="muted">
              {I18n.t('albums.share.link_note')}
            </Text>
          </Card>
        ) : null}

        {share && !isOwner ? (
          <Button variant="secondary" onPress={confirmLeave} disabled={busy !== null}>
            <View className="flex-row items-center gap-2">
              <LogOut size={16} color={colors.error} />
              <Text className="text-destructive">{I18n.t('albums.share.leave')}</Text>
            </View>
          </Button>
        ) : null}
      </FormScrollView>
    </SettingsPageLayout>
  );
}
