import * as Clipboard from 'expo-clipboard';
import { LogOut } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, View } from 'react-native';

import {
  Button,
  FormScrollView,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useCloudSync } from '~/features/cloudSync/CloudSyncContext';
import {
  getInviteLink,
  getLedgerMembers,
  type InviteLink,
  removeMember,
} from '~/features/cloudSync/services/sharedLedgersApi';
import { leaveAskingFirst } from '~/features/sharedLedgers/lib/confirmLeave';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';

import { AlbumSharingCard } from '../components/AlbumSharingCard';
import { SplitWithCard, type SplitWithRow } from '../components/SplitWithCard';
import { useAlbumGroup } from '../hooks/useAlbumGroup';
import { albumSharingMessage, peopleEditMessage } from '../lib/albumMessages';
import { type AlbumGroupPerson, type PeopleEditError } from '../lib/albumPeople';
import { groupSimplifiesDebts, subscribeAlbumGroups } from '../services/albumGroupStore';

interface AlbumPeopleScreenProps {
  albumId: string;
  onBack: () => void;
}

/**
 * A shared album's people and its sharing: everyone who joined with its link
 * (an album is shared when it is made, and its people are only those who
 * joined). The owner invites with the link and can take someone out of the
 * share; everyone else can leave. Someone who leaves, or is taken out, keeps
 * their row and their bills in the group, so nobody's balances change: they
 * read as Left.
 */
export function AlbumPeopleScreen({ albumId, onBack }: AlbumPeopleScreenProps) {
  const { albums, renameAlbumMember, setAlbumSimplifyDebts } = useApp();
  const sync = useCloudSync();
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
  const [linkFailed, setLinkFailed] = useState(false);
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
      setLinkFailed(false);
      try {
        const next = await getInviteLink(
          await getSessionToken(),
          shareId,
          { name: albumName, emoji: null },
          { rotate },
        );
        if (request === linkRequestRef.current) setLink(next);
      } catch (error) {
        // Offline, or the account not ready: offered again from the field.
        if (request === linkRequestRef.current) setLinkFailed(true);
        throw error;
      }
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

  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  if (!album) return <SettingsPageLayout>{null}</SettingsPageLayout>;

  const showEditError = (error: PeopleEditError | null) => {
    const message = error ? peopleEditMessage(error) : null;
    if (message) Alert.alert(message);
    return error === null;
  };

  // Only the user's own name changes here: everyone else names themselves.
  const renamePerson = (id: string, name: string) => {
    void renameAlbumMember(album.id, id, name).then(showEditError);
  };

  const isJoined = (person: AlbumGroupPerson) => {
    if (!share || !person.joined) return false;
    const member = group.members.find((item) => item.id === person.id);
    return joinedIds && member?.userId ? joinedIds.has(member.userId) : person.joined;
  };

  // The owner takes someone out of the share. Their row and bills stay in
  // the group (nobody's balances change); they only stop seeing it.
  const confirmRemove = (person: AlbumGroupPerson) => {
    const member = group.members.find((item) => item.id === person.id);
    if (!isOwner || !member?.userId) return;
    Alert.alert(
      I18n.t('albums.people.remove_joined_title', { name: person.name }),
      I18n.t('albums.people.remove_joined_message'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.remove'),
          style: 'destructive',
          onPress: () =>
            void run(`remove:${member.id}`, async () => {
              if (!shareId || !member.userId) return;
              // The Worker marks them as left in the group, and logs it.
              await removeMember(await getSessionToken(), shareId, member.userId);
              setLink(null);
              void trackEvent(AnalyticsEvents.ALBUM_MEMBER_REMOVED);
              await loadJoined();
              fetchLink().catch(() => undefined);
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
              // Left, the album is the user's own: it has no people page.
              if (await leaveAskingFirst((opts) => sync.leaveLedger(album.id, opts), album.name)) {
                onBack();
              }
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
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1600);
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

  const rows = group.people.map((person): SplitWithRow => {
    const joined = isJoined(person);
    return {
      id: person.id,
      // The user reads as the others see them, and can change that name.
      name: person.isSelf && group.self ? group.self.name : person.name,
      isSelf: person.isSelf,
      caption: person.isSelf
        ? I18n.t('albums.people.me_tag')
        : joined
          ? I18n.t('albums.people.joined')
          : I18n.t('albums.people.left'),
      renamable: person.isSelf && !!group.self,
      removable: !person.isSelf && isOwner && joined,
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
        <View>
          <Text variant="label" tone="muted" className="mb-2.5 px-1">
            {I18n.t('albums.people.split_with')}
          </Text>
          <SplitWithCard
            rows={rows}
            onRename={renamePerson}
            onRemove={(row) => {
              const person = group.people.find((item) => item.id === row.id);
              if (person) confirmRemove(person);
            }}
          />
        </View>

        <AlbumSharingCard
          share={null}
          simplify={
            share && group.self
              ? {
                  value: simplifies,
                  onChange: (next) => {
                    void triggerHaptic('selection');
                    void setAlbumSimplifyDebts(album.id, next);
                  },
                }
              : null
          }
          link={
            canInvite
              ? {
                  url: link?.url ?? null,
                  failed: linkFailed,
                  copied,
                  disabled: busy !== null,
                  onCopy: () => void copyLink(),
                  onNewLink: confirmNewLink,
                  onRetry: () => fetchLink().catch(() => undefined),
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
