import React from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

type FormScrollViewProps = React.ComponentProps<typeof KeyboardAwareScrollView>;

/** Gap kept between the top of the keyboard and the focused field. */
const DEFAULT_BOTTOM_OFFSET = 28;

/**
 * The standard scroll container for form screens (editors with Inputs).
 * A plain ScrollView lets the system keyboard cover whichever field sits in
 * the lower half of the screen; this wraps react-native-keyboard-controller's
 * KeyboardAwareScrollView (the KeyboardProvider is mounted at the app root)
 * so the focused input is always scrolled above the keyboard with a small
 * gap. Use this instead of ScrollView whenever the content contains text
 * inputs; all ScrollView props pass through.
 */
export function FormScrollView({
  bottomOffset = DEFAULT_BOTTOM_OFFSET,
  keyboardShouldPersistTaps = 'handled',
  showsVerticalScrollIndicator = false,
  ...props
}: FormScrollViewProps) {
  return (
    <KeyboardAwareScrollView
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      {...props}
    />
  );
}
