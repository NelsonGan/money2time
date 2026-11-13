import { X } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Card, Input, Text } from '~/components/ui';
import { PersonAvatar } from '~/features/transactions/components/PersonAvatar';
import { debtPartyKey } from '~/features/transactions/lib/debtParty';
import { useSelfPerson } from '~/hooks/useSelfPerson';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import { cleanPersonName } from '../lib/albumPeople';

/** A person in the list. */
export interface SplitWithRow {
  /** The member's id; null only for the user before their member is written. */
  id: string | null;
  name: string;
  isSelf: boolean;
  /** A muted line under the name (You, Joined, Left). */
  caption?: string;
  renamable: boolean;
  removable: boolean;
}

interface SplitWithCardProps {
  rows: readonly SplitWithRow[];
  /** A row's new name, already cleaned and different from the old one. */
  onRename: (id: string, name: string) => void;
  onRemove: (row: SplitWithRow) => void;
}

/**
 * A shared album's people: the user first, then everyone who joined. The
 * user's own name is changed in place (Return or a tap elsewhere keeps it),
 * and the × takes someone out of the share.
 */
export function SplitWithCard({ rows, onRename, onRemove }: SplitWithCardProps) {
  const colors = useThemeColors();
  const selfAvatarUri = useSelfPerson().avatarUri;
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const endRename = () => {
    if (!renaming) return;
    setRenaming(null);
    const name = cleanPersonName(renaming.name);
    const current = rows.find((row) => row.id === renaming.id)?.name;
    if (name && name !== current) onRename(renaming.id, name);
  };

  return (
    <Card className="overflow-hidden p-0">
      {rows.map((row, index) => {
        const editing = renaming !== null && renaming.id === row.id;
        return (
          <View
            key={row.id ?? 'me'}
            className={`flex-row items-center gap-3 px-4 py-3 ${index > 0 ? 'border-t border-border/15' : ''}`}
          >
            <PersonAvatar
              name={row.name}
              partyKey={row.isSelf ? null : debtPartyKey(row.name)}
              size={38}
              imageUri={row.isSelf ? selfAvatarUri : null}
            />
            {editing ? (
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
                disabled={!row.id || !row.renamable}
                onPress={() => row.id && setRenaming({ id: row.id, name: row.name })}
                accessibilityRole={row.id && row.renamable ? 'button' : 'text'}
              >
                <Text variant="bodyStrong" numberOfLines={1}>
                  {row.name}
                </Text>
                {row.caption ? (
                  <Text variant="caption" tone="muted">
                    {row.caption}
                  </Text>
                ) : null}
              </Pressable>
            )}
            {row.removable && !editing ? (
              <Pressable
                onPress={() => {
                  void triggerHaptic('warning');
                  onRemove(row);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${I18n.t('common.remove')} ${row.name}`}
                hitSlop={8}
                className="h-8 w-8 items-center justify-center rounded-full bg-secondary/50 active:opacity-70"
              >
                <X size={15} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}
