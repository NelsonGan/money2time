import { ArrowLeftRight, ArrowRight } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { PersonAvatar } from '~/features/transactions/components/PersonAvatar';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

/** Which way the money goes: to the user, from the user, or neither. */
export type SettleUpFlow = 'receive' | 'pay' | 'even';

interface SettleUpFlowAvatarsProps {
  /** The person's grouping key (their avatar's colour) and name (its initial). */
  personKey: string;
  personName: string | null;
  flow: SettleUpFlow;
  /** Dim both once the money has changed hands. */
  muted?: boolean;
}

/**
 * Who pays whom, as a picture: the payer's avatar, an arrow, the payee's. It
 * says in one glance what a sentence with two names and a verb would.
 */
export function SettleUpFlowAvatars({
  personKey,
  personName,
  flow,
  muted = false,
}: SettleUpFlowAvatarsProps) {
  const themeColors = useThemeColors();
  const person = <PersonAvatar name={personName} partyKey={personKey} size={49} />;
  const me = (
    <PersonAvatar name={I18n.t('transactions.editor.split.me_label')} partyKey={null} size={49} />
  );
  const Arrow = flow === 'even' ? ArrowLeftRight : ArrowRight;
  return (
    <View
      className="flex-row items-center gap-3.5"
      style={{ opacity: muted ? 0.5 : 1 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {flow === 'pay' ? me : person}
      <Arrow size={22} color={themeColors.textMuted} />
      {flow === 'pay' ? person : me}
    </View>
  );
}
