import * as Clipboard from 'expo-clipboard';
import { LogOut } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, View } from 'react-native';

import {
  Button,
  Card,
  FormScrollView,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useCloudSync } from '~/features/cloudSync/CloudSyncContext';
import { useSignedIn } from '~/features/cloudSync/components/SignInGate';
import {
  getInviteLink,
  getLedgerMembers,
  type InviteLink,
  removeMember,
} from '~/features/cloudSync/services/sharedLedgersApi';
import { leaveAskingFirst } from '~/features/sharedLedgers/lib/confirmLeave';
import { ownDisplayName } from '~/features/sharedLedgers/lib/ledgerPeople';
import { PersonAvatar } from '~/features/transactions/components/PersonAvatar';
import { debtPartyKey } from '~/features/transactions/lib/debtParty';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import { newId } from '~/utils/id';

import { AlbumSharingCard } from '../components/AlbumSharingCard';
import { SplitWithCard, type SplitWithRow } from '../components/SplitWithCard';
import { useAlbumGroup } from '../hooks/useAlbumGroup';
import { memberIsOnBill } from '../lib/albumGroup';
import { albumSharingMessage, peopleEditMessage } from '../lib/albumMessages';
import {
  type AlbumGroupPerson,
  MAX_ALBUM_PEOPLE,
  type PeopleEditError,
  withPersonAdded,
  withPersonRemoved,
  withPersonRenamed,
} from '../lib/albumPeople';
import {
  groupSimplifiesDebts,
  listGroupExpenses,
  subscribeAlbumGroups,
} from '../services/albumGroupStore';

interface AlbumPeopleScreenProps {
  albumId: string;
  onBack: () => void;
}

/**
 * Who an album is split with, and its sharing. The people are names on the
 * album until it is shared; then they are its group's members, some of them
 * people who joined with the album's link. The owner shares it, invites with
 * the link, removes people or stops; someone who joined says who they are and
 * can leave.
 */
export function AlbumPeopleScreen({ albumId, onBack }: AlbumPeopleScreenProps) {
  const {
    albums,
    setAlbumPeople,
    addAlbumMember,
    renameAlbumMember,
    removeAlbumMember,
    claimAlbumMember,
    setAlbumSimplifyDebts,
  } = useApp();
  const sync = useCloudSync();
  // Sharing is free and needs only an account: asked for under the switch.
  const signedIn = useSignedIn();
  const [wantsShare, setWantsShare] = useState(false);
  const colors = useThemeColors();
  const bottomInset = useSettingsBottomNavInset();
  const album = albums.find((item) => item.id === albumId) ?? null;
  const group = useAlbumGroup(album);
  const { share } = group;
  const shareId = share?.shareId ?? null;
  const isOwner = share?.role === 'owner';
  const signedOut = sync.status === 'signedOut' || sync.status === 'unavailable';
  const simplifies = useSyncExternalStore(subscribeAlbumGroups, () =>
    share ? groupSimplifiesDebts(share.ledgerId) : false,
  );

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

  const canInvite = isOwner && !signedOut;
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
      Alert.alert(albumSharingMessage(error));
    } finally {
      setBusy(null);
    }
  };

  // Share this album, asked for before signing in: done once signed in.
  const startShare = () => {
    if (!album) return;
    void run('share', async () => {
      await sync.shareAlbum({ id: album.id, name: album.name });
      void triggerHaptic('success');
    });
  };
  const startShareRef = useRef(startShare);
  startShareRef.current = startShare;
  useEffect(() => {
    if (!wantsShare || !signedIn) return;
    setWantsShare(false);
    startShareRef.current();
  }, [signedIn, wantsShare]);

  if (!album) return <SettingsPageLayout>{null}</SettingsPageLayout>;

  const showEditError = (error: PeopleEditError | null) => {
    const message = error ? peopleEditMessage(error) : null;
    if (message) Alert.alert(message);
    return error === null;
  };

  const addPerson = (name: string): boolean => {
    if (share) return showEditError(addAlbumMember(album.id, name));
    const next = withPersonAdded(album.splitWith, name, newId());
    if (typeof next === 'string') return showEditError(next);
    setAlbumPeople(album.id, next);
    return true;
  };

  const renamePerson = (id: string, name: string) => {
    if (share) {
      showEditError(renameAlbumMember(album.id, id, name));
      return;
    }
    const next = withPersonRenamed(album.splitWith, id, name);
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
      void triggerHaptic('selection');
      // With no account yet, the sign-in shows under the switch (a second
      // tap puts it away) and the album is shared once it is done.
      if (signedIn) startShare();
      else setWantsShare((wanted) => !wanted);
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
  // Joined, and not on the list yet: nothing here is theirs to change.
  const pending = !!share && !group.self;
  const placeholders = group.members.filter((member) => !member.userId);
  const claim = (memberId: string | null) => {
    void triggerHaptic('success');
    claimAlbumMember(album.id, memberId, ownDisplayName() ?? '');
  };

  const rows = group.people.map((person): SplitWithRow => {
    const joined = isJoined(person);
    return {
      id: person.id,
      // In a shared album the user reads as the others see them, and can
      // change that name like anyone's.
      name: person.isSelf && group.self ? group.self.name : person.name,
      isSelf: person.isSelf,
      caption: !share
        ? undefined
        : person.isSelf
          ? I18n.t('albums.people.me_tag')
          : joined
            ? I18n.t('albums.people.joined')
            : I18n.t('albums.people.not_joined'),
      renamable: !pending,
      // Someone who joined is the owner's to remove; a name is anyone's.
      removable: !person.isSelf && !pending && (!share || !joined || (isOwner && !!person.id)),
    };
  });

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onBack}
        title={I18n.t('albums.people.title')}
      />
      <FormScrollView
        className="flex-1"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          { paddingHorizontal: SETTINGS_HORIZONTAL_PADDING, gap: 16 },
          bottomInset,
        ]}
      >
        {group.mustClaim ? (
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
          <SplitWithCard
            rows={rows}
            canAdd={group.others.length < MAX_ALBUM_PEOPLE && !pending}
            onAdd={addPerson}
            onRename={renamePerson}
            onRemove={(row) => {
              const person = group.people.find((item) => item.id === row.id);
              if (person) confirmRemove(person);
            }}
          />
        </View>

        <AlbumSharingCard
          share={
            (share ? isOwner : group.canShare)
              ? {
                  value: !!share,
                  onChange: toggleShare,
                  busy: busy === 'share' || busy === 'stop',
                  signIn: !share && wantsShare && !signedIn,
                }
              : null
          }
          simplify={
            share && !pending
              ? {
                  value: simplifies,
                  onChange: (next) => {
                    void triggerHaptic('selection');
                    setAlbumSimplifyDebts(album.id, next);
                  },
                }
              : null
          }
          link={
            canInvite
              ? {
                  url: link?.url ?? null,
                  copied,
                  disabled: busy !== null,
                  onCopy: () => void copyLink(),
                  onNewLink: confirmNewLink,
                }
              : null
          }
        />

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
