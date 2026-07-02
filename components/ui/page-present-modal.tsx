import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, useWindowDimensions, View } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { EdgeSwipeBackContainer } from '~/components/navigation/EdgeSwipeBackContainer';
import { useThemeVars } from '~/hooks/useThemeVars';

interface PagePresentModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Presents its children as a full-screen page that slides in from the right
 * (like a native-stack push) with an edge-swipe-back gesture, rather than the
 * bottom-up pageSheet that RN Modal offers.
 *
 * Used for editor screens (account/category create-edit, etc.) that live deep
 * inside a component tree — coordinating local state that would break if lifted
 * into real navigator screens — but should still feel like pushed pages. Like
 * `ThemeModal`, it re-injects the theme's CSS vars because Modals render in a
 * separate native view hierarchy.
 */
export function PagePresentModal({ visible, onClose, children }: PagePresentModalProps) {
  const themeVars = useThemeVars();
  const { width } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(width)).current;
  // Keep the Modal mounted through the exit animation so the page can slide out
  // before it unmounts (the parent flips `visible` to false synchronously).
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      translateX.setValue(width);
      Animated.timing(translateX, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(translateX, {
        toValue: width,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
  }, [visible, width, translateX]);

  if (!rendered) return null;

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <View style={[{ flex: 1 }, themeVars]}>
          <Animated.View style={{ flex: 1, transform: [{ translateX }] }}>
            <EdgeSwipeBackContainer onBack={onClose}>{children}</EdgeSwipeBackContainer>
          </Animated.View>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}
