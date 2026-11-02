import React, { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '~/components/ui';
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
}

function personLabel(person: LedgerPerson): string {
  return person.isSelf
    ? I18n.t('shared_ledgers.belongs_to_you', { name: person.name })
    : person.name;
}

/**
 * Belongs to, in the transaction editor's options panel for a shared ledger:
 * one pill per person, the owner first. Whose entry it is decides whose
 * spending it counts as. See README.md > Shared ledgers > Who added it.
 */
export function BelongsToPicker({ people, memberId, createdBy, onSelect }: BelongsToPickerProps) {
  const selected = people.personFor(memberId);
  // Someone the entry belongs to who is not listed (left the ledger, or on an
  // older app) stays pickable, so opening the panel never moves the entry.
  const choices = useMemo(
    () =>
      people.people.some((person) => person.memberId === selected.memberId)
        ? people.people
        : [...people.people, selected],
    [people, selected],
  );
  const adder = createdBy !== undefined ? people.personFor(createdBy) : null;
  const showAdder = adder !== null && adder.memberId !== selected.memberId;

  return (
    <View className="mt-3">
      <Text variant="caption" tone="muted" className="mb-1.5 px-1 uppercase">
        {I18n.t('shared_ledgers.belongs_to_title')}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-2"
      >
        {choices.map((person) => {
          const isSelected = person.memberId === selected.memberId;
          return (
            <Pressable
              key={person.memberId ?? 'owner'}
              onPress={() => onSelect(person.memberId)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={personLabel(person)}
              className={cn(
                'h-11 flex-row items-center gap-2 rounded-2xl border pl-1.5 pr-3.5 active:opacity-70',
                isSelected ? 'border-primary/60 bg-primary/10' : 'border-border/40 bg-secondary/30',
              )}
            >
              <PersonAvatar person={person} size={28} />
              <Text
                variant="body"
                numberOfLines={1}
                className={cn('max-w-[140px]', isSelected ? 'font-semibold text-primary' : null)}
              >
                {personLabel(person)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {showAdder ? (
        <Text variant="caption" tone="muted" className="mt-1.5 px-1" numberOfLines={1}>
          {I18n.t('shared_ledgers.belongs_to_added_by', { name: adder.name })}
        </Text>
      ) : null}
    </View>
  );
}
