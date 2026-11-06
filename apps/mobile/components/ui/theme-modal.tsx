import React from 'react';
import { Modal, type ModalProps, View } from 'react-native';

import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useThemeVars } from '~/hooks/useThemeVars';

/**
 * Drop-in replacement for RN Modal that injects the current theme's CSS
 * custom properties via NativeWind `vars()`. Without this, Modals render in a
 * separate native view hierarchy and don't inherit the theme variables set on
 * the root View in App.tsx.
 *
 * On iPad (`wideTabs`) a page sheet is presented as a form sheet, the
 * centred card iPadOS uses for short forms, instead of a sheet nearly as
 * wide as the screen. Phones and the iPhone Duo keep their page sheets.
 */
export function ThemeModal({ children, presentationStyle, ...props }: ModalProps) {
  const themeVars = useThemeVars();
  const { wideTabs } = useDeviceLayout();
  return (
    <Modal
      {...props}
      presentationStyle={
        wideTabs && presentationStyle === 'pageSheet' ? 'formSheet' : presentationStyle
      }
    >
      <View style={[{ flex: 1 }, themeVars]}>{children}</View>
    </Modal>
  );
}
