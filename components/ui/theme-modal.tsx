import React from 'react';
import { Modal, type ModalProps, View } from 'react-native';

import { useThemeVars } from '~/hooks/useThemeVars';

/**
 * Drop-in replacement for RN Modal that injects the current theme's CSS
 * custom properties via NativeWind `vars()`. Without this, Modals render in a
 * separate native view hierarchy and don't inherit the theme variables set on
 * the root View in App.tsx.
 */
export function ThemeModal({ children, ...props }: ModalProps) {
  const themeVars = useThemeVars();
  return (
    <Modal {...props}>
      <View style={[{ flex: 1 }, themeVars]}>{children}</View>
    </Modal>
  );
}
