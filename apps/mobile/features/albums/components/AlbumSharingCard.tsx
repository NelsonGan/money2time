import { Check, Copy, RefreshCw } from 'lucide-react-native';
import React from 'react';
import { Pressable, Switch, View } from 'react-native';

import { LoadingDots } from '~/components/feedback/LoadingDots';
import { Card, InfoTooltipButton, Text } from '~/components/ui';
import { SignInGate } from '~/features/cloudSync/components/SignInGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

interface Toggle {
  value: boolean;
  onChange: (next: boolean) => void;
}

interface AlbumSharingCardProps {
  /**
   * "Share this album"; null where it is not offered (someone who joined).
   * `signIn`: it was turned on with no account signed in, so the sign-in
   * shows under it.
   */
  share: (Toggle & { busy?: boolean; signIn?: boolean }) | null;
  /** "Simplify group debts"; null while the album is not shared. */
  simplify: Toggle | null;
  /** The invite link, for the owner of a shared album; `url` null while it loads. */
  link?: {
    url: string | null;
    copied: boolean;
    disabled: boolean;
    onCopy: () => void;
    onNewLink: () => void;
  } | null;
}

/**
 * An album's sharing in one card: the two switches together, then the invite
 * link. What each switch does is behind its info button.
 */
export function AlbumSharingCard({ share, simplify, link }: AlbumSharingCardProps) {
  const colors = useThemeColors();
  if (!share && !simplify && !link) return null;

  const row = (
    key: string,
    title: string,
    info: string,
    toggle: Toggle & { busy?: boolean; signIn?: boolean },
    testID: string,
  ) => (
    <View key={key}>
      <View className="flex-row items-center gap-3 px-4 py-3">
        <View className="flex-1 flex-row items-center gap-1.5">
          <Text variant="bodyStrong">{title}</Text>
          <InfoTooltipButton title={title} infoTooltip={info} />
        </View>
        {toggle.busy ? (
          <LoadingDots size="small" />
        ) : (
          <Switch
            testID={testID}
            value={toggle.value}
            onValueChange={toggle.onChange}
            trackColor={{ false: undefined, true: colors.primary }}
          />
        )}
      </View>
      {toggle.signIn ? (
        <View className="px-4 pb-4">
          <SignInGate prompt={I18n.t('albums.share.sign_in')} />
        </View>
      ) : null}
    </View>
  );

  const sections = [
    share
      ? row(
          'share',
          I18n.t('albums.share.row'),
          I18n.t('albums.share.caption'),
          share,
          'album-share-switch',
        )
      : null,
    simplify
      ? row(
          'simplify',
          I18n.t('albums.simplify.row'),
          I18n.t('albums.simplify.info'),
          simplify,
          'album-simplify-switch',
        )
      : null,
    link ? (
      <View key="link" className="gap-2 px-4 py-3">
        <View className="flex-row items-center gap-1.5">
          <Text variant="bodyStrong">{I18n.t('shared_ledgers.invite_link')}</Text>
          <InfoTooltipButton
            title={I18n.t('shared_ledgers.invite_link')}
            infoTooltip={I18n.t('albums.share.link_note')}
          />
        </View>
        <View className="flex-row items-center gap-2">
          <View className="flex-1 rounded-xl bg-secondary/40 px-3 py-2.5">
            {link.url ? (
              <Text variant="caption" numberOfLines={1} selectable testID="album-invite-link">
                {link.url.replace(/^https?:\/\//, '')}
              </Text>
            ) : (
              <LoadingDots size="small" />
            )}
          </View>
          <Pressable
            onPress={link.onCopy}
            disabled={!link.url}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('common.copy')}
            className="h-10 w-10 items-center justify-center rounded-xl bg-secondary/50 active:opacity-70"
          >
            {link.copied ? (
              <Check size={17} color={colors.success} />
            ) : (
              <Copy size={17} color={colors.textMuted} />
            )}
          </Pressable>
          <Pressable
            onPress={link.onNewLink}
            disabled={!link.url || link.disabled}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('shared_ledgers.new_link')}
            className="h-10 w-10 items-center justify-center rounded-xl bg-secondary/50 active:opacity-70"
          >
            <RefreshCw size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
    ) : null,
  ].filter((section) => section !== null);

  return (
    <Card className="overflow-hidden p-0">
      {sections.map((section, index) => (
        <View key={section.key} className={index > 0 ? 'border-t border-border/15' : ''}>
          {section}
        </View>
      ))}
    </Card>
  );
}
