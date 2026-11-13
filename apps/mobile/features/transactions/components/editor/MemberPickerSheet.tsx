import { Check, Search } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FatButton, Text } from '~/components/ui';
import { BottomSheetModal } from '~/components/ui/bottom-sheet-modal';
import { SINGLE_LINE_TEXT_INPUT_STYLE } from '~/components/ui/textInputStyles';
import { PersonAvatar } from '~/features/transactions/components/PersonAvatar';
import { debtPartyKey } from '~/features/transactions/lib/debtParty';
import { useSelfPerson } from '~/hooks/useSelfPerson';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

/** From this many members the sheet offers a search field. */
const SEARCH_FROM = 7;
/** The share of the screen a sheet with search takes, at a fixed height. */
const SEARCHABLE_HEIGHT = 0.8;

export interface PickerMember {
  id: string;
  name: string;
}

interface MemberPickerSheetProps {
  visible: boolean;
  /** Everyone in the album besides the user. */
  members: readonly PickerMember[];
  /** The members on the bill now. */
  selectedIds: ReadonlySet<string>;
  /** Members who cannot be taken off (a payment is recorded with them). */
  lockedIds: ReadonlySet<string>;
  onToggle: (member: PickerMember, on: boolean) => void;
  onClose: () => void;
}

/**
 * Who a shared album's bill is split with: the album's members, ticked on or
 * off in one list over the bill, so the rows under it never move while the
 * user chooses and a long list of members stays easy to go through. The user
 * is always on it. Nothing is typed: a shared album's bills are split only
 * with its members (README: Album members and shared albums).
 */
export function MemberPickerSheet({
  visible,
  members,
  selectedIds,
  lockedIds,
  onToggle,
  onClose,
}: MemberPickerSheetProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const me = useSelfPerson();
  const [query, setQuery] = useState('');
  const searchable = members.length >= SEARCH_FROM;
  const shown = useMemo(() => {
    const key = query.trim().toLowerCase();
    return key ? members.filter((member) => member.name.toLowerCase().includes(key)) : members;
  }, [members, query]);
  const onBill = members.filter((member) => selectedIds.has(member.id)).length + 1;

  const close = () => {
    setQuery('');
    onClose();
  };

  const checkCircle = (on: boolean, muted: boolean) => (
    <View
      className={cn(
        'h-6 w-6 items-center justify-center rounded-full border-2',
        on ? 'border-primary bg-primary' : 'border-border',
        muted ? 'opacity-50' : '',
      )}
    >
      {on ? <Check size={14} strokeWidth={3} color="#FFFFFF" /> : null}
    </View>
  );

  return (
    <BottomSheetModal
      visible={visible}
      onClose={close}
      maxHeight="85%"
      // With search, a fixed height: filtering never resizes the sheet, and
      // its top (title, search, first matches) stays above the keyboard.
      style={[
        { paddingBottom: Math.max(insets.bottom, 16) + 4 },
        searchable ? { height: Math.round(windowHeight * SEARCHABLE_HEIGHT) } : null,
      ]}
    >
      <View className="items-center pt-2.5">
        <View className="h-1 w-10 rounded-full bg-border/60" />
      </View>
      <View className="px-6 pb-3 pt-4">
        <Text variant="subheading">{I18n.t('albums.people.split_with')}</Text>
        <Text variant="caption" tone="muted" className="mt-0.5">
          {I18n.t('transactions.editor.split.members_on_bill', {
            count: onBill,
            total: members.length + 1,
          })}
        </Text>
      </View>

      {searchable ? (
        <View className="mx-4 mb-2 h-11 flex-row items-center gap-2 rounded-2xl border border-border/30 bg-secondary/40 px-3">
          <Search size={16} color={themeColors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={I18n.t('transactions.editor.split.search_members')}
            placeholderTextColor={`${themeColors.mutedForeground}99`}
            autoCorrect={false}
            returnKeyType="search"
            className="flex-1"
            style={[SINGLE_LINE_TEXT_INPUT_STYLE, { color: themeColors.text, fontSize: 15 }]}
          />
        </View>
      ) : null}

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        className={searchable ? 'flex-1' : 'shrink'}
      >
        {/* The user: always on the bill. */}
        {query.trim() ? null : (
          <View className="mx-4 flex-row items-center gap-3 px-2 py-3">
            <PersonAvatar name={me.name} partyKey={null} size={36} imageUri={me.avatarUri} />
            <Text variant="body" numberOfLines={1} className="flex-1">
              {me.name}
            </Text>
            {checkCircle(true, true)}
          </View>
        )}
        {members.length === 0 ? (
          <Text variant="body" tone="muted" className="px-6 py-4">
            {I18n.t('transactions.editor.split.no_members')}
          </Text>
        ) : null}
        {shown.map((member) => {
          const on = selectedIds.has(member.id);
          const locked = on && lockedIds.has(member.id);
          return (
            <Pressable
              key={member.id}
              onPress={() => {
                void triggerHaptic('selection');
                onToggle(member, !on);
              }}
              disabled={locked}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: locked }}
              accessibilityLabel={member.name}
              testID={`split-member-option-${member.id}`}
              className="mx-4 flex-row items-center gap-3 border-t border-border/15 px-2 py-3 active:opacity-70"
            >
              <PersonAvatar name={member.name} partyKey={debtPartyKey(member.name)} size={36} />
              <Text variant="body" numberOfLines={1} className="flex-1">
                {member.name}
              </Text>
              {checkCircle(on, locked)}
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="px-4 pt-3">
        <FatButton label={I18n.t('common.done')} onPress={close} />
      </View>
    </BottomSheetModal>
  );
}
