import { Plus, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Card, Input, Text } from '~/components/ui';
import { PersonAvatar } from '~/features/transactions/components/PersonAvatar';
import { debtPartyKey } from '~/features/transactions/lib/debtParty';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import { cleanPersonName } from '../lib/albumPeople';

/** A person in the list. */
export interface SplitWithRow {
  /** Null for the user in an album that is not shared, who is only ever "Me". */
  id: string | null;
  name: string;
  isSelf: boolean;
  /** A muted line under the name (Joined, Not joined yet, You). */
  caption?: string;
  renamable: boolean;
  removable: boolean;
}

interface SplitWithCardProps {
  rows: readonly SplitWithRow[];
  /** Whether another person can be added. */
  canAdd: boolean;
  /** Adds a person by name; true when they were added, so the field clears. */
  onAdd: (name: string) => boolean;
  /** A row's new name, already cleaned and different from the old one. */
  onRename: (id: string, name: string) => void;
  onRemove: (row: SplitWithRow) => void;
}

/**
 * The people an album is split with: the user first, then a row per person
 * with a field to add one. A name is changed in place (Return or a tap
 * elsewhere keeps it), and the × removes.
 */
export function SplitWithCard({ rows, canAdd, onAdd, onRename, onRemove }: SplitWithCardProps) {
  const colors = useThemeColors();
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const add = () => {
    if (!newName.trim()) return;
    void triggerHaptic('selection');
    if (onAdd(newName)) setNewName('');
  };

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
                accessibilityRole="button"
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
              onSubmitEditing={add}
              blurOnSubmit={false}
            />
          </View>
          {newName.trim() ? (
            <Pressable
              onPress={add}
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
  );
}
