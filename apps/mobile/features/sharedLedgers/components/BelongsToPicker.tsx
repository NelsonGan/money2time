import { Check, UserRound, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui';
import { ThemeModal } from '~/components/ui/theme-modal';
import { OptionRow } from '~/features/transactions/components/editor/OptionRow';
import { useSheetColumnStyle } from '~/hooks/useSheetColumnStyle';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { cn } from '~/utils';

import type { LedgerPeople, LedgerPerson } from '../lib/ledgerPeople';
import { PersonAvatar } from './PersonAvatar';

interface BelongsToPickerProps {
  people: LedgerPeople;
  /** The person picked: null is the ledger's owner. */
  memberId: string | null;
  /**
   * Who added the entry, when editing one (null = the owner); shown when it is
   * not whose it is. Undefined for a new entry.
   */
  createdBy?: string | null;
  onSelect: (memberId: string | null) => void;
  /** A hairline above the row, inside the options card. */
  divider?: boolean;
}

function personLabel(person: LedgerPerson): string {
  // Already "You" when this phone's person has no name anywhere.
  return person.isSelf && person.name !== I18n.t('shared_ledgers.you')
    ? I18n.t('shared_ledgers.belongs_to_you', { name: person.name })
    : person.name;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '70%' },
});

/**
 * Belongs to, in the transaction editor's options card for a shared ledger:
 * one option row (the person's photo and name), which opens a sheet listing everyone in the ledger, the owner first. Whose entry
 * it is decides whose spending it counts as. See README.md > Shared ledgers >
 * Who added it.
 */
export function BelongsToPicker({
  people,
  memberId,
  createdBy,
  onSelect,
  divider,
}: BelongsToPickerProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const sheetColumnStyle = useSheetColumnStyle();
  const [open, setOpen] = useState(false);
  const selected = people.personFor(memberId);
  // Someone the entry belongs to who is not listed (left the ledger, or on an
  // older app) stays pickable, so opening the sheet never moves the entry.
  const choices = useMemo(
    () =>
      people.people.some((person) => person.memberId === selected.memberId)
        ? people.people
        : [...people.people, selected],
    [people, selected],
  );
  const adder = createdBy !== undefined ? people.personFor(createdBy) : null;
  const addedBy =
    adder && adder.memberId !== selected.memberId
      ? I18n.t('shared_ledgers.belongs_to_added_by', { name: personLabel(adder) })
      : null;
  const title = I18n.t('shared_ledgers.belongs_to_title');

  return (
    <>
      <OptionRow
        divider={divider}
        icon={<UserRound size={16} color={themeColors.primary} />}
        label={title}
        accessibilityValue={
          addedBy ? `${personLabel(selected)}, ${addedBy}` : personLabel(selected)
        }
        value={
          <>
            <PersonAvatar person={selected} size={20} />
            <Text variant="body" tone="muted" numberOfLines={1} className="shrink">
              {personLabel(selected)}
            </Text>
          </>
        }
        onPress={() => setOpen(true)}
      />

      <ThemeModal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={[styles.sheet, sheetColumnStyle]}
          >
            <View className="rounded-t-[28px] bg-card">
              <View className="flex-row items-center gap-2 px-5 pb-3 pt-5">
                <View className="shrink">
                  <Text variant="subheading" numberOfLines={1}>
                    {title}
                  </Text>
                  {addedBy ? (
                    <Text variant="caption" tone="muted" numberOfLines={1} className="mt-0.5">
                      {addedBy}
                    </Text>
                  ) : null}
                </View>
                <View className="flex-1" />
                <Pressable
                  onPress={() => setOpen(false)}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('common.close')}
                  hitSlop={8}
                  className="h-9 w-9 items-center justify-center rounded-full bg-secondary/50 active:opacity-70"
                >
                  <X size={18} color={themeColors.textMuted} />
                </Pressable>
              </View>
              <ScrollView
                contentContainerClassName="px-3"
                contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
              >
                {choices.map((person) => {
                  const isSelected = person.memberId === selected.memberId;
                  return (
                    <Pressable
                      key={person.memberId ?? 'owner'}
                      onPress={() => {
                        onSelect(person.memberId);
                        setOpen(false);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={personLabel(person)}
                      className={cn(
                        'flex-row items-center gap-3 rounded-2xl px-3 py-2.5 active:opacity-70',
                        isSelected ? 'bg-primary/10' : null,
                      )}
                    >
                      <PersonAvatar person={person} size={36} />
                      <View className="flex-1">
                        <Text
                          variant="body"
                          numberOfLines={1}
                          className={isSelected ? 'font-semibold text-primary' : undefined}
                        >
                          {personLabel(person)}
                        </Text>
                        {/* Not under an owner nobody has named, already called "Owner". */}
                        {person.role === 'owner' &&
                        person.name !== I18n.t('shared_ledgers.owner_badge') ? (
                          <Text variant="caption" tone="muted">
                            {I18n.t('shared_ledgers.owner_badge')}
                          </Text>
                        ) : null}
                      </View>
                      {isSelected ? <Check size={18} color={themeColors.primary} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </ThemeModal>
    </>
  );
}
